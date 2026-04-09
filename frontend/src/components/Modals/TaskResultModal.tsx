'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRightLeft,
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  GitBranch,
  ListChecks,
  Loader2,
  RotateCcw,
  Scale,
  Sparkles,
  X,
} from 'lucide-react';
import { apiClient, AgentSummary, TaskWorkspaceResponse } from '@/lib/api';
import { useNotify } from '@/lib/toast';

interface TaskPreview {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at?: string | null;
  result?: Record<string, unknown> | null;
  error?: string;
  attempt_count?: number;
}

interface TaskResultModalProps {
  isOpen: boolean;
  task: TaskPreview | null;
  onClose: () => void;
  onRetry?: () => void;
}

type WorkspaceTab = 'overview' | 'subtasks' | 'artifacts' | 'timeline' | 'decisions';

const statusTone: Record<string, string> = {
  completed: 'text-green-400 border-green-500/30 bg-green-500/10',
  failed: 'text-red-400 border-red-500/30 bg-red-500/10',
  blocked: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  processing: 'text-primary border-primary/30 bg-primary/10',
  review: 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10',
  queue: 'text-gray-light border-gray-metallic/30 bg-surface/40',
};

const priorityTone: Record<string, string> = {
  high: 'text-red-300 border-red-500/30 bg-red-500/10',
  medium: 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10',
  low: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
};

function formatDateTime(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('pt-BR');
}

function hasDependencyPath(startId: string, targetId: string, graph: Record<string, string[]>) {
  if (startId === targetId) return true;
  const visited = new Set<string>();
  const stack = [startId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const neighbors = graph[current] || [];
    for (const next of neighbors) {
      if (next === targetId) return true;
      if (!visited.has(next)) {
        stack.push(next);
      }
    }
  }

  return false;
}

function Section({ title, content }: { title: string; content?: string }) {
  if (!content) return null;
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-mono uppercase tracking-[0.25em] text-primary/70">{title}</h4>
      <div className="rounded-xl border border-gray-metallic/20 bg-black/30 p-3 text-sm leading-relaxed text-gray-lighter whitespace-pre-wrap">
        {content}
      </div>
    </section>
  );
}

