"""
Agent Execution Engine
Executes tasks using Claude LLM via an agentic loop with tools.
Designed to run in a background thread (non-blocking).
"""

import threading
import re
from django.utils import timezone
from django.db.models import Q
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from api.file_sandbox import SandboxPolicy, create_snapshot, preview_file_change, task_workspace
from api.work_tracking import create_agent_handoff, create_artifact, create_subtask, record_task_event


# ──────────────────────────────────────────────────────────────
# Prompt builder
# ──────────────────────────────────────────────────────────────

def build_system_prompt(agent) -> str:
    caps = ", ".join(agent.capabilities) if agent.capabilities else "general"
    org = getattr(agent, 'organization', '') or 'Geral'
    role_prompt = (getattr(agent, 'role_prompt', '') or '').strip()
    context = (getattr(agent, 'context', '') or '').strip()
    model_info = f"{getattr(agent, 'llm_provider', 'anthropic')}:{getattr(agent, 'llm_model', agent.model)}"

    extra = ""
    if role_prompt:
        extra += f"\n\n### Função/Prompt\n{role_prompt}"
    if context:
        extra += f"\n\n### Contexto\n{context}"

    return f"""Você é {agent.name}, um agente de IA especializado do sistema Heuriskein.
Organização: {org} | Tipo: {agent.type} | Capacidades: {caps} | Modelo: {model_info}

Seu papel é executar tarefas de forma autônoma, clara e objetiva.
Para cada tarefa você deve:
1. Analisar o escopo e os requisitos
2. Elaborar e executar um plano passo a passo
3. Produzir um resultado concreto e documentado
4. Identificar próximos passos e dependências

Sempre responda em português do Brasil.
Seja direto, técnico e orientado a resultados.{extra}"""


def _trim_prompt_block(value: str, limit: int = 2000) -> str:
    cleaned = (value or '').strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rstrip() + '...'


def _build_corporate_prompt_context_for_task(task, top_k: int = 3) -> str:
    """Build a compact corporate knowledge block to ground autonomous execution."""
    try:
        from api.models import CorporateDocument, CorporateMemoryEntry

        area = ''
        initiative = ''
        if getattr(task, 'epic', None):
            area = (getattr(task.epic, 'area', '') or '').strip()
            initiative = (getattr(task.epic, 'goal', '') or '').strip()

        query = ' '.join(
            part for part in [
                (getattr(task, 'title', '') or '').strip(),
                (getattr(task, 'description', '') or '').strip(),
                area,
                initiative,
            ] if part
        )

        docs_qs = CorporateDocument.objects.filter(status='active')
        mem_qs = CorporateMemoryEntry.objects.all()

        if area:
            docs_qs = docs_qs.filter(Q(area__icontains=area) | Q(area=''))
            mem_qs = mem_qs.filter(Q(area__icontains=area) | Q(area=''))

        if initiative:
            docs_qs = docs_qs.filter(Q(initiative__icontains=initiative) | Q(initiative=''))
            mem_qs = mem_qs.filter(Q(initiative__icontains=initiative) | Q(initiative=''))

        if query:
            docs_qs = docs_qs.filter(
                Q(title__icontains=query) |
                Q(summary__icontains=query) |
                Q(content__icontains=query)
            )
            mem_qs = mem_qs.filter(
                Q(title__icontains=query) |
                Q(summary__icontains=query) |
                Q(content__icontains=query)
            )

        docs = list(docs_qs.order_by('-updated_at')[:top_k])
        entries = list(mem_qs.order_by('-times_reused', '-updated_at')[:top_k])

        if not docs and not entries:
            return ''

        lines = ['### Base de Conhecimento Corporativa']
        if docs:
            lines.append('Documentos relevantes:')
            for doc in docs:
                lines.append(
                    f"- [{doc.doc_type}] {doc.title}"
                    f" (area: {doc.area or '-'}, iniciativa: {doc.initiative or '-'})"
                    f" -> {_trim_prompt_block((doc.summary or doc.content or ''), limit=360)}"
                )
        if entries:
            lines.append('Memórias reutilizáveis:')
            for entry in entries:
                lines.append(
                    f"- [{entry.source_type}] {entry.title}"
                    f" (reuso: {entry.times_reused}x)"
                    f" -> {_trim_prompt_block((entry.summary or entry.content or ''), limit=320)}"
                )

        return '\n'.join(lines)
    except Exception:
        return ''


