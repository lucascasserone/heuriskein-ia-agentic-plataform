from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClarificationRequest',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('question', models.TextField(help_text='Pergunta da IA para o piloto')),
                ('answer', models.TextField(blank=True, help_text='Resposta do piloto')),
                ('status', models.CharField(choices=[('pending', 'Pendente'), ('answered', 'Respondida'), ('expired', 'Expirada')], default='pending', max_length=10)),
                ('answered_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('agent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='api.agent')),
                ('answered_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='auth.user')),
                ('task', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='clarification_requests', to='api.task')),
            ],
            options={
                'verbose_name': 'Solicitação de Esclarecimento',
                'verbose_name_plural': 'Solicitações de Esclarecimento',
                'ordering': ['-created_at'],
            },
        ),
    ]
