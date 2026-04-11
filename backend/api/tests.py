"""Tests for API endpoints"""

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from unittest.mock import patch
from api.models import Agent, Task, Epic, Artifact, TaskEvent, Subtask, ApprovalRequest, DecisionRecord
from api.execution_engine import _extract_subtask_specs


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

    def test_agent_capacity_endpoint(self):
        agent = Agent.objects.create(
            name='Capacity Agent',
            type='executor',
            model='claude-3-opus',
            state='idle',
        )
        Task.objects.create(title='Q1', status='queue', assigned_to=agent)
        Task.objects.create(title='P1', status='processing', assigned_to=agent)
        Task.objects.create(title='B1', status='blocked', assigned_to=agent)

        response = self.client.get('/api/v1/agents/capacity/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(len(response.data) >= 1)
        item = next((row for row in response.data if row['id'] == str(agent.id)), None)
        self.assertIsNotNone(item)
        self.assertEqual(item['counts']['queue'], 1)
        self.assertEqual(item['counts']['processing'], 1)
        self.assertEqual(item['counts']['blocked'], 1)


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
        with patch('api.views.execute_task_async') as mocked_execute:
            response = self.client.post(f'/api/v1/tasks/{task.id}/execute/')

        self.assertEqual(response.status_code, 202)
        mocked_execute.assert_called_once()

    def test_update_task_due_at(self):
        task = Task.objects.create(
            title='Planejar release',
            description='Definir prazo de entrega.',
            status='queue',
        )

        response = self.client.patch(
            f'/api/v1/tasks/{task.id}/',
            {
                'due_at': '2026-04-20T15:30:00Z',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        task.refresh_from_db()
        self.assertIsNotNone(task.due_at)

    def test_task_handoff_records_assigned_event(self):
        agent_a = Agent.objects.create(name='Agent A', type='executor', model='claude-3-opus')
        agent_b = Agent.objects.create(name='Agent B', type='executor', model='claude-3-opus')
        task = Task.objects.create(
            title='Task handoff',
            description='Transferir entre agentes.',
            status='queue',
            assigned_to=agent_a,
        )

        response = self.client.patch(
            f'/api/v1/tasks/{task.id}/',
            {'assigned_to': str(agent_b.id)},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        task.refresh_from_db()
        self.assertEqual(task.assigned_to_id, agent_b.id)
        self.assertTrue(
            TaskEvent.objects.filter(task=task, event_type='assigned', message__icontains='Handoff').exists()
        )

    def test_task_workspace_includes_events_artifacts_and_subtasks(self):
        agent = Agent.objects.create(
            name='Executor Workspace',
            type='executor',
            model='claude-3-opus',
        )
        task = Task.objects.create(
            title='Mapear nova workspace da tarefa',
            description='Validar que a tarefa expõe artefatos, eventos e subtarefas.',
            status='queue',
            assigned_to=agent,
        )
        TaskEvent.objects.create(task=task, agent=agent, event_type='created', message='Tarefa criada')
        Artifact.objects.create(task=task, agent=agent, title='Relatorio inicial', artifact_type='report', status='available')
        Subtask.objects.create(task=task, assigned_to=agent, title='Validar serializacao da workspace')

        response = self.client.get(f'/api/v1/tasks/{task.id}/workspace/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['events']), 1)
        self.assertEqual(len(response.data['artifacts']), 1)
        self.assertEqual(len(response.data['subtasks']), 1)
        self.assertEqual(response.data['artifact_count'], 1)
        self.assertEqual(response.data['event_count'], 1)
        self.assertEqual(response.data['subtask_count'], 1)

    def test_request_approval_creates_proposed_decision_record(self):
        agent = Agent.objects.create(name='Executor Decisao', type='executor', model='claude-3-opus')
        task = Task.objects.create(title='Requer aprovação', description='Fluxo com decisão formal.', status='queue', assigned_to=agent)
        artifact = Artifact.objects.create(
            task=task,
            agent=agent,
            title='Diff sensível',
            artifact_type='diff',
            status='proposed',
            relative_path='src/app.ts',
            content='novo conteudo',
        )

        response = self.client.post(
            f'/api/v1/tasks/{task.id}/request_approval/',
            {'artifact_id': str(artifact.id), 'rationale': 'Mudança com impacto operacional alto'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(DecisionRecord.objects.filter(task=task, approval_request_id=response.data['id'], status='proposed').exists())

    def test_create_manual_decision_record(self):
        agent = Agent.objects.create(name='Executor Governanca', type='executor', model='claude-3-opus')
        task = Task.objects.create(title='Registrar decisão', description='Governança da entrega.', status='review', assigned_to=agent)

        response = self.client.post(
            f'/api/v1/tasks/{task.id}/create_decision/',
            {
                'title': 'Seguir rollout controlado',
                'summary': 'Liberar por etapas para reduzir risco.',
                'rationale': 'Existem incertezas de carga.',
                'scope': 'task',
                'impact': 'high',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(DecisionRecord.objects.filter(task=task, title='Seguir rollout controlado', status='accepted').exists())

    def test_supersede_decision_action_replaces_decision(self):
        agent = Agent.objects.create(name='Executor Supersede', type='executor', model='claude-3-opus')
        task = Task.objects.create(title='Substituir decisão', description='Criar cadeia de supersessão.', status='review', assigned_to=agent)
        initial = DecisionRecord.objects.create(
            task=task,
            title='Escolher stack A',
            summary='Decisão inicial',
            rationale='Contexto inicial',
            status='accepted',
            scope='task',
            impact='medium',
            created_by_user=self.user,
        )

        response = self.client.post(
            f'/api/v1/tasks/{task.id}/supersede_decision/',
            {
                'decision_id': str(initial.id),
                'replacement_title': 'Escolher stack B',
                'replacement_summary': 'Nova decisão por restrições',
                'replacement_rationale': 'Mudança de requisitos',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        initial.refresh_from_db()
        self.assertEqual(initial.status, 'superseded')

        replacement = DecisionRecord.objects.get(id=response.data['id'])
        self.assertEqual(replacement.supersedes_id, initial.id)
        self.assertEqual(replacement.status, 'accepted')
        self.assertEqual(replacement.title, 'Escolher stack B')

    def test_supersede_decision_action_requires_decision_from_same_task(self):
        agent = Agent.objects.create(name='Executor Validacao', type='executor', model='claude-3-opus')
        task = Task.objects.create(title='Task alvo', description='Task alvo para supersede.', status='review', assigned_to=agent)
        other_task = Task.objects.create(title='Task externa', description='Nao deve permitir decisão externa.', status='review', assigned_to=agent)
        external_decision = DecisionRecord.objects.create(
            task=other_task,
            title='Decisão externa',
            status='accepted',
            scope='task',
            impact='low',
        )

        response = self.client.post(
            f'/api/v1/tasks/{task.id}/supersede_decision/',
            {
                'decision_id': str(external_decision.id),
                'replacement_title': 'Nova decisão',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 404)

    def test_apply_file_change_moves_task_to_review_when_all_proposals_are_applied(self):
        agent = Agent.objects.create(
            name='Executor Aprovação',
            type='executor',
            model='claude-3-opus',
        )
        task = Task.objects.create(
            title='Aplicar mudanças propostas',
            description='Aprovar e aplicar mudanças de arquivo propostas pelo agente.',
            status='blocked',
            assigned_to=agent,
            result={
                'file_change_plan': [
                    {
                        'relative_path': 'src/demo.txt',
                        'allowed': True,
                        'reason': 'ok',
                        'diff': 'demo diff',
                    }
                ]
            },
            error='Aguardando aprovação de mudanças de arquivo',
        )
        Artifact.objects.create(
            task=task,
            agent=agent,
            title='Proposta de mudança: src/demo.txt',
            artifact_type='diff',
            status='proposed',
            relative_path='src/demo.txt',
            content='conteudo final',
        )

        approval = ApprovalRequest.objects.create(
            task=task,
            artifact=Artifact.objects.get(task=task, relative_path='src/demo.txt'),
            requested_by_agent=agent,
            status='approved',
            rationale='Aplicar mudança validada',
        )

        response = self.client.post(
            f'/api/v1/tasks/{task.id}/apply_file_change/',
            {
                'relative_path': 'src/demo.txt',
                'new_content': 'conteudo final',
                'approved': True,
                'artifact_id': str(approval.artifact_id),
                'approval_request_id': str(approval.id),
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        task.refresh_from_db()
        self.assertEqual(task.status, 'review')
        self.assertEqual(task.error, '')
        self.assertEqual(task.result['file_change_plan'][0]['applied'], True)
        self.assertTrue(Artifact.objects.filter(task=task, artifact_type='diff', status='applied').exists())


class EpicExtendedFieldsAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='epic-user', password='test123')
        self.client.force_authenticate(user=self.user)

    def test_create_and_update_epic_persists_extended_fields(self):
        create_payload = {
            'goal': 'Melhorar governanca operacional',
            'description': 'Criar fluxo estruturado de validacao e aprovacao.',
            'priority': 'high',
            'status': 'backlog',
            'complexity': 5,
            'lead_time': '2026-04-30',
            'checklist_items': [
                {
                    'text': 'Mapear critérios de aceite',
                    'agent_ready': True,
                    'critical': True,
                    'requires_validation': False,
                }
            ],
            'context_files': [
                {
                    'name': 'brief.md',
                    'size': 321,
                    'type': 'text/markdown',
                }
            ],
            'feedback': [
                {
                    'text': 'Escopo validado pelo time',
                    'time': '10:30',
                }
            ],
        }

        create_response = self.client.post('/api/v1/epics/', create_payload, format='json')
        self.assertEqual(create_response.status_code, 201)

        epic_id = create_response.data['id']
        epic = Epic.objects.get(id=epic_id)
        self.assertEqual(epic.complexity, 5)
        self.assertEqual(str(epic.lead_time), '2026-04-30')
        self.assertEqual(epic.checklist_items[0]['text'], 'Mapear critérios de aceite')
        self.assertEqual(epic.context_files[0]['name'], 'brief.md')
        self.assertEqual(epic.feedback[0]['text'], 'Escopo validado pelo time')

        update_payload = {
            'complexity': 8,
            'due_date': '2026-05-03',
            'checklist_items': [
                {
                    'text': 'Executar validação final',
                    'agent_ready': True,
                    'critical': True,
                    'requires_validation': True,
                }
            ],
        }

        update_response = self.client.patch(f'/api/v1/epics/{epic_id}/', update_payload, format='json')
        self.assertEqual(update_response.status_code, 200)

        epic.refresh_from_db()
        self.assertEqual(epic.complexity, 8)
        self.assertEqual(str(epic.lead_time), '2026-05-03')
        self.assertEqual(epic.checklist_items[0]['text'], 'Executar validação final')
        self.assertEqual(epic.checklist_items[0]['requires_validation'], True)

    def test_apply_file_change_requires_formal_approval(self):
        agent = Agent.objects.create(
            name='Executor Sem Aprovacao',
            type='executor',
            model='claude-3-opus',
        )
        task = Task.objects.create(
            title='Tentativa sem aprovacao',
            description='Nao deve aplicar sem approval_request_id aprovado.',
            status='blocked',
            assigned_to=agent,
        )

        response = self.client.post(
            f'/api/v1/tasks/{task.id}/apply_file_change/',
            {
                'relative_path': 'src/blocked.txt',
                'new_content': 'conteudo',
                'approved': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('approval_request_id', str(response.data))

    def test_create_manual_subtask(self):
        agent = Agent.objects.create(
            name='Executor Manual',
            type='executor',
            model='claude-3-opus',
        )
        task = Task.objects.create(
            title='Organizar entregas',
            description='Criar subtarefa manual via API.',
            status='queue',
            assigned_to=agent,
        )

        response = self.client.post(
            '/api/v1/subtasks/',
            {
                'task': str(task.id),
                'title': 'Revisar backlog operacional',
                'description': 'Criada manualmente pelo drawer.',
                'priority': 'medium',
                'status': 'queue',
                'assigned_to': str(agent.id),
                'source': 'manual',
                'order': 1,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Subtask.objects.filter(task=task, title='Revisar backlog operacional', source='manual').exists())

    def test_update_subtask_with_dependencies(self):
        agent = Agent.objects.create(
            name='Executor Dependencias',
            type='executor',
            model='claude-3-opus',
        )
        task = Task.objects.create(
            title='Atualizar dependencias de subtarefa',
            description='Validar edição de prioridade e dependencias.',
            status='queue',
            assigned_to=agent,
        )
        subtask_base = Subtask.objects.create(
            task=task,
            title='Base pronta',
            status='completed',
            priority='low',
            assigned_to=agent,
            source='manual',
            order=1,
        )
        subtask_target = Subtask.objects.create(
            task=task,
            title='Integrar dependencias',
            status='queue',
            priority='medium',
            assigned_to=agent,
            source='manual',
            order=2,
        )

        response = self.client.patch(
            f'/api/v1/subtasks/{subtask_target.id}/',
            {
                'priority': 'high',
                'depends_on_ids': [str(subtask_base.id)],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        subtask_target.refresh_from_db()
        self.assertEqual(subtask_target.priority, 'high')
        self.assertEqual(list(subtask_target.depends_on.values_list('id', flat=True)), [subtask_base.id])

    def test_reject_cyclic_subtask_dependencies(self):
        agent = Agent.objects.create(
            name='Executor Ciclos',
            type='executor',
            model='claude-3-opus',
        )
        task = Task.objects.create(
            title='Evitar ciclo entre subtarefas',
            description='Validar proteção anti-ciclo em dependências.',
            status='queue',
            assigned_to=agent,
        )
        subtask_a = Subtask.objects.create(
            task=task,
            title='Subtarefa A',
            status='queue',
            priority='medium',
            assigned_to=agent,
            source='manual',
            order=1,
        )
        subtask_b = Subtask.objects.create(
            task=task,
            title='Subtarefa B',
            status='queue',
            priority='medium',
            assigned_to=agent,
            source='manual',
            order=2,
        )
        subtask_a.depends_on.add(subtask_b)

        response = self.client.patch(
            f'/api/v1/subtasks/{subtask_b.id}/',
            {
                'depends_on_ids': [str(subtask_a.id)],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('ciclo', str(response.data).lower())


class ExecutionEngineParsingTest(TestCase):
    def test_extract_subtask_specs(self):
        raw_text = '''
### Resultado
Fluxo principal estruturado.

[SUBTAREFA: Criar modelo de artefato || Persistir anexos por tarefa || high]
[SUBTAREFA: Expor drawer da tarefa || Mostrar timeline e anexos || medium]
'''

        items = _extract_subtask_specs(raw_text)

        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]['title'], 'Criar modelo de artefato')
        self.assertEqual(items[0]['priority'], 'high')
        self.assertEqual(items[1]['title'], 'Expor drawer da tarefa')


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
