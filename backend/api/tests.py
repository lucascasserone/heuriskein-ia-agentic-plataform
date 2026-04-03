"""Tests for API endpoints"""

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from api.models import Agent, Task, Epic


class AgentAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='test', password='test123')
        self.client.force_authenticate(user=self.user)

    def test_create_agent(self):
        """Test creating an agent"""
        data = {
            'name': 'Test Agent',
            'type': 'executor',
            'model': 'claude-3-opus',
            'capabilities': ['code', 'analysis'],
        }
        response = self.client.post('/api/v1/agents/', data, format='json')
        self.assertEqual(response.status_code, 201)

    def test_list_agents(self):
        """Test listing agents"""
        Agent.objects.create(
            name='Test Agent',
            type='executor',
            model='claude-3-opus',
        )
        response = self.client.get('/api/v1/agents/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 1)


class TaskAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='test', password='test123')
        self.client.force_authenticate(user=self.user)

    def test_create_task(self):
        """Test creating a task"""
        data = {
            'title': 'Test Task',
            'description': 'Test Description',
            'priority': 'high',
            'status': 'queue',
        }
        response = self.client.post('/api/v1/tasks/', data, format='json')
        self.assertEqual(response.status_code, 201)

    def test_execute_task(self):
        """Test executing a task"""
        task = Task.objects.create(
            title='Test Task',
            description='Executar validação completa do fluxo com critérios claros e resultado esperado.',
            status='queue',
        )
        Agent.objects.create(
            name='Test Agent',
            type='executor',
            model='claude-3-opus',
        )
        response = self.client.post(f'/api/v1/tasks/{task.id}/execute/')
        self.assertEqual(response.status_code, 202)


class EpicAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='test', password='test123')
        self.client.force_authenticate(user=self.user)

    def test_create_epic(self):
        """Test creating an epic"""
        data = {
            'goal': 'Test Goal',
            'description': 'Test Description',
            'priority': 'high',
            'status': 'backlog',
        }
        response = self.client.post('/api/v1/epics/', data, format='json')
        self.assertEqual(response.status_code, 201)

    def test_list_epics_by_status(self):
        """Test listing epics by status"""
        Epic.objects.create(
            goal='Test Epic',
            status='backlog',
            created_by=self.user,
        )
        response = self.client.get('/api/v1/epics/by_status/')
        self.assertEqual(response.status_code, 200)

    def test_approve_epic_generates_task_queue(self):
        """Approving an epic via REST should seed execution tasks in queue."""
        epic = Epic.objects.create(
            goal='Melhorar onboarding mobile',
            description='Reduzir abandono no cadastro',
            priority='high',
            status='backlog',
            created_by=self.user,
        )

        response = self.client.patch(f'/api/v1/epics/{epic.id}/', {'status': 'approved'}, format='json')
        self.assertEqual(response.status_code, 200)

        tasks = Task.objects.filter(epic=epic)
        self.assertGreaterEqual(tasks.count(), 3)
        self.assertTrue(all(t.status == 'queue' for t in tasks))


class ChatCoordinatorCommandTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='chat_user', password='chat123')
        self.client.force_authenticate(user=self.user)
        Agent.objects.create(
            name='Coordenador IA',
            type='coordinator',
            model='claude-3-5-sonnet-20241022',
            capabilities=['planning', 'analysis'],
        )

    def test_chat_creates_epic_when_goal_is_provided(self):
        payload = {
            'message': 'Criar epico: Melhorar onboarding mobile; prioridade: alta; descricao: reduzir abandono no cadastro',
            'stream': False,
        }
        response = self.client.post('/api/v1/chat/', payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get('created'))
        self.assertEqual(response.data.get('action'), 'create_epic')
        self.assertIn('epic', response.data)

        epic = Epic.objects.get(id=response.data['epic']['id'])
        self.assertEqual(epic.goal, 'Melhorar onboarding mobile')
        self.assertEqual(epic.priority, 'high')
        self.assertEqual(epic.status, 'backlog')

    def test_chat_creates_epic_with_accented_command(self):
        payload = {
            'message': 'Criar épico: Publicar e hospedar aplicação gratuitamente',
            'stream': False,
        }
        response = self.client.post('/api/v1/chat/', payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get('created'))
        self.assertEqual(response.data.get('action'), 'create_epic')
        self.assertTrue(Epic.objects.filter(goal='Publicar e hospedar aplicação gratuitamente').exists())

    def test_chat_creates_epic_with_called_phrase(self):
        payload = {
            'message': 'Crie um epico chamado Documentacao do BOT',
            'stream': False,
        }
        response = self.client.post('/api/v1/chat/', payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get('created'))
        self.assertEqual(response.data.get('action'), 'create_epic')

    def test_chat_creates_task_with_explicit_command(self):
        payload = {
            'message': 'Criar tarefa: validar logica do chat; prioridade: media',
            'stream': False,
        }
        response = self.client.post('/api/v1/chat/', payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get('created'))
        self.assertEqual(response.data.get('action'), 'create_task')
        self.assertTrue(Task.objects.filter(title='validar logica do chat').exists())

    def test_chat_creates_task_on_followup_after_missing_title(self):
        first = {
            'message': 'gostaria de criar uma tarefa',
            'stream': False,
        }
        first_response = self.client.post('/api/v1/chat/', first, format='json')

        self.assertEqual(first_response.status_code, 200)
        self.assertFalse(first_response.data.get('created'))
        self.assertEqual(first_response.data.get('action'), 'create_task')

        second = {
            'message': 'Criar tarefa: validar logica do chat',
            'stream': False,
        }
        second_response = self.client.post('/api/v1/chat/', second, format='json')

        self.assertEqual(second_response.status_code, 200)
        self.assertTrue(second_response.data.get('created'))
        self.assertEqual(second_response.data.get('action'), 'create_task')
        self.assertTrue(Task.objects.filter(title='validar logica do chat').exists())


    def test_chat_requests_confirmation_before_ambiguous_epic_creation(self):
        payload = {
            'message': 'Gostaria de criar mais um epico chamado Documentacao do BOT',
            'stream': False,
        }
        response = self.client.post('/api/v1/chat/', payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['action'], 'create_epic')
        self.assertFalse(response.data['created'])
        self.assertTrue(response.data.get('awaiting_confirmation'))
        self.assertFalse(Epic.objects.filter(goal='Documentacao do BOT').exists())

        followup = {
            'message': 'sim, confirmar',
            'stream': False,
        }
        response2 = self.client.post('/api/v1/chat/', followup, format='json')

        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.data['action'], 'create_epic')
        self.assertTrue(response2.data['created'])
        self.assertTrue(Epic.objects.filter(goal='Documentacao do BOT').exists())
        epic = Epic.objects.get(id=response2.data['epic']['id'])
        self.assertEqual(epic.goal, 'Documentacao do BOT')

    def test_chat_requests_clarification_when_goal_missing(self):
        payload = {
            'message': 'Crie um epico novo para o projeto',
            'stream': False,
        }
        response = self.client.post('/api/v1/chat/', payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data.get('created'))
        self.assertEqual(response.data.get('action'), 'create_epic')
        self.assertIn('preciso do objetivo', response.data.get('agent_response', '').lower())
        self.assertEqual(Epic.objects.count(), 0)

    def test_chat_uses_pending_intent_to_create_epic_on_followup(self):
        first = {
            'message': 'Crie um epico novo para o projeto',
            'stream': False,
        }
        first_response = self.client.post('/api/v1/chat/', first, format='json')
        self.assertEqual(first_response.status_code, 200)
        self.assertFalse(first_response.data.get('created'))

        second = {
            'message': 'Criar documentação do bot, contendo todas as chaves de segurança',
            'stream': False,
        }
        second_response = self.client.post('/api/v1/chat/', second, format='json')

        self.assertEqual(second_response.status_code, 200)
        self.assertTrue(second_response.data.get('created'))
        self.assertEqual(second_response.data.get('action'), 'create_epic')
        self.assertEqual(Epic.objects.count(), 1)

    def test_chat_creates_epic_on_followup_with_accented_explicit_command(self):
        first = {
            'message': 'gostaria de criar um epico',
            'stream': False,
        }
        first_response = self.client.post('/api/v1/chat/', first, format='json')
        self.assertEqual(first_response.status_code, 200)
        self.assertFalse(first_response.data.get('created'))
        self.assertEqual(first_response.data.get('action'), 'create_epic')

        second = {
            'message': 'Criar épico: Publicar e hospedar aplicação gratuitamente',
            'stream': False,
        }
        second_response = self.client.post('/api/v1/chat/', second, format='json')

        self.assertEqual(second_response.status_code, 200)
        self.assertTrue(second_response.data.get('created'))
        self.assertEqual(second_response.data.get('action'), 'create_epic')
        self.assertTrue(Epic.objects.filter(goal='Publicar e hospedar aplicação gratuitamente').exists())

    def test_chat_updates_epic_status_by_id(self):
        epic = Epic.objects.create(
            goal='Melhorar onboarding',
            description='descricao inicial',
            priority='medium',
            status='backlog',
            created_by=self.user,
        )
        payload = {
            'message': f'Alterar status do epico id: {epic.id} para aprovado',
            'stream': False,
        }
        response = self.client.post('/api/v1/chat/', payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get('updated'))
        self.assertEqual(response.data.get('action'), 'update_epic_status')

        epic.refresh_from_db()
        self.assertEqual(epic.status, 'approved')

        tasks = Task.objects.filter(epic=epic)
        self.assertGreaterEqual(tasks.count(), 3)
        self.assertTrue(all(t.status == 'queue' for t in tasks))
        self.assertEqual(response.data.get('created_tasks'), tasks.count())

    def test_chat_edits_epic_fields_by_id(self):
        epic = Epic.objects.create(
            goal='Onboarding v1',
            description='antiga',
            priority='medium',
            status='backlog',
            created_by=self.user,
        )
        payload = {
            'message': f'Editar epico id: {epic.id}; novo objetivo: Onboarding v2; descricao: nova descricao; prioridade: alta',
            'stream': False,
        }
        response = self.client.post('/api/v1/chat/', payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get('updated'))
        self.assertEqual(response.data.get('action'), 'update_epic')

        epic.refresh_from_db()
        self.assertEqual(epic.goal, 'Onboarding v2')
        self.assertEqual(epic.description, 'nova descricao')
        self.assertEqual(epic.priority, 'high')
