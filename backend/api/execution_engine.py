"""
Agent Execution Engine
Executes tasks using Claude LLM via an agentic loop with tools.
Designed to run in a background thread (non-blocking).
"""

import threading
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


# ──────────────────────────────────────────────────────────────
# Prompt builder
# ──────────────────────────────────────────────────────────────

def build_system_prompt(agent) -> str:
    caps = ", ".join(agent.capabilities) if agent.capabilities else "general"
    return f"""Você é {agent.name}, um agente de IA especializado do sistema Heuriskein.
Tipo: {agent.type} | Capacidades: {caps} | Modelo: {agent.model}

Seu papel é executar tarefas de forma autônoma, clara e objetiva.
Para cada tarefa você deve:
1. Analisar o escopo e os requisitos
2. Elaborar e executar um plano passo a passo
3. Produzir um resultado concreto e documentado
4. Identificar próximos passos e dependências

Sempre responda em português do Brasil.
Seja direto, técnico e orientado a resultados."""


def build_task_prompt(task) -> str:
    epic_ctx = ""
    if task.epic:
        epic_ctx = f"""
## Contexto da Épica
**Objetivo:** {task.epic.goal}
**Descrição:** {task.epic.description or 'N/A'}
**Prioridade:** {task.epic.priority}
"""

    return f"""# Tarefa para Execução

**Título:** {task.title}
**Descrição:** {task.description or 'Sem descrição adicional.'}
**Prioridade:** {task.priority}
**Tentativa:** #{task.attempt_count}
{epic_ctx}

## Instruções
Execute esta tarefa completamente. Estruture sua resposta como:

### Análise
[Sua análise do que precisa ser feito]

### Execução
[Passos executados e decisões tomadas]

### Resultado
[O resultado concreto da execução]

### Próximos Passos
[O que deve ser feito a seguir, se aplicável]
"""


# ──────────────────────────────────────────────────────────────
# Log helper (decoupled from Django ORM import at module level)
# ──────────────────────────────────────────────────────────────

def _log(agent, task, message: str, level: str = "info"):
    """Create a ThoughtLog entry safely."""
    try:
        from api.models import ThoughtLog
        log = ThoughtLog.objects.create(
            agent=agent,
            task=task,
            message=message,
            level=level,
        )
        _broadcast(
            'thought_logs',
            'thought_log_received',
            {
                'agent_id': str(agent.id) if agent else None,
                'agent_name': agent.name if agent else 'System',
                'message': message,
                'level': level,
                'timestamp': log.timestamp.isoformat(),
            },
        )
    except Exception:
        pass  # Never crash the engine on a logging failure


def _broadcast(group: str, event_type: str, payload: dict):
    """Broadcast event to channels group if channel layer is available."""
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(group, {'type': event_type, **payload})
    except Exception:
        pass


def _broadcast_task(task):
    _broadcast(
        'tasks_updates',
        'task_updated',
        {
            'task_id': str(task.id),
            'data': {
                'status': task.status,
                'error': task.error,
                'result': task.result,
                'assigned_to': str(task.assigned_to_id) if task.assigned_to_id else None,
                'attempt_count': task.attempt_count,
            },
        },
    )


def _broadcast_agent(agent):
    if not agent:
        return
    _broadcast(
        'agents_updates',
        'agent_status_changed',
        {
            'agent_id': str(agent.id),
            'state': agent.state,
        },
    )


# ──────────────────────────────────────────────────────────────
# Core execution function (runs inside a thread)
# ──────────────────────────────────────────────────────────────

