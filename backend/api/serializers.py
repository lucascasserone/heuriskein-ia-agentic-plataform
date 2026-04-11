from rest_framework import serializers
from django.conf import settings
import os
from django.contrib.auth.models import User
from api.models import Agent, Task, Epic, ThoughtLog, ChatMessage, ClarificationRequest, Artifact, TaskEvent, Subtask, ApprovalRequest, DecisionRecord, ProviderCredential, AgentMessage, CorporateDocument, CorporateMemoryEntry, WorkflowPlaybook, WorkflowRun


class UserSerializer(serializers.ModelSerializer):
    """Serializador para User - Read only"""
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id']


class RegisterSerializer(serializers.ModelSerializer):
    """Serializador para Registro de novo usuário"""
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField(required=True)
    
    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'password', 'password2']
    
    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({"password": "Passwords must match."})
        
        if User.objects.filter(username=attrs['username']).exists():
            raise serializers.ValidationError({"username": "Username already exists."})
        
        if User.objects.filter(email=attrs['email']).exists():
            raise serializers.ValidationError({"email": "Email already exists."})
        
        return attrs
    
    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', '')
        )
        return user


class LoginSerializer(serializers.Serializer):
    """Serializador para Login"""
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class AgentSerializer(serializers.ModelSerializer):
    """Serializador para Agente"""
    
    task_count = serializers.SerializerMethodField()
    api_key_configured = serializers.SerializerMethodField()

    PROVIDER_MODELS = {
        'anthropic': ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus'],
        'openai': ['gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'],
        'xai': ['grok-2-1212', 'grok-2-mini-1212'],
        'google': ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
    }
    
    class Meta:
        model = Agent
        fields = [
            'id', 'name', 'organization', 'type', 'state',
            'model', 'llm_provider', 'llm_model', 'llm_version', 'role_prompt', 'context',
            'capabilities', 'current_task', 'task_count',
            'api_key_configured',
            'created_at', 'updated_at', 'last_activity'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_llm_provider(self, value):
        if value not in self.PROVIDER_MODELS:
            raise serializers.ValidationError('Provedor de IA inválido.')
        return value

    def validate(self, attrs):
        provider = attrs.get('llm_provider') or getattr(self.instance, 'llm_provider', 'anthropic')
        model = attrs.get('llm_model') or getattr(self.instance, 'llm_model', '')
        if provider in self.PROVIDER_MODELS and model:
            allowed = self.PROVIDER_MODELS[provider]
            if model not in allowed:
                raise serializers.ValidationError({'llm_model': f'Modelo inválido para o provedor {provider}.'})

        env_key_map = {
            'anthropic': 'ANTHROPIC_API_KEY',
            'openai': 'OPENAI_API_KEY',
            'xai': 'XAI_API_KEY',
            'google': 'GOOGLE_API_KEY',
        }
        env_name = env_key_map.get(provider)
        env_value = (getattr(settings, env_name, '') if env_name else '') or os.environ.get(env_name or '', '')
        has_stored_key = ProviderCredential.objects.filter(provider=provider).exists()
        if not env_value and not has_stored_key:
            raise serializers.ValidationError({
                'llm_provider': 'Configure a chave de API deste provedor em Configuracoes antes de salvar o agente.'
            })
        return attrs
    
    def get_task_count(self, obj):
        return obj.tasks.count()

    def get_api_key_configured(self, obj):
        env_key_map = {
            'anthropic': 'ANTHROPIC_API_KEY',
            'openai': 'OPENAI_API_KEY',
            'xai': 'XAI_API_KEY',
            'google': 'GOOGLE_API_KEY',
        }
        env_name = env_key_map.get(obj.llm_provider)
        env_value = (getattr(settings, env_name, '') if env_name else '') or os.environ.get(env_name or '', '')
        return bool(env_value) or ProviderCredential.objects.filter(provider=obj.llm_provider).exists()


class ProviderCredentialWriteSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=['anthropic', 'openai', 'xai', 'google'])
    api_key = serializers.CharField(write_only=True, min_length=16, trim_whitespace=True)


class ProviderCredentialStatusSerializer(serializers.Serializer):
    provider = serializers.CharField()
    configured = serializers.BooleanField()
    key_hint = serializers.CharField(allow_blank=True)
    updated_at = serializers.DateTimeField(allow_null=True)


