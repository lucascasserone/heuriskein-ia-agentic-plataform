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
            description='Test',
            status='queue',
        )
        agent = Agent.objects.create(
            name='Test Agent',
            type='executor',
            model='claude-3-opus',
        )
        response = self.client.post(f'/api/v1/tasks/{task.id}/execute/')
        self.assertEqual(response.status_code, 200)


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
