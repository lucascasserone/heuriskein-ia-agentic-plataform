from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.utils import timezone
from django.utils.text import slugify
from django.db.models import Q, Count
from datetime import timedelta
import json
import mimetypes
import os
from pathlib import Path
import unicodedata
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from pypdf import PdfReader

from api.models import Agent, Task, Epic, ThoughtLog, ChatMessage, ClarificationRequest, Artifact, Subtask, ApprovalRequest, DecisionRecord, ProviderCredential, AgentMessage, CorporateDocument, CorporateMemoryEntry, WorkflowPlaybook, WorkflowRun
from api.serializers import (
    AgentSerializer, TaskSerializer, EpicSerializer,
    ThoughtLogSerializer, ChatMessageSerializer,
    RegisterSerializer, LoginSerializer, UserSerializer,
    ChatRequestSerializer, ChatResponseSerializer, ClarificationRequestSerializer,
    TaskDetailSerializer, SubtaskSerializer, ApprovalRequestSerializer, DecisionRecordSerializer,
    ProviderCredentialWriteSerializer, ProviderCredentialStatusSerializer,
    AgentMessageSerializer, AgentMessageAckSerializer,
    CorporateDocumentSerializer, CorporateMemoryEntrySerializer,
    WorkflowPlaybookSerializer, WorkflowRunSerializer, ExecutiveDashboardSerializer
)
from api.epic_decomposition import ensure_epic_task_queue
from api.llm_service import get_llm_service
from api.execution_engine import execute_task_async
from api.file_sandbox import preview_file_change, apply_file_change, rollback_snapshot
from api.work_tracking import create_agent_handoff, create_artifact, record_task_event


def _broadcast(group: str, event_type: str, payload: dict):
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(group, {'type': event_type, **payload})
    except Exception:
        pass


def _task_needs_clarification(task: Task) -> bool:
    """Heuristic guard for under-specified tasks before execution."""
    text = f"{task.title or ''} {task.description or ''}".strip().lower()
    if len((task.description or '').strip()) < 20:
        return True
    weak_patterns = ['validar card', 'arrumar', 'melhorar', 'ajustar', 'fazer isso', 'resolver isso']
    return any(p in text for p in weak_patterns)


def _ensure_executor_agent(task: Task) -> Agent:
    """Pick an idle executor agent or create one for this task."""
    if not Agent.objects.exists():
        Agent.objects.create(
            name='Claude Executor',
            type='executor',
            model='claude-3-5-sonnet-20241022',
            capabilities=['general', 'execution', 'analysis', 'planning']
        )

    available_agents = Agent.objects.filter(state='idle')
    if available_agents.exists():
        return available_agents.first()

    return Agent.objects.create(
        name=f'Claude Agent #{task.attempt_count + 1}',
        type='executor',
        model='claude-3-5-sonnet-20241022',
        capabilities=['general', 'execution', 'analysis']
    )


def _start_task_processing(task: Task) -> Task:
    """Transition a task to processing and dispatch async execution."""
    agent = _ensure_executor_agent(task)

    task.status = 'processing'
    task.assigned_to = agent
    task.attempt_count += 1
    task.started_at = timezone.now()
    task.error = ''
    task.result = None
    task.save(update_fields=['status', 'assigned_to', 'attempt_count', 'started_at', 'error', 'result'])

    agent.state = 'thinking'
    agent.current_task = task
    agent.last_activity = timezone.now()
    agent.save(update_fields=['state', 'current_task', 'last_activity'])

    ThoughtLog.objects.create(
        agent=agent,
        task=task,
        message=f"🚀 Iniciando execução: {task.title}",
        level='info'
    )
    record_task_event(
        task,
        'assigned',
        f'Tarefa atribuída para {agent.name}',
        agent=agent,
        metadata={'status': task.status, 'attempt_count': task.attempt_count},
    )
    record_task_event(
        task,
        'started',
        'Execução da tarefa iniciada',
        agent=agent,
        metadata={'started_at': task.started_at.isoformat() if task.started_at else ''},
    )

    execute_task_async(str(task.pk))
    return task


def _build_action_plan(question: str, answer: str) -> list:
    """Create a deterministic action checklist from pilot clarification."""
    checklist = [
        'Consolidar critérios e restrições informados pelo piloto',
        'Aplicar validações do card no fluxo de execução',
        'Verificar consistência entre frontend e backend',
        'Registrar evidências e resultado final da validação',
    ]
    answer_lines = [line.strip(' -\t') for line in answer.splitlines() if line.strip()]
    for line in answer_lines[:3]:
        checklist.append(f'Executar critério específico: {line[:180]}')

    if question:
        checklist.insert(0, f'Pergunta original: {question[:180]}')

    return checklist


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize('NFKD', value or '')
    ascii_text = normalized.encode('ascii', 'ignore').decode('ascii')
    return ascii_text.lower()


def _extract_field(patterns: list, text: str) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return ''


def _map_epic_status(raw_status: str) -> str:
    value = _normalize_text(raw_status)
    mapping = {
        'backlog': 'backlog',
        'fila': 'backlog',
        'refinamento': 'refinement',
        'refinement': 'refinement',
        'aprovado': 'approved',
        'approved': 'approved',
        'concluido': 'completed',
        'concluida': 'completed',
        'completed': 'completed',
        'finalizado': 'completed',
        'falhou': 'failed',
        'failed': 'failed',
        'erro': 'failed',
    }
    return mapping.get(value, '')


def _resolve_priority(text: str, default: str = 'medium') -> str:
    normalized = _normalize_text(text)
    if any(term in normalized for term in ['alta', 'high', 'urgente', 'critica']):
        return 'high'
    if any(term in normalized for term in ['baixa', 'low']):
        return 'low'
    return default


def _detect_chat_action(message: str) -> dict:
    raw = (message or '').strip()
    llm_action = {'type': 'none'}
    try:
        llm_action = _detect_chat_action_llm(raw)
    except Exception:
        llm_action = {'type': 'none'}

    # If the LLM cannot classify an operation, use deterministic regex fallback.
    if isinstance(llm_action, dict) and llm_action.get('type') not in ('none', '', None):
        return llm_action
    regex_action = _detect_chat_action_regex(raw)
    if isinstance(regex_action, dict) and regex_action.get('type') not in ('none', '', None):
        return regex_action
    return llm_action if isinstance(llm_action, dict) else {'type': 'none'}


def _detect_chat_action_llm(raw: str) -> dict:
    """Use LLM to classify the user's chat message into a structured action dict."""
    import json as _json

    prompt = f"""Você é um assistente que classifica mensagens de chat de um sistema de gerenciamento de projetos.

Analise a mensagem do usuário abaixo e retorne um JSON com a ação correspondente.

Mensagem: "{raw}"

Regras de classificação:
- Se o usuário quer CRIAR um épico → type="create_epic", inclua: goal (string), description (string ou null), priority ("low"|"medium"|"high")
- Se o usuário quer CRIAR uma tarefa → type="create_task", inclua: title (string), description (string ou null), priority ("low"|"medium"|"high"), status="queue"
- Se o usuário quer ATUALIZAR STATUS de um épico → type="update_epic_status", inclua: status ("backlog"|"refinement"|"approved"|"completed"|"failed"), epic_ref (texto do objetivo), epic_id (UUID se mencionado)
- Se o usuário quer EDITAR/ATUALIZAR dados de um épico → type="update_epic", inclua: epic_ref, epic_id, goal, description, priority (apenas os campos mencionados)
- Se o usuário quer REVISAR/LISTAR épicos em refinamento → type="review_refinement_epics"
- Se não for nenhuma das ações acima → type="none"

Se algum campo obrigatório não foi mencionado pelo usuário, adicione "missing": ["campo1", ...].
Campos obrigatórios: create_epic precisa de goal (≥8 chars); create_task precisa de title (≥5 chars); update_epic_status precisa de status e (epic_ref ou epic_id); update_epic precisa de (epic_ref ou epic_id) e pelo menos um campo a alterar.

Responda APENAS com o JSON, sem explicações, sem markdown."""

    import json as _json
    response = get_llm_service().chat(
        messages=[{"role": "user", "content": prompt}],
        system="Você é um classificador de intenções. Responda somente com JSON válido.",
    )
    # strip markdown fences if present
    cleaned = response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    cleaned = cleaned.strip()
    action = _json.loads(cleaned)
    if not isinstance(action, dict) or "type" not in action:
        return {"type": "none"}
    # normalise priority
    if action.get("priority") not in ("low", "medium", "high"):
        action["priority"] = _resolve_priority(str(action.get("priority") or ""), default="medium")
    # normalise epic status
    if action.get("type") == "update_epic_status" and action.get("status"):
        action["status"] = _map_epic_status(action["status"]) or action["status"]
    return action


def _detect_chat_action_regex(raw: str) -> dict:
    """Original regex-based fallback for _detect_chat_action."""
    normalized = _normalize_text(raw)
    create_terms = ['criar', 'crie', 'adicione', 'adicionar', 'novo', 'nova']
    epic_terms = ['epico', 'epic']
    task_terms = ['tarefa', 'task']
    document_terms = ['documento', 'brief', 'spec', 'relatorio', 'report', 'sop', 'memo', 'retrospectiva', 'retro']
    playbook_terms = ['playbook', 'workflow', 'fluxo']

    review_terms = ['revisar', 'revise', 'analisar', 'analisar', 'listar', 'mostra', 'mostrar', 'auditar', 'review']
    refinement_terms = ['refinamento', 'refinement']
    if any(term in normalized for term in review_terms) and any(term in normalized for term in epic_terms) and any(term in normalized for term in refinement_terms):
        return {'type': 'review_refinement_epics'}

    if any(term in normalized for term in create_terms) and any(term in normalized for term in document_terms):
        title = _extract_field([
            r'(?:documento|brief|spec|relatorio|relatório|report|sop|memo|retro|retrospectiva)\s*[:\-]\s*(.+)',
            r'criar\s+(?:um\s+|uma\s+)?(?:documento|brief|spec|relatorio|relatório|report|sop|memo|retro|retrospectiva)\s+(?:com\s+titulo\s+)?(.+)',
        ], raw)
        summary = _extract_field([r'(?:resumo|summary)\s*[:\-]\s*(.+)'], raw)
        area = _extract_field([r'(?:area|área)\s*[:\-]\s*(.+)'], raw)
        initiative = _extract_field([r'(?:iniciativa|initiative)\s*[:\-]\s*(.+)'], raw)
        doc_type = _extract_field([r'(?:tipo|type)\s*[:\-]\s*(brief|spec|report|sop|retro|memo|playbook)'], raw)
        if not doc_type:
            if 'brief' in normalized:
                doc_type = 'brief'
            elif 'spec' in normalized:
                doc_type = 'spec'
            elif 'report' in normalized or 'relatorio' in normalized:
                doc_type = 'report'
            elif 'sop' in normalized:
                doc_type = 'sop'
            elif 'retro' in normalized or 'retrospectiva' in normalized:
                doc_type = 'retro'
            elif 'memo' in normalized:
                doc_type = 'memo'
            else:
                doc_type = 'brief'
        missing = []
        if not title or len(title) < 5:
            missing.append('title')
        return {
            'type': 'create_document',
            'title': title.strip(' .;:') if title else '',
            'summary': summary,
            'area': area,
            'initiative': initiative,
            'doc_type': doc_type,
            'missing': missing,
        }

    if any(term in normalized for term in ['executar', 'rodar', 'iniciar', 'run']) and any(term in normalized for term in playbook_terms):
        playbook_ref = _extract_field([
            r'(?:playbook|workflow|fluxo)\s*[:\-]\s*(.+)',
            r'(?:executar|rodar|iniciar|run)\s+(?:o\s+|a\s+)?(?:playbook|workflow|fluxo)\s+(.+)',
        ], raw)
        area = _extract_field([r'(?:area|área)\s*[:\-]\s*(.+)'], raw)
        initiative = _extract_field([r'(?:iniciativa|initiative)\s*[:\-]\s*(.+)'], raw)
        missing = []
        if not playbook_ref:
            missing.append('playbook')
        return {
            'type': 'run_playbook',
            'playbook_ref': playbook_ref.strip(' .;:') if playbook_ref else '',
            'area': area,
            'initiative': initiative,
            'missing': missing,
        }

    if any(term in normalized for term in ['status', 'situacao', 'situação']) and any(term in normalized for term in epic_terms):
        if any(term in normalized for term in ['alterar', 'mudar', 'atualizar', 'trocar', 'definir']):
            target_status = _extract_field([
                r'(?:status|situacao|situação)\s*[:\-]\s*([^;\n]+)',
                r'para\s+(backlog|refinamento|refinement|aprovado|approved|concluido|concluida|completed|finalizado|falhou|failed|erro)',
            ], raw)
            mapped_status = _map_epic_status(target_status)
            epic_id = _extract_field([
                r'(?:id(?:\s+do)?\s+(?:epico|épico|epic)|(?:epico|épico|epic)\s+id|id)\s*[:\-]\s*([0-9a-fA-F\-]{36})',
            ], raw)
            epic_ref = _extract_field([
                r'(?:epico|épico|epic)\s*[:\-]\s*([^;\n]+)',
                r'(?:objetivo\s+atual|goal\s+atual)\s*[:\-]\s*([^;\n]+)',
            ], raw)
            if not epic_id and epic_ref and _normalize_text(epic_ref) in ['status', 'situacao', 'situação']:
                epic_ref = ''
            missing = []
            if not mapped_status:
                missing.append('status')
            if not epic_id and not epic_ref:
                missing.append('epic_ref')
            return {
                'type': 'update_epic_status',
                'status': mapped_status,
                'epic_id': epic_id,
                'epic_ref': epic_ref,
                'missing': missing,
            }

    if any(term in normalized for term in ['editar', 'edite', 'alterar', 'atualizar']) and any(term in normalized for term in epic_terms):
        new_goal = _extract_field([r'(?:novo\s+objetivo|objetivo|goal)\s*[:\-]\s*([^;\n]+)'], raw)
        new_description = _extract_field([r'(?:nova\s+descricao|nova\s+descrição|descricao|descrição|description)\s*[:\-]\s*([^;\n]+)'], raw)
        priority_text = _extract_field([r'(?:nova\s+prioridade|prioridade|priority)\s*[:\-]\s*([^;\n]+)'], raw)
        new_priority = _resolve_priority(priority_text, default='') if priority_text else ''
        epic_id = _extract_field([r'(?:id(?:\s+do)?\s+(?:epico|épico|epic)|(?:epico|épico|epic)\s+id|id)\s*[:\-]\s*([0-9a-fA-F\-]{36})'], raw)
        epic_ref = _extract_field([r'(?:epico|épico|epic)\s*[:\-]\s*([^;\n]+)', r'(?:objetivo\s+atual|goal\s+atual)\s*[:\-]\s*([^;\n]+)'], raw)
        if not epic_id and epic_ref and _normalize_text(epic_ref) in ['editar', 'atualizar', 'alterar']:
            epic_ref = ''
        missing = []
        if not epic_id and not epic_ref:
            missing.append('epic_ref')
        if not any([new_goal, new_description, new_priority]):
            missing.append('changes')
        return {'type': 'update_epic', 'epic_id': epic_id, 'epic_ref': epic_ref, 'goal': new_goal, 'description': new_description, 'priority': new_priority, 'missing': missing}

    if any(term in normalized for term in create_terms) and any(term in normalized for term in task_terms):
        priority = _resolve_priority(normalized, default='medium')
        title = _extract_field([r'(?:tarefa|task)\s*[:\-]\s*(.+)', r'(?:tarefa|task)\s+chamada\s+(.+)', r'criar\s+(?:uma\s+)?(?:nova\s+)?(?:tarefa|task)\s+(?:com\s+)?(?:titulo\s+)?(.+)'], raw)
        description = _extract_field([r'(?:descricao|descrição|description)\s*[:\-]\s*(.+)'], raw)
        if title:
            title = re.split(r';\s*(?:prioridade|priority|descricao|descrição|description)\s*:', title, maxsplit=1, flags=re.IGNORECASE)[0].strip(' .;:')
        if not title or len(title) < 5:
            return {'type': 'create_task', 'missing': ['title'], 'priority': priority}
        return {'type': 'create_task', 'title': title, 'description': description, 'priority': priority, 'status': 'queue'}

    if not any(term in normalized for term in create_terms) or not any(term in normalized for term in epic_terms):
        return {'type': 'none'}

    priority = _resolve_priority(normalized, default='medium')
    goal = _extract_field([r'(?:objetivo|goal)\s*[:\-]\s*(.+)', r'(?:epico|épico|epic)\s*[:\-]\s*(.+)', r'criar\s+(?:um\s+)?(?:novo\s+)?(?:epico|épico|epic)\s+(?:com\s+)?(?:objetivo\s+)?(.+)'], raw)
    description = _extract_field([r'(?:descricao|descrição|description)\s*[:\-]\s*(.+)'], raw)
    if goal:
        goal = re.split(r';\s*(?:prioridade|priority|descricao|descrição|description)\s*:', goal, maxsplit=1, flags=re.IGNORECASE)[0].strip(' .;:')
    if not goal or len(goal) < 8:
        return {'type': 'create_epic', 'missing': ['goal'], 'priority': priority}
    return {'type': 'create_epic', 'goal': goal, 'description': description, 'priority': priority}


