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

from api.models import Agent, Task, Epic, ThoughtLog, ChatMessage
from api.serializers import (
    AgentSerializer, TaskSerializer, EpicSerializer,
    ThoughtLogSerializer, ChatMessageSerializer,
    RegisterSerializer, LoginSerializer, UserSerializer,
    ChatRequestSerializer, ChatResponseSerializer
)
from api.llm_service import get_llm_service
from api.execution_engine import execute_task_async


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

        # Ensure there's at least one idle agent — create default if none exist
        if not Agent.objects.exists():
            Agent.objects.create(
                name='Claude Executor',
                type='executor',
                model='claude-3-5-sonnet-20241022',
                capabilities=['general', 'execution', 'analysis', 'planning']
            )

        available_agents = Agent.objects.filter(state='idle')
        if not available_agents.exists():
            # All agents busy — create a dedicated one for this task
            agent = Agent.objects.create(
                name=f'Claude Agent #{task.attempt_count + 1}',
                type='executor',
                model='claude-3-5-sonnet-20241022',
                capabilities=['general', 'execution', 'analysis']
            )
        else:
            agent = available_agents.first()

        # Transition task → processing
        task.status = 'processing'
        task.assigned_to = agent
        task.attempt_count += 1
        task.started_at = timezone.now()
        task.error = ''
        task.result = None
        task.save(update_fields=['status', 'assigned_to', 'attempt_count', 'started_at', 'error', 'result'])

        # Transition agent → thinking
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

        # Dispatch async execution (background thread)
        execute_task_async(str(task.pk))

        return Response(TaskSerializer(task).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """Re-executar uma tarefa que falhou"""
        task = self.get_object()
        if task.status not in ('failed', 'queue'):
            return Response(
                {'error': 'Apenas tarefas em fila ou com falha podem ser re-executadas'},
                status=status.HTTP_400_BAD_REQUEST
            )
        task.status = 'queue'
        task.error = ''
        task.result = None
        task.save(update_fields=['status', 'error', 'result'])
        return self.execute(request, pk=pk)

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
