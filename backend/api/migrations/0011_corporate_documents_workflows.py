from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

	dependencies = [
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
		('api', '0010_agentmessage'),
	]

	operations = [
		migrations.CreateModel(
			name='CorporateMemoryEntry',
			fields=[
				('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
				('title', models.CharField(max_length=255)),
				('area', models.CharField(blank=True, default='', max_length=120)),
				('initiative', models.CharField(blank=True, default='', max_length=160)),
				('source_type', models.CharField(choices=[('document', 'Documento'), ('decision', 'Decisão'), ('workflow_run', 'Workflow Run'), ('task', 'Task'), ('manual', 'Manual')], default='manual', max_length=30)),
				('source_id', models.CharField(blank=True, db_index=True, default='', max_length=64)),
				('summary', models.TextField(blank=True)),
				('content', models.TextField(blank=True)),
				('tags', models.JSONField(blank=True, default=list)),
				('metadata', models.JSONField(blank=True, default=dict)),
				('times_reused', models.PositiveIntegerField(default=0)),
				('last_used_at', models.DateTimeField(blank=True, null=True)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={'ordering': ['-updated_at'], 'verbose_name': 'Memória Corporativa', 'verbose_name_plural': 'Memórias Corporativas'},
		),
		migrations.CreateModel(
			name='WorkflowPlaybook',
			fields=[
				('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
				('name', models.CharField(max_length=255)),
				('slug', models.SlugField(max_length=255, unique=True)),
				('description', models.TextField(blank=True)),
				('category', models.CharField(blank=True, default='operations', max_length=120)),
				('scope', models.CharField(choices=[('task', 'Task'), ('epic', 'Epic'), ('org', 'Org'), ('global', 'Global')], default='global', max_length=20)),
				('status', models.CharField(choices=[('draft', 'Rascunho'), ('active', 'Ativo'), ('archived', 'Arquivado')], default='active', max_length=20)),
				('is_template', models.BooleanField(default=False)),
				('trigger_phrases', models.JSONField(blank=True, default=list)),
				('graph', models.JSONField(blank=True, default=list, help_text='Ordered workflow steps')),
				('metadata', models.JSONField(blank=True, default=dict)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
				('created_by_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_playbooks', to=settings.AUTH_USER_MODEL)),
			],
			options={'ordering': ['name'], 'verbose_name': 'Workflow Playbook', 'verbose_name_plural': 'Workflow Playbooks'},
		),
		migrations.CreateModel(
			name='CorporateDocument',
			fields=[
				('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
				('title', models.CharField(max_length=255)),
				('doc_type', models.CharField(choices=[('brief', 'Brief'), ('spec', 'Spec'), ('report', 'Report'), ('sop', 'SOP'), ('retro', 'Retro'), ('memo', 'Memo'), ('playbook', 'Playbook')], default='brief', max_length=20)),
				('status', models.CharField(choices=[('draft', 'Rascunho'), ('active', 'Ativo'), ('archived', 'Arquivado')], default='draft', max_length=20)),
				('scope', models.CharField(choices=[('task', 'Task'), ('epic', 'Epic'), ('org', 'Org'), ('global', 'Global')], default='org', max_length=20)),
				('area', models.CharField(blank=True, default='', max_length=120)),
				('initiative', models.CharField(blank=True, default='', max_length=160)),
				('version', models.PositiveIntegerField(default=1)),
				('tags', models.JSONField(blank=True, default=list)),
				('summary', models.TextField(blank=True)),
				('content', models.TextField(blank=True)),
				('metadata', models.JSONField(blank=True, default=dict)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
				('created_by_agent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='corporate_documents', to='api.agent')),
				('created_by_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='corporate_documents', to=settings.AUTH_USER_MODEL)),
				('epic', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='corporate_documents', to='api.epic')),
				('task', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='corporate_documents', to='api.task')),
			],
			options={'ordering': ['-updated_at'], 'verbose_name': 'Documento Corporativo', 'verbose_name_plural': 'Documentos Corporativos'},
		),
		migrations.CreateModel(
			name='WorkflowRun',
			fields=[
				('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
				('status', models.CharField(choices=[('pending', 'Pendente'), ('running', 'Executando'), ('completed', 'Concluído'), ('failed', 'Falhou')], default='pending', max_length=20)),
				('scope', models.CharField(default='global', max_length=20)),
				('input_payload', models.JSONField(blank=True, default=dict)),
				('execution_log', models.JSONField(blank=True, default=list)),
				('result_payload', models.JSONField(blank=True, default=dict)),
				('started_at', models.DateTimeField(blank=True, null=True)),
				('completed_at', models.DateTimeField(blank=True, null=True)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
				('created_by_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_runs', to=settings.AUTH_USER_MODEL)),
				('epic', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_runs', to='api.epic')),
				('playbook', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='runs', to='api.workflowplaybook')),
				('task', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_runs', to='api.task')),
			],
			options={'ordering': ['-created_at'], 'verbose_name': 'Workflow Run', 'verbose_name_plural': 'Workflow Runs'},
		),
	]
