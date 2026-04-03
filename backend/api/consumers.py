import json
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from django.conf import settings
from api.models import Task, Agent, ThoughtLog, Epic
from api.epic_decomposition import ensure_epic_task_queue


class TaskConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer para atualizações de tarefas em tempo real"""
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated and not settings.DEBUG:
            await self.close()
            return
        
        self.room_group_name = 'tasks_updates'
        
        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
    
    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
    
    async def receive(self, text_data):
        """Receber mensagens do cliente"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'task_update':
                await self.handle_task_update(data)
            elif message_type == 'subscribe':
                await self.handle_subscribe(data)
            
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'error': 'Invalid JSON'
            }))
    
    async def handle_task_update(self, data):
        """Processar atualização de tarefa"""
        task_id = data.get('task_id')
        update_data = data.get('data', {})
        
        task = await self.get_task(task_id)
        if not task:
            return
        
        # Update task
        for field, value in update_data.items():
            if hasattr(task, field):
                setattr(task, field, value)
        
        await self.save_task(task)
        
        # Broadcast to group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'task_updated',
                'task_id': str(task_id),
                'data': update_data
            }
        )
    
    async def handle_subscribe(self, data):
        """Processar inscrição em atualizações"""
        task_id = data.get('task_id')
        
        task = await self.get_task(task_id)
        if task:
            await self.send(text_data=json.dumps({
                'type': 'subscribed',
                'task_id': str(task_id)
            }))
    
    # Receive message from room group
    async def task_updated(self, event):
        """Enviar atualização de tarefa para o WebSocket"""
        await self.send(text_data=json.dumps({
            'type': 'task_updated',
            'task_id': event['task_id'],
            'data': event['data']
        }))
    
    async def agent_status_changed(self, event):
        """Enviar mudança de status do agente"""
        await self.send(text_data=json.dumps({
            'type': 'agent_status_changed',
            'agent_id': event['agent_id'],
            'state': event['state']
        }))
    
    async def thought_log_received(self, event):
        """Enviar novo log de pensamento"""
        await self.send(text_data=json.dumps({
            'type': 'thought_log',
            'agent_id': event['agent_id'],
            'message': event['message'],
            'level': event['level'],
            'timestamp': event['timestamp']
        }))
    
    @sync_to_async
    def get_task(self, task_id):
        try:
            return Task.objects.get(id=task_id)
        except Task.DoesNotExist:
            return None
    
    @sync_to_async
    def save_task(self, task):
        task.save()


class AgentConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer para atualizações de agentes em tempo real"""
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated and not settings.DEBUG:
            await self.close()
            return
        
        self.room_group_name = 'agents_updates'
        
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Send list of all active agents
        agents = await self.get_active_agents()
        await self.send(text_data=json.dumps({
            'type': 'agents_list',
            'agents': agents
        }))
    
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
    
    async def receive(self, text_data):
        """Receber mudanças de estado do agente"""
        try:
            data = json.loads(text_data)
            
            if data.get('type') == 'agent_status_update':
                agent_id = data.get('agent_id')
                new_state = data.get('state')
                
                await self.update_agent_state(agent_id, new_state)
                
                # Broadcast
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'agent_status_changed',
                        'agent_id': str(agent_id),
                        'state': new_state
                    }
                )
        except json.JSONDecodeError:
            pass
    
    async def agent_status_changed(self, event):
        """Enviar mudança de status para clientes"""
        await self.send(text_data=json.dumps({
            'type': 'agent_status_changed',
            'agent_id': event['agent_id'],
            'state': event['state']
        }))
    
    @sync_to_async
    def get_active_agents(self):
        agents = Agent.objects.filter(state__in=['idle', 'thinking'])
        return [
            {
                'id': str(agent.id),
                'name': agent.name,
                'state': agent.state,
                'model': agent.model
            }
            for agent in agents
        ]
    
    @sync_to_async
    def update_agent_state(self, agent_id, new_state):
        try:
            agent = Agent.objects.get(id=agent_id)
            agent.state = new_state
            agent.save()
        except Agent.DoesNotExist:
            pass


class ThoughtLogConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer para logs de pensamento em tempo real"""
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated and not settings.DEBUG:
            await self.close()
            return
        
        self.room_group_name = 'thought_logs'
        
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Send latest logs
        logs = await self.get_recent_logs()
        await self.send(text_data=json.dumps({
            'type': 'logs_list',
            'logs': logs
        }))
    
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
    
    async def thought_log_received(self, event):
        """Enviar novo log de pensamento"""
        await self.send(text_data=json.dumps({
            'type': 'thought_log',
            'agent_id': event['agent_id'],
            'agent_name': event['agent_name'],
            'message': event['message'],
            'level': event['level'],
            'timestamp': event['timestamp']
        }))
    
    @sync_to_async
    def get_recent_logs(self):
        logs = ThoughtLog.objects.all().order_by('-timestamp')[:50]
        return [
            {
                'agent_id': str(log.agent_id),
                'agent_name': log.agent.name,
                'message': log.message,
                'level': log.level,
                'timestamp': log.timestamp.isoformat()
            }
            for log in logs
        ]


class EpicUpdateConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer para atualizações de épicos em tempo real"""
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated and not settings.DEBUG:
            await self.close()
            return
        
        self.room_group_name = 'epics_updates'
        
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Send list of all epics
        epics = await self.get_all_epics()
        await self.send(text_data=json.dumps({
            'type': 'epics_list',
            'epics': epics
        }))
    
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
    
    async def receive(self, text_data):
        """Receber mudanças de épicos"""
        try:
            data = json.loads(text_data)
            
            if data.get('type') == 'epic_update':
                epic_id = data.get('epic_id')
                update_data = data.get('data', {})
                
                await self.update_epic(epic_id, update_data)
                
                # Broadcast
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'epic_updated',
                        'epic_id': str(epic_id),
                        'data': update_data
                    }
                )
        except json.JSONDecodeError:
            pass
    
    async def epic_updated(self, event):
        """Enviar atualização de épico para clientes"""
        await self.send(text_data=json.dumps({
            'type': 'epic_updated',
            'epic_id': event['epic_id'],
            'data': event['data']
        }))
    
    @sync_to_async
    def get_all_epics(self):
        epics = Epic.objects.all()
        return [
            {
                'id': str(epic.id),
                'goal': epic.goal,
                'status': epic.status,
                'priority': epic.priority,
                'task_count': epic.tasks.count()
            }
            for epic in epics
        ]
    
    @sync_to_async
    def update_epic(self, epic_id, update_data):
        try:
            epic = Epic.objects.get(id=epic_id)
            previous_status = epic.status
            for field, value in update_data.items():
                if hasattr(epic, field):
                    setattr(epic, field, value)
            epic.save()
            if previous_status != 'approved' and epic.status == 'approved':
                ensure_epic_task_queue(epic)
        except Epic.DoesNotExist:
            pass

