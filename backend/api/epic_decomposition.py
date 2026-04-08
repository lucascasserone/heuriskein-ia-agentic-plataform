import logging

from api.models import Epic, Task

logger = logging.getLogger(__name__)


def build_seed_tasks_from_epic(epic: Epic) -> list:
    """Generate tasks for an approved epic using LLM when available, falling back to
    deterministic seed tasks if the LLM is unavailable or returns nothing useful."""

    # ── Try LLM-powered decomposition first ────────────────────────────────────
    try:
        from api.llm_service import get_llm_service
        llm = get_llm_service()
        tasks = llm.decompose_epic(
            goal=epic.goal or '',
            description=epic.description or '',
            priority=epic.priority,
        )
        if tasks:
            logger.info("Epic %s decomposed by LLM into %d tasks.", epic.id, len(tasks))
            return tasks
    except Exception as exc:
        logger.warning("LLM epic decomposition failed (%s), falling back to seed tasks.", exc)

    # ── Fallback: deterministic seed tasks ─────────────────────────────────────
    return _seed_tasks_fallback(epic)


def _seed_tasks_fallback(epic: Epic) -> list:
    """Deterministic three-task starter queue (used when LLM is unavailable)."""
    goal = (epic.goal or '').strip()
    detail = (epic.description or '').strip()
    excerpt = detail[:220] if detail else 'Sem detalhes adicionais.'

    return [
        {
            'title': f'Planejar execução do épico: {goal[:90]}',
            'description': (
                f'Quebrar o épico em entregas menores com escopo claro. '
                f'Contexto: {excerpt}'
            ),
            'priority': epic.priority,
            'status': 'queue',
        },
        {
            'title': f'Implementar núcleo do épico: {goal[:90]}',
            'description': (
                f'Executar o trabalho principal definido no épico e produzir um resultado verificável. '
                f'Contexto: {excerpt}'
            ),
            'priority': epic.priority,
            'status': 'queue',
        },
        {
            'title': f'Validar critérios do épico: {goal[:90]}',
            'description': 'Validar critérios de aceitação, consistência entre frontend/backend e registrar evidências.',
            'priority': 'medium' if epic.priority == 'high' else epic.priority,
            'status': 'queue',
        },
    ]


def ensure_epic_task_queue(epic: Epic) -> int:
    """Create starter tasks once when epic is approved. Returns number of created tasks."""
    if epic.status != 'approved':
        return 0

    if epic.tasks.exists():
        return 0

    created = 0
    for payload in build_seed_tasks_from_epic(epic):
        Task.objects.create(epic=epic, **payload)
        created += 1

    return created