class AgentMessageSerializer(serializers.ModelSerializer):
    from_agent_name = serializers.CharField(source='from_agent.name', read_only=True)
    to_agent_name = serializers.CharField(source='to_agent.name', read_only=True)

    class Meta:
        model = AgentMessage
        fields = [
            'id', 'from_agent', 'from_agent_name', 'to_agent', 'to_agent_name',
            'task', 'parent_message', 'message_type', 'status', 'subject', 'body',
            'payload', 'trace_id', 'correlation_id', 'created_at', 'delivered_at', 'acknowledged_at'
        ]
        read_only_fields = ['id', 'status', 'created_at', 'delivered_at', 'acknowledged_at']

    def validate(self, attrs):
        from_agent = attrs.get('from_agent') or getattr(self.instance, 'from_agent', None)
        to_agent = attrs.get('to_agent') or getattr(self.instance, 'to_agent', None)
        if from_agent and to_agent and from_agent.id == to_agent.id:
            raise serializers.ValidationError({'to_agent': 'O agente de destino deve ser diferente do agente de origem.'})
        return attrs


class AgentMessageAckSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['acknowledged', 'failed'], default='acknowledged')


class EpicSerializer(serializers.ModelSerializer):
    """Serializador para Épico"""
    
    task_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    due_date = serializers.DateField(source='lead_time', required=False, allow_null=True, read_only=True)
    
    class Meta:
        model = Epic
        fields = [
            'id', 'goal', 'description', 'status', 'priority',
            'checklist_items', 'complexity', 'lead_time', 'due_date', 'context_files', 'feedback',
            'created_by', 'created_by_name', 'task_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_complexity(self, value):
        if value is None:
            return value
        if value < 1 or value > 13:
            raise serializers.ValidationError('Complexidade deve estar entre 1 e 13.')
        return value
    
    def get_task_count(self, obj):
        return obj.task_count()


class TaskSerializer(serializers.ModelSerializer):
    """Serializador para Tarefa"""
    
    assigned_to_name = serializers.CharField(source='assigned_to.name', read_only=True)
    epic_goal = serializers.CharField(source='epic.goal', read_only=True)
    pending_clarification = serializers.SerializerMethodField()
    latest_question = serializers.SerializerMethodField()
    artifact_count = serializers.SerializerMethodField()
    event_count = serializers.SerializerMethodField()
    subtask_count = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()
    next_action = serializers.SerializerMethodField()
    
    class Meta:
        model = Task
        fields = [
            'id', 'title', 'description', 'epic', 'epic_goal',
            'status', 'priority', 'assigned_to', 'assigned_to_name',
            'attempt_count', 'result', 'error', 'due_at',
            'summary', 'next_action', 'artifact_count', 'event_count', 'subtask_count',
            'pending_clarification', 'latest_question',
            'created_at', 'updated_at', 'started_at', 'completed_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_pending_clarification(self, obj):
        return obj.clarification_requests.filter(status='pending').exists()

    def get_latest_question(self, obj):
        req = obj.clarification_requests.filter(status='pending').order_by('-created_at').first()
        return req.question if req else ''

    def get_artifact_count(self, obj):
        return obj.artifacts.count()

    def get_event_count(self, obj):
        return obj.events.count()

    def get_subtask_count(self, obj):
        return obj.subtasks.count()

    def get_summary(self, obj):
        if isinstance(obj.result, dict):
            return obj.result.get('summary') or obj.result.get('resultado') or ''
        return ''

    def get_next_action(self, obj):
        if isinstance(obj.result, dict):
            next_action = obj.result.get('next_action')
            if next_action:
                return next_action
            next_steps = obj.result.get('next_steps') or []
            if next_steps:
                return next_steps[0]
            return obj.result.get('próximos_passos') or ''
        return ''


class SubtaskSerializer(serializers.ModelSerializer):
    """Serializador para subtarefas."""

    assigned_to_name = serializers.CharField(source='assigned_to.name', read_only=True)
    depends_on_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
        write_only=True,
    )
    depends_on = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Subtask
        fields = [
            'id', 'task', 'title', 'description', 'status', 'priority',
            'assigned_to', 'assigned_to_name', 'source', 'order', 'metadata',
            'depends_on', 'depends_on_ids', 'created_at', 'updated_at', 'completed_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_depends_on(self, obj):
        return [str(item.id) for item in obj.depends_on.all()]

    def validate_depends_on_ids(self, value):
        if not value:
            return []

        subtask_id = self.instance.id if self.instance else None
        if subtask_id and subtask_id in value:
            raise serializers.ValidationError('Subtarefa não pode depender de si mesma.')

        if self.instance and self._creates_cycle(self.instance.id, value):
            raise serializers.ValidationError('Dependência inválida: ciclo detectado entre subtarefas.')
        return value

    def _creates_cycle(self, subtask_id, dependency_ids):
        """Return True when any selected dependency already reaches subtask_id."""
        if not subtask_id or not dependency_ids:
            return False

        visited = set()
        stack = [str(dep_id) for dep_id in dependency_ids]
        target = str(subtask_id)

        while stack:
            current_id = stack.pop()
            if current_id == target:
                return True
            if current_id in visited:
                continue

            visited.add(current_id)
            try:
                current = Subtask.objects.get(id=current_id)
            except Subtask.DoesNotExist:
                continue

            stack.extend(str(item.id) for item in current.depends_on.all())

        return False

    def create(self, validated_data):
        depends_on_ids = validated_data.pop('depends_on_ids', [])
        subtask = super().create(validated_data)
        if depends_on_ids:
            subtask.depends_on.set(depends_on_ids)
        return subtask

    def update(self, instance, validated_data):
        depends_on_ids = validated_data.pop('depends_on_ids', None)
        subtask = super().update(instance, validated_data)
        if depends_on_ids is not None:
            subtask.depends_on.set(depends_on_ids)
        return subtask


class ArtifactSerializer(serializers.ModelSerializer):
    """Serializador para artefatos."""

    agent_name = serializers.CharField(source='agent.name', read_only=True)

    class Meta:
        model = Artifact
        fields = [
            'id', 'title', 'artifact_type', 'task', 'epic', 'agent', 'agent_name',
            'status', 'version', 'relative_path', 'preview', 'content', 'payload',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class TaskEventSerializer(serializers.ModelSerializer):
    """Serializador para eventos de tarefa."""

    agent_name = serializers.CharField(source='agent.name', read_only=True)

    class Meta:
        model = TaskEvent
        fields = ['id', 'task', 'agent', 'agent_name', 'event_type', 'message', 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']


class ApprovalRequestSerializer(serializers.ModelSerializer):
    requested_by_agent_name = serializers.CharField(source='requested_by_agent.name', read_only=True)
    requested_by_user_name = serializers.CharField(source='requested_by_user.username', read_only=True)
    decided_by_name = serializers.CharField(source='decided_by.username', read_only=True)

    class Meta:
        model = ApprovalRequest
        fields = [
            'id', 'task', 'artifact', 'status', 'rationale', 'decision_notes',
            'requested_by_agent', 'requested_by_agent_name',
            'requested_by_user', 'requested_by_user_name',
            'decided_by', 'decided_by_name',
            'requested_at', 'decided_at', 'updated_at'
        ]
        read_only_fields = ['id', 'requested_at', 'decided_at', 'updated_at']


class DecisionRecordSerializer(serializers.ModelSerializer):
    created_by_agent_name = serializers.CharField(source='created_by_agent.name', read_only=True)
    created_by_user_name = serializers.CharField(source='created_by_user.username', read_only=True)
    decided_by_name = serializers.CharField(source='decided_by.username', read_only=True)
    supersedes_title = serializers.CharField(source='supersedes.title', read_only=True)

    class Meta:
        model = DecisionRecord
        fields = [
            'id', 'task', 'artifact', 'approval_request', 'supersedes', 'supersedes_title', 'title', 'summary', 'rationale',
            'scope', 'status', 'impact',
            'created_by_agent', 'created_by_agent_name',
            'created_by_user', 'created_by_user_name',
            'decided_by', 'decided_by_name',
            'created_at', 'decided_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'decided_at', 'updated_at']


class CorporateDocumentSerializer(serializers.ModelSerializer):
    created_by_agent_name = serializers.CharField(source='created_by_agent.name', read_only=True)
    created_by_user_name = serializers.CharField(source='created_by_user.username', read_only=True)

    class Meta:
        model = CorporateDocument
        fields = [
            'id', 'title', 'doc_type', 'status', 'scope', 'area', 'initiative',
            'version', 'tags', 'summary', 'content', 'metadata',
            'task', 'epic', 'created_by_agent', 'created_by_agent_name',
            'created_by_user', 'created_by_user_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CorporateMemoryEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = CorporateMemoryEntry
        fields = [
            'id', 'title', 'area', 'initiative', 'source_type', 'source_id',
            'summary', 'content', 'tags', 'metadata', 'times_reused',
            'last_used_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'times_reused', 'last_used_at', 'created_at', 'updated_at']


class WorkflowPlaybookSerializer(serializers.ModelSerializer):
    created_by_user_name = serializers.CharField(source='created_by_user.username', read_only=True)
    run_count = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowPlaybook
        fields = [
            'id', 'name', 'slug', 'description', 'category', 'scope', 'status',
            'is_template', 'trigger_phrases', 'graph', 'metadata',
            'created_by_user', 'created_by_user_name', 'run_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'run_count']

    def get_run_count(self, obj):
        return obj.runs.count()


class WorkflowRunSerializer(serializers.ModelSerializer):
    playbook_name = serializers.CharField(source='playbook.name', read_only=True)
    created_by_user_name = serializers.CharField(source='created_by_user.username', read_only=True)

    class Meta:
        model = WorkflowRun
        fields = [
            'id', 'playbook', 'playbook_name', 'status', 'scope', 'input_payload',
            'execution_log', 'result_payload', 'task', 'epic',
            'created_by_user', 'created_by_user_name',
            'started_at', 'completed_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'execution_log', 'result_payload', 'started_at', 'completed_at', 'created_at', 'updated_at']


class ExecutiveDashboardSerializer(serializers.Serializer):
    generated_at = serializers.DateTimeField()
    approvals_pending = serializers.IntegerField()
    decisions_open = serializers.IntegerField()
    active_documents = serializers.IntegerField()
    memory_entries = serializers.IntegerField()
    workflow_runs_today = serializers.IntegerField()
    overloaded_agents = serializers.ListField()
    pending_approvals = ApprovalRequestSerializer(many=True)
    recent_decisions = DecisionRecordSerializer(many=True)
    recent_documents = CorporateDocumentSerializer(many=True)
    recent_runs = WorkflowRunSerializer(many=True)


class TaskDetailSerializer(TaskSerializer):
    """Serializador detalhado para a workspace da tarefa."""

    artifacts = ArtifactSerializer(many=True, read_only=True)
    events = TaskEventSerializer(many=True, read_only=True)
    subtasks = SubtaskSerializer(many=True, read_only=True)
    approval_requests = ApprovalRequestSerializer(many=True, read_only=True)
    decision_records = DecisionRecordSerializer(many=True, read_only=True)

    class Meta(TaskSerializer.Meta):
        fields = TaskSerializer.Meta.fields + ['artifacts', 'events', 'subtasks', 'approval_requests', 'decision_records']


class ClarificationRequestSerializer(serializers.ModelSerializer):
    """Serializador para solicitações de esclarecimento"""

    task_title = serializers.CharField(source='task.title', read_only=True)
    agent_name = serializers.CharField(source='agent.name', read_only=True)
    answered_by_name = serializers.CharField(source='answered_by.username', read_only=True)

    class Meta:
        model = ClarificationRequest
        fields = [
            'id', 'task', 'task_title', 'agent', 'agent_name',
            'question', 'answer', 'status', 'answered_by', 'answered_by_name',
            'answered_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'answered_at']


class ThoughtLogSerializer(serializers.ModelSerializer):
    """Serializador para Log de Pensamento"""
    
    agent_name = serializers.CharField(source='agent.name', read_only=True)
    
    class Meta:
        model = ThoughtLog
        fields = [
            'id', 'agent', 'agent_name', 'task', 'message',
            'level', 'context', 'timestamp'
        ]
        read_only_fields = ['id', 'timestamp']


class ChatMessageSerializer(serializers.ModelSerializer):
    """Serializador para Mensagem de Chat"""
    
    agent_name = serializers.CharField(source='agent.name', read_only=True)
    user_name = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = ChatMessage
        fields = [
            'id', 'agent', 'agent_name', 'user', 'user_name',
            'user_message', 'agent_response', 'context', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'agent_response']


class ChatRequestSerializer(serializers.Serializer):
    """Serializador para requisição de chat com LLM"""
    message = serializers.CharField(max_length=2048)
    context = serializers.JSONField(required=False, default=dict)
    system_prompt = serializers.CharField(required=False, default='')
    stream = serializers.BooleanField(required=False, default=False)


class ChatResponseSerializer(serializers.Serializer):
    """Serializador para resposta de chat"""
    response = serializers.CharField()
    tokens_used = serializers.IntegerField(required=False)
    metadata = serializers.JSONField(required=False)