def _find_epic_for_action(action: dict):
    epic_id = (action.get('epic_id') or '').strip()
    epic_ref = (action.get('epic_ref') or '').strip()
    if epic_id:
        try:
            return Epic.objects.get(id=epic_id), ''
        except Epic.DoesNotExist:
            return None, 'Epic não encontrado para o ID informado.'

    if epic_ref:
        qs = Epic.objects.filter(goal__icontains=epic_ref).order_by('-updated_at')
        count = qs.count()
        if count == 0:
            return None, 'Não encontrei épico com essa referência. Informe o ID do épico para evitar ambiguidade.'
        if count > 1:
            return None, 'Encontrei mais de um épico com essa referência. Informe o ID do épico.'
        return qs.first(), ''

    return None, 'Informe o ID do épico ou uma referência única do objetivo.'


def _get_pending_intent(user: User) -> dict:
    """Read pending intent from the most recent chat context for this user."""
    last_msg = ChatMessage.objects.filter(user=user).order_by('-created_at').first()
    if not last_msg or not isinstance(last_msg.context, dict):
        return {}
    pending = last_msg.context.get('pending_intent')
    return pending if isinstance(pending, dict) else {}


def _looks_like_operational_request_without_parse(message: str) -> bool:
    normalized = _normalize_text(message)
    action_terms = ['criar', 'crie', 'editar', 'alterar', 'atualizar', 'mudar', 'deletar', 'excluir']
    target_terms = ['epico', 'epic', 'tarefa', 'task', 'kanban', 'status']
    return any(term in normalized for term in action_terms) and any(term in normalized for term in target_terms)


def _is_confirmation_message(message: str) -> bool:
    normalized = _normalize_text(message)
    positive = ['sim', 'confirmo', 'pode criar', 'ok', 'isso', 'confirmar', 'pode prosseguir', 'pode seguir']
    return any(term in normalized for term in positive)


def _is_rejection_message(message: str) -> bool:
    normalized = _normalize_text(message)
    negative = ['nao', 'cancela', 'cancelar', 'pare', 'parar', 'deixa', 'nao criar']
    return any(term in normalized for term in negative)


def _build_refinement_review_message() -> tuple[str, int]:
    """Return a deterministic review for epics currently in refinement."""
    epics = Epic.objects.filter(status='refinement').order_by('-updated_at')
    total = epics.count()
    if total == 0:
        return (
            'Nenhum épico em refinamento no Kanban neste momento. '
            'Se quiser, posso ajudar a mover um épico de backlog para refinamento.',
            0,
        )

    lines = [f'Encontrei {total} épico(s) em refinamento:']
    for index, epic in enumerate(epics[:8], start=1):
        tasks = epic.tasks.count()
        goal = (epic.goal or '').strip()
        compact_goal = goal[:110] + ('...' if len(goal) > 110 else '')
        signals = []
        if not (epic.description or '').strip():
            signals.append('sem descrição estratégica')
        if tasks == 0:
            signals.append('sem tarefas de execução')
        if epic.priority == 'high' and tasks < 2:
            signals.append('alta prioridade com baixa decomposição')

        signal_text = f" | atenção: {', '.join(signals)}" if signals else ''
        lines.append(
            f"{index}. [{epic.priority}] {compact_goal} (id: {epic.id}, tasks: {tasks}){signal_text}"
        )

    if total > 8:
        lines.append(f'... e mais {total - 8} épico(s).')

    lines.append('')
    lines.append('Próximo passo sugerido: use "aprovar épico id: <id>" para iniciar decomposição automática em tarefas, ou "editar épico id: <id>" para melhorar o escopo.')
    return ('\n'.join(lines), total)


def _sync_corporate_memory(*, title: str, summary: str = '', content: str = '', area: str = '', initiative: str = '', source_type: str = 'manual', source_id: str = '', tags: list | None = None, metadata: dict | None = None):
    defaults = {
        'title': title,
        'summary': summary,
        'content': content,
        'area': area or '',
        'initiative': initiative or '',
        'tags': tags or [],
        'metadata': metadata or {},
    }
    if source_type and source_id:
        entry, _ = CorporateMemoryEntry.objects.update_or_create(
            source_type=source_type,
            source_id=source_id,
            defaults=defaults,
        )
        return entry
    return CorporateMemoryEntry.objects.create(source_type=source_type, source_id=source_id or '', **defaults)


def _trim_prompt_block(value: str, limit: int = 2400) -> str:
    text = (value or '').strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}\n..."


def _extract_uploaded_document(uploaded_file) -> tuple[str, str]:
    name = getattr(uploaded_file, 'name', 'documento') or 'documento'
    suffix = Path(name).suffix.lower()
    content_type = getattr(uploaded_file, 'content_type', '') or mimetypes.guess_type(name)[0] or 'application/octet-stream'

    if suffix in {'.md', '.txt'}:
        raw = uploaded_file.read()
        uploaded_file.seek(0)
        return raw.decode('utf-8', errors='ignore'), content_type

    if suffix == '.pdf':
        reader = PdfReader(uploaded_file)
        chunks = []
        for page in reader.pages:
            try:
                chunks.append(page.extract_text() or '')
            except Exception:
                continue
        uploaded_file.seek(0)
        return '\n\n'.join(chunk for chunk in chunks if chunk).strip(), content_type

    raise ValueError('Formato não suportado. Use .md, .txt ou .pdf.')


def _persist_uploaded_document(uploaded_file, document_id: str) -> dict:
    original_name = getattr(uploaded_file, 'name', 'documento') or 'documento'
    safe_name = Path(original_name).name.replace(' ', '_')
    relative_dir = Path('corporate_documents')
    relative_path = relative_dir / f'{document_id}_{safe_name}'
    absolute_path = Path(settings.MEDIA_ROOT) / relative_path
    absolute_path.parent.mkdir(parents=True, exist_ok=True)

    with absolute_path.open('wb') as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)

    return {
        'file_name': original_name,
        'stored_path': relative_path.as_posix(),
        'size': int(getattr(uploaded_file, 'size', 0) or 0),
        'mime_type': getattr(uploaded_file, 'content_type', '') or mimetypes.guess_type(original_name)[0] or 'application/octet-stream',
        'extension': Path(original_name).suffix.lower(),
    }


def _build_corporate_context(query: str, *, area: str = '', initiative: str = '', top_k: int = 5) -> dict:
    query_text = (query or '').strip()
    doc_queryset = CorporateDocument.objects.filter(status='active')
    memory_queryset = CorporateMemoryEntry.objects.all()

    if area:
                doc_queryset = doc_queryset.filter(area__icontains=area)
                memory_queryset = memory_queryset.filter(area__icontains=area)
    if initiative:
                doc_queryset = doc_queryset.filter(initiative__icontains=initiative)
                memory_queryset = memory_queryset.filter(initiative__icontains=initiative)

    if query_text:
        doc_queryset = doc_queryset.filter(
            Q(title__icontains=query_text)
            | Q(summary__icontains=query_text)
            | Q(content__icontains=query_text)
            | Q(area__icontains=query_text)
            | Q(initiative__icontains=query_text)
            | Q(tags__icontains=query_text)
        )
        memory_queryset = memory_queryset.filter(
            Q(title__icontains=query_text)
            | Q(summary__icontains=query_text)
            | Q(content__icontains=query_text)
            | Q(area__icontains=query_text)
            | Q(initiative__icontains=query_text)
            | Q(tags__icontains=query_text)
        )

    documents = list(doc_queryset.order_by('-updated_at')[:top_k])
    memories = list(memory_queryset.order_by('-times_reused', '-updated_at')[:top_k])

    lines = []
    if documents:
        lines.append('## Contexto Corporativo Relevante')
        for document in documents:
            lines.append(
                f"- Documento: {document.title} | tipo={document.doc_type} | area={document.area or '-'} | iniciativa={document.initiative or '-'}"
            )
            if document.summary:
                lines.append(f"  Resumo: {_trim_prompt_block(document.summary, 280)}")
            excerpt = document.content or ''
            if excerpt:
                lines.append(f"  Conteúdo: {_trim_prompt_block(excerpt, 420)}")

    if memories:
        lines.append('')
        lines.append('## Memória Reutilizável')
        for entry in memories:
            lines.append(
                f"- Memória: {entry.title} | origem={entry.source_type} | reuso={entry.times_reused}"
            )
            if entry.summary:
                lines.append(f"  Resumo: {_trim_prompt_block(entry.summary, 240)}")
            excerpt = entry.content or ''
            if excerpt:
                lines.append(f"  Conteúdo: {_trim_prompt_block(excerpt, 320)}")

    return {
        'documents': documents,
        'memory_entries': memories,
        'prompt_markdown': '\n'.join(lines).strip(),
    }


def _build_document_graph() -> dict:
    documents = list(CorporateDocument.objects.order_by('-updated_at')[:80])
    memory_entries = list(CorporateMemoryEntry.objects.order_by('-updated_at')[:80])
    nodes = []
    edges = []
    seen_nodes = set()

    def add_node(node_id: str, label: str, node_type: str, extra: dict | None = None):
        if node_id in seen_nodes:
            return
        seen_nodes.add(node_id)
        payload = {'id': node_id, 'label': label, 'type': node_type}
        if extra:
            payload.update(extra)
        nodes.append(payload)

    for document in documents:
        doc_id = f'doc:{document.id}'
        add_node(doc_id, document.title, 'document', {
            'doc_type': document.doc_type,
            'area': document.area,
            'initiative': document.initiative,
        })
        if document.area:
            area_id = f'area:{slugify(document.area)}'
            add_node(area_id, document.area, 'area')
            edges.append({'id': f'{doc_id}->{area_id}', 'source': doc_id, 'target': area_id, 'label': 'area'})
        if document.initiative:
            initiative_id = f'initiative:{slugify(document.initiative)}'
            add_node(initiative_id, document.initiative, 'initiative')
            edges.append({'id': f'{doc_id}->{initiative_id}', 'source': doc_id, 'target': initiative_id, 'label': 'initiative'})
        for tag in (document.tags or [])[:6]:
            tag_id = f'tag:{slugify(str(tag))}'
            add_node(tag_id, str(tag), 'tag')
            edges.append({'id': f'{doc_id}->{tag_id}', 'source': doc_id, 'target': tag_id, 'label': 'tag'})

    for entry in memory_entries:
        memory_id = f'memory:{entry.id}'
        add_node(memory_id, entry.title, 'memory', {
            'source_type': entry.source_type,
            'area': entry.area,
            'initiative': entry.initiative,
        })
        if entry.area:
            area_id = f'area:{slugify(entry.area)}'
            add_node(area_id, entry.area, 'area')
            edges.append({'id': f'{memory_id}->{area_id}', 'source': memory_id, 'target': area_id, 'label': 'area'})
        if entry.initiative:
            initiative_id = f'initiative:{slugify(entry.initiative)}'
            add_node(initiative_id, entry.initiative, 'initiative')
            edges.append({'id': f'{memory_id}->{initiative_id}', 'source': memory_id, 'target': initiative_id, 'label': 'initiative'})
        if entry.source_type == 'document' and entry.source_id:
            doc_id = f'doc:{entry.source_id}'
            edges.append({'id': f'{memory_id}->{doc_id}', 'source': memory_id, 'target': doc_id, 'label': 'deriva'})

    return {'nodes': nodes, 'edges': edges}


def _render_template_value(value, payload: dict):
    if isinstance(value, str):
        try:
            return value.format(**payload)
        except Exception:
            return value
    return value