def build_task_prompt(task, corporate_prompt_context: str = '') -> str:
    epic_ctx = ""
    if task.epic:
        epic_ctx = f"""
## Contexto da Épica
**Objetivo:** {task.epic.goal}
**Descrição:** {task.epic.description or 'N/A'}
**Prioridade:** {task.epic.priority}
"""

    clarification_ctx = ""
    try:
        latest = task.clarification_requests.filter(status='answered').order_by('-answered_at', '-created_at').first()
        if latest:
            clarification_ctx = f"""
## Esclarecimento do Piloto
**Pergunta da IA:** {latest.question}
**Resposta do piloto:** {latest.answer}

Use explicitamente esse esclarecimento para orientar a execução.
"""
    except Exception:
        clarification_ctx = ""

    corporate_ctx = ""
    if corporate_prompt_context:
        corporate_ctx = f"""
## Contexto Corporativo
{corporate_prompt_context}
"""

    workspace = task_workspace(str(task.id))
    policy = SandboxPolicy()

    return f"""# Tarefa para Execução

**Título:** {task.title}
**Descrição:** {task.description or 'Sem descrição adicional.'}
**Prioridade:** {task.priority}
**Tentativa:** #{task.attempt_count}
{epic_ctx}
{clarification_ctx}
{corporate_ctx}

## Instruções
Execute esta tarefa completamente. Estruture sua resposta com as seções abaixo.

## Sandbox de Arquivos (Semana 1)
- Workspace isolado da tarefa: {workspace}
- Somente caminhos relativos (sem '..' e sem caminho absoluto)
- Extensões permitidas: {', '.join(policy.allowed_extensions)}
- Extensões bloqueadas: {', '.join(policy.blocked_extensions)}
- Tamanho máximo por arquivo: {policy.max_file_bytes} bytes

Se você precisar propor criação/edição de arquivos, use EXATAMENTE este formato:
[FILE_CHANGE: caminho/relativo.ext]
```content
<conteúdo completo final do arquivo>
```
[/FILE_CHANGE]
Não aplique alterações destrutivas fora do sandbox.

### Análise
[Sua análise do que precisa ser feito]

### Execução
[Passos executados e decisões tomadas]

### Resultado
[O resultado concreto da execução]

### Próximos Passos
[O que deve ser feito a seguir, se aplicável]

### Subtarefas Geradas
Se esta tarefa revelou trabalhos adicionais que precisam ser criados como tarefas independentes,
liste-os usando EXATAMENTE o formato abaixo (uma por linha, sem texto extra):
[SUBTAREFA: <título> || <descrição> || <low|medium|high>]
Se não houver subtarefas novas, omita esta seção.
"""


# ──────────────────────────────────────────────────────────────
# Log helper (decoupled from Django ORM import at module level)
# ──────────────────────────────────────────────────────────────

def _log(agent, task, message: str, level: str = "info"):
    """Create a ThoughtLog entry safely."""
    try:
        from api.models import ThoughtLog
        log = ThoughtLog.objects.create(
            agent=agent,
            task=task,
            message=message,
            level=level,
        )
        _broadcast(
            'thought_logs',
            'thought_log_received',
            {
                'agent_id': str(agent.id) if agent else None,
                'agent_name': agent.name if agent else 'System',
                'message': message,
                'level': level,
                'timestamp': log.timestamp.isoformat(),
            },
        )
    except Exception:
        pass  # Never crash the engine on a logging failure


