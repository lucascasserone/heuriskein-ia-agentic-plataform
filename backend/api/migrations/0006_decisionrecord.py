from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_approvalrequest'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='DecisionRecord',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)),
                ('summary', models.TextField(blank=True)),
                ('rationale', models.TextField(blank=True)),
                ('scope', models.CharField(choices=[('task', 'Task'), ('epic', 'Epic'), ('org', 'Org')], default='task', max_length=20)),
                ('status', models.CharField(choices=[('proposed', 'Proposta'), ('accepted', 'Aceita'), ('rejected', 'Rejeitada'), ('superseded', 'Substituída')], default='proposed', max_length=20)),
                ('impact', models.CharField(choices=[('low', 'Baixo'), ('medium', 'Médio'), ('high', 'Alto')], default='medium', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('decided_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('approval_request', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decision_records', to='api.approvalrequest')),
                ('artifact', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decision_records', to='api.artifact')),
                ('created_by_agent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decision_records', to='api.agent')),
                ('created_by_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_decisions', to=settings.AUTH_USER_MODEL)),
                ('decided_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decided_records', to=settings.AUTH_USER_MODEL)),
                ('task', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='decision_records', to='api.task')),
            ],
            options={
                'verbose_name': 'Registro de Decisão',
                'verbose_name_plural': 'Registros de Decisão',
                'ordering': ['-created_at'],
            },
        ),
    ]
