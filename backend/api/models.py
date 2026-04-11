import uuid
import base64
import hashlib
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from django.conf import settings
from cryptography.fernet import Fernet, InvalidToken

class Agent(models.Model):
    """Modelo para representar um Agente IA"""
    
    AGENT_TYPES = [
        ('coordinator', 'Coordinador'),
        ('executor', 'Ejecutor'),
        ('analyst', 'Analista'),
    ]
    
    AGENT_STATES = [
        ('idle', 'Disponível'),
        ('thinking', 'Pensando'),
        ('executing', 'Executando'),
        ('blocked', 'Bloqueado'),
        ('error', 'Erro'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    organization = models.CharField(max_length=255, blank=True, default='Geral')
    type = models.CharField(max_length=20, choices=AGENT_TYPES, default='executor')
    state = models.CharField(max_length=20, choices=AGENT_STATES, default='idle')
    model = models.CharField(max_length=100, default='claude-3-opus')  # LLM model
    llm_provider = models.CharField(max_length=20, default='anthropic')
    llm_model = models.CharField(max_length=120, blank=True, default='claude-3-5-sonnet')
    llm_version = models.CharField(max_length=120, blank=True, default='latest')
    role_prompt = models.TextField(blank=True, default='')
    context = models.TextField(blank=True, default='')
    capabilities = models.JSONField(default=list, help_text="Lista de capacidades do agente")
    current_task = models.ForeignKey('Task', on_delete=models.SET_NULL, null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_activity = models.DateTimeField(default=timezone.now)
    
    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'Agente'
        verbose_name_plural = 'Agentes'
    
    def __str__(self):
        return f"{self.name} ({self.get_state_display()})"

    def save(self, *args, **kwargs):
        model_base = (self.llm_model or '').strip() or self.model
        model_version = (self.llm_version or '').strip()
        self.model = f"{model_base}@{model_version}" if model_version and model_version != 'latest' else model_base
        super().save(*args, **kwargs)


class ProviderCredential(models.Model):
    """Stores provider API keys encrypted at rest."""

    PROVIDER_CHOICES = [
        ('anthropic', 'Anthropic'),
        ('openai', 'OpenAI'),
        ('xai', 'xAI (Grok)'),
        ('google', 'Google (Gemini)'),
    ]

    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, unique=True)
    encrypted_api_key = models.TextField()
    key_hint = models.CharField(max_length=8, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Credencial de Provedor'
        verbose_name_plural = 'Credenciais de Provedor'

    @staticmethod
    def _fernet() -> Fernet:
        seed = (settings.SECRET_KEY or 'dev-secret').encode('utf-8')
        digest = hashlib.sha256(seed).digest()
        return Fernet(base64.urlsafe_b64encode(digest))

    def set_api_key(self, raw_api_key: str):
        value = (raw_api_key or '').strip()
        token = self._fernet().encrypt(value.encode('utf-8'))
        self.encrypted_api_key = token.decode('utf-8')
        self.key_hint = value[-4:] if len(value) >= 4 else value

    def get_api_key(self) -> str:
        try:
            return self._fernet().decrypt(self.encrypted_api_key.encode('utf-8')).decode('utf-8')
        except (InvalidToken, ValueError, TypeError):
            return ''


class Epic(models.Model):
    """Modelo para representar um Épico (grande objetivo)"""
    
    STATUS_CHOICES = [
        ('backlog', 'Backlog'),
        ('refinement', 'Refinamento'),
        ('approved', 'Aprovado'),
        ('completed', 'Completado'),
        ('failed', 'Falhou'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Baixa'),
        ('medium', 'Média'),
        ('high', 'Alta'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    goal = models.CharField(max_length=255, help_text="Objetivo do épico")
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='backlog')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    checklist_items = models.JSONField(default=list, blank=True)
    complexity = models.PositiveSmallIntegerField(null=True, blank=True)
    lead_time = models.DateField(null=True, blank=True)
    context_files = models.JSONField(default=list, blank=True)
    feedback = models.JSONField(default=list, blank=True)
    
    # Relacionamentos
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Épico'
        verbose_name_plural = 'Épicos'
    
    def __str__(self):
        return f"{self.goal} ({self.get_status_display()})"
    
    def task_count(self):
        return self.tasks.count()


class Task(models.Model):
    """Modelo para representar uma Tarefa"""
    
    STATUS_CHOICES = [
        ('queue', 'Fila'),
        ('processing', 'Processando'),
        ('blocked', 'Bloqueada'),
        ('review', 'Revisão'),
        ('completed', 'Completado'),
        ('failed', 'Falhou'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Baixa'),
        ('medium', 'Média'),
        ('high', 'Alta'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    
    # Relacionamentos
    epic = models.ForeignKey(Epic, on_delete=models.CASCADE, related_name='tasks', null=True, blank=True)
    assigned_to = models.ForeignKey(Agent, on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks')
    
    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queue')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    
    # Execução
    attempt_count = models.IntegerField(default=0)
    result = models.JSONField(null=True, blank=True, help_text="Resultado da execução")
    error = models.TextField(blank=True, help_text="Mensagem de erro se falhou")
    due_at = models.DateTimeField(null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Tarefa'
        verbose_name_plural = 'Tarefas'
    
    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"


class Subtask(models.Model):
    """Representa trabalho decomposto vinculado a uma tarefa pai."""

    STATUS_CHOICES = Task.STATUS_CHOICES
    PRIORITY_CHOICES = Task.PRIORITY_CHOICES
    SOURCE_CHOICES = [
        ('agent', 'Agente'),
        ('manual', 'Manual'),
        ('system', 'Sistema'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='subtasks')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queue')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    assigned_to = models.ForeignKey(Agent, on_delete=models.SET_NULL, null=True, blank=True, related_name='subtasks')
    depends_on = models.ManyToManyField('self', symmetrical=False, blank=True, related_name='dependents')
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='agent')
    order = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']
        verbose_name = 'Subtarefa'
        verbose_name_plural = 'Subtarefas'

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"


class Artifact(models.Model):
    """Entregáveis e anexos produzidos ao longo da execução."""

    ARTIFACT_TYPES = [
        ('document', 'Documento'),
        ('diff', 'Diff'),
        ('report', 'Relatório'),
        ('decision', 'Decisão'),
        ('spec', 'Especificação'),
        ('test_result', 'Resultado de Teste'),
        ('file_bundle', 'Pacote de Arquivos'),
        ('snapshot', 'Snapshot'),
        ('log', 'Log'),
    ]

    STATUS_CHOICES = [
        ('proposed', 'Proposto'),
        ('available', 'Disponível'),
        ('approved', 'Aprovado'),
        ('applied', 'Aplicado'),
        ('archived', 'Arquivado'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    artifact_type = models.CharField(max_length=30, choices=ARTIFACT_TYPES)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='artifacts', null=True, blank=True)
    epic = models.ForeignKey(Epic, on_delete=models.CASCADE, related_name='artifacts', null=True, blank=True)
    agent = models.ForeignKey(Agent, on_delete=models.SET_NULL, null=True, blank=True, related_name='artifacts')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')
    version = models.PositiveIntegerField(default=1)
    relative_path = models.CharField(max_length=500, blank=True)
    preview = models.TextField(blank=True)
    content = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Artefato'
        verbose_name_plural = 'Artefatos'

    def __str__(self):
        return f"{self.title} ({self.get_artifact_type_display()})"


class TaskEvent(models.Model):
    """Evento auditável de ciclo de vida da tarefa."""

    EVENT_TYPES = [
        ('created', 'Criada'),
        ('assigned', 'Atribuída'),
        ('started', 'Iniciada'),
        ('decomposed', 'Decomposta'),
        ('artifact_added', 'Artefato anexado'),
        ('blocked', 'Bloqueada'),
        ('approval_requested', 'Aguardando aprovação'),
        ('approved', 'Aprovada'),
        ('completed', 'Concluída'),
        ('failed', 'Falhou'),
        ('rolled_back', 'Rollback aplicado'),
        ('updated', 'Atualizada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='events')
    agent = models.ForeignKey(Agent, on_delete=models.SET_NULL, null=True, blank=True, related_name='task_events')
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES)
    message = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Evento de Tarefa'
        verbose_name_plural = 'Eventos de Tarefa'

    def __str__(self):
        return f"{self.task.title}: {self.message[:60]}"


class ApprovalRequest(models.Model):
    """Solicitação formal de aprovação para mudanças sensíveis."""

    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('approved', 'Aprovada'),
        ('rejected', 'Rejeitada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='approval_requests')
    artifact = models.ForeignKey(Artifact, on_delete=models.CASCADE, related_name='approval_requests', null=True, blank=True)
    requested_by_agent = models.ForeignKey(Agent, on_delete=models.SET_NULL, null=True, blank=True, related_name='approval_requests')
    requested_by_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='requested_approvals')
    decided_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='decided_approvals')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    rationale = models.TextField(blank=True)
    decision_notes = models.TextField(blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-requested_at']
        verbose_name = 'Solicitação de Aprovação'
        verbose_name_plural = 'Solicitações de Aprovação'

    def __str__(self):
        return f"Approval {self.id} ({self.status})"


class DecisionRecord(models.Model):
    """Registro de decisão operacional ou estratégica vinculada ao trabalho."""

    SCOPE_CHOICES = [
        ('task', 'Task'),
        ('epic', 'Epic'),
        ('org', 'Org'),
    ]

    STATUS_CHOICES = [
        ('proposed', 'Proposta'),
        ('accepted', 'Aceita'),
        ('rejected', 'Rejeitada'),
        ('superseded', 'Substituída'),
    ]

    IMPACT_CHOICES = [
        ('low', 'Baixo'),
        ('medium', 'Médio'),
        ('high', 'Alto'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='decision_records')
    artifact = models.ForeignKey(Artifact, on_delete=models.SET_NULL, null=True, blank=True, related_name='decision_records')
    approval_request = models.ForeignKey(ApprovalRequest, on_delete=models.SET_NULL, null=True, blank=True, related_name='decision_records')
    supersedes = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='superseded_by')
    created_by_agent = models.ForeignKey(Agent, on_delete=models.SET_NULL, null=True, blank=True, related_name='decision_records')
    created_by_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_decisions')
    decided_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='decided_records')
    title = models.CharField(max_length=255)
    summary = models.TextField(blank=True)
    rationale = models.TextField(blank=True)
    scope = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='task')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='proposed')
    impact = models.CharField(max_length=20, choices=IMPACT_CHOICES, default='medium')
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Registro de Decisão'
        verbose_name_plural = 'Registros de Decisão'

    def __str__(self):
        return f"{self.title} ({self.status})"


class AgentMessage(models.Model):
    """Structured node-to-node communication envelope between agents."""

    MESSAGE_TYPES = [
        ('delegate', 'Delegar'),
        ('review', 'Revisar'),
        ('escalate', 'Escalar'),
        ('context_sync', 'Sincronizar Contexto'),
        ('result', 'Resultado'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('delivered', 'Entregue'),
        ('acknowledged', 'Reconhecida'),
        ('failed', 'Falhou'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    from_agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name='messages_sent')
    to_agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name='messages_received')
    task = models.ForeignKey(Task, on_delete=models.SET_NULL, null=True, blank=True, related_name='agent_messages')
    parent_message = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='replies')
    message_type = models.CharField(max_length=20, choices=MESSAGE_TYPES, default='delegate')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    subject = models.CharField(max_length=255, blank=True)
    body = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True)
    trace_id = models.CharField(max_length=64, db_index=True, blank=True)
    correlation_id = models.CharField(max_length=64, db_index=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Mensagem de Agente'
        verbose_name_plural = 'Mensagens de Agente'

    def __str__(self):
        return f"{self.from_agent.name} -> {self.to_agent.name} ({self.message_type})"


class CorporateDocument(models.Model):
    """Versioned operational document linked to work items and governance."""

    DOC_TYPES = [
        ('brief', 'Brief'),
        ('spec', 'Spec'),
        ('report', 'Report'),
        ('sop', 'SOP'),
        ('retro', 'Retro'),
        ('memo', 'Memo'),
        ('playbook', 'Playbook'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('active', 'Ativo'),
        ('archived', 'Arquivado'),
    ]

    SCOPE_CHOICES = [
        ('task', 'Task'),
        ('epic', 'Epic'),
        ('org', 'Org'),
        ('global', 'Global'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    doc_type = models.CharField(max_length=20, choices=DOC_TYPES, default='brief')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    scope = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='org')
    area = models.CharField(max_length=120, blank=True, default='')
    initiative = models.CharField(max_length=160, blank=True, default='')
    version = models.PositiveIntegerField(default=1)
    tags = models.JSONField(default=list, blank=True)
    summary = models.TextField(blank=True)
    content = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    task = models.ForeignKey(Task, on_delete=models.SET_NULL, null=True, blank=True, related_name='corporate_documents')
    epic = models.ForeignKey(Epic, on_delete=models.SET_NULL, null=True, blank=True, related_name='corporate_documents')
    created_by_agent = models.ForeignKey(Agent, on_delete=models.SET_NULL, null=True, blank=True, related_name='corporate_documents')
    created_by_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='corporate_documents')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'Documento Corporativo'
        verbose_name_plural = 'Documentos Corporativos'

    def __str__(self):
        return f"{self.title} v{self.version}"


class CorporateMemoryEntry(models.Model):
    """Reusable memory entry by area and initiative."""

    SOURCE_TYPES = [
        ('document', 'Documento'),
        ('decision', 'Decisão'),
        ('workflow_run', 'Workflow Run'),
        ('task', 'Task'),
        ('manual', 'Manual'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    area = models.CharField(max_length=120, blank=True, default='')
    initiative = models.CharField(max_length=160, blank=True, default='')
    source_type = models.CharField(max_length=30, choices=SOURCE_TYPES, default='manual')
    source_id = models.CharField(max_length=64, blank=True, default='', db_index=True)
    summary = models.TextField(blank=True)
    content = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    times_reused = models.PositiveIntegerField(default=0)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'Memória Corporativa'
        verbose_name_plural = 'Memórias Corporativas'

    def __str__(self):
        return self.title


class WorkflowPlaybook(models.Model):
    """Reusable business workflow or playbook."""

    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('active', 'Ativo'),
        ('archived', 'Arquivado'),
    ]

    SCOPE_CHOICES = [
        ('task', 'Task'),
        ('epic', 'Epic'),
        ('org', 'Org'),
        ('global', 'Global'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=120, blank=True, default='operations')
    scope = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='global')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    is_template = models.BooleanField(default=False)
    trigger_phrases = models.JSONField(default=list, blank=True)
    graph = models.JSONField(default=list, blank=True, help_text='Ordered workflow steps')
    metadata = models.JSONField(default=dict, blank=True)
    created_by_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_playbooks')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Workflow Playbook'
        verbose_name_plural = 'Workflow Playbooks'

    def __str__(self):
        return self.name


class WorkflowRun(models.Model):
    """Execution record of a workflow playbook."""

    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('running', 'Executando'),
        ('completed', 'Concluído'),
        ('failed', 'Falhou'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    playbook = models.ForeignKey(WorkflowPlaybook, on_delete=models.CASCADE, related_name='runs')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    scope = models.CharField(max_length=20, default='global')
    input_payload = models.JSONField(default=dict, blank=True)
    execution_log = models.JSONField(default=list, blank=True)
    result_payload = models.JSONField(default=dict, blank=True)
    task = models.ForeignKey(Task, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_runs')
    epic = models.ForeignKey(Epic, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_runs')
    created_by_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_runs')
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Workflow Run'
        verbose_name_plural = 'Workflow Runs'

    def __str__(self):
        return f"{self.playbook.name} ({self.status})"


class ThoughtLog(models.Model):
    """Modelo para registrar pensamentos e ações dos agentes"""
    
    LOG_LEVELS = [
        ('debug', 'Debug'),
        ('info', 'Info'),
        ('warning', 'Warning'),
        ('error', 'Error'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name='thought_logs')
    task = models.ForeignKey(Task, on_delete=models.SET_NULL, null=True, blank=True)
    
    message = models.TextField(help_text="Pensamento ou ação do agente")
    level = models.CharField(max_length=10, choices=LOG_LEVELS, default='info')
    context = models.JSONField(default=dict, blank=True)
    
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Log de Pensamento'
        verbose_name_plural = 'Logs de Pensamento'
    
    def __str__(self):
        return f"{self.agent.name}: {self.message[:50]}"


class ChatMessage(models.Model):
    """Modelo para armazenar mensagens de chat"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name='chat_messages')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    
    user_message = models.TextField()
    agent_response = models.TextField()
    context = models.JSONField(default=dict, blank=True, help_text="Contexto (tarefas, épicos)")
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Mensagem de Chat'
        verbose_name_plural = 'Mensagens de Chat'


class ClarificationRequest(models.Model):
    """Solicitação de esclarecimento ao piloto (human-in-the-loop)."""

    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('answered', 'Respondida'),
        ('expired', 'Expirada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='clarification_requests')
    agent = models.ForeignKey(Agent, on_delete=models.SET_NULL, null=True, blank=True)
    question = models.TextField(help_text='Pergunta da IA para o piloto')
    answer = models.TextField(blank=True, help_text='Resposta do piloto')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    answered_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Solicitação de Esclarecimento'
        verbose_name_plural = 'Solicitações de Esclarecimento'

    def __str__(self):
        return f"Clarification {self.id} ({self.status})"
