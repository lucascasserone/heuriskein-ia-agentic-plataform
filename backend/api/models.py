import uuid
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

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
    type = models.CharField(max_length=20, choices=AGENT_TYPES, default='executor')
    state = models.CharField(max_length=20, choices=AGENT_STATES, default='idle')
    model = models.CharField(max_length=100, default='claude-3-opus')  # LLM model
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
