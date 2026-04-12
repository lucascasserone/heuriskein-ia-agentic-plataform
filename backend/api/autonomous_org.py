"""
Autonomous Organization engine.

Implements a LangGraph workflow with corporate hierarchy (CEO -> Directors -> Heads -> Analysts),
dynamic hiring, and long-term memory retrieval with pgvector-compatible storage.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, TypedDict

from django.db import transaction
from django.utils import timezone as dj_timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

try:
    from langgraph.graph import END, StateGraph
    HAS_LANGGRAPH = True
except ImportError:
    END = "__end__"
    StateGraph = None
    HAS_LANGGRAPH = False

from api.models import Agent, ApprovalRequest, ClarificationRequest, Epic, Task
from api.llm_service import get_llm_service
from api.work_tracking import create_agent_handoff

try:
    import psycopg2
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False


HierarchyLevel = Literal["ceo", "director", "head", "analyst"]
TaskStatus = Literal["queued", "in_progress", "awaiting_approval", "approved", "rejected", "done"]

ORG_MISSION_MARKER = "[ORG_MISSION_ID:{mission_id}]"
ORG_TASK_MARKER = "[ORG_TASK_ID:{task_id}]"

logger = logging.getLogger(__name__)


class TaskNode(TypedDict):
    id: str
    parent_id: Optional[str]
    title: str
    objective: str
    level: HierarchyLevel
    agent_id: str
    status: TaskStatus
    complexity: int
    dependencies: List[str]
    children: List[str]
    approval_notes: str
    execution_logs: List[str]


class CompanyState(TypedDict):
    mission_id: str
    mission_brief: str
    mission_constraints: List[str]
    corporate_memory_hits: List[Dict[str, Any]]
    task_tree: Dict[str, TaskNode]
    root_task_id: str
    active_task_id: str
    active_agent_id: str
    pending_queue: List[str]
    awaiting_approval_queue: List[str]
    rejected_queue: List[str]
    completed_tasks: List[str]
    final_report: str
    execution_trace: List[str]
    estimated_tokens: int
    avg_resolution_minutes: float
    delegation_events: int
    agent_profiles: Dict[str, Dict[str, Any]]
    route_decision: str


@dataclass
class AgentProfile:
    name: str
    department: str
    level: HierarchyLevel
    capabilities: List[str] = field(default_factory=list)
    model_hint: str = ""


class AgentFactory:
    """Injects agents dynamically from JSON profiles."""

    LEVEL_TO_TYPE = {
        "ceo": "coordinator",
        "director": "coordinator",
        "head": "executor",
        "analyst": "analyst",
    }

    LEVEL_TO_DEFAULT_MODEL = {
        "ceo": "claude-3-5-sonnet-20241022",
        "director": "claude-3-5-sonnet-20241022",
        "head": "gpt-4o-mini",
        "analyst": "gpt-4o-mini",
    }

    ROLE_TEMPLATES: Dict[str, Dict[str, Dict[str, Any]]] = {
        "marketing": {
            "director": {
                "capabilities": ["growth", "branding", "roi", "ltv", "go-to-market"],
                "bio": "Diretor orientado a crescimento previsivel, foco em funil, marca e eficiencia de investimento.",
            },
            "head": {
                "capabilities": ["performance-media", "crm", "attribution", "experiments"],
                "bio": "Head hands-on em experimentacao e canais de aquisicao, obcecado por conversao e CAC eficiente.",
            },
            "analyst": {
                "capabilities": ["dashboard", "cohort", "forecast", "ab-testing"],
                "bio": "Analista de dados e performance que transforma sinais de mercado em acoes taticas.",
            },
        },
        "ti": {
            "director": {
                "capabilities": ["arquitetura", "seguranca", "governanca", "plataforma"],
                "bio": "Diretor de tecnologia com foco em escala, confiabilidade e alinhamento com objetivos de negocio.",
            },
            "head": {
                "capabilities": ["infraestrutura", "devops", "sre", "observabilidade"],
                "bio": "Head tecnico com mentalidade de plataforma e excelencia operacional em producao.",
            },
            "analyst": {
                "capabilities": ["qa", "suporte", "automacao", "incident-response"],
                "bio": "Analista tecnico pragmatista, rapido em diagnostico e execucao com qualidade.",
            },
        },
        "financeiro": {
            "director": {
                "capabilities": ["budgeting", "forecast", "risk", "compliance"],
                "bio": "Diretor financeiro focado em governanca, margem e disciplina de capital.",
            },
            "head": {
                "capabilities": ["cashflow", "cost-control", "scenario-planning", "audit"],
                "bio": "Head de controladoria com rigor analitico e foco em previsibilidade.",
            },
            "analyst": {
                "capabilities": ["modelagem", "indicadores", "reporting", "controles"],
                "bio": "Analista financeiro detalhista, orientado a risco-retorno e qualidade de dados.",
            },
        },
    }

    @classmethod
    def get_role_template(cls, department: str, level: str) -> Dict[str, Any]:
        dep_key = (department or "").strip().lower()
        lvl_key = (level or "").strip().lower()
        dep_templates = cls.ROLE_TEMPLATES.get(dep_key)
        if dep_templates and lvl_key in dep_templates:
            return dep_templates[lvl_key]

        fallback_caps = [dep_key or "general", lvl_key or "analyst", "problem-solving"]
        fallback_bio = f"{(lvl_key or 'analyst').title()} orientado a resultados no dominio {(dep_key or 'general')}"
        return {
            "capabilities": fallback_caps,
            "bio": fallback_bio,
        }

    @classmethod
    def create_or_get_agent(cls, profile_data: Dict[str, Any]) -> Dict[str, Any]:
        profile = AgentProfile(
            name=str(profile_data.get("name") or f"{profile_data.get('level', 'analyst').title()} Agent"),
            department=str(profile_data.get("department") or profile_data.get("perfil") or "general"),
            level=str(profile_data.get("level") or "analyst").lower(),
            capabilities=list(profile_data.get("capabilities") or []),
            model_hint=str(profile_data.get("model_hint") or ""),
        )

        if profile.level not in cls.LEVEL_TO_TYPE:
            raise ValueError("Invalid level. Use ceo, director, head or analyst.")

        template = cls.get_role_template(profile.department, profile.level)
        final_capabilities = profile.capabilities or list(template.get("capabilities") or [])
        final_capabilities = list(dict.fromkeys(final_capabilities + [f"level:{profile.level}", f"department:{profile.department}"]))

        with transaction.atomic():
            agent, created = Agent.objects.get_or_create(
                name=profile.name,
                defaults={
                    "type": cls.LEVEL_TO_TYPE[profile.level],
                    "model": profile.model_hint or cls.LEVEL_TO_DEFAULT_MODEL[profile.level],
                    "capabilities": final_capabilities,
                    "state": "idle",
                },
            )
            if not created:
                merged_caps = list(dict.fromkeys((agent.capabilities or []) + final_capabilities))
                if merged_caps:
                    agent.capabilities = merged_caps
                if profile.model_hint:
                    agent.model = profile.model_hint
                agent.save(update_fields=["capabilities", "model", "updated_at"])

        return {
            "id": str(agent.id),
            "name": agent.name,
            "level": profile.level,
            "department": profile.department,
            "type": agent.type,
            "model": agent.model,
            "capabilities": agent.capabilities,
            "bio": str(template.get("bio") or ""),
        }


def _map_org_status_to_task_status(status: TaskStatus) -> str:
    mapping = {
        "queued": "queue",
        "in_progress": "processing",
        "awaiting_approval": "blocked",
        "approved": "completed",
        "rejected": "failed",
        "done": "completed",
    }
    return mapping.get(status, "queue")


def _map_complexity_to_priority(complexity: int) -> str:
    if complexity >= 8:
        return "high"
    if complexity >= 5:
        return "medium"
    return "low"


def _sync_org_state_to_kanban(state: CompanyState) -> None:
    mission_id = state["mission_id"]
    mission_marker = ORG_MISSION_MARKER.format(mission_id=mission_id)

    epic_defaults = {
        "goal": (f"[ORG] {state['mission_brief']}")[:255],
        "description": f"Missao sincronizada da aba Organizacao.\n{mission_marker}",
        "status": "approved",
        "priority": "medium",
    }

    epic, created = Epic.objects.get_or_create(
        goal=epic_defaults["goal"],
        defaults=epic_defaults,
    )
    if not created:
        epic.description = epic.description or ""
        if mission_marker not in epic.description:
            epic.description = (epic.description + "\n" + mission_marker).strip()
        if state.get("final_report"):
            epic.status = "completed"
        elif state.get("completed_tasks"):
            epic.status = "approved"
        else:
            epic.status = "refinement"
        epic.save(update_fields=["description", "status", "updated_at"])

    if created:
        if state.get("final_report"):
            epic.status = "completed"
        elif state.get("completed_tasks"):
            epic.status = "approved"
        else:
            epic.status = "refinement"
        epic.save(update_fields=["status", "updated_at"])

    for org_task in state["task_tree"].values():
        task_marker = ORG_TASK_MARKER.format(task_id=org_task["id"])
        marker_block = f"{mission_marker} {task_marker}"
        kanban_status = _map_org_status_to_task_status(org_task["status"])
        assigned_agent = Agent.objects.filter(id=org_task["agent_id"]).first()

        existing = Task.objects.filter(description__icontains=task_marker).order_by("-created_at").first()

        execution_tail = "\n".join(org_task.get("execution_logs", [])[-3:])
        description_parts = [
            org_task.get("objective") or "",
            f"Nivel: {org_task.get('level')}",
            f"Dependencias: {', '.join(org_task.get('dependencies', [])) or '-'}",
            f"Notas de aprovacao: {org_task.get('approval_notes') or '-'}",
            f"{marker_block}",
        ]
        if execution_tail:
            description_parts.append("Ultimos logs:\n" + execution_tail)
        task_description = "\n\n".join([part for part in description_parts if part]).strip()

        payload = {
            "title": f"[ORG:{org_task.get('level', 'task').upper()}] {org_task.get('title', 'Task')}"[:255],
            "description": task_description,
            "epic": epic,
            "assigned_to": assigned_agent,
            "status": kanban_status,
            "priority": _map_complexity_to_priority(int(org_task.get("complexity") or 1)),
            "error": org_task.get("approval_notes") if kanban_status == "failed" else "",
            "result": {
                "org_task_id": org_task.get("id"),
                "org_parent_id": org_task.get("parent_id"),
                "org_level": org_task.get("level"),
                "org_status": org_task.get("status"),
                "org_children": org_task.get("children", []),
                "org_mission_id": mission_id,
            },
        }

        now = dj_timezone.now()
        if kanban_status == "processing" and (not existing or not existing.started_at):
            payload["started_at"] = now
        if kanban_status in ("completed", "failed"):
            payload["completed_at"] = now

        if existing:
            for field, value in payload.items():
                setattr(existing, field, value)
            existing.save()
        else:
            Task.objects.create(**payload)


def _extract_number_from_text(text: str) -> Optional[float]:
    import re
    match = re.search(r"(\d+(?:[\.,]\d+)?)", text or "")
    if not match:
        return None
    value = match.group(1).replace(".", "").replace(",", ".")
    try:
        return float(value)
    except Exception:
        return None


def _estimate_viability(mission_brief: str, constraints: List[str]) -> Dict[str, Any]:
    complexity = _complexity_from_brief(mission_brief)
    score = 100 - complexity * 7
    reasons: List[str] = []

    budget_value = None
    deadline_days = None
    team_size = None

    for item in constraints:
        normalized = (item or "").lower()
        number = _extract_number_from_text(item)
        if any(token in normalized for token in ["budget", "orcamento", "orçamento", "r$"]):
            budget_value = number
        if any(token in normalized for token in ["dias", "day", "prazo"]):
            deadline_days = number
        if any(token in normalized for token in ["pessoas", "equipe", "team"]):
            team_size = number

    if budget_value is not None and budget_value < 100:
        score -= 15
        reasons.append("Budget potencialmente insuficiente para a complexidade da missão.")
    if budget_value is not None and budget_value >= 200:
        score += 8
        reasons.append("Budget favorável para execução com folga de contingência.")

    if deadline_days is not None and deadline_days < 30:
        score -= 18
        reasons.append("Prazo muito agressivo para o escopo atual.")
    if deadline_days is not None and deadline_days >= 60:
        score += 6
        reasons.append("Prazo razoável para decomposição e validação iterativa.")

    if team_size is not None and team_size < 4:
        score -= 12
        reasons.append("Equipe enxuta exige foco em prioridades críticas.")
    if team_size is not None and team_size >= 8:
        score += 7
        reasons.append("Capacidade de equipe adequada para trabalho paralelo.")

    if not reasons:
        reasons.append("Missão viável com execução disciplinada e checkpoints semanais.")

    score = max(5, min(98, int(score)))
    verdict = "alta" if score >= 80 else "moderada" if score >= 60 else "baixa"

    return {
        "score_percent": score,
        "verdict": verdict,
        "reasons": reasons,
        "complexity": complexity,
    }


def _compute_kpis(state: CompanyState) -> None:
    tasks = list(state["task_tree"].values())
    state["delegation_events"] = sum(1 for t in tasks if t.get("parent_id"))
    base_tokens = max(1, len(tasks)) * 640
    complexity_tax = sum(int(t.get("complexity") or 1) * 18 for t in tasks)
    state["estimated_tokens"] = int(base_tokens + complexity_tax)

    completed = max(1, len(state["completed_tasks"]))
    avg_complexity = sum(int(t.get("complexity") or 1) for t in tasks) / max(1, len(tasks))
    state["avg_resolution_minutes"] = round((avg_complexity * 6.5) / completed, 2)


def _extract_agent_profiles(state: CompanyState) -> Dict[str, Dict[str, Any]]:
    profiles: Dict[str, Dict[str, Any]] = {}
    for task in state["task_tree"].values():
        agent_id = task["agent_id"]
        if agent_id in profiles:
            continue
        try:
            agent = Agent.objects.get(id=agent_id)
            profiles[agent_id] = {
                "id": str(agent.id),
                "name": agent.name,
                "state": agent.state,
                "model": agent.model,
                "type": agent.type,
                "capabilities": agent.capabilities or [],
                "level": task["level"],
            }
        except Agent.DoesNotExist:
            profiles[agent_id] = {
                "id": agent_id,
                "name": "Agente não encontrado",
                "state": "idle",
                "model": "",
                "type": "unknown",
                "capabilities": [],
                "level": task["level"],
            }
    return profiles


class CorporateMemoryStore:
    """Long-term memory using pgvector-compatible SQL with safe fallback."""

    def __init__(self, dim: int = 64):
        self.dim = dim
        self.db_url = (
            os.environ.get("SUPABASE_DB_URL")
            or os.environ.get("DATABASE_URL")
            or ""
        )
        self.use_db = bool(self.db_url and HAS_PSYCOPG2)
        self._openai_client = None
        self._local_cache: List[Dict[str, Any]] = []

        if HAS_OPENAI and os.environ.get("OPENAI_API_KEY"):
            self._openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

        if self.use_db:
            self._ensure_schema()

    def _connect(self):
        return psycopg2.connect(self.db_url)

    def _ensure_schema(self) -> None:
        try:
            with self._connect() as conn:
                with conn.cursor() as cur:
                    cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                    cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
                    cur.execute(
                        f"""
                        CREATE TABLE IF NOT EXISTS corporate_memory (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            mission_text TEXT NOT NULL,
                            summary TEXT NOT NULL,
                            metadata JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                            embedding VECTOR({self.dim}) NOT NULL,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        );
                        """
                    )
                    cur.execute(
                        """
                        CREATE INDEX IF NOT EXISTS idx_corporate_memory_created_at
                        ON corporate_memory (created_at DESC);
                        """
                    )
                conn.commit()
        except Exception:
            self.use_db = False

    def _embed(self, text: str) -> List[float]:
        payload = text.strip()[:4000]
        if self._openai_client:
            response = self._openai_client.embeddings.create(
                model="text-embedding-3-small",
                input=payload,
            )
            vector = response.data[0].embedding
            if len(vector) > self.dim:
                return vector[: self.dim]
            if len(vector) < self.dim:
                return vector + [0.0] * (self.dim - len(vector))
            return vector

        # Deterministic fallback embedding for local/dev mode.
        digest = hashlib.sha256(payload.encode("utf-8")).digest()
        values = []
        for i in range(self.dim):
            byte = digest[i % len(digest)]
            values.append((byte / 255.0) * 2.0 - 1.0)
        return values

    @staticmethod
    def _to_vector_literal(values: List[float]) -> str:
        return "[" + ",".join(f"{v:.6f}" for v in values) + "]"

    def retrieve_similar_experiences(self, mission_text: str, top_k: int = 5) -> List[Dict[str, Any]]:
        query_embedding = self._embed(mission_text)

        if self.use_db:
            try:
                vector_literal = self._to_vector_literal(query_embedding)
                with self._connect() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            SELECT mission_text, summary, metadata,
                                   1 - (embedding <=> %s::vector) AS similarity
                            FROM corporate_memory
                            ORDER BY embedding <=> %s::vector
                            LIMIT %s;
                            """,
                            (vector_literal, vector_literal, top_k),
                        )
                        rows = cur.fetchall()
                return [
                    {
                        "mission_text": row[0],
                        "summary": row[1],
                        "metadata": row[2] or {},
                        "similarity": float(row[3] or 0.0),
                    }
                    for row in rows
                ]
            except Exception:
                self.use_db = False

        # Fallback in-memory ranking by cosine-like dot product.
        scored = []
        for item in self._local_cache:
            emb = item.get("embedding") or []
            score = sum(a * b for a, b in zip(query_embedding, emb))
            scored.append((score, item))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            {
                "mission_text": entry["mission_text"],
                "summary": entry["summary"],
                "metadata": entry["metadata"],
                "similarity": float(score),
            }
            for score, entry in scored[:top_k]
        ]

    def store_experience(self, mission_text: str, summary: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        metadata = metadata or {}
        embedding = self._embed(mission_text)

        if self.use_db:
            try:
                vector_literal = self._to_vector_literal(embedding)
                with self._connect() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO corporate_memory (mission_text, summary, metadata, embedding)
                            VALUES (%s, %s, %s::jsonb, %s::vector);
                            """,
                            (mission_text, summary, json.dumps(metadata), vector_literal),
                        )
                    conn.commit()
                return
            except Exception:
                self.use_db = False

        self._local_cache.append(
            {
                "mission_text": mission_text,
                "summary": summary,
                "metadata": metadata,
                "embedding": embedding,
            }
        )


class HierarchyRouter:
    """Routing strategy for recursive delegation and approval loops."""

    COMPLEXITY_THRESHOLD = {
        "ceo": 7,
        "director": 6,
        "head": 5,
        "analyst": 10,
    }

    CHILD_LEVEL = {
        "ceo": "director",
        "director": "head",
        "head": "analyst",
        "analyst": "analyst",
    }

    PARENT_LEVEL = {
        "ceo": "ceo",
        "director": "ceo",
        "head": "director",
        "analyst": "head",
    }

    def next_action(self, task: TaskNode) -> Literal[
        "delegate", "execute", "send_for_approval", "finalize", "rework"
    ]:
        level = task["level"]
        status = task["status"]
        complexity = task["complexity"]

        if status == "rejected":
            return "rework"
        if status == "done":
            if level == "ceo":
                return "finalize"
            return "send_for_approval"
        if complexity >= self.COMPLEXITY_THRESHOLD[level] and level != "analyst":
            return "delegate"
        return "execute"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _complexity_from_brief(text: str) -> int:
    # Heuristic tuned for autonomous decomposition.
    payload = (text or "").strip().lower()
    words = len(payload.split())
    strategic_terms = [
        "estrategia",
        "expansao",
        "internacional",
        "compliance",
        "governanca",
        "integracao",
        "infraestrutura",
        "multi",
        "frentes",
        "simultane",
        "roadmap",
    ]
    connector_terms = [" e ", " com ", " alem de", " incluindo", " paralelo", " validar", " integrar"]
    strategic_hits = sum(payload.count(term) for term in strategic_terms)
    connector_hits = sum(payload.count(term) for term in connector_terms)

    base = 1
    if words >= 25:
        base += 3
    elif words >= 16:
        base += 2
    elif words >= 10:
        base += 1

    score = base + strategic_hits + connector_hits
    return min(10, max(1, score))


def _pick_agent_for_level(level: HierarchyLevel) -> str:
    mapping = {
        "ceo": ["coordinator"],
        "director": ["coordinator"],
        "head": ["executor", "coordinator"],
        "analyst": ["analyst", "executor"],
    }
    agent = Agent.objects.filter(type__in=mapping[level]).order_by("last_activity").first()
    if agent:
        return str(agent.id)

    default_profile = {
        "name": f"{level.title()} Auto",
        "department": "autonomous-org",
        "level": level,
        "capabilities": ["planning", "execution", "review"],
    }
    created = AgentFactory.create_or_get_agent(default_profile)
    return created["id"]


def _append_trace(state: CompanyState, message: str) -> None:
    state["execution_trace"].append(f"[{_utc_now()}] {message}")


def _create_child_task(state: CompanyState, parent_id: str, level: HierarchyLevel) -> str:
    parent = state["task_tree"][parent_id]
    child_id = str(uuid.uuid4())
    child_agent_id = _pick_agent_for_level(level)
    child_complexity = max(2, parent["complexity"] - 2)
    child_task: TaskNode = {
        "id": child_id,
        "parent_id": parent_id,
        "title": f"Subtask de {parent['title']}",
        "objective": parent["objective"],
        "level": level,
        "agent_id": child_agent_id,
        "status": "queued",
        "complexity": child_complexity,
        "dependencies": [parent_id],
        "children": [],
        "approval_notes": "",
        "execution_logs": [f"{_utc_now()} - Tarefa criada para nivel {level}"],
    }
    state["task_tree"][child_id] = child_task
    state["task_tree"][parent_id]["children"].append(child_id)
    state["pending_queue"].append(child_id)
    _append_trace(state, f"Delegacao: {parent['level']} -> {level} ({child_id})")

    parent_agent = Agent.objects.filter(id=parent["agent_id"]).first()
    child_agent = Agent.objects.filter(id=child_agent_id).first()
    create_agent_handoff(
        from_agent=parent_agent,
        to_agent=child_agent,
        message_type='delegate',
        subject=f"Delegação organizacional: {parent['title']}",
        body=(
            f"Delegação de {parent['level']} para {level}.\n\n"
            f"Objetivo: {parent['objective']}\n"
            f"Nova frente: {child_task['title']}\n"
            f"Complexidade estimada: {child_complexity}"
        ),
        payload={
            'source': 'autonomous_org',
            'org_parent_task_id': parent_id,
            'org_child_task_id': child_id,
            'from_level': parent['level'],
            'to_level': level,
            'mission_id': state['mission_id'],
        },
        trace_id=state['mission_id'],
        correlation_id=parent_id,
    )
    return child_id


def _node_ceo_intake(state: CompanyState) -> CompanyState:
    _append_trace(state, "CEO iniciou analise da missao com memoria corporativa.")
    state["active_task_id"] = state["root_task_id"]
    root = state["task_tree"][state["root_task_id"]]
    state["active_agent_id"] = root["agent_id"]
    return state


def _node_route(state: CompanyState) -> CompanyState:
    router = HierarchyRouter()
    task = state["task_tree"][state["active_task_id"]]
    decision = router.next_action(task)
    task["execution_logs"].append(f"{_utc_now()} - Router decision: {decision}")
    _append_trace(state, f"Router decidiu '{decision}' para task {task['id']} ({task['level']}).")
    state["route_decision"] = decision
    return state


def _node_delegate(state: CompanyState) -> CompanyState:
    current = state["task_tree"][state["active_task_id"]]
    next_level: HierarchyLevel = HierarchyRouter.CHILD_LEVEL[current["level"]]  # type: ignore[assignment]
    child_id = _create_child_task(state, current["id"], next_level)
    current["status"] = "in_progress"
    state["active_task_id"] = child_id
    state["active_agent_id"] = state["task_tree"][child_id]["agent_id"]
    return state


def _node_execute(state: CompanyState) -> CompanyState:
    task = state["task_tree"][state["active_task_id"]]

    # ── LLM execution ─────────────────────────────────────────────────────
    agent_profile = state["agent_profiles"].get(task["agent_id"], {})
    agent_bio = agent_profile.get("bio", "")
    agent_caps = ", ".join(agent_profile.get("capabilities") or [])
    mission = state.get("mission_brief", "")

    prompt = f"""Você é {agent_profile.get('name', 'um agente')} ({task['level'].upper()}).
{f'Perfil: {agent_bio}' if agent_bio else ''}
{f'Capacidades: {agent_caps}' if agent_caps else ''}

Missão da empresa: {mission}

Sua tarefa:
- Título: {task['title']}
- Objetivo: {task['objective']}
- Complexidade estimada: {task['complexity']}/10

Contexto de contexto já executado (trace):
{chr(10).join(state['execution_trace'][-6:]) if state.get('execution_trace') else 'Nenhum.'}

Execute esta tarefa completamente. Responda em português.
Estruture sua resposta:
### Análise
### Execução
### Resultado
### Entregável"""

    llm_result = ""
    try:
        llm_result = get_llm_service().chat(
            messages=[{"role": "user", "content": prompt}],
            system=f"Você é um agente corporativo de nível {task['level']} executando uma tarefa. Seja preciso e objetivo.",
        )
    except Exception as exc:  # noqa: BLE001
        llm_result = f"[LLM indisponível – execução simulada] {exc}"

    task["execution_logs"].append(
        f"{_utc_now()} - Execução pelo agente {task['agent_id']}:\n{llm_result[:800]}"
    )
    task["approval_notes"] = llm_result  # store full result for reviewer
    # ──────────────────────────────────────────────────────────────────────

    if task["level"] == "ceo":
        task["status"] = "done"
        state["completed_tasks"].append(task["id"])
        state["final_report"] = f"Missão concluída: {state['mission_brief']}\n\n{llm_result[:1200]}"
        _append_trace(state, "CEO concluiu a missão.")
        return state

    task["status"] = "awaiting_approval"
    state["awaiting_approval_queue"].append(task["id"])
    _append_trace(state, f"Task {task['id']} enviada para aprovação do superior.")
    return state


def _node_review_by_superior(state: CompanyState) -> CompanyState:
    if not state["awaiting_approval_queue"]:
        return state

    task_id = state["awaiting_approval_queue"].pop(0)
    task = state["task_tree"][task_id]
    parent_id = task["parent_id"]

    # ── LLM review by parent-level agent ──────────────────────────────────
    parent_profile: dict = {}
    if parent_id and parent_id in state["task_tree"]:
        parent_agent_id = state["task_tree"][parent_id]["agent_id"]
        parent_profile = state["agent_profiles"].get(parent_agent_id, {})

    execution_summary = (task.get("approval_notes") or "")[:1000]
    reviewer_name = parent_profile.get("name", "Superior")
    reviewer_level = (state["task_tree"][parent_id]["level"] if parent_id and parent_id in state["task_tree"] else "superior").upper()

    review_prompt = f"""Você é {reviewer_name} ({reviewer_level}) revisando a entrega de um subordinado.

Missão: {state.get('mission_brief', '')}

Tarefa entregue:
- Título: {task['title']}
- Objetivo: {task['objective']}
- Complexidade: {task['complexity']}/10
- Nível do executor: {task['level'].upper()}

Resultado entregue pelo agente:
{execution_summary or '(sem resultado registrado)'}

Com base na entrega, responda com exatamente uma das palavras:
APROVADO ou REJEITADO

Em seguida, em uma nova linha, forneça feedback curto (máx 2 frases) justificando sua decisão."""

    approved = True
    feedback = "Aprovado pelo superior."
    try:
        review_response = get_llm_service().chat(
            messages=[{"role": "user", "content": review_prompt}],
            system="Você é um gestor experiente avaliando entregas da sua equipe. Seja criterioso e justo.",
        )
        first_line = review_response.strip().splitlines()[0].upper()
        approved = "APROVADO" in first_line
        # extract feedback from remaining lines
        lines = review_response.strip().splitlines()
        feedback = " ".join(ln.strip() for ln in lines[1:] if ln.strip())[:300] or feedback
    except Exception as exc:  # noqa: BLE001
        # Fallback to deterministic rule if LLM fails
        approved = not (task["complexity"] >= 7 and task["level"] != "analyst")
        feedback = f"[LLM indisponível – regra determinística aplicada] {exc}"
    # ──────────────────────────────────────────────────────────────────────

    if not approved:
        task["status"] = "rejected"
        task["approval_notes"] = feedback
        task["execution_logs"].append(f"{_utc_now()} - Reprovado pelo superior: {feedback}")
        state["rejected_queue"].append(task_id)
        _append_trace(state, f"Superior rejeitou task {task_id}: {feedback}")
        state["active_task_id"] = task_id
    else:
        task["status"] = "approved"
        task["approval_notes"] = feedback
        task["execution_logs"].append(f"{_utc_now()} - Aprovado pelo superior: {feedback}")
        state["completed_tasks"].append(task_id)
        _append_trace(state, f"Superior aprovou task {task_id}.")
        if parent_id and parent_id in state["task_tree"]:
            state["active_task_id"] = parent_id
            parent = state["task_tree"][parent_id]
            parent["status"] = "done"
            state["active_agent_id"] = parent["agent_id"]
    return state


def _node_rework(state: CompanyState) -> CompanyState:
    if not state["rejected_queue"]:
        return state

    task_id = state["rejected_queue"].pop(0)
    task = state["task_tree"][task_id]
    task["status"] = "queued"
    task["complexity"] = max(1, task["complexity"] - 2)
    task["execution_logs"].append(
        f"{_utc_now()} - Rework solicitado. Nova complexidade alvo: {task['complexity']}"
    )
    state["pending_queue"].append(task_id)
    state["active_task_id"] = task_id
    state["active_agent_id"] = task["agent_id"]
    _append_trace(state, f"Task {task_id} retornou para retrabalho com feedback do superior.")
    return state


def _node_finalize(state: CompanyState) -> CompanyState:
    if not state["final_report"]:
        state["final_report"] = f"Missao consolidada com {len(state['completed_tasks'])} entregas aprovadas."
    _append_trace(state, "Missao finalizada pelo CEO.")
    return state


def build_company_graph():
    if not HAS_LANGGRAPH or StateGraph is None:
        class FallbackGraph:
            """Fallback deterministic pipeline when langgraph is unavailable."""

            def invoke(self, state: CompanyState) -> CompanyState:
                state = _node_ceo_intake(state)
                guard = 0
                while guard < 32:
                    guard += 1
                    state = _node_route(state)
                    decision = str(state.get("route_decision") or "execute")
                    if decision == "delegate":
                        state = _node_delegate(state)
                        continue
                    if decision == "execute":
                        state = _node_execute(state)
                        # CEO done can finalize directly.
                        if state["task_tree"][state["active_task_id"]]["level"] == "ceo":
                            state = _node_finalize(state)
                            return state
                        state = _node_review_by_superior(state)
                        continue
                    if decision == "send_for_approval":
                        state = _node_review_by_superior(state)
                        continue
                    if decision == "rework":
                        state = _node_rework(state)
                        continue
                    if decision == "finalize":
                        state = _node_finalize(state)
                        return state

                state = _node_finalize(state)
                return state

        return FallbackGraph()

    workflow = StateGraph(CompanyState)

    workflow.add_node("ceo_intake", _node_ceo_intake)
    workflow.add_node("route", _node_route)
    workflow.add_node("delegate", _node_delegate)
    workflow.add_node("execute", _node_execute)
    workflow.add_node("review", _node_review_by_superior)
    workflow.add_node("rework", _node_rework)
    workflow.add_node("finalize", _node_finalize)

    workflow.set_entry_point("ceo_intake")
    workflow.add_edge("ceo_intake", "route")

    def route_selector(state: CompanyState) -> str:
        return str(state.get("route_decision") or "execute")

    workflow.add_conditional_edges(
        "route",
        route_selector,
        {
            "delegate": "delegate",
            "execute": "execute",
            "send_for_approval": "review",
            "rework": "rework",
            "finalize": "finalize",
        },
    )

    workflow.add_edge("delegate", "route")
    workflow.add_conditional_edges(
        "execute",
        lambda s: "finalize" if s["task_tree"][s["active_task_id"]]["level"] == "ceo" else "review",
        {"review": "review", "finalize": "finalize"},
    )
    workflow.add_edge("review", "route")
    workflow.add_edge("rework", "route")
    workflow.add_edge("finalize", END)

    return workflow.compile()


class AutonomousOrganizationService:
    def __init__(self):
        self.memory = CorporateMemoryStore()
        self.graph = build_company_graph()
        self.last_state: Optional[CompanyState] = None

    def run_mission(self, mission_brief: str, constraints: Optional[List[str]] = None) -> CompanyState:
        constraints = constraints or []
        memory_hits = self.memory.retrieve_similar_experiences(mission_brief, top_k=5)
        mission_id = str(uuid.uuid4())
        ceo_agent_id = _pick_agent_for_level("ceo")

        root_id = str(uuid.uuid4())
        root_task: TaskNode = {
            "id": root_id,
            "parent_id": None,
            "title": "Missao Corporativa",
            "objective": mission_brief,
            "level": "ceo",
            "agent_id": ceo_agent_id,
            "status": "queued",
            "complexity": _complexity_from_brief(mission_brief),
            "dependencies": [],
            "children": [],
            "approval_notes": "",
            "execution_logs": [f"{_utc_now()} - Missao recebida pelo CEO"],
        }

        state: CompanyState = {
            "mission_id": mission_id,
            "mission_brief": mission_brief,
            "mission_constraints": constraints,
            "corporate_memory_hits": memory_hits,
            "task_tree": {root_id: root_task},
            "root_task_id": root_id,
            "active_task_id": root_id,
            "active_agent_id": ceo_agent_id,
            "pending_queue": [root_id],
            "awaiting_approval_queue": [],
            "rejected_queue": [],
            "completed_tasks": [],
            "final_report": "",
            "execution_trace": [],
            "estimated_tokens": 0,
            "avg_resolution_minutes": 0.0,
            "delegation_events": 0,
            "agent_profiles": {},
            "route_decision": "",
        }

        result = self.graph.invoke(state)
        _compute_kpis(result)
        result["agent_profiles"] = _extract_agent_profiles(result)

        try:
            _sync_org_state_to_kanban(result)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Org mission sync to Kanban failed")
            result["execution_trace"].append(f"[{_utc_now()}] Aviso: falha ao sincronizar missão no Kanban ({exc}).")

        self.last_state = result

        try:
            self.memory.store_experience(
                mission_text=mission_brief,
                summary=result.get("final_report") or "Missao executada pela Organizacao Autonoma.",
                metadata={
                    "mission_id": mission_id,
                    "completed_tasks": len(result.get("completed_tasks") or []),
                    "timestamp": _utc_now(),
                },
            )
        except Exception:  # noqa: BLE001
            logger.exception("Org mission memory store failed")

        return result

    def hire_agent(self, profile_data: Dict[str, Any]) -> Dict[str, Any]:
        return AgentFactory.create_or_get_agent(profile_data)

    def get_last_state(self) -> Optional[CompanyState]:
        return self.last_state


ORG_SERVICE = AutonomousOrganizationService()


class OrgHireSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    level = serializers.ChoiceField(choices=["ceo", "director", "head", "analyst"])
    capabilities = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    model_hint = serializers.CharField(required=False, allow_blank=True)


class OrgMissionSerializer(serializers.Serializer):
    mission_brief = serializers.CharField(max_length=5000)
    constraints = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )


