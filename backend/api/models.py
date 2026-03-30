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