def _default_playbook_templates():
    return [
        {
            'name': 'Product Launch Review',
            'slug': 'product-launch-review',
            'description': 'Cria task, brief e decisão operacional para lançamento de produto.',
            'category': 'launch',
            'scope': 'epic',
            'status': 'active',
            'is_template': True,
            'trigger_phrases': ['lancar produto', 'product launch', 'go to market'],
            'graph': [
                {'action': 'create_task', 'title': 'Planejar lançamento: {initiative}', 'description': 'Criado pelo playbook de lançamento.', 'priority': 'high', 'status': 'queue'},
                {'action': 'create_document', 'title': 'Brief de lançamento: {initiative}', 'doc_type': 'brief', 'status': 'active', 'scope': 'epic', 'summary': 'Brief executivo criado automaticamente.', 'content': 'Iniciativa: {initiative}\nÁrea: {area}\nObjetivo: organizar o lançamento.'},
                {'action': 'create_decision', 'title': 'Aprovar kickoff do lançamento {initiative}', 'summary': 'Playbook iniciou o fluxo padrão de lançamento.', 'impact': 'high'},
            ],
        },
        {
            'name': 'Incident Response',
            'slug': 'incident-response',
            'description': 'Organiza triagem, relatório e registro para incidentes.',
            'category': 'operations',
            'scope': 'task',
            'status': 'active',
            'is_template': True,
            'trigger_phrases': ['incidente', 'incident response', 'falha critica'],
            'graph': [
                {'action': 'create_task', 'title': 'Triagem de incidente: {initiative}', 'description': 'Iniciar triagem técnica e impacto.', 'priority': 'high', 'status': 'queue'},
                {'action': 'create_document', 'title': 'Relatório de incidente: {initiative}', 'doc_type': 'report', 'status': 'active', 'scope': 'task', 'summary': 'Relatório inicial do incidente.', 'content': 'Contexto: {initiative}\nÁrea: {area}\nPróximo passo: estabilizar o serviço.'},
            ],
        },
        {
            'name': 'Hiring Request',
            'slug': 'hiring-request',
            'description': 'Formaliza demanda de contratação com memo e tarefas iniciais.',
            'category': 'people',
            'scope': 'org',
            'status': 'active',
            'is_template': True,
            'trigger_phrases': ['contratacao', 'hiring request', 'abrir vaga'],
            'graph': [
                {'action': 'create_document', 'title': 'Memo de contratação: {initiative}', 'doc_type': 'memo', 'status': 'active', 'scope': 'org', 'summary': 'Pedido formal de contratação.', 'content': 'Área: {area}\nIniciativa: {initiative}\nMotivo: ampliar capacidade operacional.'},
                {'action': 'create_task', 'title': 'Validar headcount para {initiative}', 'description': 'Conferir orçamento, senioridade e urgência.', 'priority': 'medium', 'status': 'queue'},
            ],
        },
    ]


def _seed_playbook_templates(user=None) -> list[WorkflowPlaybook]:
    seeded = []
    for item in _default_playbook_templates():
        playbook, created = WorkflowPlaybook.objects.get_or_create(
            slug=item['slug'],
            defaults={**item, 'created_by_user': user},
        )
        if created:
            seeded.append(playbook)
    return seeded


def _execute_workflow_run(run: WorkflowRun):
    payload = run.input_payload or {}
    execution_log = []
    result_payload = {'created_tasks': [], 'created_documents': [], 'created_decisions': [], 'approval_requests': [], 'messages': []}

    run.status = 'running'
    run.started_at = timezone.now()
    run.execution_log = execution_log
    run.save(update_fields=['status', 'started_at', 'execution_log', 'updated_at'])

    try:
        for index, step in enumerate(run.playbook.graph or [], start=1):
            action = str(step.get('action') or '').strip().lower()
            execution_log.append(f'[{index}] Executando {action}')

            if action == 'create_task':
                task = Task.objects.create(
                    title=_render_template_value(step.get('title') or f'Task from {run.playbook.name}', payload),
                    description=_render_template_value(step.get('description') or '', payload),
                    priority=str(step.get('priority') or 'medium'),
                    status=str(step.get('status') or 'queue'),
                    epic=run.epic,
                )
                result_payload['created_tasks'].append({'id': str(task.id), 'title': task.title})
                execution_log.append(f'[{index}] Task criada: {task.title}')
            elif action == 'create_document':
                document = CorporateDocument.objects.create(
                    title=_render_template_value(step.get('title') or f'Document from {run.playbook.name}', payload),
                    doc_type=str(step.get('doc_type') or 'brief'),
                    status=str(step.get('status') or 'active'),
                    scope=str(step.get('scope') or run.scope or 'global'),
                    area=_render_template_value(step.get('area') or payload.get('area') or '', payload),
                    initiative=_render_template_value(step.get('initiative') or payload.get('initiative') or '', payload),
                    summary=_render_template_value(step.get('summary') or '', payload),
                    content=_render_template_value(step.get('content') or '', payload),
                    task=run.task,
                    epic=run.epic,
                    created_by_user=run.created_by_user,
                    metadata={'playbook_id': str(run.playbook_id), 'run_id': str(run.id), 'step_index': index},
                )
                _sync_corporate_memory(
                    title=document.title,
                    summary=document.summary,
                    content=document.content,
                    area=document.area,
                    initiative=document.initiative,
                    source_type='document',
                    source_id=str(document.id),
                    tags=document.tags,
                    metadata=document.metadata,
                )
                result_payload['created_documents'].append({'id': str(document.id), 'title': document.title})
                execution_log.append(f'[{index}] Documento criado: {document.title}')
            elif action == 'create_decision':
                if not run.task:
                    execution_log.append(f'[{index}] Pulado: create_decision exige task vinculada.')
                    continue
                decision = DecisionRecord.objects.create(
                    task=run.task,
                    created_by_user=run.created_by_user,
                    title=_render_template_value(step.get('title') or f'Decision from {run.playbook.name}', payload),
                    summary=_render_template_value(step.get('summary') or '', payload),
                    rationale=_render_template_value(step.get('rationale') or '', payload),
                    scope='task',
                    status='accepted',
                    impact=str(step.get('impact') or 'medium'),
                    decided_by=run.created_by_user,
                    decided_at=timezone.now(),
                )
                _sync_corporate_memory(
                    title=decision.title,
                    summary=decision.summary,
                    content=decision.rationale,
                    area=str(payload.get('area') or ''),
                    initiative=str(payload.get('initiative') or ''),
                    source_type='decision',
                    source_id=str(decision.id),
                    tags=['decision', run.playbook.category],
                    metadata={'playbook_id': str(run.playbook_id), 'run_id': str(run.id)},
                )
                result_payload['created_decisions'].append({'id': str(decision.id), 'title': decision.title})
                execution_log.append(f'[{index}] Decisão criada: {decision.title}')
            elif action == 'request_approval':
                if not run.task:
                    execution_log.append(f'[{index}] Pulado: request_approval exige task vinculada.')
                    continue
                artifact_id = str(step.get('artifact_id') or payload.get('artifact_id') or '')
                artifact = Artifact.objects.filter(id=artifact_id, task=run.task).first() if artifact_id else run.task.artifacts.order_by('-created_at').first()
                if not artifact:
                    execution_log.append(f'[{index}] Pulado: nenhum artefato elegível para aprovação.')
                    continue
                approval, _ = ApprovalRequest.objects.get_or_create(
                    task=run.task,
                    artifact=artifact,
                    status='pending',
                    defaults={
                        'requested_by_agent': run.task.assigned_to,
                        'requested_by_user': run.created_by_user,
                        'rationale': _render_template_value(step.get('rationale') or f'Aprovação solicitada pelo playbook {run.playbook.name}', payload),
                    },
                )
                result_payload['approval_requests'].append({'id': str(approval.id), 'artifact_id': str(artifact.id)})
                execution_log.append(f'[{index}] Aprovação solicitada para artefato {artifact.title}')
            elif action == 'handoff_message':
                from_agent = Agent.objects.filter(id=str(step.get('from_agent_id') or payload.get('from_agent_id') or '')).first()
                to_agent = Agent.objects.filter(id=str(step.get('to_agent_id') or payload.get('to_agent_id') or '')).first()
                handoff = create_agent_handoff(
                    from_agent=from_agent,
                    to_agent=to_agent,
                    task=run.task,
                    message_type=str(step.get('message_type') or 'delegate'),
                    subject=_render_template_value(step.get('subject') or f'Handoff via {run.playbook.name}', payload),
                    body=_render_template_value(step.get('body') or '', payload),
                    payload={'playbook_id': str(run.playbook_id), 'run_id': str(run.id), 'step_index': index},
                )
                if handoff:
                    result_payload['messages'].append({'id': str(handoff.id), 'subject': handoff.subject})
                    execution_log.append(f'[{index}] Mensagem enviada: {handoff.subject}')
                else:
                    execution_log.append(f'[{index}] Pulado: handoff_message sem agentes válidos.')
            else:
                execution_log.append(f'[{index}] Pulado: ação {action} não suportada.')

        _sync_corporate_memory(
            title=f'Workflow run: {run.playbook.name}',
            summary='Execução recente de workflow/playbook registrada para reuso.',
            content='\n'.join(execution_log[-8:]),
            area=str(payload.get('area') or ''),
            initiative=str(payload.get('initiative') or ''),
            source_type='workflow_run',
            source_id=str(run.id),
            tags=['workflow', run.playbook.category],
            metadata={'playbook_id': str(run.playbook_id), 'status': 'completed'},
        )
        run.status = 'completed'
        run.completed_at = timezone.now()
        run.execution_log = execution_log
        run.result_payload = result_payload
        run.save(update_fields=['status', 'completed_at', 'execution_log', 'result_payload', 'updated_at'])
    except Exception as exc:
        execution_log.append(f'Erro: {str(exc)}')
        run.status = 'failed'
        run.completed_at = timezone.now()
        run.execution_log = execution_log
        run.result_payload = {'error': str(exc), **result_payload}
        run.save(update_fields=['status', 'completed_at', 'execution_log', 'result_payload', 'updated_at'])
    return run


def _should_request_creation_confirmation(message: str, action: dict) -> bool:
    if action.get('type') != 'create_epic' or action.get('missing'):
        return False

    normalized = _normalize_text(message)
    explicit_patterns = ['criar epico:', 'criar epic:', 'objetivo:', 'goal:']
    if any(pattern in normalized for pattern in explicit_patterns):
        return False

    soft_intent_patterns = ['gostaria de', 'quero', 'poderia', 'pode', 'seria possivel']
    return any(pattern in normalized for pattern in soft_intent_patterns)


