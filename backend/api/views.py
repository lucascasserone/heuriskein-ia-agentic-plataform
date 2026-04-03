from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.utils import timezone
from django.db.models import Q
from datetime import timedelta
import re
import unicodedata
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from api.models import Agent, Task, Epic, ThoughtLog, ChatMessage, ClarificationRequest
from api.serializers import (
    AgentSerializer, TaskSerializer, EpicSerializer,
    ThoughtLogSerializer, ChatMessageSerializer,
    RegisterSerializer, LoginSerializer, UserSerializer,
    ChatRequestSerializer, ChatResponseSerializer, ClarificationRequestSerializer
)
from api.epic_decomposition import ensure_epic_task_queue
from api.llm_service import get_llm_service
from api.execution_engine import execute_task_async


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
    normalized = _normalize_text(raw)
    create_terms = ['criar', 'crie', 'adicione', 'adicionar', 'novo', 'nova']
    epic_terms = ['epico', 'epic']
    task_terms = ['tarefa', 'task']

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
        new_goal = _extract_field([
            r'(?:novo\s+objetivo|objetivo|goal)\s*[:\-]\s*([^;\n]+)',
        ], raw)
        new_description = _extract_field([
            r'(?:nova\s+descricao|nova\s+descrição|descricao|descrição|description)\s*[:\-]\s*([^;\n]+)',
        ], raw)
        priority_text = _extract_field([
            r'(?:nova\s+prioridade|prioridade|priority)\s*[:\-]\s*([^;\n]+)',
        ], raw)
        new_priority = _resolve_priority(priority_text, default='') if priority_text else ''
        epic_id = _extract_field([
            r'(?:id(?:\s+do)?\s+(?:epico|épico|epic)|(?:epico|épico|epic)\s+id|id)\s*[:\-]\s*([0-9a-fA-F\-]{36})',
        ], raw)
        epic_ref = _extract_field([
            r'(?:epico|épico|epic)\s*[:\-]\s*([^;\n]+)',
            r'(?:objetivo\s+atual|goal\s+atual)\s*[:\-]\s*([^;\n]+)',
        ], raw)
        if not epic_id and epic_ref and _normalize_text(epic_ref) in ['editar', 'atualizar', 'alterar']:
            epic_ref = ''
        missing = []
        if not epic_id and not epic_ref:
            missing.append('epic_ref')
        if not any([new_goal, new_description, new_priority]):
            missing.append('changes')
        return {
            'type': 'update_epic',
            'epic_id': epic_id,
            'epic_ref': epic_ref,
            'goal': new_goal,
            'description': new_description,
            'priority': new_priority,
            'missing': missing,
        }

    if any(term in normalized for term in create_terms) and any(term in normalized for term in task_terms):
        priority = _resolve_priority(normalized, default='medium')
        title = _extract_field([
            r'(?:tarefa|task)\s*[:\-]\s*(.+)',
            r'(?:tarefa|task)\s+chamada\s+(.+)',
            r'(?:tarefa|task)\s+com\s+nome\s+(.+)',
            r'criar\s+(?:uma\s+)?(?:nova\s+)?(?:tarefa|task)\s+(?:com\s+)?(?:titulo\s+)?(.+)',
        ], raw)
        description = _extract_field([
            r'(?:descricao|descrição|description)\s*[:\-]\s*(.+)',
            r'(?:detalhes|detalhe|details)\s*[:\-]\s*(.+)',
        ], raw)

        if title:
            title = re.split(
                r';\s*(?:prioridade|priority|descricao|descrição|description)\s*:',
                title,
                maxsplit=1,
                flags=re.IGNORECASE,
            )[0].strip(' .;:')

        if not title or len(title) < 5:
            return {
                'type': 'create_task',
                'missing': ['title'],
                'priority': priority,
            }

        return {
            'type': 'create_task',
            'title': title,
            'description': description,
            'priority': priority,
            'status': 'queue',
        }

    if not any(term in normalized for term in create_terms) or not any(term in normalized for term in epic_terms):
        return {'type': 'none'}

    priority = _resolve_priority(normalized, default='medium')

    goal = _extract_field([
        r'(?:objetivo|goal)\s*[:\-]\s*(.+)',
        r'(?:epico|épico|epic)\s*[:\-]\s*(.+)',
        r'(?:epico|épico|epic)\s+chamado\s+(.+)',
        r'(?:epico|épico|epic)\s+com\s+nome\s+(.+)',
        r'(?:chamado|nomeado)\s+(.+)',
        r'criar\s+(?:um\s+)?(?:novo\s+)?(?:epico|épico|epic)\s+(?:com\s+)?(?:objetivo\s+)?(.+)',
    ], raw)

    description = _extract_field([
        r'(?:descricao|descrição|description)\s*[:\-]\s*(.+)',
        r'(?:detalhes|detalhe|details)\s*[:\-]\s*(.+)',
    ], raw)

    if goal:
        # Remove trailing structured fields that may come in the same sentence.
        goal = re.split(
            r';\s*(?:prioridade|priority|descricao|descrição|description)\s*:',
            goal,
            maxsplit=1,
            flags=re.IGNORECASE,
        )[0].strip(' .;:')

    if not goal or len(goal) < 8:
        return {
            'type': 'create_epic',
            'missing': ['goal'],
            'priority': priority,
        }

    return {
        'type': 'create_epic',
        'goal': goal,
        'description': description,
        'priority': priority,
    }


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

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Marcar tarefa como completada"""
        task = self.get_object()
        task.status = 'completed'
        task.result = request.data.get('result', {})
        task.completed_at = timezone.now()
        task.save()

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


class HealthCheckAPIView(APIView):
    """Health check endpoint"""
    permission_classes = []
    
    def get(self, request):
        return Response({
            'status': 'healthy',
            'agents': Agent.objects.count(),
            'tasks': Task.objects.count(),
            'epics': Epic.objects.count(),
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
            
            # Prepare messages for LLM
            messages = [
                {"role": "user", "content": user_message}
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
