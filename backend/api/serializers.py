from rest_framework import serializers
from django.contrib.auth.models import User
from api.models import Agent, Task, Epic, ThoughtLog, ChatMessage


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
    
    class Meta:
        model = Agent
        fields = [
            'id', 'name', 'type', 'state', 'model', 
            'capabilities', 'current_task', 'task_count',
            'created_at', 'updated_at', 'last_activity'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_task_count(self, obj):
        return obj.tasks.count()


class EpicSerializer(serializers.ModelSerializer):
    """Serializador para Épico"""
    
    task_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = Epic
        fields = [
            'id', 'goal', 'description', 'status', 'priority',
            'created_by', 'created_by_name', 'task_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_task_count(self, obj):
        return obj.task_count()


class TaskSerializer(serializers.ModelSerializer):
    """Serializador para Tarefa"""
    
    assigned_to_name = serializers.CharField(source='assigned_to.name', read_only=True)
    epic_goal = serializers.CharField(source='epic.goal', read_only=True)
    
    class Meta:
        model = Task
        fields = [
            'id', 'title', 'description', 'epic', 'epic_goal',
            'status', 'priority', 'assigned_to', 'assigned_to_name',
            'attempt_count', 'result', 'error',
            'created_at', 'updated_at', 'started_at', 'completed_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


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