class RegisterAPIView(APIView):
    """
    API View para registro de novo usuário
    POST /api/v1/auth/register/
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            # Generate tokens
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginAPIView(APIView):
    """
    API View para login de usuário
    POST /api/v1/auth/login/
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            username = serializer.validated_data.get('username')
            password = serializer.validated_data.get('password')
            
            user = authenticate(username=username, password=password)
            if user is not None:
                refresh = RefreshToken.for_user(user)
                return Response({
                    'user': UserSerializer(user).data,
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'error': 'Invalid credentials'
                }, status=status.HTTP_401_UNAUTHORIZED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserDetailAPIView(APIView):
    """
    API View para obter detalhes do usuário autenticado
    GET /api/v1/auth/user/
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class AgentProvidersAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        payload = {
            'providers': [
                {
                    'id': 'anthropic',
                    'label': 'Anthropic',
                    'models': ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus'],
                },
                {
                    'id': 'openai',
                    'label': 'OpenAI',
                    'models': ['gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'],
                },
                {
                    'id': 'xai',
                    'label': 'xAI (Grok)',
                    'models': ['grok-2-1212', 'grok-2-mini-1212'],
                },
                {
                    'id': 'google',
                    'label': 'Google (Gemini)',
                    'models': ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
                },
            ]
        }
        return Response(payload)


class ProviderCredentialsStatusAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if (not settings.DEBUG) and (not request.user or not request.user.is_authenticated):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        providers = ['anthropic', 'openai', 'xai', 'google']
        env_key_map = {
            'anthropic': 'ANTHROPIC_API_KEY',
            'openai': 'OPENAI_API_KEY',
            'xai': 'XAI_API_KEY',
            'google': 'GOOGLE_API_KEY',
        }
        payload = []
        for provider in providers:
            item = ProviderCredential.objects.filter(provider=provider).first()
            env_name = env_key_map.get(provider)
            env_value = (getattr(settings, env_name, '') if env_name else '') or ''
            configured = bool(item is not None or env_value)
            payload.append({
                'provider': provider,
                'configured': configured,
                'key_hint': item.key_hint if item else ('env' if env_value else ''),
                'updated_at': item.updated_at if item else None,
            })
        serializer = ProviderCredentialStatusSerializer(payload, many=True)
        return Response(serializer.data)


class ProviderCredentialsUpsertAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        if (not settings.DEBUG) and (not request.user or not request.user.is_authenticated):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = ProviderCredentialWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        provider = serializer.validated_data['provider']
        raw_key = serializer.validated_data['api_key']

        item, _ = ProviderCredential.objects.get_or_create(provider=provider)
        item.set_api_key(raw_key)
        item.save(update_fields=['encrypted_api_key', 'key_hint', 'updated_at'])

        return Response({
            'provider': provider,
            'configured': True,
            'key_hint': item.key_hint,
            'updated_at': item.updated_at,
        }, status=status.HTTP_200_OK)


class AgentViewSet(viewsets.ModelViewSet):
    """
    ViewSet para CRUD de Agentes
    """
    queryset = Agent.objects.all()
    serializer_class = AgentSerializer
    permission_classes = [AllowAny]  # Leitura pública, escrita para dev
    filterset_fields = ['type', 'state']
    search_fields = ['name', 'capabilities']
    ordering_fields = ['created_at', 'updated_at', 'last_activity']
    ordering = ['-updated_at']
    
    @action(detail=True, methods=['post'])
    def update_state(self, request, pk=None):
        """Atualizar estado do agente"""
        agent = self.get_object()
        new_state = request.data.get('state')
        
        if new_state not in dict(Agent.AGENT_STATES):
            return Response(
                {'error': 'Estado inválido'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        agent.state = new_state
        agent.last_activity = timezone.now()
        agent.save()
        
        return Response(AgentSerializer(agent).data)
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Listar agentes ativos (não bloqueados)"""
        agents = Agent.objects.filter(state__in=['idle', 'thinking'])
        serializer = self.get_serializer(agents, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def capacity(self, request):
        """Resumo de capacidade e carga operacional por agente."""
        agents = Agent.objects.all().annotate(
            queue_count=Count('tasks', filter=Q(tasks__status='queue')),
            processing_count=Count('tasks', filter=Q(tasks__status='processing')),
            blocked_count=Count('tasks', filter=Q(tasks__status='blocked')),
            review_count=Count('tasks', filter=Q(tasks__status='review')),
            completed_count=Count('tasks', filter=Q(tasks__status='completed')),
            failed_count=Count('tasks', filter=Q(tasks__status='failed')),
        )

        payload = []
        for agent in agents:
            active_load = agent.processing_count + agent.blocked_count + agent.review_count
            queued_load = agent.queue_count
            total_open = active_load + queued_load

            payload.append({
                'id': str(agent.id),
                'name': agent.name,
                'type': agent.type,
                'state': agent.state,
                'current_task_id': str(agent.current_task_id) if agent.current_task_id else None,
                'counts': {
                    'queue': agent.queue_count,
                    'processing': agent.processing_count,
                    'blocked': agent.blocked_count,
                    'review': agent.review_count,
                    'completed': agent.completed_count,
                    'failed': agent.failed_count,
                },
                'load': {
                    'active': active_load,
                    'queued': queued_load,
                    'open_total': total_open,
                },
            })

        payload.sort(key=lambda item: item['load']['open_total'], reverse=True)
        return Response(payload)

    @action(detail=False, methods=['get'])
    def providers(self, request):
        payload = {
            'providers': [
                {
                    'id': 'anthropic',
                    'label': 'Anthropic',
                    'models': ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus'],
                },
                {
                    'id': 'openai',
                    'label': 'OpenAI',
                    'models': ['gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'],
                },
                {
                    'id': 'xai',
                    'label': 'xAI (Grok)',
                    'models': ['grok-2-1212', 'grok-2-mini-1212'],
                },
                {
                    'id': 'google',
                    'label': 'Google (Gemini)',
                    'models': ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
                },
            ]
        }
        return Response(payload)

    @action(detail=False, methods=['get'], url_path='credentials/status')
    def credentials_status(self, request):
        if (not settings.DEBUG) and (not request.user or not request.user.is_authenticated):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        providers = ['anthropic', 'openai', 'xai', 'google']
        env_key_map = {
            'anthropic': 'ANTHROPIC_API_KEY',
            'openai': 'OPENAI_API_KEY',
            'xai': 'XAI_API_KEY',
            'google': 'GOOGLE_API_KEY',
        }
        payload = []
        for provider in providers:
            item = ProviderCredential.objects.filter(provider=provider).first()
            env_name = env_key_map.get(provider)
            env_value = (getattr(settings, env_name, '') if env_name else '') or ''
            configured = bool(item is not None or env_value)
            payload.append({
                'provider': provider,
                'configured': configured,
                'key_hint': item.key_hint if item else ('env' if env_value else ''),
                'updated_at': item.updated_at if item else None,
            })
        serializer = ProviderCredentialStatusSerializer(payload, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='credentials')
    def upsert_credentials(self, request):
        if (not settings.DEBUG) and (not request.user or not request.user.is_authenticated):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = ProviderCredentialWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        provider = serializer.validated_data['provider']
        raw_key = serializer.validated_data['api_key']

        item, _ = ProviderCredential.objects.get_or_create(provider=provider)
        item.set_api_key(raw_key)
        item.save(update_fields=['encrypted_api_key', 'key_hint', 'updated_at'])

        return Response({
            'provider': provider,
            'configured': True,
            'key_hint': item.key_hint,
            'updated_at': item.updated_at,
        }, status=status.HTTP_200_OK)


class EpicViewSet(viewsets.ModelViewSet):
    """
    ViewSet para CRUD de Épicos
    """
    queryset = Epic.objects.all()
    serializer_class = EpicSerializer
    permission_classes = [AllowAny]  # Léitura pública, escrita para dev
    filterset_fields = ['status', 'priority']
    search_fields = ['goal', 'description']
    ordering_fields = ['created_at', 'updated_at', 'priority']
    ordering = ['-created_at']
    
    def perform_create(self, serializer):
        """Salvar epic com usuário atual"""
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(created_by=user)

    def perform_update(self, serializer):
        """Handle status transitions and seed queue when an epic is approved."""
        previous_status = serializer.instance.status
        epic = serializer.save()
        if previous_status != 'approved' and epic.status == 'approved':
            ensure_epic_task_queue(epic)
    
    @action(detail=True, methods=['get'])
    def tasks(self, request, pk=None):
        """Listar tarefas de um épico"""
        epic = self.get_object()
        tasks = epic.tasks.all()
        serializer = TaskSerializer(tasks, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_status(self, request):
        """Agrupar épicos por status"""
        statuses = dict(Epic.STATUS_CHOICES)
        result = {}
        for status_key, status_label in statuses.items():
            epics = Epic.objects.filter(status=status_key)
            result[status_key] = EpicSerializer(epics, many=True).data
        return Response(result)


class AgentMessageViewSet(viewsets.ModelViewSet):
    """Node-to-node structured messages between agents."""

    queryset = AgentMessage.objects.select_related('from_agent', 'to_agent', 'task', 'parent_message')
    serializer_class = AgentMessageSerializer
    permission_classes = [AllowAny]
    filterset_fields = ['from_agent', 'to_agent', 'task', 'message_type', 'status']
    ordering_fields = ['created_at', 'delivered_at', 'acknowledged_at']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        message = serializer.save(status='delivered', delivered_at=timezone.now())
        if message.task_id:
            record_task_event(
                message.task,
                'updated',
                f'Handoff {message.from_agent.name} -> {message.to_agent.name}: {message.subject or message.message_type}',
                agent=message.from_agent,
                metadata={
                    'agent_message_id': str(message.id),
                    'message_type': message.message_type,
                    'to_agent_id': str(message.to_agent_id),
                    'trace_id': message.trace_id,
                    'correlation_id': message.correlation_id,
                },
            )

    @action(detail=False, methods=['get'])
    def inbox(self, request):
        to_agent = request.query_params.get('to_agent')
        if not to_agent:
            return Response({'error': 'Query param to_agent é obrigatório.'}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.get_queryset().filter(to_agent_id=to_agent)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def outbox(self, request):
        from_agent = request.query_params.get('from_agent')
        if not from_agent:
            return Response({'error': 'Query param from_agent é obrigatório.'}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.get_queryset().filter(from_agent_id=from_agent)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        message = self.get_object()
        serializer = AgentMessageAckSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data['status']

        message.status = new_status
        if new_status == 'acknowledged':
            message.acknowledged_at = timezone.now()
        message.save(update_fields=['status', 'acknowledged_at'])

        return Response(self.get_serializer(message).data)


class CorporateDocumentViewSet(viewsets.ModelViewSet):
    queryset = CorporateDocument.objects.all().select_related('task', 'epic', 'created_by_agent', 'created_by_user')
    serializer_class = CorporateDocumentSerializer
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]
    filterset_fields = ['doc_type', 'status', 'scope', 'area', 'initiative', 'task', 'epic']
    search_fields = ['title', 'summary', 'content', 'area', 'initiative']
    ordering_fields = ['updated_at', 'created_at', 'version']
    ordering = ['-updated_at']

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        document = serializer.save(created_by_user=user)
        if document.task_id and not document.created_by_agent:
            document.created_by_agent = document.task.assigned_to
            document.save(update_fields=['created_by_agent', 'updated_at'])
        _sync_corporate_memory(
            title=document.title,
            summary=document.summary,
            content=document.content,
            area=document.area,
            initiative=document.initiative,
            source_type='document',
            source_id=str(document.id),
            tags=document.tags,
            metadata=document.metadata,
        )

    def perform_update(self, serializer):
        previous = serializer.instance
        document = serializer.save(version=(previous.version or 1) + 1)
        _sync_corporate_memory(
            title=document.title,
            summary=document.summary,
            content=document.content,
            area=document.area,
            initiative=document.initiative,
            source_type='document',
            source_id=str(document.id),
            tags=document.tags,
            metadata=document.metadata,
        )

    @action(detail=False, methods=['post'])
    def upload(self, request):
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'error': 'Arquivo é obrigatório.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            extracted_text, content_type = _extract_uploaded_document(uploaded_file)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'error': f'Falha ao processar arquivo: {exc}'}, status=status.HTTP_400_BAD_REQUEST)

        title = (request.data.get('title') or Path(uploaded_file.name).stem or 'Documento anexado').strip()
        summary = (request.data.get('summary') or extracted_text[:280]).strip()
        area = (request.data.get('area') or '').strip()
        initiative = (request.data.get('initiative') or '').strip()
        doc_type = (request.data.get('doc_type') or 'brief').strip() or 'brief'
        scope = (request.data.get('scope') or 'org').strip() or 'org'
        status_value = (request.data.get('status') or 'active').strip() or 'active'
        tags = [tag.strip() for tag in str(request.data.get('tags') or '').split(',') if tag.strip()]
        tags = list(dict.fromkeys([doc_type, Path(uploaded_file.name).suffix.lower().lstrip('.'), *tags]))

        document = CorporateDocument.objects.create(
            title=title,
            doc_type=doc_type,
            status=status_value,
            scope=scope,
            area=area,
            initiative=initiative,
            summary=summary,
            content=extracted_text,
            tags=tags,
            created_by_user=request.user if request.user.is_authenticated else None,
            metadata={
                'source': 'upload',
                'source_format': Path(uploaded_file.name).suffix.lower().lstrip('.'),
                'mime_type': content_type,
            },
        )
        file_meta = _persist_uploaded_document(uploaded_file, str(document.id))
        document.metadata = {**(document.metadata or {}), 'attachment': file_meta}
        document.save(update_fields=['metadata', 'updated_at'])

        _sync_corporate_memory(
            title=document.title,
            summary=document.summary,
            content=document.content,
            area=document.area,
            initiative=document.initiative,
            source_type='document',
            source_id=str(document.id),
            tags=document.tags,
            metadata=document.metadata,
        )

        return Response(self.get_serializer(document).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def prompt_context(self, request):
        query = request.query_params.get('q', '')
        area = request.query_params.get('area', '')
        initiative = request.query_params.get('initiative', '')
        context_payload = _build_corporate_context(query, area=area, initiative=initiative)

        return Response({
            'query': query,
            'area': area,
            'initiative': initiative,
            'prompt_markdown': context_payload['prompt_markdown'],
            'documents': CorporateDocumentSerializer(context_payload['documents'], many=True).data,
            'memory_entries': CorporateMemoryEntrySerializer(context_payload['memory_entries'], many=True).data,
        })

    @action(detail=False, methods=['get'])
    def context_graph(self, request):
        return Response(_build_document_graph())


class CorporateMemoryEntryViewSet(viewsets.ModelViewSet):
    queryset = CorporateMemoryEntry.objects.all()
    serializer_class = CorporateMemoryEntrySerializer
    permission_classes = [AllowAny]
    filterset_fields = ['area', 'initiative', 'source_type']
    search_fields = ['title', 'summary', 'content']
    ordering_fields = ['updated_at', 'created_at', 'times_reused']
    ordering = ['-updated_at']

    @action(detail=True, methods=['post'])
    def mark_reused(self, request, pk=None):
        entry = self.get_object()
        entry.times_reused += 1
        entry.last_used_at = timezone.now()
        entry.save(update_fields=['times_reused', 'last_used_at', 'updated_at'])
        return Response(self.get_serializer(entry).data)


class WorkflowPlaybookViewSet(viewsets.ModelViewSet):
    queryset = WorkflowPlaybook.objects.all().prefetch_related('runs')
    serializer_class = WorkflowPlaybookSerializer
    permission_classes = [AllowAny]
    filterset_fields = ['category', 'scope', 'status', 'is_template']
    search_fields = ['name', 'slug', 'description', 'category']
    ordering_fields = ['name', 'updated_at', 'created_at']
    ordering = ['name']

    def perform_create(self, serializer):
        serializer.save(created_by_user=self.request.user if self.request.user.is_authenticated else None)

    @action(detail=False, methods=['post'])
    def seed_templates(self, request):
        items = _seed_playbook_templates(request.user if request.user.is_authenticated else None)
        serializer = self.get_serializer(items, many=True)
        return Response({'created_count': len(items), 'items': serializer.data})

    @action(detail=True, methods=['post'])
    def run(self, request, pk=None):
        playbook = self.get_object()
        run = WorkflowRun.objects.create(
            playbook=playbook,
            scope=(request.data.get('scope') or playbook.scope or 'global'),
            input_payload=request.data.get('input_payload') or {},
            task=Task.objects.filter(id=(request.data.get('task_id') or '')).first(),
            epic=Epic.objects.filter(id=(request.data.get('epic_id') or '')).first(),
            created_by_user=request.user if request.user.is_authenticated else None,
        )
        _execute_workflow_run(run)
        return Response(WorkflowRunSerializer(run).data, status=status.HTTP_201_CREATED)


class WorkflowRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WorkflowRun.objects.all().select_related('playbook', 'task', 'epic', 'created_by_user')
    serializer_class = WorkflowRunSerializer
    permission_classes = [AllowAny]
    filterset_fields = ['status', 'playbook', 'scope', 'task', 'epic']
    ordering_fields = ['created_at', 'started_at', 'completed_at']
    ordering = ['-created_at']


class TaskViewSet(viewsets.ModelViewSet):
    """
    ViewSet para CRUD de Tarefas
    """
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [AllowAny]  # Léitura pública, escrita para dev
    filterset_fields = ['status', 'priority', 'epic', 'assigned_to']
    search_fields = ['title', 'description']
    ordering_fields = ['created_at', 'updated_at', 'priority']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action in ('retrieve', 'workspace'):
            return TaskDetailSerializer
        return TaskSerializer

    def perform_create(self, serializer):
        task = serializer.save()
        record_task_event(task, 'created', 'Tarefa criada', metadata={'status': task.status, 'priority': task.priority})

    def perform_update(self, serializer):
        previous = serializer.instance
        previous_assigned_to = previous.assigned_to
        previous_status = previous.status
        previous_due_at = previous.due_at
        previous_error = previous.error

        task = serializer.save()

        if previous_assigned_to != task.assigned_to:
            from_name = previous_assigned_to.name if previous_assigned_to else 'Sem responsável'
            to_name = task.assigned_to.name if task.assigned_to else 'Sem responsável'
            record_task_event(
                task,
                'assigned',
                f'Handoff de responsabilidade: {from_name} -> {to_name}',
                agent=task.assigned_to,
                metadata={
                    'from_agent_id': str(previous_assigned_to.id) if previous_assigned_to else None,
                    'to_agent_id': str(task.assigned_to.id) if task.assigned_to else None,
                },
            )
            handoff = create_agent_handoff(
                from_agent=previous_assigned_to,
                to_agent=task.assigned_to,
                task=task,
                message_type='delegate',
                subject=f'Handoff de tarefa: {task.title}',
                body=(
                    f'Responsabilidade da tarefa transferida de {from_name} para {to_name}.\n\n'
                    f'Status atual: {task.status}\nPrioridade: {task.priority}\n\n'
                    f'Descrição: {task.description or "Sem descrição adicional."}'
                ),
                payload={
                    'source': 'task_update',
                    'task_id': str(task.id),
                    'task_title': task.title,
                    'from_agent_id': str(previous_assigned_to.id) if previous_assigned_to else None,
                    'to_agent_id': str(task.assigned_to.id) if task.assigned_to else None,
                    'status': task.status,
                    'priority': task.priority,
                },
            )
            if handoff:
                record_task_event(
                    task,
                    'updated',
                    f'Mensagem node-to-node criada para o handoff {from_name} -> {to_name}',
                    agent=previous_assigned_to,
                    metadata={
                        'agent_message_id': str(handoff.id),
                        'message_type': handoff.message_type,
                    },
                )

        if previous_status != task.status:
            record_task_event(
                task,
                'updated',
                f'Status alterado: {previous_status} -> {task.status}',
                agent=task.assigned_to,
                metadata={'from_status': previous_status, 'to_status': task.status},
            )

        if previous_due_at != task.due_at:
            record_task_event(
                task,
                'updated',
                'Prazo da tarefa atualizado',
                agent=task.assigned_to,
                metadata={
                    'from_due_at': previous_due_at.isoformat() if previous_due_at else None,
                    'to_due_at': task.due_at.isoformat() if task.due_at else None,
                },
            )

        if previous_error != task.error and task.error:
            record_task_event(
                task,
                'blocked' if task.status == 'blocked' else 'updated',
                f'Motivo atualizado: {task.error[:180]}',
                agent=task.assigned_to,
                metadata={'status': task.status},
            )
    
    @action(detail=True, methods=['post'])
    def execute(self, request, pk=None):
        """Executar uma tarefa com Claude via execution engine"""
        task = self.get_object()

        if task.clarification_requests.filter(status='pending').exists():
            task.status = 'blocked'
            task.save(update_fields=['status'])
            return Response(
                {'error': 'Tarefa bloqueada aguardando esclarecimento do piloto'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if _task_needs_clarification(task):
            question = (
                "Quais critérios de aceitação devem ser validados neste card do Kanban? "
                "Descreva resultado esperado, restrições e exemplos de sucesso."
            )
            req = ClarificationRequest.objects.create(
                task=task,
                agent=task.assigned_to,
                question=question,
                status='pending',
            )
            task.status = 'blocked'
            task.error = 'Aguardando esclarecimento do piloto'
            task.save(update_fields=['status', 'error'])

            _broadcast('tasks_updates', 'task_updated', {
                'task_id': str(task.id),
                'data': {'status': 'blocked', 'error': task.error, 'latest_question': question}
            })
            _broadcast('thought_logs', 'thought_log_received', {
                'agent_id': str(task.assigned_to.id) if task.assigned_to else None,
                'agent_name': task.assigned_to.name if task.assigned_to else 'Coordinator',
                'message': f'❓ Esclarecimento solicitado: {question}',
                'level': 'warning',
                'timestamp': timezone.now().isoformat(),
            })
            return Response(
                {
                    'error': 'Tarefa bloqueada por falta de contexto',
                    'clarification_id': str(req.id),
                    'question': question,
                    'task_id': str(task.id),
                },
                status=status.HTTP_409_CONFLICT,
            )

        if task.status == 'processing':
            return Response(
                {'error': 'Tarefa já está em execução'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if task.status == 'completed':
            return Response(
                {'error': 'Tarefa já foi completada. Use retry para re-executar.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        task = _start_task_processing(task)

        return Response(TaskSerializer(task).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """Re-executar uma tarefa que falhou"""
        task = self.get_object()
        if task.status not in ('failed', 'queue', 'blocked'):
            return Response(
                {'error': 'Apenas tarefas em fila, bloqueadas ou com falha podem ser re-executadas'},
                status=status.HTTP_400_BAD_REQUEST
            )
        task.status = 'queue'
        task.error = ''
        task.result = None
        task.save(update_fields=['status', 'error', 'result'])
        record_task_event(task, 'updated', 'Tarefa reencaminhada para nova execução', metadata={'status': task.status})
        return self.execute(request, pk=pk)

    @action(detail=True, methods=['post'])
    def request_clarification(self, request, pk=None):
        """Solicita esclarecimento ao piloto e bloqueia a tarefa."""
        task = self.get_object()
        question = request.data.get('question', '').strip()
        if not question:
            return Response({'error': 'Pergunta é obrigatória'}, status=status.HTTP_400_BAD_REQUEST)

        req = ClarificationRequest.objects.create(
            task=task,
            agent=task.assigned_to,
            question=question,
            status='pending',
        )

        task.status = 'blocked'
        task.error = 'Aguardando esclarecimento do piloto'
        task.save(update_fields=['status', 'error'])
        record_task_event(task, 'blocked', 'Tarefa bloqueada aguardando esclarecimento do piloto', agent=task.assigned_to, metadata={'question': question, 'clarification_id': str(req.id)})

        if task.assigned_to:
            task.assigned_to.state = 'blocked'
            task.assigned_to.save(update_fields=['state'])

        _broadcast('tasks_updates', 'task_updated', {
            'task_id': str(task.id),
            'data': {'status': 'blocked', 'error': task.error}
        })
        _broadcast('thought_logs', 'thought_log_received', {
            'agent_id': str(task.assigned_to.id) if task.assigned_to else None,
            'agent_name': task.assigned_to.name if task.assigned_to else 'Coordinator',
            'message': f'❓ Esclarecimento solicitado: {question}',
            'level': 'warning',
            'timestamp': timezone.now().isoformat(),
        })

        return Response(ClarificationRequestSerializer(req).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def clarifications(self, request, pk=None):
        """Lista solicitações de esclarecimento da tarefa."""
        task = self.get_object()
        items = task.clarification_requests.all()
        return Response(ClarificationRequestSerializer(items, many=True).data)

    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        """Retorna os logs de pensamento de uma tarefa"""
        task = self.get_object()
        logs = ThoughtLog.objects.filter(task=task).order_by('timestamp')
        serializer = ThoughtLogSerializer(logs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def workspace(self, request, pk=None):
        """Retorna a workspace operacional da tarefa com eventos, artefatos e subtarefas."""
        task = self.get_object()
        serializer = TaskDetailSerializer(task)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def file_change_preview(self, request, pk=None):
        """Gera diff e valida policy sem alterar arquivos."""
        task = self.get_object()
        relative_path = (request.data.get('relative_path') or '').strip()
        new_content = request.data.get('new_content') or ''

        if not relative_path:
            return Response({'error': 'relative_path é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

        preview = preview_file_change(str(task.id), relative_path, str(new_content))
        return Response(preview, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def request_approval(self, request, pk=None):
        """Cria solicitação formal de aprovação para artefato sensível."""
        task = self.get_object()
        artifact_id = (request.data.get('artifact_id') or '').strip()
        rationale = (request.data.get('rationale') or '').strip()

        if not artifact_id:
            return Response({'error': 'artifact_id é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

        artifact = Artifact.objects.filter(id=artifact_id, task=task).first()
        if not artifact:
            return Response({'error': 'Artefato não encontrado para esta tarefa'}, status=status.HTTP_404_NOT_FOUND)

        pending = ApprovalRequest.objects.filter(task=task, artifact=artifact, status='pending').first()
        if pending:
            return Response(ApprovalRequestSerializer(pending).data, status=status.HTTP_200_OK)

        approval = ApprovalRequest.objects.create(
            task=task,
            artifact=artifact,
            requested_by_agent=task.assigned_to,
            requested_by_user=request.user if request.user.is_authenticated else None,
            rationale=rationale or f'Aprovação necessária para aplicar mudança em {artifact.relative_path or artifact.title}',
        )

        DecisionRecord.objects.create(
            task=task,
            artifact=artifact,
            approval_request=approval,
            created_by_agent=task.assigned_to,
            created_by_user=request.user if request.user.is_authenticated else None,
            title=f'Decidir aplicação de {artifact.relative_path or artifact.title}',
            summary='Mudança sensível aguardando decisão formal antes de aplicar no workspace.',
            rationale=approval.rationale,
            scope='task',
            status='proposed',
            impact='high' if artifact.artifact_type == 'diff' else 'medium',
        )

        task.status = 'blocked'
        task.error = 'Aguardando aprovação formal para aplicar artefato sensível'
        task.save(update_fields=['status', 'error'])

        record_task_event(
            task,
            'approval_requested',
            f'Aprovação solicitada para artefato: {artifact.title}',
            agent=task.assigned_to,
            metadata={'approval_id': str(approval.id), 'artifact_id': str(artifact.id)},
        )

        return Response(ApprovalRequestSerializer(approval).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def decide_approval(self, request, pk=None):
        """Registra decisão formal da solicitação de aprovação."""
        task = self.get_object()
        approval_id = (request.data.get('approval_id') or '').strip()
        decision = (request.data.get('decision') or '').strip().lower()
        notes = (request.data.get('notes') or '').strip()

        if not approval_id:
            return Response({'error': 'approval_id é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

        if decision not in ('approved', 'rejected'):
            return Response({'error': 'decision deve ser approved ou rejected'}, status=status.HTTP_400_BAD_REQUEST)

        approval = ApprovalRequest.objects.filter(id=approval_id, task=task, status='pending').select_related('artifact').first()
        if not approval:
            return Response({'error': 'Solicitação pendente não encontrada'}, status=status.HTTP_404_NOT_FOUND)

        approval.status = decision
        approval.decision_notes = notes
        approval.decided_by = request.user if request.user.is_authenticated else None
        approval.decided_at = timezone.now()
        approval.save(update_fields=['status', 'decision_notes', 'decided_by', 'decided_at', 'updated_at'])

        decision_record = DecisionRecord.objects.filter(approval_request=approval, task=task).order_by('-created_at').first()
        if decision_record:
            decision_record.status = 'accepted' if decision == 'approved' else 'rejected'
            decision_record.decided_by = request.user if request.user.is_authenticated else None
            decision_record.decided_at = approval.decided_at
            decision_record.summary = notes or decision_record.summary
            decision_record.save(update_fields=['status', 'decided_by', 'decided_at', 'summary', 'updated_at'])

        if decision == 'approved':
            if approval.artifact and approval.artifact.status == 'proposed':
                approval.artifact.status = 'approved'
                approval.artifact.save(update_fields=['status', 'updated_at'])
            task.error = 'Aprovação concedida. Pronto para aplicar mudança.'
            record_task_event(
                task,
                'approved',
                f'Aprovação concedida para artefato: {approval.artifact.title if approval.artifact else "n/a"}',
                agent=task.assigned_to,
                metadata={'approval_id': str(approval.id), 'artifact_id': str(approval.artifact_id) if approval.artifact_id else None},
            )
        else:
            task.error = notes or 'Solicitação de aprovação rejeitada'
            record_task_event(
                task,
                'blocked',
                f'Aprovação rejeitada para artefato: {approval.artifact.title if approval.artifact else "n/a"}',
                agent=task.assigned_to,
                metadata={'approval_id': str(approval.id), 'artifact_id': str(approval.artifact_id) if approval.artifact_id else None},
            )

        task.status = 'blocked'
        task.save(update_fields=['status', 'error'])

        return Response(ApprovalRequestSerializer(approval).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def create_decision(self, request, pk=None):
        """Cria registro manual de decisão vinculado à task."""
        task = self.get_object()
        title = (request.data.get('title') or '').strip()
        summary = (request.data.get('summary') or '').strip()
        rationale = (request.data.get('rationale') or '').strip()
        scope = (request.data.get('scope') or 'task').strip()
        impact = (request.data.get('impact') or 'medium').strip()
        artifact_id = (request.data.get('artifact_id') or '').strip()

        if not title:
            return Response({'error': 'title é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

        artifact = None
        if artifact_id:
            artifact = Artifact.objects.filter(id=artifact_id, task=task).first()
            if not artifact:
                return Response({'error': 'artifact_id inválido para esta task'}, status=status.HTTP_400_BAD_REQUEST)

        decision = DecisionRecord.objects.create(
            task=task,
            artifact=artifact,
            created_by_agent=task.assigned_to,
            created_by_user=request.user if request.user.is_authenticated else None,
            title=title,
            summary=summary,
            rationale=rationale,
            scope=scope if scope in {'task', 'epic', 'org'} else 'task',
            status='accepted',
            impact=impact if impact in {'low', 'medium', 'high'} else 'medium',
            decided_by=request.user if request.user.is_authenticated else None,
            decided_at=timezone.now(),
        )

        record_task_event(
            task,
            'updated',
            f'Decisão registrada: {decision.title}',
            agent=task.assigned_to,
            metadata={'decision_id': str(decision.id), 'impact': decision.impact, 'scope': decision.scope},
        )

        create_artifact(
            title=f'Decisão: {decision.title}',
            artifact_type='decision',
            task=task,
            epic=task.epic,
            agent=task.assigned_to,
            status='available',
            preview=decision.summary,
            content=decision.rationale,
            payload={
                'decision_id': str(decision.id),
                'status': decision.status,
                'impact': decision.impact,
                'scope': decision.scope,
            },
        )

        _sync_corporate_memory(
            title=decision.title,
            summary=decision.summary,
            content=decision.rationale,
            area=task.assigned_to.organization if task.assigned_to else '',
            initiative=task.epic.goal if task.epic else task.title,
            source_type='decision',
            source_id=str(decision.id),
            tags=['decision', decision.scope, decision.impact],
            metadata={'task_id': str(task.id), 'epic_id': str(task.epic_id) if task.epic_id else None},
        )

        return Response(DecisionRecordSerializer(decision).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def supersede_decision(self, request, pk=None):
        """Marca decisão atual como substituída e cria nova decisão sucessora."""
        task = self.get_object()
        decision_id = (request.data.get('decision_id') or '').strip()
        replacement_title = (request.data.get('replacement_title') or '').strip()
        replacement_summary = (request.data.get('replacement_summary') or '').strip()
        replacement_rationale = (request.data.get('replacement_rationale') or '').strip()

        if not decision_id:
            return Response({'error': 'decision_id é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        if not replacement_title:
            return Response({'error': 'replacement_title é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

        previous = DecisionRecord.objects.filter(id=decision_id, task=task).first()
        if not previous:
            return Response({'error': 'Decisão não encontrada para esta task'}, status=status.HTTP_404_NOT_FOUND)

        previous.status = 'superseded'
        previous.decided_by = request.user if request.user.is_authenticated else previous.decided_by
        previous.decided_at = timezone.now()
        previous.save(update_fields=['status', 'decided_by', 'decided_at', 'updated_at'])

        replacement = DecisionRecord.objects.create(
            task=task,
            artifact=previous.artifact,
            approval_request=previous.approval_request,
            supersedes=previous,
            created_by_agent=task.assigned_to,
            created_by_user=request.user if request.user.is_authenticated else None,
            decided_by=request.user if request.user.is_authenticated else None,
            title=replacement_title,
            summary=replacement_summary,
            rationale=replacement_rationale,
            scope=previous.scope,
            status='accepted',
            impact=previous.impact,
            decided_at=timezone.now(),
        )

        record_task_event(
            task,
            'updated',
            f'Decisão substituída: {previous.title} -> {replacement.title}',
            agent=task.assigned_to,
            metadata={
                'decision_id': str(previous.id),
                'replacement_decision_id': str(replacement.id),
            },
        )

        create_artifact(
            title=f'Decisão substituída: {replacement.title}',
            artifact_type='decision',
            task=task,
            epic=task.epic,
            agent=task.assigned_to,
            status='available',
            preview=replacement.summary,
            content=replacement.rationale,
            payload={
                'decision_id': str(replacement.id),
                'supersedes': str(previous.id),
                'status': replacement.status,
                'impact': replacement.impact,
                'scope': replacement.scope,
            },
        )

        _sync_corporate_memory(
            title=replacement.title,
            summary=replacement.summary,
            content=replacement.rationale,
            area=task.assigned_to.organization if task.assigned_to else '',
            initiative=task.epic.goal if task.epic else task.title,
            source_type='decision',
            source_id=str(replacement.id),
            tags=['decision', 'superseded', replacement.scope],
            metadata={'task_id': str(task.id), 'supersedes': str(previous.id)},
        )

        return Response(DecisionRecordSerializer(replacement).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def apply_file_change(self, request, pk=None):
        """Aplica mudança de arquivo somente com aprovação explícita."""
        task = self.get_object()
        relative_path = (request.data.get('relative_path') or '').strip()
        new_content = request.data.get('new_content') or ''
        approved = bool(request.data.get('approved', False))
        artifact_id = (request.data.get('artifact_id') or '').strip()
        approval_request_id = (request.data.get('approval_request_id') or '').strip()

        if not relative_path:
            return Response({'error': 'relative_path é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

        approval = None
        if approved:
            if not approval_request_id:
                return Response({'error': 'approval_request_id é obrigatório para aplicar mudança'}, status=status.HTTP_400_BAD_REQUEST)

            approval = ApprovalRequest.objects.filter(id=approval_request_id, task=task, status='approved').select_related('artifact').first()
            if not approval:
                return Response({'error': 'Aprovação válida não encontrada para esta tarefa'}, status=status.HTTP_400_BAD_REQUEST)

            if artifact_id and approval.artifact_id and str(approval.artifact_id) != artifact_id:
                return Response({'error': 'approval_request_id não corresponde ao artifact_id informado'}, status=status.HTTP_400_BAD_REQUEST)

            if approval.artifact and approval.artifact.relative_path and approval.artifact.relative_path != relative_path:
                return Response({'error': 'A aprovação não corresponde ao arquivo solicitado'}, status=status.HTTP_400_BAD_REQUEST)

        result = apply_file_change(
            task_id=str(task.id),
            relative_path=relative_path,
            new_content=str(new_content),
            approved=approved,
        )

        if task.result is None or not isinstance(task.result, dict):
            task.result = {}
        task.result['last_file_change'] = result

        if result.get('applied'):
            file_change_plan = task.result.get('file_change_plan') or []
            updated_plan = []
            for item in file_change_plan:
                if item.get('relative_path') == relative_path:
                    item = {
                        **item,
                        'applied': True,
                        'applied_at': timezone.now().isoformat(),
                        'snapshot_id': result.get('snapshot', {}).get('snapshot_id', ''),
                    }
                updated_plan.append(item)
            task.result['file_change_plan'] = updated_plan

            Artifact.objects.filter(
                task=task,
                artifact_type='diff',
                relative_path=relative_path,
                status='proposed',
            ).update(status='applied', payload=result)

            if artifact_id:
                Artifact.objects.filter(id=artifact_id, task=task).update(status='applied', payload=result)

            create_artifact(
                title=f'Mudança aplicada: {relative_path}',
                artifact_type='diff',
                task=task,
                epic=task.epic,
                agent=task.assigned_to,
                status='applied',
                relative_path=relative_path,
                preview=result.get('diff', ''),
                payload=result,
            )
            record_task_event(
                task,
                'approved',
                f'Mudança aprovada e aplicada em {relative_path}',
                agent=task.assigned_to,
                metadata={
                    'relative_path': relative_path,
                    'approval_id': str(approval.id) if approval else None,
                    'artifact_id': artifact_id or (str(approval.artifact_id) if approval and approval.artifact_id else None),
                },
            )

            if updated_plan and all(item.get('applied') for item in updated_plan):
                task.status = 'review'
                task.error = ''
                record_task_event(task, 'updated', 'Todas as mudanças propostas foram aplicadas; tarefa movida para revisão', agent=task.assigned_to)

        task.save(update_fields=['result', 'status', 'error'] if result.get('applied') else ['result'])
        result['task_status'] = task.status

        http_status = status.HTTP_200_OK if result.get('applied') else status.HTTP_400_BAD_REQUEST
        return Response(result, status=http_status)

    @action(detail=True, methods=['post'])
    def rollback_file_snapshot(self, request, pk=None):
        """Restaura o workspace isolado da tarefa para um snapshot específico."""
        task = self.get_object()
        snapshot_id = (request.data.get('snapshot_id') or '').strip()
        if not snapshot_id:
            return Response({'error': 'snapshot_id é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

        result = rollback_snapshot(str(task.id), snapshot_id)
        if result.get('rolled_back'):
            create_artifact(
                title=f'Rollback do snapshot {snapshot_id}',
                artifact_type='snapshot',
                task=task,
                epic=task.epic,
                agent=task.assigned_to,
                status='available',
                payload=result,
            )
            record_task_event(task, 'rolled_back', f'Rollback executado para o snapshot {snapshot_id}', agent=task.assigned_to, metadata=result)
        http_status = status.HTTP_200_OK if result.get('rolled_back') else status.HTTP_400_BAD_REQUEST
        return Response(result, status=http_status)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Marcar tarefa como completada"""
        task = self.get_object()
        task.status = 'completed'
        task.result = request.data.get('result', {})
        task.completed_at = timezone.now()
        task.save()
        record_task_event(task, 'completed', 'Tarefa concluída manualmente', agent=task.assigned_to)

        if task.assigned_to:
            task.assigned_to.state = 'idle'
            task.assigned_to.current_task = None
            task.assigned_to.save()

        return Response(TaskSerializer(task).data)

    @action(detail=True, methods=['post'])
    def fail(self, request, pk=None):
        """Marcar tarefa como falha"""
        task = self.get_object()
        task.status = 'failed'
        task.error = request.data.get('error', '')
        task.completed_at = timezone.now()
        task.save()
        record_task_event(task, 'failed', 'Tarefa marcada como falha manualmente', agent=task.assigned_to, metadata={'error': task.error})

        if task.assigned_to:
            task.assigned_to.state = 'idle'
            task.assigned_to.current_task = None
            task.assigned_to.save()

        return Response(TaskSerializer(task).data)

    @action(detail=False, methods=['get'])
    def by_status(self, request):
        """Agrupar tarefas por status"""
        statuses = dict(Task.STATUS_CHOICES)
        result = {}
        for status_key, status_label in statuses.items():
            tasks = Task.objects.filter(status=status_key)
            result[status_key] = TaskSerializer(tasks, many=True).data
        return Response(result)


class ClarificationRequestViewSet(viewsets.ModelViewSet):
    """ViewSet para human-in-the-loop"""
    queryset = ClarificationRequest.objects.all()
    serializer_class = ClarificationRequestSerializer
    permission_classes = [AllowAny]
    filterset_fields = ['status', 'task', 'agent']
    ordering_fields = ['created_at', 'updated_at', 'answered_at']
    ordering = ['-created_at']

    @action(detail=True, methods=['post'])
    def answer(self, request, pk=None):
        item = self.get_object()
        if item.status == 'answered':
            return Response(ClarificationRequestSerializer(item).data)

        answer = request.data.get('answer', '').strip()
        if not answer:
            return Response({'error': 'Resposta é obrigatória'}, status=status.HTTP_400_BAD_REQUEST)

        item.answer = answer
        item.status = 'answered'
        item.answered_by = request.user if request.user.is_authenticated else None
        item.answered_at = timezone.now()
        item.save(update_fields=['answer', 'status', 'answered_by', 'answered_at', 'updated_at'])

        task = item.task

        # Expire stale pending clarifications so execute() won't block again.
        ClarificationRequest.objects.filter(task=task, status='pending').exclude(pk=item.pk).update(status='expired')

        action_plan = _build_action_plan(item.question, answer)
        clarification_ctx = (
            f"\n\n[CLARIFICATION_CONTEXT]\n"
            f"Pergunta: {item.question}\n"
            f"Resposta do piloto: {answer}\n"
            f"Checklist de ação: " + " | ".join(action_plan)
        )
        if '[CLARIFICATION_CONTEXT]' not in (task.description or ''):
            task.description = (task.description or '').strip() + clarification_ctx

        task.error = ''
        task.status = 'queue'
        task.result = {
            'action_plan': action_plan,
            'clarification': {
                'question': item.question,
                'answer': answer,
            },
            'state': 'ready_to_resume'
        }
        task.save(update_fields=['description', 'error', 'status', 'result'])

        if task.assigned_to and task.assigned_to.state == 'blocked':
            task.assigned_to.state = 'idle'
            task.assigned_to.save(update_fields=['state'])

        log_agent = task.assigned_to or Agent.objects.first()
        if log_agent:
            ThoughtLog.objects.create(
                agent=log_agent,
                task=task,
                message=f"✅ Esclarecimento recebido: {answer[:180]}",
                level='info'
            )
            ThoughtLog.objects.create(
                agent=log_agent,
                task=task,
                message=f"🧭 Plano de ação gerado com {len(action_plan)} passos. Retomando execução automática.",
                level='info'
            )

        _broadcast('thought_logs', 'thought_log_received', {
            'agent_id': str(task.assigned_to.id) if task.assigned_to else None,
            'agent_name': task.assigned_to.name if task.assigned_to else 'Coordinator',
            'message': f'🧭 Ação gerada a partir do esclarecimento da task {task.title}',
            'level': 'info',
            'timestamp': timezone.now().isoformat(),
        })

        _broadcast('tasks_updates', 'task_updated', {
            'task_id': str(task.id),
            'data': {'status': 'queue', 'error': '', 'result': task.result}
        })

        if task.status in ('queue', 'blocked', 'failed'):
            task = _start_task_processing(task)

        _broadcast('tasks_updates', 'task_updated', {
            'task_id': str(task.id),
            'data': {'status': task.status, 'error': task.error}
        })

        return Response(ClarificationRequestSerializer(item).data)


class SubtaskViewSet(viewsets.ModelViewSet):
    """CRUD leve para subtarefas operacionais."""
    queryset = Subtask.objects.all().select_related('task', 'assigned_to')
    serializer_class = SubtaskSerializer
    permission_classes = [AllowAny]
    filterset_fields = ['task', 'status', 'priority', 'assigned_to', 'source']
    search_fields = ['title', 'description']
    ordering_fields = ['created_at', 'updated_at', 'order', 'priority']
    ordering = ['task', 'order', 'created_at']

    def perform_create(self, serializer):
        subtask = serializer.save()
        record_task_event(
            subtask.task,
            'decomposed',
            f'Subtarefa criada manualmente: {subtask.title}',
            agent=subtask.assigned_to or subtask.task.assigned_to,
            metadata={'subtask_id': str(subtask.id), 'source': subtask.source},
        )
        handoff = create_agent_handoff(
            from_agent=subtask.task.assigned_to,
            to_agent=subtask.assigned_to,
            task=subtask.task,
            message_type='delegate',
            subject=f'Subtarefa delegada: {subtask.title}',
            body=(
                f'Nova subtarefa atribuída: {subtask.title}.\n\n'
                f'Descrição: {subtask.description or "Sem descrição adicional."}\n'
                f'Prioridade: {subtask.priority}\nStatus: {subtask.status}'
            ),
            payload={
                'source': 'subtask_create',
                'subtask_id': str(subtask.id),
                'subtask_title': subtask.title,
                'priority': subtask.priority,
                'status': subtask.status,
            },
        )
        if handoff:
            record_task_event(
                subtask.task,
                'updated',
                f'Mensagem node-to-node criada para a subtarefa {subtask.title}',
                agent=subtask.task.assigned_to,
                metadata={'subtask_id': str(subtask.id), 'agent_message_id': str(handoff.id)},
            )

    def perform_update(self, serializer):
        previous = serializer.instance
        previous_assigned_to = previous.assigned_to
        subtask = serializer.save()
        record_task_event(
            subtask.task,
            'updated',
            f'Subtarefa atualizada: {subtask.title}',
            agent=subtask.assigned_to or subtask.task.assigned_to,
            metadata={
                'subtask_id': str(subtask.id),
                'previous_status': previous.status,
                'status': subtask.status,
            },
        )
        handoff = create_agent_handoff(
            from_agent=previous_assigned_to or subtask.task.assigned_to,
            to_agent=subtask.assigned_to,
            task=subtask.task,
            message_type='delegate',
            subject=f'Redelegação de subtarefa: {subtask.title}',
            body=(
                f'A subtarefa {subtask.title} foi reatribuída para outro agente.\n\n'
                f'Status atual: {subtask.status}\nPrioridade: {subtask.priority}'
            ),
            payload={
                'source': 'subtask_update',
                'subtask_id': str(subtask.id),
                'subtask_title': subtask.title,
                'previous_assigned_to': str(previous_assigned_to.id) if previous_assigned_to else None,
                'assigned_to': str(subtask.assigned_to.id) if subtask.assigned_to else None,
            },
        )
        if handoff:
            record_task_event(
                subtask.task,
                'updated',
                f'Mensagem node-to-node criada para a reatribuição da subtarefa {subtask.title}',
                agent=previous_assigned_to or subtask.task.assigned_to,
                metadata={'subtask_id': str(subtask.id), 'agent_message_id': str(handoff.id)},
            )


class HealthCheckAPIView(APIView):
    """Health check endpoint"""
    permission_classes = []
    
    def get(self, request):
        try:
            agents = Agent.objects.count()
            tasks = Task.objects.count()
            epics = Epic.objects.count()
            db_status = 'ok'
        except Exception:
            agents = tasks = epics = 0
            db_status = 'unavailable'

        return Response({
            'status': 'healthy',
            'db': db_status,
            'agents': agents,
            'tasks': tasks,
            'epics': epics,
        })


class MetricsOverviewAPIView(APIView):
    """KPI snapshot for orchestration flow monitoring."""
    permission_classes = [AllowAny]

    def get(self, request):
        now = timezone.now()
        statuses = [choice[0] for choice in Task.STATUS_CHOICES]
        status_counts = {status_key: Task.objects.filter(status=status_key).count() for status_key in statuses}

        completed_count = status_counts.get('completed', 0)
        failed_count = status_counts.get('failed', 0)
        processed_total = completed_count + failed_count
        success_rate = round((completed_count / processed_total) * 100, 2) if processed_total else 0.0

        completed_tasks = Task.objects.filter(
            status='completed',
            started_at__isnull=False,
            completed_at__isnull=False,
        )
        execution_minutes = []
        for task in completed_tasks:
            delta = task.completed_at - task.started_at
            if delta.total_seconds() > 0:
                execution_minutes.append(delta.total_seconds() / 60)

        avg_execution_minutes = round(sum(execution_minutes) / len(execution_minutes), 2) if execution_minutes else 0.0

        queue_tasks = Task.objects.filter(status='queue')
        oldest_queue_task = queue_tasks.order_by('created_at').first()
        queue_age_minutes = 0.0
        if oldest_queue_task:
            queue_age_minutes = round((now - oldest_queue_task.created_at).total_seconds() / 60, 2)

        approval_to_queue_minutes = []
        approved_epics = Epic.objects.filter(status='approved').prefetch_related('tasks')
        for epic in approved_epics:
            first_task = epic.tasks.order_by('created_at').first()
            if not first_task:
                continue
            delta = first_task.created_at - epic.updated_at
            if delta >= timedelta(0):
                approval_to_queue_minutes.append(delta.total_seconds() / 60)

        avg_approval_to_queue_minutes = (
            round(sum(approval_to_queue_minutes) / len(approval_to_queue_minutes), 2)
            if approval_to_queue_minutes
            else 0.0
        )

        return Response({
            'task_counts': status_counts,
            'success_rate_percent': success_rate,
            'avg_execution_minutes': avg_execution_minutes,
            'avg_approval_to_queue_minutes': avg_approval_to_queue_minutes,
            'queue_age_minutes': queue_age_minutes,
            'approved_epics_waiting_breakdown': approved_epics.filter(tasks__isnull=True).distinct().count(),
            'generated_at': now.isoformat(),
        })


class MetricsTimeseriesAPIView(APIView):
    """Daily operational series for dashboard analytics."""
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            days = int(request.query_params.get('days', 14))
        except (TypeError, ValueError):
            days = 14

        days = max(3, min(days, 90))
        today = timezone.localdate()
        start_day = today - timedelta(days=days - 1)
        start_dt = timezone.make_aware(
            timezone.datetime.combine(start_day, timezone.datetime.min.time())
        )

        created_map = {}
        created_qs = Task.objects.filter(created_at__gte=start_dt).values_list('created_at', flat=True)
        for created_at in created_qs:
            day_key = timezone.localtime(created_at).date().isoformat()
            created_map[day_key] = created_map.get(day_key, 0) + 1

        completed_map = {}
        failed_map = {}
        done_qs = Task.objects.filter(
            completed_at__isnull=False,
            completed_at__gte=start_dt,
        ).values_list('completed_at', 'status')
        for completed_at, status_key in done_qs:
            day_key = timezone.localtime(completed_at).date().isoformat()
            if status_key == 'completed':
                completed_map[day_key] = completed_map.get(day_key, 0) + 1
            elif status_key == 'failed':
                failed_map[day_key] = failed_map.get(day_key, 0) + 1

        points = []
        for index in range(days):
            day = start_day + timedelta(days=index)
            key = day.isoformat()
            points.append({
                'date': key,
                'created': created_map.get(key, 0),
                'completed': completed_map.get(key, 0),
                'failed': failed_map.get(key, 0),
            })

        return Response({
            'days': days,
            'start_date': start_day.isoformat(),
            'end_date': today.isoformat(),
            'points': points,
            'generated_at': timezone.now().isoformat(),
        })


class ExecutiveDashboardAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        now = timezone.now()
        overloaded_agents = []
        agents = Agent.objects.all().annotate(
            queue_count=Count('tasks', filter=Q(tasks__status='queue')),
            processing_count=Count('tasks', filter=Q(tasks__status='processing')),
            blocked_count=Count('tasks', filter=Q(tasks__status='blocked')),
            review_count=Count('tasks', filter=Q(tasks__status='review')),
        )

        for agent in agents:
            active_load = agent.processing_count + agent.blocked_count + agent.review_count
            open_total = active_load + agent.queue_count
            if open_total >= 4 or agent.blocked_count >= 2:
                overloaded_agents.append({
                    'id': str(agent.id),
                    'name': agent.name,
                    'state': agent.state,
                    'open_total': open_total,
                    'blocked': agent.blocked_count,
                    'queue': agent.queue_count,
                })

        payload = {
            'generated_at': now,
            'approvals_pending': ApprovalRequest.objects.filter(status='pending').count(),
            'decisions_open': DecisionRecord.objects.filter(status='proposed').count(),
            'active_documents': CorporateDocument.objects.filter(status='active').count(),
            'memory_entries': CorporateMemoryEntry.objects.count(),
            'workflow_runs_today': WorkflowRun.objects.filter(created_at__date=now.date()).count(),
            'overloaded_agents': overloaded_agents[:5],
            'pending_approvals': ApprovalRequest.objects.filter(status='pending').select_related('task', 'artifact', 'requested_by_agent')[:6],
            'recent_decisions': DecisionRecord.objects.select_related('task', 'created_by_agent', 'created_by_user', 'decided_by')[:6],
            'recent_documents': CorporateDocument.objects.select_related('created_by_agent', 'created_by_user', 'task', 'epic')[:6],
            'recent_runs': WorkflowRun.objects.select_related('playbook', 'created_by_user', 'task', 'epic')[:6],
        }
        serializer = ExecutiveDashboardSerializer(payload)
        return Response(serializer.data)


class ChatAPIView(APIView):
    """Chat endpoint integrado com LLM (Claude/OpenAI)"""
    permission_classes = [AllowAny]  # Dev: Allow without auth
    
    def post(self, request):
        """Enviar mensagem para LLM e receber resposta"""
        serializer = ChatRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        user_message = serializer.validated_data['message']
        context = serializer.validated_data.get('context', {})
        system_prompt = serializer.validated_data.get('system_prompt', '')
        stream = serializer.validated_data.get('stream', False)
        
        try:
            chat_user = request.user if request.user.is_authenticated else User.objects.first()

            if chat_user is None:
                chat_user = User.objects.create_user(
                    username='guest_chat',
                    email='guest-chat@local',
                    password=User.objects.make_random_password()
                )

            # Get or create agent
            agent_id = request.data.get('agent_id')
            try:
                agent = Agent.objects.get(id=agent_id) if agent_id else Agent.objects.first()
            except Agent.DoesNotExist:
                agent = Agent.objects.create(
                    name='Coordenador IA',
                    type='coordinator',
                    model='claude-3-5-sonnet-20241022',
                    capabilities=['planning', 'analysis', 'execution']
                )

            action = _detect_chat_action(user_message)
            pending_intent = _get_pending_intent(chat_user)

            # If the chat was opened from playbooks with context payload, run it directly.
            if action.get('type') == 'none' and isinstance(context, dict):
                playbook_hint = str(context.get('playbook_hint') or context.get('playbook_id') or '').strip()
                if playbook_hint:
                    action = {
                        'type': 'run_playbook',
                        'playbook_ref': playbook_hint,
                        'area': str(context.get('area') or '').strip(),
                        'initiative': str(context.get('initiative') or '').strip(),
                        'missing': [],
                    }

            if action.get('type') == 'none' and pending_intent.get('type') == 'create_epic_confirm':
                if _is_confirmation_message(user_message):
                    pending_action = pending_intent.get('action')
                    if isinstance(pending_action, dict) and pending_action.get('type') == 'create_epic':
                        action = pending_action
                elif _is_rejection_message(user_message):
                    cancel_msg = 'Perfeito, criacao do epico cancelada. Se quiser, me passe um novo objetivo.'
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=cancel_msg,
                        context={
                            **context,
                            'action': 'create_epic',
                            'result': 'cancelled',
                            'pending_intent': None,
                        }
                    )
                    if stream:
                        from django.http import StreamingHttpResponse
                        return StreamingHttpResponse(iter([f"data: {cancel_msg}\n\n"]), content_type='text/event-stream')
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': cancel_msg,
                        'action': 'create_epic',
                        'created': False,
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

            if action.get('type') == 'none' and pending_intent.get('type') == 'create_task':
                inferred = _detect_chat_action(f"Criar tarefa: {user_message}")
                if inferred.get('type') == 'create_task' and not inferred.get('missing'):
                    action = inferred
                elif len(user_message.strip()) >= 5:
                    action = {
                        'type': 'create_task',
                        'title': user_message.strip(' .;:'),
                        'description': '',
                        'priority': pending_intent.get('priority') or _resolve_priority(user_message, default='medium'),
                        'status': 'queue',
                    }

            # If previous turn requested missing goal, treat the next message as completion context.
            if action.get('type') == 'none' and pending_intent.get('type') == 'create_epic':
                inferred = _detect_chat_action(f"Criar epico: {user_message}")
                if inferred.get('type') == 'create_epic' and not inferred.get('missing'):
                    action = inferred
                elif len(user_message.strip()) >= 8:
                    action = {
                        'type': 'create_epic',
                        'goal': user_message.strip(' .;:'),
                        'description': '',
                        'priority': pending_intent.get('priority') or _resolve_priority(user_message, default='medium'),
                    }

            if action.get('type') == 'none' and _looks_like_operational_request_without_parse(user_message):
                clarification = (
                    'Entendi que voce quer uma acao no Kanban, mas faltou formato para executar com seguranca. '
                    'Exemplos: "Criar epico: Documentacao do BOT; prioridade: alta", '
                    '"Criar tarefa: validar logica do chat; prioridade: media" ou '
                    '"Alterar status do epico id: <id> para aprovado".'
                )
                chat_message = ChatMessage.objects.create(
                    agent=agent,
                    user=chat_user,
                    user_message=user_message,
                    agent_response=clarification,
                    context={
                        **context,
                        'action': 'operational_clarification',
                        'result': 'missing_format',
                    }
                )
                if stream:
                    from django.http import StreamingHttpResponse
                    return StreamingHttpResponse(iter([f"data: {clarification}\n\n"]), content_type='text/event-stream')
                return Response({
                    'id': str(chat_message.id),
                    'agent': agent.name,
                    'agent_id': str(agent.id),
                    'user_message': user_message,
                    'agent_response': clarification,
                    'action': 'operational_clarification',
                    'created_at': chat_message.created_at,
                }, status=status.HTTP_200_OK)

            if action.get('type') == 'review_refinement_epics':
                review_msg, count = _build_refinement_review_message()
                chat_message = ChatMessage.objects.create(
                    agent=agent,
                    user=chat_user,
                    user_message=user_message,
                    agent_response=review_msg,
                    context={
                        **context,
                        'action': 'review_refinement_epics',
                        'result': 'completed',
                        'epics_found': count,
                    }
                )
                if stream:
                    from django.http import StreamingHttpResponse
                    return StreamingHttpResponse(iter([f"data: {review_msg}\n\n"]), content_type='text/event-stream')

                return Response({
                    'id': str(chat_message.id),
                    'agent': agent.name,
                    'agent_id': str(agent.id),
                    'user_message': user_message,
                    'agent_response': review_msg,
                    'action': 'review_refinement_epics',
                    'reviewed': True,
                    'epics_found': count,
                    'created_at': chat_message.created_at,
                }, status=status.HTTP_200_OK)

            if action.get('type') == 'create_task':
                if action.get('missing'):
                    clarification = (
                        'Para criar a tarefa no Kanban eu preciso do titulo principal. '
                        'Exemplo: "Criar tarefa: validar logica do chat; prioridade: media".'
                    )
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=clarification,
                        context={
                            **context,
                            'action': 'create_task',
                            'result': 'missing_data',
                            'missing': action.get('missing', []),
                            'pending_intent': {
                                'type': 'create_task',
                                'priority': action.get('priority', 'medium'),
                            },
                        }
                    )
                    if stream:
                        from django.http import StreamingHttpResponse
                        return StreamingHttpResponse(iter([f"data: {clarification}\n\n"]), content_type='text/event-stream')
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': clarification,
                        'action': 'create_task',
                        'created': False,
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

                task = Task.objects.create(
                    title=action['title'],
                    description=action.get('description', ''),
                    priority=action.get('priority', 'medium'),
                    status=action.get('status', 'queue'),
                )
                creation_msg = (
                    f"Tarefa criada com sucesso no Kanban. "
                    f"ID: {task.id} | Titulo: {task.title} | Prioridade: {task.priority} | Status: {task.status}."
                )
                chat_message = ChatMessage.objects.create(
                    agent=agent,
                    user=chat_user,
                    user_message=user_message,
                    agent_response=creation_msg,
                    context={
                        **context,
                        'action': 'create_task',
                        'result': 'created',
                        'task_id': str(task.id),
                        'pending_intent': None,
                    }
                )

                if stream:
                    from django.http import StreamingHttpResponse
                    return StreamingHttpResponse(iter([f"data: {creation_msg}\n\n"]), content_type='text/event-stream')

                return Response({
                    'id': str(chat_message.id),
                    'agent': agent.name,
                    'agent_id': str(agent.id),
                    'user_message': user_message,
                    'agent_response': creation_msg,
                    'action': 'create_task',
                    'created': True,
                    'task': {
                        'id': str(task.id),
                        'title': task.title,
                        'priority': task.priority,
                        'status': task.status,
                    },
                    'created_at': chat_message.created_at,
                }, status=status.HTTP_200_OK)

            if action.get('type') == 'create_epic':
                if action.get('missing'):
                    clarification = (
                        'Para criar o épico no Kanban eu preciso do objetivo principal. '
                        'Exemplo: "Criar épico: Melhorar onboarding mobile; prioridade: alta".'
                    )
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=clarification,
                        context={
                            **context,
                            'action': 'create_epic',
                            'result': 'missing_data',
                            'missing': action.get('missing', []),
                            'pending_intent': {
                                'type': 'create_epic',
                                'priority': action.get('priority', 'medium'),
                            },
                        }
                    )
                    if stream:
                        from django.http import StreamingHttpResponse
                        return StreamingHttpResponse(iter([f"data: {clarification}\n\n"]), content_type='text/event-stream')
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': clarification,
                        'action': 'create_epic',
                        'created': False,
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

                if _should_request_creation_confirmation(user_message, action):
                    confirm_msg = (
                        f"Entendi. Vou criar o épico '{action['goal']}' com prioridade {action.get('priority', 'medium')}. "
                        f"Confirmar?"
                    )
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=confirm_msg,
                        context={
                            **context,
                            'action': 'create_epic',
                            'result': 'awaiting_confirmation',
                            'pending_intent': {
                                'type': 'create_epic_confirm',
                                'action': action,
                            },
                        }
                    )
                    if stream:
                        from django.http import StreamingHttpResponse
                        return StreamingHttpResponse(iter([f"data: {confirm_msg}\n\n"]), content_type='text/event-stream')
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': confirm_msg,
                        'action': 'create_epic',
                        'created': False,
                        'awaiting_confirmation': True,
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

                epic = Epic.objects.create(
                    goal=action['goal'],
                    description=action.get('description', ''),
                    priority=action.get('priority', 'medium'),
                    status='backlog',
                    created_by=chat_user,
                )
                creation_msg = (
                    f"Épico criado com sucesso no Kanban. "
                    f"ID: {epic.id} | Objetivo: {epic.goal} | Prioridade: {epic.priority} | Status: {epic.status}."
                )
                chat_message = ChatMessage.objects.create(
                    agent=agent,
                    user=chat_user,
                    user_message=user_message,
                    agent_response=creation_msg,
                    context={
                        **context,
                        'action': 'create_epic',
                        'result': 'created',
                        'epic_id': str(epic.id),
                        'pending_intent': None,
                    }
                )

                if stream:
                    from django.http import StreamingHttpResponse
                    return StreamingHttpResponse(iter([f"data: {creation_msg}\n\n"]), content_type='text/event-stream')

                return Response({
                    'id': str(chat_message.id),
                    'agent': agent.name,
                    'agent_id': str(agent.id),
                    'user_message': user_message,
                    'agent_response': creation_msg,
                    'action': 'create_epic',
                    'created': True,
                    'epic': {
                        'id': str(epic.id),
                        'goal': epic.goal,
                        'priority': epic.priority,
                        'status': epic.status,
                    },
                    'created_at': chat_message.created_at,
                }, status=status.HTTP_200_OK)

            if action.get('type') == 'update_epic_status':
                if action.get('missing'):
                    clarification = (
                        'Para alterar status de épico preciso de: referência do épico (ID ou objetivo) '
                        'e status alvo (backlog/refinamento/aprovado/concluido/falhou).'
                    )
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=clarification,
                        context={
                            **context,
                            'action': 'update_epic_status',
                            'result': 'missing_data',
                            'missing': action.get('missing', []),
                        }
                    )
                    if stream:
                        from django.http import StreamingHttpResponse
                        return StreamingHttpResponse(iter([f"data: {clarification}\n\n"]), content_type='text/event-stream')
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': clarification,
                        'action': 'update_epic_status',
                        'updated': False,
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

                epic, lookup_error = _find_epic_for_action(action)
                if epic is None:
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=lookup_error,
                        context={
                            **context,
                            'action': 'update_epic_status',
                            'result': 'not_found_or_ambiguous',
                        }
                    )
                    if stream:
                        from django.http import StreamingHttpResponse
                        return StreamingHttpResponse(iter([f"data: {lookup_error}\n\n"]), content_type='text/event-stream')
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': lookup_error,
                        'action': 'update_epic_status',
                        'updated': False,
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

                old_status = epic.status
                epic.status = action['status']
                epic.save(update_fields=['status', 'updated_at'])
                created_tasks = 0
                if old_status != 'approved' and epic.status == 'approved':
                    created_tasks = ensure_epic_task_queue(epic)
                update_msg = (
                    f"Status do épico atualizado com sucesso. "
                    f"ID: {epic.id} | Objetivo: {epic.goal} | De: {old_status} | Para: {epic.status}."
                )
                if created_tasks:
                    update_msg += f" Foram geradas {created_tasks} tarefas na fila de execução."
                chat_message = ChatMessage.objects.create(
                    agent=agent,
                    user=chat_user,
                    user_message=user_message,
                    agent_response=update_msg,
                    context={
                        **context,
                        'action': 'update_epic_status',
                        'result': 'updated',
                        'epic_id': str(epic.id),
                    }
                )
                if stream:
                    from django.http import StreamingHttpResponse
                    return StreamingHttpResponse(iter([f"data: {update_msg}\n\n"]), content_type='text/event-stream')
                return Response({
                    'id': str(chat_message.id),
                    'agent': agent.name,
                    'agent_id': str(agent.id),
                    'user_message': user_message,
                    'agent_response': update_msg,
                    'action': 'update_epic_status',
                    'updated': True,
                    'created_tasks': created_tasks,
                    'epic': {
                        'id': str(epic.id),
                        'goal': epic.goal,
                        'priority': epic.priority,
                        'status': epic.status,
                    },
                    'created_at': chat_message.created_at,
                }, status=status.HTTP_200_OK)

            if action.get('type') == 'update_epic':
                if action.get('missing'):
                    clarification = (
                        'Para editar o épico, informe a referência (ID ou objetivo atual) e o que mudar. '
                        'Exemplo: "Editar épico id: <id>; novo objetivo: X; descrição: Y; prioridade: alta".'
                    )
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=clarification,
                        context={
                            **context,
                            'action': 'update_epic',
                            'result': 'missing_data',
                            'missing': action.get('missing', []),
                        }
                    )
                    if stream:
                        from django.http import StreamingHttpResponse
                        return StreamingHttpResponse(iter([f"data: {clarification}\n\n"]), content_type='text/event-stream')
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': clarification,
                        'action': 'update_epic',
                        'updated': False,
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

                epic, lookup_error = _find_epic_for_action(action)
                if epic is None:
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=lookup_error,
                        context={
                            **context,
                            'action': 'update_epic',
                            'result': 'not_found_or_ambiguous',
                        }
                    )
                    if stream:
                        from django.http import StreamingHttpResponse
                        return StreamingHttpResponse(iter([f"data: {lookup_error}\n\n"]), content_type='text/event-stream')
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': lookup_error,
                        'action': 'update_epic',
                        'updated': False,
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

                changed = []
                if action.get('goal'):
                    epic.goal = action['goal']
                    changed.append('goal')
                if action.get('description'):
                    epic.description = action['description']
                    changed.append('description')
                if action.get('priority'):
                    epic.priority = action['priority']
                    changed.append('priority')

                if not changed:
                    no_change_msg = 'Nenhuma alteração válida foi identificada para o épico informado.'
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=no_change_msg,
                        context={
                            **context,
                            'action': 'update_epic',
                            'result': 'no_changes',
                            'epic_id': str(epic.id),
                        }
                    )
                    if stream:
                        from django.http import StreamingHttpResponse
                        return StreamingHttpResponse(iter([f"data: {no_change_msg}\n\n"]), content_type='text/event-stream')
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': no_change_msg,
                        'action': 'update_epic',
                        'updated': False,
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

                epic.save(update_fields=changed + ['updated_at'])
                update_msg = (
                    f"Épico atualizado com sucesso. ID: {epic.id} | Objetivo: {epic.goal} | "
                    f"Prioridade: {epic.priority} | Status: {epic.status}."
                )
                chat_message = ChatMessage.objects.create(
                    agent=agent,
                    user=chat_user,
                    user_message=user_message,
                    agent_response=update_msg,
                    context={
                        **context,
                        'action': 'update_epic',
                        'result': 'updated',
                        'epic_id': str(epic.id),
                        'changed': changed,
                    }
                )
                if stream:
                    from django.http import StreamingHttpResponse
                    return StreamingHttpResponse(iter([f"data: {update_msg}\n\n"]), content_type='text/event-stream')
                return Response({
                    'id': str(chat_message.id),
                    'agent': agent.name,
                    'agent_id': str(agent.id),
                    'user_message': user_message,
                    'agent_response': update_msg,
                    'action': 'update_epic',
                    'updated': True,
                    'epic': {
                        'id': str(epic.id),
                        'goal': epic.goal,
                        'description': epic.description,
                        'priority': epic.priority,
                        'status': epic.status,
                    },
                    'created_at': chat_message.created_at,
                }, status=status.HTTP_200_OK)

            if action.get('type') == 'create_document':
                if action.get('missing'):
                    clarification = (
                        'Para criar o documento corporativo preciso ao menos do título. '
                        'Exemplo: "Criar brief: Lançamento Q2; área: Marketing; iniciativa: Expansão SMB".'
                    )
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=clarification,
                        context={**context, 'action': 'create_document', 'result': 'missing_data', 'missing': action.get('missing', [])}
                    )
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': clarification,
                        'action': 'create_document',
                        'created': False,
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

                document = CorporateDocument.objects.create(
                    title=action['title'],
                    doc_type=action.get('doc_type') or 'brief',
                    status='active',
                    scope='org',
                    area=action.get('area') or '',
                    initiative=action.get('initiative') or '',
                    summary=action.get('summary') or '',
                    content=context.get('content', '') if isinstance(context, dict) else '',
                    created_by_agent=agent,
                    created_by_user=chat_user,
                    metadata={'source': 'chat', 'chat_context': context},
                )
                _sync_corporate_memory(
                    title=document.title,
                    summary=document.summary,
                    content=document.content,
                    area=document.area,
                    initiative=document.initiative,
                    source_type='document',
                    source_id=str(document.id),
                    tags=[document.doc_type, 'chat'],
                    metadata=document.metadata,
                )
                creation_msg = (
                    f"Documento corporativo criado. ID: {document.id} | Título: {document.title} | "
                    f"Tipo: {document.doc_type} | Área: {document.area or '-'} | Iniciativa: {document.initiative or '-'}"
                )
                chat_message = ChatMessage.objects.create(
                    agent=agent,
                    user=chat_user,
                    user_message=user_message,
                    agent_response=creation_msg,
                    context={**context, 'action': 'create_document', 'result': 'created', 'document_id': str(document.id)}
                )
                return Response({
                    'id': str(chat_message.id),
                    'agent': agent.name,
                    'agent_id': str(agent.id),
                    'user_message': user_message,
                    'agent_response': creation_msg,
                    'action': 'create_document',
                    'created': True,
                    'document': CorporateDocumentSerializer(document).data,
                    'created_at': chat_message.created_at,
                }, status=status.HTTP_200_OK)

            if action.get('type') == 'run_playbook':
                if action.get('missing'):
                    clarification = (
                        'Para executar um playbook, informe o nome ou slug. '
                        'Exemplo: "Executar playbook: incident-response; área: TI; iniciativa: API 500".'
                    )
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=clarification,
                        context={**context, 'action': 'run_playbook', 'result': 'missing_data', 'missing': action.get('missing', [])}
                    )
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': clarification,
                        'action': 'run_playbook',
                        'created': False,
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

                if not WorkflowPlaybook.objects.exists():
                    _seed_playbook_templates(chat_user)

                playbook_ref = action.get('playbook_ref') or ''
                playbook = WorkflowPlaybook.objects.filter(Q(slug=slugify(playbook_ref)) | Q(name__icontains=playbook_ref)).order_by('name').first()
                if not playbook:
                    not_found_msg = 'Playbook não encontrado. Use a biblioteca de playbooks para ver os disponíveis.'
                    chat_message = ChatMessage.objects.create(
                        agent=agent,
                        user=chat_user,
                        user_message=user_message,
                        agent_response=not_found_msg,
                        context={**context, 'action': 'run_playbook', 'result': 'not_found'}
                    )
                    return Response({
                        'id': str(chat_message.id),
                        'agent': agent.name,
                        'agent_id': str(agent.id),
                        'user_message': user_message,
                        'agent_response': not_found_msg,
                        'action': 'run_playbook',
                        'created_at': chat_message.created_at,
                    }, status=status.HTTP_200_OK)

                run = WorkflowRun.objects.create(
                    playbook=playbook,
                    scope=playbook.scope,
                    input_payload={
                        'area': action.get('area') or '',
                        'initiative': action.get('initiative') or playbook_ref,
                        **(context if isinstance(context, dict) else {}),
                    },
                    created_by_user=chat_user,
                )
                _execute_workflow_run(run)
                run_msg = (
                    f"Playbook executado: {playbook.name}. Status final: {run.status}. "
                    f"Tasks criadas: {len((run.result_payload or {}).get('created_tasks', []))} | "
                    f"Documentos criados: {len((run.result_payload or {}).get('created_documents', []))}."
                )
                chat_message = ChatMessage.objects.create(
                    agent=agent,
                    user=chat_user,
                    user_message=user_message,
                    agent_response=run_msg,
                    context={**context, 'action': 'run_playbook', 'result': run.status, 'workflow_run_id': str(run.id), 'playbook_id': str(playbook.id)}
                )
                return Response({
                    'id': str(chat_message.id),
                    'agent': agent.name,
                    'agent_id': str(agent.id),
                    'user_message': user_message,
                    'agent_response': run_msg,
                    'action': 'run_playbook',
                    'run': WorkflowRunSerializer(run).data,
                    'created_at': chat_message.created_at,
                }, status=status.HTTP_200_OK)
            
            # Prepare messages for LLM
            knowledge_context = _build_corporate_context(
                user_message,
                area=str(context.get('area') or '') if isinstance(context, dict) else '',
                initiative=str(context.get('initiative') or '') if isinstance(context, dict) else '',
                top_k=4,
            )
            prompt_context_markdown = knowledge_context.get('prompt_markdown') or ''
            messages = [
                {"role": "user", "content": user_message}
            ]
            if prompt_context_markdown:
                context['corporate_prompt_context'] = prompt_context_markdown
                context['corporate_memory_hits'] = [
                    {
                        'id': str(item.id),
                        'title': item.title,
                        'type': 'document',
                    }
                    for item in knowledge_context.get('documents', [])
                ] + [
                    {
                        'id': str(item.id),
                        'title': item.title,
                        'type': 'memory',
                    }
                    for item in knowledge_context.get('memory_entries', [])
                ]
            
            # Get LLM service and generate response
            llm_service = None
            try:
                llm_service = get_llm_service()
            except Exception:
                llm_service = None

            fallback_response = (
                'LLM indisponivel no momento. Configure ANTHROPIC_API_KEY ou OPENAI_API_KEY para respostas inteligentes.'
            )
            if prompt_context_markdown:
                system_prompt = f"{system_prompt}\n\n### Base de Conhecimento (.md/.txt/.pdf)\n{prompt_context_markdown}"
            
            if stream:
                # Streaming response (SSE - Server-Sent Events)
                def event_generator():
                    try:
                        response_text = ""
                        if llm_service is None:
                            response_text = fallback_response
                            yield f"data: {fallback_response}\n\n"
                        else:
                            for chunk in llm_service.stream_chat(messages, system_prompt):
                                response_text += chunk
                                yield f"data: {chunk}\n\n"
                        
                        # Save chat message after streaming
                        ChatMessage.objects.create(
                            agent=agent,
                            user=chat_user,
                            user_message=user_message,
                            agent_response=response_text,
                            context={**context, 'streaming': True}
                        )
                    except Exception as e:
                        yield f"data: Error: {str(e)}\n\n"
                
                from django.http import StreamingHttpResponse
                return StreamingHttpResponse(
                    event_generator(),
                    content_type='text/event-stream'
                )
            else:
                # Non-streaming response
                agent_response = llm_service.chat(messages, system_prompt) if llm_service else fallback_response
                
                # Save chat message
                chat_message = ChatMessage.objects.create(
                    agent=agent,
                    user=chat_user,
                    user_message=user_message,
                    agent_response=agent_response,
                    context=context
                )
                
                return Response({
                    'id': str(chat_message.id),
                    'agent': agent.name,
                    'agent_id': str(agent.id),
                    'user_message': user_message,
                    'agent_response': agent_response,
                    'created_at': chat_message.created_at,
                }, status=status.HTTP_200_OK)
        
        except ImportError as e:
            return Response({
                'error': f'LLM não configurado: {str(e)}. Configure ANTHROPIC_API_KEY ou OPENAI_API_KEY no .env'
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            return Response({
                'error': f'Erro ao processar mensagem: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def get(self, request):
        """Obter histórico de chat"""
        agent_id = request.query_params.get('agent_id')
        limit = int(request.query_params.get('limit', 50))
        
        queryset = ChatMessage.objects.all()
        
        if agent_id:
            queryset = queryset.filter(agent_id=agent_id)
        
        if request.user.is_authenticated:
            queryset = queryset.filter(user=request.user)
        
        messages = queryset.order_by('-created_at')[:limit]
        serializer = ChatMessageSerializer(messages, many=True)
        return Response(serializer.data)
