from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_clarificationrequest'),
    ]

    operations = [
        migrations.CreateModel(
            name='Artifact',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)),
                ('artifact_type', models.CharField(choices=[('document', 'Documento'), ('diff', 'Diff'), ('report', 'Relatório'), ('decision', 'Decisão'), ('spec', 'Especificação'), ('test_result', 'Resultado de Teste'), ('file_bundle', 'Pacote de Arquivos'), ('snapshot', 'Snapshot'), ('log', 'Log')], max_length=30)),
                ('status', models.CharField(choices=[('proposed', 'Proposto'), ('available', 'Disponível'), ('approved', 'Aprovado'), ('applied', 'Aplicado'), ('archived', 'Arquivado')], default='available', max_length=20)),
                ('version', models.PositiveIntegerField(default=1)),
                ('relative_path', models.CharField(blank=True, max_length=500)),
                ('preview', models.TextField(blank=True)),
                ('content', models.TextField(blank=True)),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('agent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='artifacts', to='api.agent')),
                ('epic', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='artifacts', to='api.epic')),
                ('task', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='artifacts', to='api.task')),
            ],
            options={
                'verbose_name': 'Artefato',
                'verbose_name_plural': 'Artefatos',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='TaskEvent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('event_type', models.CharField(choices=[('created', 'Criada'), ('assigned', 'Atribuída'), ('started', 'Iniciada'), ('decomposed', 'Decomposta'), ('artifact_added', 'Artefato anexado'), ('blocked', 'Bloqueada'), ('approval_requested', 'Aguardando aprovação'), ('approved', 'Aprovada'), ('completed', 'Concluída'), ('failed', 'Falhou'), ('rolled_back', 'Rollback aplicado'), ('updated', 'Atualizada')], max_length=30)),
                ('message', models.TextField()),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('agent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='task_events', to='api.agent')),
                ('task', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='events', to='api.task')),
            ],
            options={
                'verbose_name': 'Evento de Tarefa',
                'verbose_name_plural': 'Eventos de Tarefa',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='Subtask',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('queue', 'Fila'), ('processing', 'Processando'), ('blocked', 'Bloqueada'), ('review', 'Revisão'), ('completed', 'Completado'), ('failed', 'Falhou')], default='queue', max_length=20)),
                ('priority', models.CharField(choices=[('low', 'Baixa'), ('medium', 'Média'), ('high', 'Alta')], default='medium', max_length=10)),
                ('source', models.CharField(choices=[('agent', 'Agente'), ('manual', 'Manual'), ('system', 'Sistema')], default='agent', max_length=20)),
                ('order', models.PositiveIntegerField(default=0)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assigned_to', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='subtasks', to='api.agent')),
                ('task', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='subtasks', to='api.task')),
            ],
            options={
                'verbose_name': 'Subtarefa',
                'verbose_name_plural': 'Subtarefas',
                'ordering': ['order', 'created_at'],
            },
        ),
        migrations.AddField(
            model_name='subtask',
            name='depends_on',
            field=models.ManyToManyField(blank=True, related_name='dependents', to='api.subtask'),
        ),
    ]