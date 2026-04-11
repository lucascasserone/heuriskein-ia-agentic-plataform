from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0008_epic_extended_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='agent',
            name='context',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='agent',
            name='llm_model',
            field=models.CharField(blank=True, default='claude-3-5-sonnet', max_length=120),
        ),
        migrations.AddField(
            model_name='agent',
            name='llm_provider',
            field=models.CharField(default='anthropic', max_length=20),
        ),
        migrations.AddField(
            model_name='agent',
            name='llm_version',
            field=models.CharField(blank=True, default='latest', max_length=120),
        ),
        migrations.AddField(
            model_name='agent',
            name='organization',
            field=models.CharField(blank=True, default='Geral', max_length=255),
        ),
        migrations.AddField(
            model_name='agent',
            name='role_prompt',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.CreateModel(
            name='ProviderCredential',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider', models.CharField(choices=[('anthropic', 'Anthropic'), ('openai', 'OpenAI'), ('xai', 'xAI (Grok)'), ('google', 'Google (Gemini)')], max_length=20, unique=True)),
                ('encrypted_api_key', models.TextField()),
                ('key_hint', models.CharField(blank=True, default='', max_length=8)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Credencial de Provedor',
                'verbose_name_plural': 'Credenciais de Provedor',
            },
        ),
    ]