class OrgFeasibilitySerializer(serializers.Serializer):
    mission_brief = serializers.CharField(max_length=5000)
    constraints = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )


class OrgTemplateSerializer(serializers.Serializer):
    department = serializers.CharField(max_length=120)
    level = serializers.ChoiceField(choices=["ceo", "director", "head", "analyst"])


class OrgHireAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OrgHireSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        created = ORG_SERVICE.hire_agent(serializer.validated_data)
        return Response({"agent": created}, status=status.HTTP_201_CREATED)


class OrgMissionAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OrgMissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mission_brief = serializer.validated_data["mission_brief"]
        constraints = serializer.validated_data.get("constraints") or []

        try:
            state = ORG_SERVICE.run_mission(
                mission_brief=mission_brief,
                constraints=constraints,
            )
            return Response({"state": state}, status=status.HTTP_200_OK)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Org mission execution failed")
            mission_id = str(uuid.uuid4())
            root_id = str(uuid.uuid4())
            fallback_state: CompanyState = {
                "mission_id": mission_id,
                "mission_brief": mission_brief,
                "mission_constraints": constraints,
                "corporate_memory_hits": [],
                "task_tree": {
                    root_id: {
                        "id": root_id,
                        "parent_id": None,
                        "title": "Missao Corporativa",
                        "objective": mission_brief,
                        "level": "ceo",
                        "agent_id": "",
                        "status": "rejected",
                        "complexity": _complexity_from_brief(mission_brief),
                        "dependencies": [],
                        "children": [],
                        "approval_notes": f"Falha na execução da missão: {exc}",
                        "execution_logs": [f"{_utc_now()} - Falha capturada no backend: {exc}"],
                    }
                },
                "root_task_id": root_id,
                "active_task_id": root_id,
                "active_agent_id": "",
                "pending_queue": [],
                "awaiting_approval_queue": [],
                "rejected_queue": [root_id],
                "completed_tasks": [],
                "final_report": "Falha ao executar a missão no backend. Verifique configuração de provedores LLM e logs do serviço.",
                "execution_trace": [f"[{_utc_now()}] Missão falhou: {exc}"],
                "estimated_tokens": 0,
                "avg_resolution_minutes": 0.0,
                "delegation_events": 0,
                "agent_profiles": {},
                "route_decision": "",
            }
            return Response(
                {
                    "state": fallback_state,
                    "warning": "mission_execution_failed",
                    "detail": str(exc),
                },
                status=status.HTTP_200_OK,
            )


class OrgStateAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        state = ORG_SERVICE.get_last_state()
        return Response({"state": state or {}}, status=status.HTTP_200_OK)


class OrgMissionStatsAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        state = ORG_SERVICE.get_last_state() or {}
        task_tree = state.get("task_tree") or {}
        tasks = list(task_tree.values())

        completed = sum(1 for task in tasks if task.get("status") in {"done", "approved"})
        total = len(tasks)
        success_rate = round((completed / total) * 100, 1) if total else 0.0

        pending_approvals = ApprovalRequest.objects.filter(status="pending").count()
        pending_clarifications = ClarificationRequest.objects.filter(status="pending").count()

        queue_task = (
            Task.objects.filter(status__in=["queue", "processing", "blocked", "review"]) 
            .order_by("created_at")
            .first()
        )
        queue_age_minutes = 0
        if queue_task and queue_task.created_at:
            delta = dj_timezone.now() - queue_task.created_at
            queue_age_minutes = max(int(delta.total_seconds() // 60), 0)

        active_agents = Agent.objects.exclude(state="idle").count()

        payload = {
            "status": "active" if total else "idle",
            "successRate": success_rate,
            "queueAge": queue_age_minutes,
            "activeAgents": active_agents,
            "approvingPending": pending_approvals,
            "clarificationsNeeded": pending_clarifications,
            "delegationEvents": int(state.get("delegation_events") or 0),
            "estimatedTokens": int(state.get("estimated_tokens") or 0),
        }
        return Response(payload, status=status.HTTP_200_OK)


class OrgCapabilitiesSummaryAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        state = ORG_SERVICE.get_last_state() or {}
        task_tree = state.get("task_tree") or {}

        active_agents = Agent.objects.count()
        pending_approvals = ApprovalRequest.objects.filter(status="pending").count()

        capabilities = [
            {
                "id": "agents",
                "name": "Multi-Agent Collaboration",
                "status": "active",
                "metrics": {
                    "agents": active_agents,
                    "delegation_events": int(state.get("delegation_events") or 0),
                },
            },
            {
                "id": "approvals",
                "name": "Approval Workflow",
                "status": "active",
                "metrics": {
                    "pending": pending_approvals,
                    "tasks_in_tree": len(task_tree),
                },
            },
            {
                "id": "knowledge",
                "name": "Corporate Knowledge",
                "status": "alpha",
                "metrics": {
                    "memory_hits": len(state.get("corporate_memory_hits") or []),
                },
            },
            {
                "id": "automation",
                "name": "Playbooks & Automation",
                "status": "alpha",
                "metrics": {
                    "epics": Epic.objects.count(),
                    "tasks": Task.objects.count(),
                },
            },
        ]
        return Response({"capabilities": capabilities}, status=status.HTTP_200_OK)


class OrgFeasibilityAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OrgFeasibilitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = _estimate_viability(
            serializer.validated_data["mission_brief"],
            serializer.validated_data.get("constraints") or [],
        )
        return Response({"viability": result}, status=status.HTTP_200_OK)


class OrgTemplateAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        serializer = OrgTemplateSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        department = serializer.validated_data["department"]
        level = serializer.validated_data["level"]
        template = AgentFactory.get_role_template(department, level)
        return Response(
            {
                "template": {
                    "department": department,
                    "level": level,
                    "capabilities": template.get("capabilities") or [],
                    "bio": template.get("bio") or "",
                }
            },
            status=status.HTTP_200_OK,
        )