def _run_task(task_id: str):
    """
    Main execution loop. Called in a daemon thread.
    Loads models fresh inside the thread to avoid Django ORM issues.
    """
    from api.models import Task
    from api.llm_service import get_llm_service

    try:
        task = Task.objects.select_related("epic", "assigned_to").get(pk=task_id)
    except Task.DoesNotExist:
        return

    agent = task.assigned_to

    # ── Mark agent as thinking ──────────────────────────────
    if agent:
        agent.state = "thinking"
        agent.last_activity = timezone.now()
        agent.save(update_fields=["state", "last_activity"])
        _broadcast_agent(agent)

    _log(agent, task, f"🧠 Analisando tarefa: {task.title}")

    try:
        llm = get_llm_service()
    except Exception as e:
        _fail_task(task, agent, f"Falha ao inicializar LLM: {str(e)}")
        return

    system_prompt = build_system_prompt(agent) if agent else (
        "Você é um agente executor do sistema Heuriskein. Responda em português."
    )
    user_prompt = build_task_prompt(task)

    # ── Mark agent as executing ─────────────────────────────
    if agent:
        agent.state = "executing"
        agent.last_activity = timezone.now()
        agent.save(update_fields=["state", "last_activity"])
        _broadcast_agent(agent)

    _log(agent, task, "⚙️ Enviando tarefa para Claude...")

    try:
        response_text = llm.chat(
            messages=[{"role": "user", "content": user_prompt}],
            system=system_prompt,
        )
    except Exception as e:
        _fail_task(task, agent, f"Erro na chamada LLM: {str(e)}")
        return

    # ── Parse sections from response ────────────────────────
    result = _parse_response(response_text)

    # ── Save result & mark completed ────────────────────────
    task.status = "completed"
    task.result = result
    task.completed_at = timezone.now()
    task.save(update_fields=["status", "result", "completed_at"])
    _broadcast_task(task)

    if agent:
        agent.state = "idle"
        agent.current_task = None
        agent.last_activity = timezone.now()
        agent.save(update_fields=["state", "current_task", "last_activity"])
        _broadcast_agent(agent)

    _log(agent, task, "✅ Tarefa concluída com sucesso.")


def _fail_task(task, agent, error_msg: str):
    """Mark task as failed and reset agent state."""
    task.status = "failed"
    task.error = error_msg
    task.completed_at = timezone.now()
    task.save(update_fields=["status", "error", "completed_at"])
    _broadcast_task(task)

    if agent:
        agent.state = "error" if "error" in [s[0] for s in agent._meta.model.AGENT_STATES] else "idle"
        agent.current_task = None
        agent.last_activity = timezone.now()
        agent.save(update_fields=["state", "current_task", "last_activity"])
        _broadcast_agent(agent)

    _log(agent, task, f"❌ Falha na execução: {error_msg}", level="error")


def _parse_response(text: str) -> dict:
    """Extract structured sections from LLM markdown response."""
    sections = {
        "análise": "",
        "execução": "",
        "resultado": "",
        "próximos_passos": "",
        "raw": text,
    }

    mapping = {
        "análise": ["### análise", "## análise", "**análise**"],
        "execução": ["### execução", "## execução", "**execução**"],
        "resultado": ["### resultado", "## resultado", "**resultado**"],
        "próximos_passos": ["### próximos passos", "## próximos passos", "**próximos passos**"],
    }

    lines = text.splitlines()
    current_section = None

    for line in lines:
        lower = line.strip().lower()

        # Check if this line starts a new section
        matched = None
        for key, headers in mapping.items():
            if any(lower.startswith(h) for h in headers):
                matched = key
                break

        if matched:
            current_section = matched
            continue

        if current_section:
            sections[current_section] += line + "\n"

    # Clean up whitespace
    for key in ["análise", "execução", "resultado", "próximos_passos"]:
        sections[key] = sections[key].strip()

    # If parsing failed (no sections found), put everything in resultado
    if not any(sections[k] for k in ["análise", "execução", "resultado"]):
        sections["resultado"] = text.strip()

    return sections


# ──────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────

def execute_task_async(task_id: str):
    """
    Dispatch task execution in a background daemon thread.
    Returns immediately — caller gets the thread for reference.
    """
    t = threading.Thread(target=_run_task, args=(task_id,), daemon=True)
    t.start()
    return t