def _broadcast(group: str, event_type: str, payload: dict):
    """Broadcast event to channels group if channel layer is available."""
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(group, {'type': event_type, **payload})
    except Exception:
        pass


def _broadcast_task(task):
    _broadcast(
        'tasks_updates',
        'task_updated',
        {
            'task_id': str(task.id),
            'data': {
                'status': task.status,
                'error': task.error,
                'result': task.result,
                'assigned_to': str(task.assigned_to_id) if task.assigned_to_id else None,
                'attempt_count': task.attempt_count,
            },
        },
    )


def _broadcast_agent(agent):
    if not agent:
        return
    _broadcast(
        'agents_updates',
        'agent_status_changed',
        {
            'agent_id': str(agent.id),
            'state': agent.state,
        },
    )


# ──────────────────────────────────────────────────────────────
# Core execution function (runs inside a thread)
# ──────────────────────────────────────────────────────────────

def _run_task(task_id: str):
    """
    Main execution loop. Called in a daemon thread.
    Loads models fresh inside the thread to avoid Django ORM issues.
    """
    from api.models import Task
    from api.llm_service import get_llm_service

    try:
        task = Task.objects.select_related("epic", "assigned_to").get(pk=task_id)
    except Task.DoesNotExist:
        return

    agent = task.assigned_to

    # ── Mark agent as thinking ──────────────────────────────
    if agent:
        agent.state = "thinking"
        agent.last_activity = timezone.now()
        agent.save(update_fields=["state", "last_activity"])
        _broadcast_agent(agent)

    _log(agent, task, f"🧠 Analisando tarefa: {task.title}")
    record_task_event(task, 'started', 'Agente iniciou análise da tarefa', agent=agent)

    snapshot_info = create_snapshot(str(task.id))
    _log(agent, task, f"🧷 Snapshot criado: {snapshot_info.get('snapshot_id')}")
    create_artifact(
        title=f"Snapshot inicial {snapshot_info.get('snapshot_id')}",
        artifact_type='snapshot',
        task=task,
        epic=task.epic,
        agent=agent,
        status='available',
        payload=snapshot_info,
    )
    record_task_event(task, 'artifact_added', 'Snapshot inicial do workspace criado', agent=agent, metadata=snapshot_info)

    try:
        llm = get_llm_service()
    except Exception as e:
        _fail_task(task, agent, f"Falha ao inicializar LLM: {str(e)}")
        return

    system_prompt = build_system_prompt(agent) if agent else (
        "Você é um agente executor do sistema Heuriskein. Responda em português."
    )
    corporate_prompt_context = _build_corporate_prompt_context_for_task(task, top_k=3)
    if corporate_prompt_context:
        _log(agent, task, "📚 Contexto corporativo injetado na execução da tarefa.")

    user_prompt = build_task_prompt(task, corporate_prompt_context=corporate_prompt_context)

    # ── Mark agent as executing ─────────────────────────────
    if agent:
        agent.state = "executing"
        agent.last_activity = timezone.now()
        agent.save(update_fields=["state", "last_activity"])
        _broadcast_agent(agent)

    _log(agent, task, "⚙️ Enviando tarefa para Claude...")

    try:
        if agent:
            response_text = llm.chat_for_agent(
                agent,
                messages=[{"role": "user", "content": user_prompt}],
                system=system_prompt,
            )
        else:
            response_text = llm.chat(
                messages=[{"role": "user", "content": user_prompt}],
                system=system_prompt,
            )
    except Exception as e:
        _fail_task(task, agent, f"Erro na chamada LLM: {str(e)}")
        return

    # ── Parse sections from response ────────────────────────
    result = _parse_response(response_text)
    subtask_specs = _extract_subtask_specs(response_text)
    result['subtasks'] = subtask_specs

    file_change_plan = _extract_file_change_plan(str(task.id), response_text)
    if file_change_plan:
        result['file_change_plan'] = file_change_plan
        result['requires_approval'] = True
        _log(agent, task, f"📝 {len(file_change_plan)} mudança(s) de arquivo proposta(s) com diff.")
        for preview in file_change_plan:
            create_artifact(
                title=f"Proposta de mudança: {preview.get('relative_path')}",
                artifact_type='diff',
                task=task,
                epic=task.epic,
                agent=agent,
                status='proposed',
                relative_path=preview.get('relative_path', ''),
                preview=preview.get('diff', ''),
                content=preview.get('new_content', ''),
                payload=preview,
            )
        record_task_event(
            task,
            'approval_requested',
            f'{len(file_change_plan)} mudança(s) de arquivo aguardando aprovação',
            agent=agent,
            metadata={'count': len(file_change_plan)},
        )

    # ── Persist result and route to approval when file changes exist ──────
    task.result = result
    if file_change_plan:
        task.status = "blocked"
        task.error = "Aguardando aprovação de mudanças de arquivo"
        task.completed_at = None
        task.save(update_fields=["status", "result", "error", "completed_at"])
        record_task_event(task, 'blocked', task.error, agent=agent)
    else:
        task.status = "completed"
        task.completed_at = timezone.now()
        task.save(update_fields=["status", "result", "completed_at"])
        record_task_event(task, 'completed', 'Tarefa concluída com sucesso', agent=agent, metadata={'summary': result.get('summary', '')})
    _broadcast_task(task)

    if agent:
        agent.state = "idle"
        agent.current_task = None
        agent.last_activity = timezone.now()
        agent.save(update_fields=["state", "current_task", "last_activity"])
        _broadcast_agent(agent)

    _log(agent, task, "✅ Tarefa concluída com sucesso.")

    # ── Auto-create subtasks from LLM output ────────────────
    subtask_count = _create_subtasks_from_result(task, subtask_specs, agent=agent)
    if subtask_count:
        _log(agent, task, f"📋 {subtask_count} subtarefa(s) gerada(s) automaticamente.")
        record_task_event(task, 'decomposed', f'{subtask_count} subtarefa(s) gerada(s) automaticamente', agent=agent, metadata={'count': subtask_count})


