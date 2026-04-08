"""
Sandboxed file operations for agent tasks.

Week 1 foundations:
- task-scoped workspace
- strict path/extension policy
- unified diff generation before any write
- snapshot creation for rollback
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import difflib
import shutil

from django.conf import settings


@dataclass(frozen=True)
class SandboxPolicy:
    allowed_extensions: tuple[str, ...] = (
        ".py",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".json",
        ".md",
        ".yml",
        ".yaml",
        ".txt",
        ".css",
        ".scss",
        ".html",
    )
    blocked_extensions: tuple[str, ...] = (
        ".exe",
        ".dll",
        ".bat",
        ".cmd",
        ".ps1",
        ".msi",
        ".sh",
    )
    max_file_bytes: int = 250_000


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _workspace_root() -> Path:
    configured = getattr(settings, "AGENT_WORKSPACE_ROOT", "")
    if configured:
        return Path(configured).resolve()
    return (_repo_root() / ".agent_workspaces").resolve()


def task_workspace(task_id: str) -> Path:
    root = _workspace_root()
    root.mkdir(parents=True, exist_ok=True)
    workspace = root / str(task_id)
    workspace.mkdir(parents=True, exist_ok=True)
    return workspace


def _is_relative_path_safe(relative_path: str) -> bool:
    p = Path(relative_path)
    if p.is_absolute():
        return False
    return ".." not in p.parts


def _validate_policy(relative_path: str, new_content: str, policy: SandboxPolicy) -> tuple[bool, str]:
    if not relative_path or not relative_path.strip():
        return False, "path vazio"

    if not _is_relative_path_safe(relative_path):
        return False, "path inválido (somente relativo, sem '..')"

    suffix = Path(relative_path).suffix.lower()
    if suffix in policy.blocked_extensions:
        return False, f"extensão bloqueada: {suffix}"

    if suffix not in policy.allowed_extensions:
        return False, f"extensão não permitida: {suffix}"

    size = len(new_content.encode("utf-8"))
    if size > policy.max_file_bytes:
        return False, f"arquivo excede limite de {policy.max_file_bytes} bytes"

    return True, "ok"


def _read_text(path: Path) -> str:
    if not path.exists() or not path.is_file():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def _unified_diff(old_text: str, new_text: str, relative_path: str) -> str:
    old_lines = old_text.splitlines(keepends=True)
    new_lines = new_text.splitlines(keepends=True)
    diff = difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile=f"a/{relative_path}",
        tofile=f"b/{relative_path}",
        lineterm="",
    )
    return "\n".join(diff)


def preview_file_change(task_id: str, relative_path: str, new_content: str, policy: SandboxPolicy | None = None) -> dict:
    """Generate policy check + diff without writing files."""
    policy = policy or SandboxPolicy()

    allowed, reason = _validate_policy(relative_path, new_content, policy)
    workspace = task_workspace(task_id)
    target = (workspace / relative_path).resolve()

    if not str(target).startswith(str(workspace.resolve())):
        return {
            "allowed": False,
            "reason": "path resolve fora do sandbox",
            "relative_path": relative_path,
            "diff": "",
            "is_new_file": False,
        }

    old_text = _read_text(target)
    diff_text = _unified_diff(old_text, new_content, relative_path)

    return {
        "allowed": allowed,
        "reason": reason,
        "relative_path": relative_path,
        "workspace_path": str(target),
        "is_new_file": not target.exists(),
        "old_size": len(old_text.encode("utf-8")) if old_text else 0,
        "new_size": len(new_content.encode("utf-8")),
        "diff": diff_text,
    }


def create_snapshot(task_id: str) -> dict:
    """Create a full workspace snapshot that can be used for rollback."""
    workspace = task_workspace(task_id)
    snapshots_root = workspace / "_snapshots"
    snapshots_root.mkdir(parents=True, exist_ok=True)

    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S%fZ")
    snapshot_dir = snapshots_root / ts
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    copied_files = 0
    for item in workspace.rglob("*"):
        if not item.is_file():
            continue
        if "_snapshots" in item.parts:
            continue

        rel = item.relative_to(workspace)
        target = snapshot_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, target)
        copied_files += 1

    return {
        "snapshot_id": ts,
        "snapshot_path": str(snapshot_dir),
        "files": copied_files,
    }


def apply_file_change(task_id: str, relative_path: str, new_content: str, approved: bool, policy: SandboxPolicy | None = None) -> dict:
    """Apply a file change only when explicitly approved."""
    if not approved:
        return {
            "applied": False,
            "reason": "mudança não aprovada",
            "relative_path": relative_path,
        }

    preview = preview_file_change(task_id=task_id, relative_path=relative_path, new_content=new_content, policy=policy)
    if not preview.get("allowed"):
        return {
            "applied": False,
            "reason": preview.get("reason", "bloqueado por policy"),
            "relative_path": relative_path,
            "diff": preview.get("diff", ""),
        }

    snapshot = create_snapshot(task_id)
    target = Path(preview["workspace_path"])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(new_content, encoding="utf-8")

    return {
        "applied": True,
        "reason": "ok",
        "relative_path": relative_path,
        "snapshot": snapshot,
        "diff": preview.get("diff", ""),
    }


def rollback_snapshot(task_id: str, snapshot_id: str) -> dict:
    """Rollback workspace files to a specific snapshot."""
    workspace = task_workspace(task_id)
    snapshot_dir = workspace / "_snapshots" / snapshot_id

    if not snapshot_dir.exists() or not snapshot_dir.is_dir():
        return {
            "rolled_back": False,
            "reason": "snapshot não encontrado",
            "snapshot_id": snapshot_id,
        }

    # Remove current non-snapshot files.
    removed = 0
    for item in workspace.rglob("*"):
        if not item.is_file():
            continue
        if "_snapshots" in item.parts:
            continue
        item.unlink(missing_ok=True)
        removed += 1

    restored = 0
    for item in snapshot_dir.rglob("*"):
        if not item.is_file():
            continue
        rel = item.relative_to(snapshot_dir)
        target = workspace / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, target)
        restored += 1

    return {
        "rolled_back": True,
        "snapshot_id": snapshot_id,
        "removed_files": removed,
        "restored_files": restored,
    }
