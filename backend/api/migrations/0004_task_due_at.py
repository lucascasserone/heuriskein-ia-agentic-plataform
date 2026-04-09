from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_artifact_taskevent_subtask'),
    ]

    operations = [
        migrations.AddField(
            model_name='task',
            name='due_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
