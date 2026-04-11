from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0007_decisionrecord_supersedes'),
    ]

    operations = [
        migrations.AddField(
            model_name='epic',
            name='checklist_items',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='epic',
            name='complexity',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='epic',
            name='context_files',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='epic',
            name='feedback',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='epic',
            name='lead_time',
            field=models.DateField(blank=True, null=True),
        ),
    ]