export default function TaskResultModal({ isOpen, task, onClose, onRetry }: TaskResultModalProps) {
  const notify = useNotify();
  const [workspace, setWorkspace] = useState<TaskWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [artifactActionId, setArtifactActionId] = useState('');
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [taskActionLoading, setTaskActionLoading] = useState(false);
  const [subtaskLoading, setSubtaskLoading] = useState(false);
  const [taskStatusDraft, setTaskStatusDraft] = useState<string>('queue');
  const [assignedAgentDraft, setAssignedAgentDraft] = useState<string>('');
  const [blockReasonDraft, setBlockReasonDraft] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskDescription, setSubtaskDescription] = useState('');
  const [subtaskPriority, setSubtaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [subtaskAgentDraft, setSubtaskAgentDraft] = useState<string>('');
  const [subtaskActionId, setSubtaskActionId] = useState('');
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, { status: string; assigned_to: string; priority: string; depends_on_ids: string[] }>>({});
  const [dueAtDraft, setDueAtDraft] = useState('');
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionSummary, setDecisionSummary] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [decisionScope, setDecisionScope] = useState<'task' | 'epic' | 'org'>('task');
  const [decisionImpact, setDecisionImpact] = useState<'low' | 'medium' | 'high'>('medium');

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

  const loadWorkspace = async (taskId: string) => {
    const response = await apiClient.getTaskWorkspace(taskId);
    setWorkspace(response.data);
  };

  const loadAgents = async () => {
    const response = await apiClient.getActiveAgents();
    const data = response.data;
    const items = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
    setAgents(items as AgentSummary[]);
  };

  useEffect(() => {
    if (!isOpen || !task) return;

    let cancelled = false;
    setWorkspace(null);
    setLoadError('');
    setLoading(true);
    setArtifactActionId('');
    setTab('overview');
    setSubtaskTitle('');
    setSubtaskDescription('');
    setBlockReasonDraft('');
    setDecisionTitle('');
    setDecisionSummary('');
    setDecisionRationale('');

    Promise.all([loadWorkspace(task.id), loadAgents()])
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = typeof error === 'object' && error !== null && 'response' in error
            ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível carregar a workspace da tarefa.')
            : 'Não foi possível carregar a workspace da tarefa.';
          setLoadError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, task]);

  useEffect(() => {
    if (!workspace) return;
    setTaskStatusDraft(workspace.status);
    setAssignedAgentDraft(workspace.assigned_to || '');
    setSubtaskAgentDraft(workspace.assigned_to || '');
    setSubtaskDrafts(
      workspace.subtasks.reduce((acc, item) => {
        acc[item.id] = {
          status: item.status,
          assigned_to: item.assigned_to || '',
          priority: item.priority,
          depends_on_ids: item.depends_on || [],
        };
        return acc;
      }, {} as Record<string, { status: string; assigned_to: string; priority: string; depends_on_ids: string[] }>)
    );
    setDueAtDraft(toDateTimeLocal(workspace.due_at));
  }, [workspace]);

  const currentTask = workspace || task;
  const dependencyGraph = useMemo(() => {
    if (!workspace) return {} as Record<string, string[]>;
    return workspace.subtasks.reduce((acc, item) => {
      acc[item.id] = subtaskDrafts[item.id]?.depends_on_ids || item.depends_on || [];
      return acc;
    }, {} as Record<string, string[]>);
  }, [workspace, subtaskDrafts]);

  const wouldCreateCycle = (candidateId: string, targetSubtaskId: string) => {
    if (candidateId === targetSubtaskId) return true;
    return hasDependencyPath(candidateId, targetSubtaskId, dependencyGraph);
  };

  const getBlockedByCycleCount = (targetSubtaskId: string) => {
    if (!workspace) return 0;
    return workspace.subtasks.filter(
      (candidate) => candidate.id !== targetSubtaskId && wouldCreateCycle(candidate.id, targetSubtaskId)
    ).length;
  };

  const structuredResult = useMemo(() => {
    const result = workspace?.result || task?.result;
    if (!result || typeof result !== 'object') return null;
    return result;
  }, [task?.result, workspace?.result]);

  if (!task) return null;

  const currentStatus = currentTask?.status || 'queue';
  const currentPriority = currentTask?.priority || 'medium';

  const handleApplyArtifact = async (artifactId: string, approvalRequestId: string, relativePath?: string, newContent?: string) => {
    if (!task || !relativePath || typeof newContent !== 'string') {
      notify.error('Artefato sem conteúdo aplicável.');
      return;
    }

    try {
      setArtifactActionId(artifactId);
      await apiClient.applyTaskFileChange(task.id, {
        relative_path: relativePath,
        new_content: newContent,
        approved: true,
        artifact_id: artifactId,
        approval_request_id: approvalRequestId,
      });
      await loadWorkspace(task.id);
      notify.success('Mudança aprovada e aplicada ao workspace da tarefa.');
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível aplicar o artefato.')
        : 'Não foi possível aplicar o artefato.';
      notify.error(message);
    } finally {
      setArtifactActionId('');
    }
  };

  const handleRequestApproval = async (artifactId: string, relativePath?: string) => {
    if (!task) return;

    const rationale = window.prompt(
      'Justificativa para aprovação formal:',
      `Solicito aprovação para aplicar mudança em ${relativePath || 'arquivo proposto'}.`
    );

    if (rationale === null) return;

    try {
      setArtifactActionId(artifactId);
      await apiClient.requestTaskApproval(task.id, {
        artifact_id: artifactId,
        rationale,
      });
      await loadWorkspace(task.id);
      notify.success('Solicitação de aprovação criada.');
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível solicitar aprovação.')
        : 'Não foi possível solicitar aprovação.';
      notify.error(message);
    } finally {
      setArtifactActionId('');
    }
  };

  const handleDecideApproval = async (artifactId: string, approvalId: string, decision: 'approved' | 'rejected') => {
    if (!task) return;

    const notes = window.prompt(
      decision === 'approved' ? 'Notas da aprovação (opcional):' : 'Motivo da rejeição:',
      ''
    );

    if (notes === null) return;

    try {
      setArtifactActionId(artifactId);
      await apiClient.decideTaskApproval(task.id, {
        approval_id: approvalId,
        decision,
        notes,
      });
      await loadWorkspace(task.id);
      notify.success(decision === 'approved' ? 'Aprovação registrada.' : 'Rejeição registrada.');
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível registrar a decisão.')
        : 'Não foi possível registrar a decisão.';
      notify.error(message);
    } finally {
      setArtifactActionId('');
    }
  };

  const handleRollbackArtifact = async (artifactId: string, snapshotId?: string) => {
    if (!task || !snapshotId) {
      notify.error('Snapshot inválido para rollback.');
      return;
    }

    try {
      setArtifactActionId(artifactId);
      await apiClient.rollbackTaskSnapshot(task.id, { snapshot_id: snapshotId });
      await loadWorkspace(task.id);
      notify.success('Rollback executado no workspace da tarefa.');
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível executar rollback.')
        : 'Não foi possível executar rollback.';
      notify.error(message);
    } finally {
      setArtifactActionId('');
    }
  };

  const handleSaveTaskControls = async () => {
    if (!task || !workspace) return;

    try {
      setTaskActionLoading(true);
      await apiClient.updateTask(task.id, {
        status: taskStatusDraft as 'queue' | 'processing' | 'blocked' | 'review' | 'completed' | 'failed',
        assigned_to: assignedAgentDraft || null,
        error: taskStatusDraft === 'blocked' ? blockReasonDraft : '',
        due_at: dueAtDraft ? new Date(dueAtDraft).toISOString() : null,
      });
      await loadWorkspace(task.id);
      notify.success('Controles da tarefa atualizados.');
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível atualizar a tarefa.')
        : 'Não foi possível atualizar a tarefa.';
      notify.error(message);
    } finally {
      setTaskActionLoading(false);
    }
  };

  const handleCreateSubtask = async () => {
    if (!task || !subtaskTitle.trim()) {
      notify.error('Informe um título para a subtarefa.');
      return;
    }

    try {
      setSubtaskLoading(true);
      await apiClient.createSubtask({
        task: task.id,
        title: subtaskTitle.trim(),
        description: subtaskDescription.trim(),
        priority: subtaskPriority,
        status: 'queue',
        assigned_to: subtaskAgentDraft || null,
        source: 'manual',
        order: (workspace?.subtasks.length || 0) + 1,
      });
      setSubtaskTitle('');
      setSubtaskDescription('');
      await loadWorkspace(task.id);
      notify.success('Subtarefa criada com sucesso.');
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível criar a subtarefa.')
        : 'Não foi possível criar a subtarefa.';
      notify.error(message);
    } finally {
      setSubtaskLoading(false);
    }
  };

  const handleUpdateSubtask = async (subtaskId: string) => {
    if (!task || !workspace) return;
    const draft = subtaskDrafts[subtaskId];
    if (!draft) return;

    try {
      setSubtaskActionId(subtaskId);
      await apiClient.updateSubtask(subtaskId, {
        status: draft.status as 'queue' | 'processing' | 'blocked' | 'review' | 'completed' | 'failed',
        assigned_to: draft.assigned_to || null,
        priority: draft.priority as 'low' | 'medium' | 'high',
        depends_on_ids: draft.depends_on_ids,
      });
      await loadWorkspace(task.id);
      notify.success('Subtarefa atualizada.');
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível atualizar a subtarefa.')
        : 'Não foi possível atualizar a subtarefa.';
      notify.error(message);
    } finally {
      setSubtaskActionId('');
    }
  };

  const handleCreateDecision = async () => {
    if (!task || !decisionTitle.trim()) {
      notify.error('Informe um título para a decisão.');
      return;
    }

    try {
      setDecisionLoading(true);
      await apiClient.createTaskDecision(task.id, {
        title: decisionTitle.trim(),
        summary: decisionSummary.trim(),
        rationale: decisionRationale.trim(),
        scope: decisionScope,
        impact: decisionImpact,
      });
      setDecisionTitle('');
      setDecisionSummary('');
      setDecisionRationale('');
      await loadWorkspace(task.id);
      notify.success('Decisão registrada com sucesso.');
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível registrar a decisão.')
        : 'Não foi possível registrar a decisão.';
      notify.error(message);
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleSupersedeDecision = async (decisionId: string, currentTitle: string) => {
    if (!task) return;
    const replacementTitle = window.prompt('Novo título da decisão substituta:', `Substitui: ${currentTitle}`);
    if (!replacementTitle) return;
    const replacementSummary = window.prompt('Resumo da nova decisão (opcional):', '') || '';
    const replacementRationale = window.prompt('Justificativa da substituição (opcional):', '') || '';

    try {
      setDecisionLoading(true);
      await apiClient.supersedeTaskDecision(task.id, {
        decision_id: decisionId,
        replacement_title: replacementTitle,
        replacement_summary: replacementSummary,
        replacement_rationale: replacementRationale,
      });
      await loadWorkspace(task.id);
      notify.success('Decisão substituída com sucesso.');
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Não foi possível substituir a decisão.')
        : 'Não foi possível substituir a decisão.';
      notify.error(message);
    } finally {
      setDecisionLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-gray-metallic/30 bg-dark shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          >
            <div className="border-b border-gray-metallic/20 px-5 py-4 shrink-0">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.2em] ${statusTone[currentStatus] || statusTone.queue}`}>
                      {currentStatus}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.2em] ${priorityTone[currentPriority] || priorityTone.medium}`}>
                      {currentPriority}
                    </span>
                    <span className="text-[11px] font-mono text-gray-dim">tentativa #{currentTask?.attempt_count || 0}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-text-title">{currentTask?.title}</h2>
                  {workspace?.summary && (
                    <p className="mt-2 text-sm leading-relaxed text-gray-light">{workspace.summary}</p>
                  )}
                </div>

                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-gray-light transition-colors hover:bg-gray-metallic/20 hover:text-text-title"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-dim">Artefatos</p>
                  <p className="mt-1 text-lg font-semibold text-text-title">{workspace?.artifact_count ?? 0}</p>
                </div>
                <div className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-dim">Eventos</p>
                  <p className="mt-1 text-lg font-semibold text-text-title">{workspace?.event_count ?? 0}</p>
                </div>
                <div className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-dim">Subtarefas</p>
                  <p className="mt-1 text-lg font-semibold text-text-title">{workspace?.subtask_count ?? 0}</p>
                </div>
                <div className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-dim">Próxima ação</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-light">{workspace?.next_action || 'Sem próxima ação definida'}</p>
                </div>
              </div>
            </div>

            <div className="border-b border-gray-metallic/20 px-3 shrink-0">
              <div className="flex flex-wrap gap-1 py-2">
                {([
                  ['overview', 'Visão geral', Sparkles],
                  ['subtasks', 'Subtarefas', ListChecks],
                  ['artifacts', 'Artefatos', FileText],
                  ['timeline', 'Timeline', GitBranch],
                  ['decisions', 'Decisões', Scale],
                ] as const).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    onClick={() => setTab(value)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
                      tab === value
                        ? 'border-primary/40 bg-primary/15 text-primary'
                        : 'border-gray-metallic/20 bg-transparent text-gray-light hover:text-text-title'
                    }`}
                  >
                    <Icon size={13} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && (
                <div className="flex h-56 flex-col items-center justify-center gap-3 text-gray-light">
                  <Loader2 className="animate-spin text-primary" size={24} />
                  <span className="text-sm">Carregando workspace da tarefa...</span>
                </div>
              )}

              {!loading && loadError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                  {loadError}
                </div>
              )}

              {!loading && !loadError && workspace && tab === 'overview' && (
                <div className="space-y-5">
                  <section className="space-y-3 rounded-xl border border-gray-metallic/20 bg-surface/25 p-4">
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft size={14} className="text-primary" />
                      <h4 className="text-[11px] font-mono uppercase tracking-[0.25em] text-primary/70">Controles rápidos</h4>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">

                                          <label className="space-y-1.5 text-xs text-gray-light block">
                                            <span>Prazo (due date)</span>
                                            <input
                                              type="datetime-local"
                                              value={dueAtDraft}
                                              onChange={(event) => setDueAtDraft(event.target.value)}
                                              className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                                            />
                                          </label>
                      <label className="space-y-1.5 text-xs text-gray-light">
                        <span>Status</span>
                        <select
                          value={taskStatusDraft}
                          onChange={(event) => setTaskStatusDraft(event.target.value)}
                          className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                        >
                          {['queue', 'processing', 'blocked', 'review', 'completed', 'failed'].map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1.5 text-xs text-gray-light">
                        <span>Responsável</span>
                        <select
                          value={assignedAgentDraft}
                          onChange={(event) => setAssignedAgentDraft(event.target.value)}
                          className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                        >
                          <option value="">Não atribuído</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>{agent.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {taskStatusDraft === 'blocked' && (
                      <label className="space-y-1.5 text-xs text-gray-light block">
                        <span>Motivo do bloqueio</span>
                        <textarea
                          value={blockReasonDraft}
                          onChange={(event) => setBlockReasonDraft(event.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                          placeholder="Descreva o que está impedindo a continuidade da tarefa"
                        />
                      </label>
                    )}

                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveTaskControls}
                        disabled={taskActionLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/15 px-4 py-2 text-xs text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                      >
                        {taskActionLoading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        <span>Salvar controles</span>
                      </button>
                    </div>
                  </section>

                  {workspace.description && (
                    <section className="space-y-2">
                      <h4 className="text-[11px] font-mono uppercase tracking-[0.25em] text-gray-dim">Contexto</h4>
                      <div className="rounded-xl border border-gray-metallic/20 bg-black/30 p-3 text-sm leading-relaxed text-gray-lighter whitespace-pre-wrap">
                        {workspace.description}
                      </div>
                    </section>
                  )}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-3 text-sm text-gray-light">
                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-dim">Responsável</p>
                      <p className="mt-1 text-text-title">{workspace.assigned_to_name || 'Não atribuído'}</p>
                    </div>
                    <div className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-3 text-sm text-gray-light">
                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-dim">Épica</p>
                      <p className="mt-1 text-text-title">{workspace.epic_goal || 'Sem épica vinculada'}</p>
                    </div>
                    <div className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-3 text-sm text-gray-light">
                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-dim">Criada em</p>
                      <p className="mt-1 text-text-title">{formatDateTime(workspace.created_at)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-3 text-sm text-gray-light">
                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-dim">Prazo</p>
                      <p className="mt-1 text-text-title">{formatDateTime(workspace.due_at || undefined)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-3 text-sm text-gray-light">
                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-dim">Concluída em</p>
                      <p className="mt-1 text-text-title">{formatDateTime(workspace.completed_at)}</p>
                    </div>
                  </div>

                  {workspace.error && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                      <div className="mb-2 flex items-center gap-2">
                        <AlertCircle size={14} />
                        <span className="font-medium">Erro atual</span>
                      </div>
                      <p>{workspace.error}</p>
                    </div>
                  )}

                  <Section title="Resumo" content={workspace.summary} />
                  <Section title="Análise" content={typeof structuredResult?.analysis === 'string' ? structuredResult.analysis : undefined} />
                  <Section title="Execução" content={typeof structuredResult?.execution === 'string' ? structuredResult.execution : undefined} />
                  <Section title="Resultado" content={typeof structuredResult?.resultado === 'string' ? structuredResult.resultado : undefined} />
                  <Section title="Próximos passos" content={typeof structuredResult?.próximos_passos === 'string' ? structuredResult.próximos_passos : undefined} />
                </div>
              )}

              {!loading && !loadError && workspace && tab === 'subtasks' && (
                <div className="space-y-3">
                  <section className="space-y-3 rounded-xl border border-gray-metallic/20 bg-surface/25 p-4">
                    <div className="flex items-center gap-2">
                      <ListChecks size={14} className="text-primary" />
                      <h4 className="text-[11px] font-mono uppercase tracking-[0.25em] text-primary/70">Nova subtarefa</h4>
                    </div>

                    <input
                      value={subtaskTitle}
                      onChange={(event) => setSubtaskTitle(event.target.value)}
                      className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                      placeholder="Título da subtarefa"
                    />

                    <textarea
                      value={subtaskDescription}
                      onChange={(event) => setSubtaskDescription(event.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                      placeholder="Descrição operacional da subtarefa"
                    />

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="space-y-1.5 text-xs text-gray-light">
                        <span>Prioridade</span>
                        <select
                          value={subtaskPriority}
                          onChange={(event) => setSubtaskPriority(event.target.value as 'low' | 'medium' | 'high')}
                          className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                        >
                          <option value="low">low</option>
                          <option value="medium">medium</option>
                          <option value="high">high</option>
                        </select>
                      </label>

                      <label className="space-y-1.5 text-xs text-gray-light">
                        <span>Responsável</span>
                        <select
                          value={subtaskAgentDraft}
                          onChange={(event) => setSubtaskAgentDraft(event.target.value)}
                          className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                        >
                          <option value="">Não atribuído</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>{agent.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleCreateSubtask}
                        disabled={subtaskLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/15 px-4 py-2 text-xs text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                      >
                        {subtaskLoading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        <span>Criar subtarefa</span>
                      </button>
                    </div>
                  </section>

                  {workspace.subtasks.length === 0 && (
                    <p className="text-sm text-gray-light">Nenhuma subtarefa foi gerada ainda.</p>
                  )}
                  {workspace.subtasks.map((subtask) => (
                    <div key={subtask.id} className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase ${statusTone[subtask.status] || statusTone.queue}`}>
                              {subtask.status}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase ${priorityTone[subtask.priority] || priorityTone.medium}`}>
                              {subtask.priority}
                            </span>
                            <span className="text-[10px] font-mono text-gray-dim">ordem {subtask.order || 0}</span>
                          </div>
                          <h4 className="mt-2 text-sm font-semibold text-text-title">{subtask.title}</h4>
                          {subtask.description && (
                            <p className="mt-1 text-sm leading-relaxed text-gray-light">{subtask.description}</p>
                          )}
                        </div>
                        <div className="text-right text-[11px] text-gray-dim">
                          <p>{subtask.assigned_to_name || 'Sem owner'}</p>
                          <p>{subtask.source || 'agent'}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="space-y-1 text-xs text-gray-light">
                          <span>Status</span>
                          <select
                            value={subtaskDrafts[subtask.id]?.status || subtask.status}
                            onChange={(event) => {
                              const nextStatus = event.target.value;
                              setSubtaskDrafts((previous) => ({
                                ...previous,
                                [subtask.id]: {
                                  status: nextStatus,
                                  assigned_to: previous[subtask.id]?.assigned_to ?? subtask.assigned_to ?? '',
                                  priority: previous[subtask.id]?.priority ?? subtask.priority,
                                  depends_on_ids: previous[subtask.id]?.depends_on_ids ?? subtask.depends_on ?? [],
                                },
                              }));
                            }}
                            className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                          >
                            {['queue', 'processing', 'blocked', 'review', 'completed', 'failed'].map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1 text-xs text-gray-light">
                          <span>Responsável</span>
                          <select
                            value={subtaskDrafts[subtask.id]?.assigned_to || ''}
                            onChange={(event) => {
                              const nextAssigned = event.target.value;
                              setSubtaskDrafts((previous) => ({
                                ...previous,
                                [subtask.id]: {
                                  status: previous[subtask.id]?.status ?? subtask.status,
                                  assigned_to: nextAssigned,
                                  priority: previous[subtask.id]?.priority ?? subtask.priority,
                                  depends_on_ids: previous[subtask.id]?.depends_on_ids ?? subtask.depends_on ?? [],
                                },
                              }));
                            }}
                            className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                          >
                            <option value="">Não atribuído</option>
                            {agents.map((agent) => (
                              <option key={agent.id} value={agent.id}>{agent.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="space-y-1 text-xs text-gray-light">
                          <span>Prioridade</span>
                          <select
                            value={subtaskDrafts[subtask.id]?.priority || subtask.priority}
                            onChange={(event) => {
                              const nextPriority = event.target.value;
                              setSubtaskDrafts((previous) => ({
                                ...previous,
                                [subtask.id]: {
                                  status: previous[subtask.id]?.status ?? subtask.status,
                                  assigned_to: previous[subtask.id]?.assigned_to ?? subtask.assigned_to ?? '',
                                  priority: nextPriority,
                                  depends_on_ids: previous[subtask.id]?.depends_on_ids ?? subtask.depends_on ?? [],
                                },
                              }));
                            }}
                            className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                          >
                            {['low', 'medium', 'high'].map((priority) => (
                              <option key={priority} value={priority}>{priority}</option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1 text-xs text-gray-light">
                          <span>Dependências</span>
                          <select
                            multiple
                            value={subtaskDrafts[subtask.id]?.depends_on_ids || []}
                            onChange={(event) => {
                              const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                              setSubtaskDrafts((previous) => ({
                                ...previous,
                                [subtask.id]: {
                                  status: previous[subtask.id]?.status ?? subtask.status,
                                  assigned_to: previous[subtask.id]?.assigned_to ?? subtask.assigned_to ?? '',
                                  priority: previous[subtask.id]?.priority ?? subtask.priority,
                                  depends_on_ids: values,
                                },
                              }));
                            }}
                            className="h-24 w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                          >
                            {workspace.subtasks
                              .filter((candidate) => candidate.id !== subtask.id)
                              .map((candidate) => (
                                <option
                                  key={candidate.id}
                                  value={candidate.id}
                                  disabled={wouldCreateCycle(candidate.id, subtask.id)}
                                >
                                  {candidate.title}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>

                      {getBlockedByCycleCount(subtask.id) > 0 && (
                        <p className="mt-2 text-[11px] text-orange-300/90">
                          {getBlockedByCycleCount(subtask.id)} opcoes desabilitadas para evitar ciclo de dependencias.
                        </p>
                      )}

                      {subtaskDrafts[subtask.id]?.depends_on_ids?.length ? (
                        <p className="mt-2 text-[11px] text-gray-dim">
                          {subtaskDrafts[subtask.id].depends_on_ids.length} dependência(s) selecionada(s)
                        </p>
                      ) : null}

                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => handleUpdateSubtask(subtask.id)}
                          disabled={subtaskActionId === subtask.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                        >
                          {subtaskActionId === subtask.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          <span>Salvar subtarefa</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && !loadError && workspace && tab === 'artifacts' && (
                <div className="space-y-3">
                  {workspace.artifacts.length === 0 && (
                    <p className="text-sm text-gray-light">Nenhum artefato anexado ainda.</p>
                  )}
                  {workspace.artifacts.map((artifact) => (
                    <div key={artifact.id} className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-4">
                      {(() => {
                        const pendingApproval = workspace.approval_requests?.find(
                          (approval) => approval.artifact === artifact.id && approval.status === 'pending'
                        );
                        const approvedApproval = workspace.approval_requests?.find(
                          (approval) => approval.artifact === artifact.id && approval.status === 'approved'
                        );

                        return (
                          <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono uppercase text-primary">
                              {artifact.artifact_type}
                            </span>
                            <span className="rounded-full border border-gray-metallic/30 bg-black/30 px-2 py-0.5 text-[10px] font-mono uppercase text-gray-light">
                              {artifact.status}
                            </span>
                            {pendingApproval && (
                              <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-mono uppercase text-yellow-300">
                                aprovação pendente
                              </span>
                            )}
                            {approvedApproval && (
                              <span className="rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-[10px] font-mono uppercase text-green-300">
                                aprovado
                              </span>
                            )}
                          </div>
                          <h4 className="mt-2 text-sm font-semibold text-text-title">{artifact.title}</h4>
                          {artifact.relative_path && (
                            <p className="mt-1 text-xs font-mono text-gray-dim">{artifact.relative_path}</p>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-dim">{formatDateTime(artifact.created_at)}</div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {artifact.artifact_type === 'diff' && artifact.status === 'proposed' && !pendingApproval && !approvedApproval && (
                          <button
                            onClick={() => handleRequestApproval(artifact.id, artifact.relative_path)}
                            disabled={artifactActionId === artifact.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-xs text-yellow-300 transition-colors hover:bg-yellow-500/20 disabled:opacity-50"
                          >
                            {artifactActionId === artifact.id ? <Loader2 size={12} className="animate-spin" /> : <Clock3 size={12} />}
                            <span>Solicitar aprovação</span>
                          </button>
                        )}

                        {pendingApproval && (
                          <>
                            <button
                              onClick={() => handleDecideApproval(artifact.id, pendingApproval.id, 'approved')}
                              disabled={artifactActionId === artifact.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs text-green-300 transition-colors hover:bg-green-500/20 disabled:opacity-50"
                            >
                              {artifactActionId === artifact.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                              <span>Aprovar</span>
                            </button>
                            <button
                              onClick={() => handleDecideApproval(artifact.id, pendingApproval.id, 'rejected')}
                              disabled={artifactActionId === artifact.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                            >
                              {artifactActionId === artifact.id ? <Loader2 size={12} className="animate-spin" /> : <AlertCircle size={12} />}
                              <span>Rejeitar</span>
                            </button>
                          </>
                        )}

                        {artifact.artifact_type === 'diff' && artifact.status !== 'applied' && approvedApproval && artifact.relative_path && typeof artifact.content === 'string' && (
                          <button
                            onClick={() => handleApplyArtifact(artifact.id, approvedApproval.id, artifact.relative_path, artifact.content)}
                            disabled={artifactActionId === artifact.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs text-green-300 transition-colors hover:bg-green-500/20 disabled:opacity-50"
                          >
                            {artifactActionId === artifact.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                            <span>Aprovar e aplicar</span>
                          </button>
                        )}
                        {artifact.artifact_type === 'snapshot' && (
                          <button
                            onClick={() => handleRollbackArtifact(
                              artifact.id,
                              typeof artifact.payload?.snapshot_id === 'string'
                                ? artifact.payload.snapshot_id
                                : undefined
                            )}
                            disabled={artifactActionId === artifact.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs text-orange-300 transition-colors hover:bg-orange-500/20 disabled:opacity-50"
                          >
                            {artifactActionId === artifact.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                            <span>Rollback</span>
                          </button>
                        )}
                      </div>

                      {artifact.preview && (
                        <pre className="mt-3 overflow-x-auto rounded-lg border border-gray-metallic/20 bg-black/40 p-3 text-[11px] leading-relaxed text-gray-lighter whitespace-pre-wrap">
                          {artifact.preview}
                        </pre>
                      )}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}

              {!loading && !loadError && workspace && tab === 'timeline' && (
                <div className="space-y-3">
                  {workspace.events.length === 0 && (
                    <p className="text-sm text-gray-light">Nenhum evento registrado ainda.</p>
                  )}
                  {workspace.events.map((event, index) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                          {event.event_type === 'completed' ? <CheckCircle2 size={14} /> : event.event_type === 'blocked' ? <AlertCircle size={14} /> : event.event_type === 'started' ? <Bot size={14} /> : <Clock3 size={14} />}
                        </div>
                        {index < workspace.events.length - 1 && <div className="mt-1 w-px flex-1 bg-gray-metallic/20" />}
                      </div>
                      <div className="min-w-0 flex-1 pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-text-title">{event.message}</span>
                          <span className="text-[10px] font-mono uppercase text-gray-dim">{event.event_type}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-dim">
                          <span>{event.agent_name || 'Sistema'}</span>
                          <ChevronRight size={11} />
                          <span>{formatDateTime(event.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && !loadError && workspace && tab === 'decisions' && (
                <div className="space-y-4">
                  <section className="space-y-3 rounded-xl border border-gray-metallic/20 bg-surface/25 p-4">
                    <div className="flex items-center gap-2">
                      <Scale size={14} className="text-primary" />
                      <h4 className="text-[11px] font-mono uppercase tracking-[0.25em] text-primary/70">Nova decisão</h4>
                    </div>

                    <input
                      value={decisionTitle}
                      onChange={(event) => setDecisionTitle(event.target.value)}
                      className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                      placeholder="Título da decisão"
                    />

                    <textarea
                      value={decisionSummary}
                      onChange={(event) => setDecisionSummary(event.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                      placeholder="Resumo executivo da decisão"
                    />

                    <textarea
                      value={decisionRationale}
                      onChange={(event) => setDecisionRationale(event.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                      placeholder="Justificativa, tradeoffs e evidências"
                    />

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="space-y-1.5 text-xs text-gray-light">
                        <span>Escopo</span>
                        <select
                          value={decisionScope}
                          onChange={(event) => setDecisionScope(event.target.value as 'task' | 'epic' | 'org')}
                          className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                        >
                          <option value="task">task</option>
                          <option value="epic">epic</option>
                          <option value="org">org</option>
                        </select>
                      </label>

                      <label className="space-y-1.5 text-xs text-gray-light">
                        <span>Impacto</span>
                        <select
                          value={decisionImpact}
                          onChange={(event) => setDecisionImpact(event.target.value as 'low' | 'medium' | 'high')}
                          className="w-full rounded-lg border border-gray-metallic/30 bg-black/30 px-3 py-2 text-sm text-text-title"
                        >
                          <option value="low">low</option>
                          <option value="medium">medium</option>
                          <option value="high">high</option>
                        </select>
                      </label>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleCreateDecision}
                        disabled={decisionLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/15 px-4 py-2 text-xs text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                      >
                        {decisionLoading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        <span>Registrar decisão</span>
                      </button>
                    </div>
                  </section>

                  {workspace.decision_records.length === 0 ? (
                    <p className="text-sm text-gray-light">Nenhuma decisão registrada ainda.</p>
                  ) : (
                    workspace.decision_records.map((decision) => (
                      <div key={decision.id} className="rounded-xl border border-gray-metallic/20 bg-surface/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono uppercase text-primary">
                                {decision.scope}
                              </span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase ${decision.status === 'accepted' ? 'border-green-500/30 bg-green-500/10 text-green-300' : decision.status === 'rejected' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'}`}>
                                {decision.status}
                              </span>
                              <span className="rounded-full border border-gray-metallic/30 bg-black/30 px-2 py-0.5 text-[10px] font-mono uppercase text-gray-light">
                                impacto {decision.impact}
                              </span>
                            </div>
                            <h4 className="mt-2 text-sm font-semibold text-text-title">{decision.title}</h4>
                            {decision.summary ? <p className="mt-1 text-sm text-gray-light">{decision.summary}</p> : null}
                            {decision.rationale ? <p className="mt-2 text-xs text-gray-dim whitespace-pre-wrap">{decision.rationale}</p> : null}
                            {decision.supersedes_title ? (
                              <p className="mt-2 text-[11px] text-orange-300">Substitui: {decision.supersedes_title}</p>
                            ) : null}
                            {decision.status !== 'superseded' ? (
                              <button
                                onClick={() => handleSupersedeDecision(decision.id, decision.title)}
                                disabled={decisionLoading}
                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs text-orange-300 transition-colors hover:bg-orange-500/20 disabled:opacity-50"
                              >
                                {decisionLoading ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                <span>Substituir decisão</span>
                              </button>
                            ) : null}
                          </div>
                          <div className="text-right text-[11px] text-gray-dim">
                            <p>{decision.decided_by_name || decision.created_by_user_name || decision.created_by_agent_name || 'Sistema'}</p>
                            <p>{formatDateTime(decision.decided_at || decision.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-gray-metallic/20 px-5 py-4 shrink-0 flex justify-between gap-2">
              <div className="text-[11px] text-gray-dim">
                {workspace?.latest_question ? `Dúvida pendente: ${workspace.latest_question}` : 'Workspace operacional da tarefa'}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-gray-metallic/30 px-4 py-2 text-xs text-gray-light transition-colors hover:text-text-title"
                >
                  Fechar
                </button>
                {currentStatus === 'failed' && onRetry && (
                  <button
                    onClick={() => {
                      onRetry();
                      onClose();
                    }}
                    className="rounded-lg border border-primary/40 bg-primary/15 px-4 py-2 text-xs text-primary transition-colors hover:bg-primary/25"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
