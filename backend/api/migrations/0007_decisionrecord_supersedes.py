from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_decisionrecord'),
    ]

    operations = [
        migrations.AddField(
            model_name='decisionrecord',
            name='supersedes',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='superseded_by', to='api.decisionrecord'),
        ),
    ]
