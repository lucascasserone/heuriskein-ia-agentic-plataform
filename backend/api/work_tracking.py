from __future__ import annotations

from typing import Iterable

from api.models import Artifact, Subtask, TaskEvent


def record_task_event(task, event_type: str, message: str, agent=None, metadata: dict | None = None) -> TaskEvent:
    return TaskEvent.objects.create(
        task=task,
        agent=agent,
        event_type=event_type,
        message=message,
        metadata=metadata or {},
    )


def create_artifact(
    *,
    title: str,
    artifact_type: str,
    task=None,
    epic=None,
    agent=None,
    status: str = 'available',
    relative_path: str = '',
    preview: str = '',
    content: str = '',
    payload: dict | None = None,
    version: int = 1,
) -> Artifact:
    return Artifact.objects.create(
        title=title,
        artifact_type=artifact_type,
        task=task,
        epic=epic,
        agent=agent,
        status=status,
        relative_path=relative_path,
        preview=preview,
        content=content,
        payload=payload or {},
        version=version,
    )


def create_subtask(
    *,
    task,
    title: str,
    description: str = '',
    priority: str = 'medium',
    assigned_to=None,
    source: str = 'agent',
    order: int = 0,
    metadata: dict | None = None,
    depends_on: Iterable[Subtask] | None = None,
) -> Subtask:
    subtask = Subtask.objects.create(
        task=task,
        title=title,
        description=description,
        priority=priority,
        assigned_to=assigned_to,
        source=source,
        order=order,
        metadata=metadata or {},
    )
    if depends_on:
        subtask.depends_on.set(depends_on)
    return subtask