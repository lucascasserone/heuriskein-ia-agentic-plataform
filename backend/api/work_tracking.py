from __future__ import annotations

import uuid
from typing import Iterable

from django.utils import timezone

from api.models import AgentMessage, Artifact, Subtask, TaskEvent


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


def create_agent_handoff(
    *,
    from_agent,
    to_agent,
    task=None,
    message_type: str = 'delegate',
    subject: str = '',
    body: str = '',
    payload: dict | None = None,
    parent_message=None,
    trace_id: str = '',
    correlation_id: str = '',
):
    if not from_agent or not to_agent or from_agent.id == to_agent.id:
        return None

    return AgentMessage.objects.create(
        from_agent=from_agent,
        to_agent=to_agent,
        task=task,
        parent_message=parent_message,
        message_type=message_type,
        status='delivered',
        subject=subject,
        body=body,
        payload=payload or {},
        trace_id=trace_id or uuid.uuid4().hex[:16],
        correlation_id=correlation_id or (str(task.id) if task else uuid.uuid4().hex[:16]),
        delivered_at=timezone.now(),
    )