def _fail_task(task, agent, error_msg: str):
    """Mark task as failed and reset agent state."""
    task.status = "failed"
    task.error = error_msg
    task.completed_at = timezone.now()
    task.save(update_fields=["status", "error", "completed_at"])
    _broadcast_task(task)
    record_task_event(task, 'failed', error_msg, agent=agent, metadata={'error': error_msg})

    if agent:
        agent.state = "error" if "error" in [s[0] for s in agent._meta.model.AGENT_STATES] else "idle"
        agent.current_task = None
        agent.last_activity = timezone.now()
        agent.save(update_fields=["state", "current_task", "last_activity"])
        _broadcast_agent(agent)

    _log(agent, task, f"❌ Falha na execução: {error_msg}", level="error")


def _extract_subtask_specs(raw_text: str) -> list[dict]:
    """Parse [SUBTAREFA: title || description || priority] markers into structured specs."""
    pattern = re.compile(
        r'\[SUBTAREFA:\s*(.+?)\s*\|\|\s*(.+?)\s*\|\|\s*(low|medium|high)\s*\]',
        re.IGNORECASE | re.DOTALL,
    )

    items: list[dict] = []
    for match in pattern.finditer(raw_text):
        title = match.group(1).strip()[:255]
        description = match.group(2).strip()
        priority = match.group(3).strip().lower()
        if title:
            items.append({
                'title': title,
                'description': description,
                'priority': priority,
            })

    return items


