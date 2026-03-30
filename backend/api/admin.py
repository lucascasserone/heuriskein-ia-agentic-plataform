from django.contrib import admin
from api.models import Agent, Task, Epic, ThoughtLog, ChatMessage


@admin.register(Agent)
class AgentAdmin(admin.ModelAdmin):
    list_display = ['name', 'type', 'state', 'model', 'last_activity']
    list_filter = ['type', 'state', 'created_at']
    search_fields = ['name', 'capabilities']
    readonly_fields = ['id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Informações Básicas', {
            'fields': ('name', 'type', 'model')
        }),
        ('Status', {
            'fields': ('state', 'current_task', 'last_activity')
        }),
        ('Capacidades', {
            'fields': ('capabilities',)
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Epic)
class EpicAdmin(admin.ModelAdmin):
    list_display = ['goal', 'status', 'priority', 'task_count', 'created_at']
    list_filter = ['status', 'priority', 'created_at']
    search_fields = ['goal', 'description']
    readonly_fields = ['id', 'created_at', 'updated_at', 'created_by']
    
    fieldsets = (
        ('Objetivo', {
            'fields': ('goal', 'description')
        }),
        ('Status', {
            'fields': ('status', 'priority')
        }),
        ('Metadata', {
            'fields': ('created_by', 'id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ['title', 'status', 'priority', 'assigned_to', 'attempt_count', 'created_at']
    list_filter = ['status', 'priority', 'epic', 'created_at']
    search_fields = ['title', 'description']
    readonly_fields = ['id', 'created_at', 'updated_at', 'attempt_count']
    
    fieldsets = (
        ('Tarefa', {
            'fields': ('title', 'description', 'epic')
        }),
        ('Alocação', {
            'fields': ('assigned_to',)
        }),
        ('Execução', {
            'fields': ('status', 'priority', 'attempt_count', 'result', 'error')
        }),
        ('Timestamps', {
            'fields': ('started_at', 'completed_at', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(ThoughtLog)
class ThoughtLogAdmin(admin.ModelAdmin):
    list_display = ['agent', 'task', 'level', 'timestamp']
    list_filter = ['level', 'agent', 'timestamp']
    search_fields = ['message', 'agent__name']
    readonly_fields = ['id', 'timestamp']
    
    fieldsets = (
        ('Log', {
            'fields': ('message', 'level')
        }),
        ('Relacionamentos', {
            'fields': ('agent', 'task')
        }),
        ('Context', {
            'fields': ('context',)
        }),
        ('Metadata', {
            'fields': ('id', 'timestamp'),
            'classes': ('collapse',)
        }),
    )


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ['user', 'agent', 'created_at']
    list_filter = ['agent', 'created_at']
    search_fields = ['user_message', 'agent_response']
    readonly_fields = ['id', 'created_at']
    
    fieldsets = (
        ('Mensagem', {
            'fields': ('user_message', 'agent_response')
        }),
        ('Relacionamentos', {
            'fields': ('user', 'agent')
        }),
        ('Context', {
            'fields': ('context',)
        }),
        ('Metadata', {
            'fields': ('id', 'created_at'),
            'classes': ('collapse',)
        }),
    )