def _create_subtasks_from_result(task, subtask_specs: list[dict], agent=None) -> int:
    """Persist structured subtasks linked to the parent task."""
    created = 0
    for order, spec in enumerate(subtask_specs, start=1):
        try:
            subtask = create_subtask(
                task=task,
                title=spec['title'],
                description=spec.get('description', ''),
                priority=spec.get('priority', 'medium'),
                assigned_to=agent,
                source='agent',
                order=order,
            )
            handoff = create_agent_handoff(
                from_agent=task.assigned_to,
                to_agent=subtask.assigned_to,
                task=task,
                message_type='delegate',
                subject=f'Subtarefa automatizada: {subtask.title}',
                body=(
                    f'O agente executor decompôs a tarefa em uma nova subtarefa: {subtask.title}.\n\n'
                    f'Descrição: {subtask.description or "Sem descrição adicional."}'
                ),
                payload={
                    'source': 'execution_engine',
                    'subtask_id': str(subtask.id),
                    'subtask_title': subtask.title,
                    'priority': subtask.priority,
                },
            )
            if handoff:
                record_task_event(
                    task,
                    'updated',
                    f'Mensagem node-to-node criada para a subtarefa automatizada {subtask.title}',
                    agent=task.assigned_to,
                    metadata={'subtask_id': str(subtask.id), 'agent_message_id': str(handoff.id)},
                )
            created += 1
        except Exception:
            pass
    return created


def _parse_response(text: str) -> dict:
    """Extract structured sections from LLM markdown response."""
    sections = {
        "análise": "",
        "execução": "",
        "resultado": "",
        "próximos_passos": "",
        "raw": text,
    }

    mapping = {
        "análise": ["### análise", "## análise", "**análise**"],
        "execução": ["### execução", "## execução", "**execução**"],
        "resultado": ["### resultado", "## resultado", "**resultado**"],
        "próximos_passos": ["### próximos passos", "## próximos passos", "**próximos passos**"],
    }

    lines = text.splitlines()
    current_section = None

    for line in lines:
        lower = line.strip().lower()

        # Check if this line starts a new section
        matched = None
        for key, headers in mapping.items():
            if any(lower.startswith(h) for h in headers):
                matched = key
                break

        if matched:
            current_section = matched
            continue

        if current_section:
            sections[current_section] += line + "\n"

    # Clean up whitespace
    for key in ["análise", "execução", "resultado", "próximos_passos"]:
        sections[key] = sections[key].strip()

    # If parsing failed (no sections found), put everything in resultado
    if not any(sections[k] for k in ["análise", "execução", "resultado"]):
        sections["resultado"] = text.strip()

    next_steps = [line.strip(' -\t') for line in sections["próximos_passos"].splitlines() if line.strip()]
    summary = sections["resultado"] or sections["execução"] or text.strip()
    summary = summary.splitlines()[0].strip() if summary else ''

    return {
        "summary": summary,
        "analysis": sections["análise"],
        "execution": sections["execução"],
        "resultado": sections["resultado"],
        "next_action": next_steps[0] if next_steps else '',
        "next_steps": next_steps,
        "próximos_passos": sections["próximos_passos"],
        "raw": text,
    }


def _extract_file_change_plan(task_id: str, text: str) -> list[dict]:
    """Parse FILE_CHANGE blocks and build non-destructive diff previews."""
    pattern = re.compile(
        r'\[FILE_CHANGE:\s*(.+?)\]\s*```(?:content)?\n(.*?)```\s*\[/FILE_CHANGE\]',
        re.IGNORECASE | re.DOTALL,
    )

    plan: list[dict] = []
    for match in pattern.finditer(text):
        relative_path = match.group(1).strip()
        new_content = match.group(2)
        preview = preview_file_change(
            task_id=task_id,
            relative_path=relative_path,
            new_content=new_content,
        )
        preview['new_content'] = new_content
        plan.append(preview)

    return plan


# ──────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────

def execute_task_async(task_id: str):
    """
    Dispatch task execution in a background daemon thread.
    Returns immediately — caller gets the thread for reference.
    """
    t = threading.Thread(target=_run_task, args=(task_id,), daemon=True)
    t.start()
    return t
