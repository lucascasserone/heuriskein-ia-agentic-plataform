'use client';

import React, { useEffect, useState } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { apiClient, MetricsOverview } from '@/lib/api';
import { LayoutGrid, Zap, CheckCircle2, Clock, AlertCircle, User, Timer, Eye, EyeOff, Pencil, Trash2, Search, X as XIcon, Minimize2, Maximize2, Plus, Code2, Globe, Wrench, ArrowRight, GitBranch } from 'lucide-react';
import { useNotify } from '@/lib/toast';
import EditEpicModal from '@/components/Modals/EditEpicModal';
import EditTaskModal from '@/components/Modals/EditTaskModal';
import CreateEpicModal from '@/components/Modals/CreateEpicModal';
import CreateTaskModal from '@/components/Modals/CreateTaskModal';
import ConfirmDeleteModal from '@/components/Modals/ConfirmDeleteModal';
import TaskResultModal from '@/components/Modals/TaskResultModal';
import ClarificationModal from '@/components/Modals/ClarificationModal';
import { useTaskRealtime } from '@/hooks/useWebRealtime';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'queue' | 'processing' | 'blocked' | 'review' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  assigned_to?: string;
  epic?: string | null;
  epic_goal?: string;
  result?: Record<string, unknown> | null;
  error?: string;
  latest_question?: string;
  attempt_count?: number;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
}

interface Epic {
  id: string;
  goal: string;
  status: 'backlog' | 'refinement' | 'approved' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  created_at?: string;
}

type TaskStatus = Task['status'];
type EpicStatus = Epic['status'];

// Planning Board (Epics) - Blueprint Style
const planningStatuses = [
  { key: 'backlog', label: 'Backlog', icon: <Clock size={16} /> },
  { key: 'refinement', label: 'Refinamento', icon: <AlertCircle size={16} /> },
  { key: 'approved', label: 'Aprovado', icon: <CheckCircle2 size={16} /> },
  { key: 'completed', label: 'Completado', icon: <CheckCircle2 size={16} /> },
];

// Execution Board (Tasks) - Vivo Style
const executionStatuses = [
  { key: 'queue', label: 'Fila', icon: <Clock size={16} /> },
  { key: 'processing', label: 'Processando', icon: <Zap size={16} /> },
  { key: 'blocked', label: 'Aprovação', icon: <AlertCircle size={16} /> },
  { key: 'review', label: 'QA', icon: <AlertCircle size={16} /> },
  { key: 'completed', label: 'Finalizado', icon: <CheckCircle2 size={16} /> },
];

const priorityColors = {
  low: { bg: 'bg-blue-900/20', border: 'border-blue-500/30', text: 'text-blue-300' },
  medium: { bg: 'bg-yellow-900/20', border: 'border-yellow-500/30', text: 'text-yellow-300' },
  high: { bg: 'bg-red-900/20', border: 'border-red-500/30', text: 'text-red-300' },
};

// Status indicators for tasks
const statusDots = {
  queue: { color: 'bg-yellow-400', label: 'Aguardando' },
  processing: { color: 'bg-green-400', label: 'Ativo' },
  blocked: { color: 'bg-orange-400', label: 'Aguardando aprovacao' },
  review: { color: 'bg-orange-400', label: 'Revisão' },
  completed: { color: 'bg-blue-400', label: 'Concluído' },
};

export default function DualKanbanDragDrop() {
  const [epics, setEpics] = useState<{ [key: string]: Epic[] }>({});
  const [tasks, setTasks] = useState<{ [key: string]: Task[] }>({});
  const [loading, setLoading] = useState(true);
  const [showFlowGraph, setShowFlowGraph] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [compactBeforeFocus, setCompactBeforeFocus] = useState<boolean | null>(null);
  const notify = useNotify();

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [flowEpicStatusFilter, setFlowEpicStatusFilter] = useState<EpicStatus | null>(null);
  const [flowTaskStatusFilter, setFlowTaskStatusFilter] = useState<TaskStatus | null>(null);

  // Edit/Delete state
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isCreateEpicOpen, setIsCreateEpicOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{ item: Task | Epic; type: 'task' | 'epic' } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Task result viewer
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [clarifyingTask, setClarifyingTask] = useState<Task | null>(null);
  const [metrics, setMetrics] = useState<MetricsOverview | null>(null);
  const taskRealtime = useTaskRealtime();

  useEffect(() => {
    let isActive = true;

    try {
      const savedCompact = localStorage.getItem('kanban_compact_mode');
      if (savedCompact === null) {
        setCompactMode(false);
      } else {
        setCompactMode(savedCompact === '1');
      }
    } catch {
      // Ignore localStorage access errors.
    }

    const initData = async () => {
      const loadingGuard = window.setTimeout(() => {
        if (isActive) {
          setLoading(false);
          notify.error('Tempo de carregamento excedido. Exibindo dados disponíveis.');
        }
      }, 10000);

      try {
        await fetchData();
      } finally {
        window.clearTimeout(loadingGuard);
        if (isActive) {
          setLoading(false);
        }
      }
    };

    initData();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const unsubTask = taskRealtime.subscribe('task_updated', () => {
      fetchData();
    });

    return () => {
      unsubTask();
    };
  }, [taskRealtime]);

  useEffect(() => {
    const refreshHandler = () => {
      fetchData();
    };

    window.addEventListener('kanban:refresh', refreshHandler);
    const interval = window.setInterval(refreshHandler, 15000);

    return () => {
      window.removeEventListener('kanban:refresh', refreshHandler);
      window.clearInterval(interval);
    };
  }, []);

  // Fast poll (every 4 s) while any task is processing
  useEffect(() => {
    const hasProcessing = Object.values(tasks).flat().some((t) => t.status === 'processing');
    if (!hasProcessing) return;
    const fastPoll = window.setInterval(fetchData, 4000);
    return () => window.clearInterval(fastPoll);
  }, [tasks]);

  const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('Request timeout'));
      }, ms);

      promise
        .then((value) => {
          window.clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timer);
          reject(error);
        });
    });
  };

  const fetchData = async () => {
    try {
      const [epicsRes, tasksRes, metricsRes] = await Promise.all([
        withTimeout(apiClient.getEpicsByStatus(), 8000),
        withTimeout(apiClient.getTasksByStatus(), 8000),
        withTimeout(apiClient.getMetricsOverview(), 8000),
      ]);
      setEpics(epicsRes.data || {});
      setTasks(tasksRes.data || {});
      setMetrics(metricsRes.data || null);
    } catch (error) {
      console.error('Error fetching data:', error);
      notify.error('Erro ao carregar dados');
    }
  };

  const handleDragEnd = async (
    item: Epic | Task,
    newStatus: TaskStatus | EpicStatus,
    type: 'epic' | 'task'
  ) => {
    try {
      notify.loading('Atualizando status...');

      if (type === 'epic') {
        await apiClient.updateEpic(item.id, { status: newStatus as EpicStatus });
      } else {
        await apiClient.updateTask(item.id, { status: newStatus as TaskStatus });
      }

      notify.success(`Status atualizado para "${newStatus}"`);
      fetchData();
    } catch (error) {
      notify.error('Erro ao atualizar status');
      console.error('Error updating status:', error);
    }
  };

  const handleStatusChange = async (
    item: Task | Epic,
    newStatus: TaskStatus | EpicStatus,
    type: 'task' | 'epic'
  ) => {
    try {
      if (type === 'task') {
        await apiClient.updateTask(item.id, { status: newStatus as TaskStatus });
      } else {
        await apiClient.updateEpic(item.id, { status: newStatus as EpicStatus });
      }
      await fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      notify.error('Erro ao alterar status');
    }
  };

  const handleEdit = (item: Task | Epic, type: 'task' | 'epic') => {
    if (type === 'epic') {
      setEditingEpic(item as Epic);
    } else {
      setEditingTask(item as Task);
    }
  };

  const handleDeleteRequest = (item: Task | Epic, type: 'task' | 'epic') => {
    setDeletingItem({ item, type });
  };

  // Filter helper
  const filterItems = <T extends Task | Epic,>(items: T[]): T[] => {
    return items.filter((item) => {
      const text = 'goal' in item ? item.goal : (item as Task).title;
      const matchesSearch = searchQuery === '' || text.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = filterPriority === 'all' || item.priority === filterPriority;
      return matchesSearch && matchesPriority;
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    setDeleteLoading(true);
    try {
      if (deletingItem.type === 'epic') {
        await apiClient.deleteEpic(deletingItem.item.id);
        notify.success('Épica excluída com sucesso');
      } else {
        await apiClient.deleteTask(deletingItem.item.id);
        notify.success('Tarefa excluída com sucesso');
      }
      setDeletingItem(null);
      fetchData();
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Erro ao excluir';
      notify.error(msg);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleTaskAction = async (task: Task, action: 'execute' | 'complete' | 'fail' | 'retry' | 'viewResult' | 'clarify') => {
    if (action === 'viewResult') {
      setViewingTask(task);
      return;
    }
    if (action === 'clarify') {
      setClarifyingTask(task);
      return;
    }

    try {
      if (action === 'execute') {
        await apiClient.executeTask(task.id);
        notify.success('Tarefa enviada para execução com Claude');
      } else if (action === 'retry') {
        await apiClient.retryTask(task.id);
        notify.success('Re-executando tarefa com Claude');
      } else if (action === 'complete') {
        await apiClient.completeTask(task.id, { completed_by: 'ui' });
        notify.success('Tarefa concluída');
      } else {
        await apiClient.failTask(task.id, 'Falha registrada via UI');
        notify.success('Tarefa marcada como falha');
      }

      await fetchData();
    } catch (error: any) {
      const detail = error?.response?.data?.error || 'Não foi possível executar a ação';
      notify.error(detail);
      const question = error?.response?.data?.question;
      if (question) {
        notify.error(`IA precisa de contexto: ${question}`);
        setClarifyingTask(task);
      }
    }
  };

  const toggleCompactMode = () => {
    setCompactMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('kanban_compact_mode', next ? '1' : '0');
      } catch {
        // Ignore localStorage access errors.
      }
      return next;
    });
  };

  const toggleFocusMode = () => {
    setFocusMode((prev) => {
      const next = !prev;

      if (next) {
        setCompactBeforeFocus(compactMode);
        setCompactMode(true);
      } else {
        if (compactBeforeFocus !== null) {
          setCompactMode(compactBeforeFocus);
        }
        setCompactBeforeFocus(null);
      }

      try {
        localStorage.setItem('kanban_focus_mode', next ? '1' : '0');
      } catch {
        // Ignore localStorage access errors.
      }

      window.dispatchEvent(new CustomEvent('workspace:focus-mode', { detail: { enabled: next } }));
      return next;
    });
  };

  const zoomScale = compactMode ? 0.8 : 1;
  const zoomStyle: React.CSSProperties | undefined = compactMode
    ? {
        transform: `scale(${zoomScale})`,
        transformOrigin: 'top left',
        width: `${100 / zoomScale}%`,
        height: `${100 / zoomScale}%`,
      }
    : undefined;

  const visiblePlanningStatuses = flowEpicStatusFilter
    ? planningStatuses.filter((status) => status.key === flowEpicStatusFilter)
    : planningStatuses;

  const visibleExecutionStatuses = flowTaskStatusFilter
    ? executionStatuses.filter((status) => status.key === flowTaskStatusFilter)
    : executionStatuses;

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterPriority('all');
    setFlowEpicStatusFilter(null);
    setFlowTaskStatusFilter(null);
  };

  const flowExecutionNodes = [
    { key: 'queue' as const, label: 'Fila', count: (tasks.queue || []).length },
    { key: 'processing' as const, label: 'Processando', count: (tasks.processing || []).length },
    { key: 'blocked' as const, label: 'Aguardando aprovacao', count: (tasks.blocked || []).length },
    { key: 'review' as const, label: 'QA', count: (tasks.review || []).length },
    { key: 'completed' as const, label: 'Finalizado', count: (tasks.completed || []).length },
  ];

  return (
    <>
      <TaskResultModal
        isOpen={!!viewingTask}
        task={viewingTask}
        onClose={() => setViewingTask(null)}
        onRetry={() => {
          if (viewingTask) handleTaskAction(viewingTask, 'retry');
        }}
      />
      <ClarificationModal
        isOpen={!!clarifyingTask}
        task={clarifyingTask ? { id: clarifyingTask.id, title: clarifyingTask.title } : null}
        onClose={() => setClarifyingTask(null)}
        onAnswered={() => {
          setClarifyingTask(null);
          fetchData();
          notify.success('Esclarecimento enviado. A task voltou para fila.');
        }}
      />
      <EditEpicModal
        isOpen={!!editingEpic}
        epic={editingEpic}
        onClose={() => setEditingEpic(null)}
        onSuccess={() => {
          setEditingEpic(null);
          fetchData();
        }}
      />
      <CreateEpicModal
        isOpen={isCreateEpicOpen}
        onClose={() => setIsCreateEpicOpen(false)}
        onSuccess={() => {
          setIsCreateEpicOpen(false);
          fetchData();
        }}
      />
      <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        onSuccess={() => {
          setIsCreateTaskOpen(false);
          fetchData();
        }}
      />
      <EditTaskModal
        isOpen={!!editingTask}
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSuccess={() => {
          setEditingTask(null);
          fetchData();
        }}
      />
      <ConfirmDeleteModal
        isOpen={!!deletingItem}
        title={deletingItem ? ('goal' in deletingItem.item ? deletingItem.item.goal : (deletingItem.item as Task).title) : ''}
        description={`Excluir esta ${deletingItem?.type === 'epic' ? 'épica' : 'tarefa'} permanentemente?`}
        confirmLabel={`Excluir ${deletingItem?.type === 'epic' ? 'Épica' : 'Tarefa'}`}
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingItem(null)}
      />
      <div className="h-full flex flex-col bg-dark overflow-hidden">
      <div className={`${compactMode ? 'p-2.5 lg:p-3' : 'p-4 lg:p-5'} flex-shrink-0`}>
      {loading && (
        <div className="mb-3 text-xs text-gray-light flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span>Carregando dados...</span>
        </div>
      )}

      {/* Header */}
      <div className={`${compactMode ? 'mb-2.5 lg:mb-3' : 'mb-4 lg:mb-5'}`}>
        <div className={`flex items-center justify-between ${compactMode ? 'mb-1.5' : 'mb-2'}`}>
          <div className={`flex items-center ${compactMode ? 'gap-1.5 lg:gap-2' : 'gap-2 lg:gap-3'}`}>
            <motion.div
              className={`${compactMode ? 'p-1.5 lg:p-1.5' : 'p-1.5 lg:p-2'} rounded-lg glassmorphism`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <LayoutGrid size={20} className="text-primary lg:w-6 lg:h-6" />
            </motion.div>
            <h1 className={`${compactMode ? 'text-lg lg:text-xl' : 'text-xl lg:text-2xl'} font-bold text-text-title`}>Orquestração</h1>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={toggleFocusMode}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors border border-secondary/30"
              title={focusMode ? 'Sair do modo foco' : 'Ativar modo foco (maximizar área do Kanban)'}
            >
              {focusMode ? (
                <Minimize2 size={15} className="text-secondary" />
              ) : (
                <Maximize2 size={15} className="text-secondary" />
              )}
            </motion.button>
            <button
              onClick={toggleCompactMode}
              className="px-2 py-1 rounded-md border border-gray-metallic/30 bg-surface/40 text-[11px] text-gray-light hover:text-text-title hover:border-primary/40 transition-colors"
              title={compactMode ? 'Layout compacto ativado' : 'Layout compacto desativado'}
            >
              Denso
            </button>
            <motion.button
              onClick={() => setShowFlowGraph(!showFlowGraph)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors border border-primary/30"
              title={showFlowGraph ? 'Ocultar Fluxo' : 'Ver Fluxo'}
            >
              {showFlowGraph ? (
                <EyeOff size={16} className="text-primary" />
              ) : (
                <Eye size={16} className="text-primary" />
              )}
            </motion.button>
          </div>
        </div>
        <p className={`${compactMode ? 'text-[11px] lg:text-xs ml-7 lg:ml-8' : 'text-xs lg:text-sm ml-8 lg:ml-9'} text-gray-light`}>{showFlowGraph ? 'Fluxo de Trabalho' : 'Planejamento e Execução em tempo real'}</p>

        {!showFlowGraph && metrics && (
          <div className={`flex flex-wrap items-center ${compactMode ? 'gap-1 mt-2 ml-7 lg:ml-8' : 'gap-2 mt-3 ml-8 lg:ml-9'}`}>
            <span className="px-2 py-1 rounded-md text-[11px] border border-primary/30 bg-primary/10 text-primary">
              Sucesso: {metrics.success_rate_percent}%
            </span>
            <span className="px-2 py-1 rounded-md text-[11px] border border-secondary/30 bg-secondary/10 text-secondary">
              Exec. media: {metrics.avg_execution_minutes} min
            </span>
            <span className="px-2 py-1 rounded-md text-[11px] border border-yellow-400/30 bg-yellow-500/10 text-yellow-300">
              Fila: {metrics.task_counts?.queue || 0}
            </span>
            <span className="px-2 py-1 rounded-md text-[11px] border border-orange-400/30 bg-orange-500/10 text-orange-300">
              Idade fila: {metrics.queue_age_minutes} min
            </span>
          </div>
        )}

        {/* Search + Priority Filter */}
        {!showFlowGraph && (
          <div className={`flex items-center ${compactMode ? 'gap-1.5 mt-2' : 'gap-2 mt-3'}`}>
            {/* Search box */}
            <div className={`relative flex-1 ${compactMode ? 'max-w-[220px] lg:max-w-[260px]' : 'max-w-xs'}`}>
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-light pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar épicas e tarefas…"
                className={`
                  w-full pl-8 pr-8 ${compactMode ? 'py-1 text-[11px]' : 'py-1.5 text-xs'} bg-surface border border-gray-metallic/30 rounded-lg
                  text-text-default placeholder-gray-dim
                  focus:outline-none focus:border-primary/60 transition-colors
                `}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-light hover:text-text-default"
                >
                  <XIcon size={12} />
                </button>
              )}
            </div>

            {/* Priority filter chips */}
            <div className="flex items-center gap-1">
              {(['all', 'high', 'medium', 'low'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterPriority(p)}
                  className={`
                    px-2.5 py-1 rounded-md text-xs font-semibold transition-all border
                    ${filterPriority === p
                      ? p === 'high' ? 'bg-red-500/30 border-red-400/60 text-red-300'
                        : p === 'medium' ? 'bg-yellow-500/30 border-yellow-400/60 text-yellow-300'
                        : p === 'low' ? 'bg-blue-500/30 border-blue-400/60 text-blue-300'
                        : 'bg-primary/20 border-primary/40 text-primary'
                      : 'bg-transparent border-gray-metallic/20 text-gray-dim hover:text-gray-light hover:border-gray-metallic/40'
                    }
                  `}
                >
                  {p === 'all' ? 'Todos' : p === 'high' ? 'Alta' : p === 'medium' ? 'Média' : 'Baixa'}
                </button>
              ))}
            </div>

            <div className="ml-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsCreateEpicOpen(true)}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-primary/40 bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                title="Nova Épica"
              >
                <Plus size={12} />
                <span>Épica</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCreateTaskOpen(true)}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-success/40 bg-success/15 text-success hover:bg-success/25 transition-colors"
                title="Nova Tarefa"
              >
                <Plus size={12} />
                <span>Tarefa</span>
              </button>
            </div>

            {/* Active filter count badge */}
            {(searchQuery || filterPriority !== 'all' || flowEpicStatusFilter || flowTaskStatusFilter) && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-gray-dim hover:text-red-400 transition-colors ml-1"
                title="Limpar filtros"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>
        )}

        {!showFlowGraph && (flowEpicStatusFilter || flowTaskStatusFilter) && (
          <div className="mt-2 ml-8 lg:ml-9 flex flex-wrap items-center gap-2 text-[11px]">
            {flowEpicStatusFilter && (
              <span className="px-2 py-1 rounded-md border border-primary/40 bg-primary/15 text-primary">
                Planejamento: {flowEpicStatusFilter}
              </span>
            )}
            {flowTaskStatusFilter && (
              <span className="px-2 py-1 rounded-md border border-secondary/40 bg-secondary/15 text-secondary">
                Execucao: {flowTaskStatusFilter}
              </span>
            )}
          </div>
        )}
      </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <div style={zoomStyle} className="h-full overflow-visible">

      {/* Kanban or Flow Graph - Toggle View */}
      {!showFlowGraph ? (
      <div className={`flex flex-col ${compactMode ? 'gap-2.5 lg:gap-3.5' : 'gap-4 lg:gap-6'} flex-1 overflow-y-auto pr-1`}>
        {/* PLANNING BOARD - Blueprint Style */}
        <div className="flex flex-col min-h-0">
          <div className={`flex items-center gap-2 ${compactMode ? 'mb-2 lg:mb-2.5 pb-1.5 lg:pb-2' : 'mb-3 lg:mb-4 pb-2 lg:pb-3'} border-b border-primary/20`}>
            <div className="p-1 lg:p-1.5 rounded-md bg-primary/10">
              <LayoutGrid size={16} className="text-primary lg:w-4.5 lg:h-4.5" />
            </div>
            <div>
              <h2 className={`${compactMode ? 'text-sm lg:text-base' : 'text-base lg:text-lg'} font-bold text-text-title`}>Planejamento</h2>
              <p className="text-xs text-gray-light">Gestão Estratégica</p>
            </div>
          </div>

          <div className={`flex ${compactMode ? 'gap-2 lg:gap-2.5 pb-1.5 lg:pb-2' : 'gap-3 lg:gap-4 pb-2 lg:pb-3'} overflow-x-auto flex-1`}>
            {visiblePlanningStatuses.map(({ key, label, icon }) => (
              <KanbanColumnWithDragDrop
                key={key}
                status={key}
                label={label}
                icon={icon}
                items={filterItems(epics[key] || [])}
                type="epic"
                cardStyle="blueprint"
                onDragEnd={(item) => handleDragEnd(item, key as EpicStatus, 'epic')}
                onStatusChange={handleStatusChange}
                onTaskAction={handleTaskAction}
                onEdit={(item) => handleEdit(item, 'epic')}
                onDelete={(item) => handleDeleteRequest(item, 'epic')}
                compactMode={compactMode}
              />
            ))}
          </div>
        </div>

        {/* EXECUTION BOARD - Vivo Style */}
        <div className="flex flex-col min-h-0">
          <div className={`flex items-center gap-2 ${compactMode ? 'mb-2 lg:mb-2.5 pb-1.5 lg:pb-2' : 'mb-3 lg:mb-4 pb-2 lg:pb-3'} border-b border-secondary/20`}>
            <div className="p-1 lg:p-1.5 rounded-md bg-secondary/10">
              <Zap size={16} className="text-secondary lg:w-4.5 lg:h-4.5" />
            </div>
            <div>
              <h2 className={`${compactMode ? 'text-sm lg:text-base' : 'text-base lg:text-lg'} font-bold text-text-title`}>Execução</h2>
              <p className="text-xs text-gray-light">Operacional</p>
            </div>
          </div>

          <div className={`flex ${compactMode ? 'gap-2 lg:gap-2.5 pb-1.5 lg:pb-2' : 'gap-3 lg:gap-4 pb-2 lg:pb-3'} overflow-x-auto flex-1`}>
            {visibleExecutionStatuses.map(({ key, label, icon }) => (
              <KanbanColumnWithDragDrop
                key={key}
                status={key}
                label={label}
                icon={icon}
                items={filterItems(tasks[key] || [])}
                type="task"
                cardStyle="vivo"
                onDragEnd={(item) => handleDragEnd(item, key as TaskStatus, 'task')}
                onStatusChange={handleStatusChange}
                onTaskAction={handleTaskAction}
                onEdit={(item) => handleEdit(item, 'task')}
                onDelete={(item) => handleDeleteRequest(item, 'task')}
                compactMode={compactMode}
              />
            ))}
          </div>
        </div>
      </div>
      ) : (
        /* Flow Graph View */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 border border-primary/20 rounded-lg bg-gradient-to-br from-primary/5 to-transparent p-4 overflow-auto"
        >
          <div className="w-full max-w-6xl mx-auto space-y-6">
            <div className="flex items-center gap-2 text-primary">
              <GitBranch size={16} />
              <h3 className="text-sm font-semibold">Fluxo de trabalho</h3>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-widest text-primary/80">Planejamento (Épicos)</p>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {planningStatuses.map((node, index) => (
                  <React.Fragment key={node.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setFlowEpicStatusFilter(node.key as EpicStatus);
                        setShowFlowGraph(false);
                      }}
                      className="min-w-[150px] rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-left transition-colors hover:bg-primary/20"
                      title={`Filtrar planejamento em ${node.label}`}
                    >
                      <p className="text-[11px] text-gray-light">{node.label}</p>
                      <p className="text-lg font-bold text-primary">{(epics[node.key] || []).length}</p>
                    </button>
                    {index < planningStatuses.length - 1 && <ArrowRight size={14} className="text-primary/70 shrink-0" />}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-widest text-secondary/80">Execução (Tarefas)</p>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {flowExecutionNodes.map((node, index) => (
                  <React.Fragment key={node.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setFlowTaskStatusFilter(node.key);
                        setShowFlowGraph(false);
                      }}
                      className="min-w-[150px] rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-2 text-left transition-colors hover:bg-secondary/20"
                      title={`Filtrar execução em ${node.label}`}
                    >
                      <p className="text-[11px] text-gray-light">{node.label}</p>
                      <p className="text-lg font-bold text-secondary">{node.count}</p>
                    </button>
                    {index < flowExecutionNodes.length - 1 && <ArrowRight size={14} className="text-secondary/70 shrink-0" />}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-metallic/30 bg-black/30 p-3">
              <p className="text-xs text-gray-light">
                Leitura rápida: backlog/refinamento mostram entrada de demanda; fila/processando mostram pressão operacional; concluído/falhou mostram throughput e qualidade.
              </p>
              <p className="text-[11px] text-gray-light mt-2">
                Dica: clique em um nó para abrir o Kanban já filtrado naquele estágio.
              </p>
            </div>
          </div>
        </motion.div>
      )}
      </div>
      </div>
      </div>
    </>
  );
}

interface ColumnProps {
  status: string;
  label: string;
  icon: React.ReactNode;
  items: (Task | Epic)[];
  type: 'epic' | 'task';
  cardStyle: 'blueprint' | 'vivo';
  onDragEnd: (item: Task | Epic) => void;
  onStatusChange: (item: Task | Epic, newStatus: TaskStatus | EpicStatus, type: 'task' | 'epic') => Promise<void>;
  onTaskAction: (task: Task, action: 'execute' | 'complete' | 'fail' | 'retry' | 'viewResult' | 'clarify') => Promise<void>;
  onEdit: (item: Task | Epic) => void;
  onDelete: (item: Task | Epic) => void;
  compactMode: boolean;
}

function KanbanColumnWithDragDrop({
  status,
  label,
  icon,
  items,
  type,
  cardStyle,
  onDragEnd,
  onStatusChange,
  onTaskAction,
  onEdit,
  onDelete,
  compactMode,
}: ColumnProps) {
  const [orderedItems, setOrderedItems] = React.useState(items);
  const [columnCompact, setColumnCompact] = React.useState(false);
  const isProcessing = status === 'processing';
  const effectiveCompact = compactMode || columnCompact;

  React.useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  return (
    <motion.div
      className={`flex-shrink-0 ${effectiveCompact ? 'w-[12.1rem] lg:w-[13.2rem] xl:w-[14.3rem]' : 'w-[15.4rem] lg:w-[17.6rem]'} flex flex-col bg-surface-alt/40 rounded-lg lg:rounded-xl border border-gray-metallic/20 overflow-hidden overflow-x-hidden`}
      whileHover={{ borderColor: 'rgba(0, 242, 255, 0.4)' }}
      transition={{ duration: 0.3 }}
    >
      {/* Column Header */}
      <div
        className={`
          px-3 lg:px-4 py-2 lg:py-3 border-b border-gray-metallic/20 flex items-center gap-2
          ${isProcessing ? 'bg-primary/10' : 'bg-transparent'}
        `}
      >
        <span className="text-primary/70 text-sm lg:text-base">{icon}</span>
        <h3 className="font-semibold text-xs lg:text-sm text-text-title">{label}</h3>
        <button
          onClick={() => setColumnCompact((prev) => !prev)}
          className="ml-auto p-1 rounded border border-gray-metallic/30 text-gray-light hover:text-text-title hover:border-primary/40 transition-colors"
          title={columnCompact ? 'Expandir cards da coluna' : 'Compactar cards da coluna'}
        >
          {columnCompact ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
        </button>
        <motion.span
          className="px-1.5 py-0.5 rounded text-xs font-mono text-gray-light bg-black/30"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          key={items.length}
        >
          {items.length}
        </motion.span>
      </div>

      {/* Cards Container with Reorder */}
      <div className={`overflow-y-auto overflow-x-hidden ${effectiveCompact ? 'px-1.5 lg:px-2 py-2 lg:py-2.5 space-y-1.5 lg:space-y-2' : 'px-2 lg:px-3 py-3 lg:py-4 space-y-2 lg:space-y-3'} max-h-[19rem] lg:max-h-[24rem]`}>
        <Reorder.Group axis="y" values={orderedItems} onReorder={setOrderedItems}>
          <AnimatePresence>
            {orderedItems.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center h-full text-gray-light text-sm"
              >
                <p>Sem itens</p>
              </motion.div>
            ) : (
              orderedItems.map((item) => (
                <Reorder.Item
                  key={item.id}
                  value={item}
                  onDragEnd={() => onDragEnd(item)}
                  className="cursor-move"
                >
                  <DragDropCard 
                    item={item} 
                    type={type} 
                    status={status} 
                    cardStyle={cardStyle}
                    onStatusChange={onStatusChange}
                    onTaskAction={onTaskAction}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    compactMode={effectiveCompact}
                  />
                </Reorder.Item>
              ))
            )}
          </AnimatePresence>
        </Reorder.Group>
      </div>
    </motion.div>
  );
}

interface CardProps {
  item: Task | Epic;
  type: 'epic' | 'task';
  status: string;
  cardStyle: 'blueprint' | 'vivo';
  onStatusChange: (item: Task | Epic, newStatus: TaskStatus | EpicStatus, type: 'task' | 'epic') => Promise<void>;
  onTaskAction: (task: Task, action: 'execute' | 'complete' | 'fail' | 'retry' | 'viewResult' | 'clarify') => Promise<void>;
  onEdit: (item: Task | Epic) => void;
  onDelete: (item: Task | Epic) => void;
  compactMode: boolean;
}

function DragDropCard({ item, type, status, cardStyle, onStatusChange, onTaskAction, onEdit, onDelete, compactMode }: CardProps) {
  const title = 'goal' in item ? item.goal : item.title;
  const priority = item.priority || 'medium';
  const colors = priorityColors[priority as keyof typeof priorityColors];
  const isTask = type === 'task';
  const taskItem = isTask ? (item as Task) : null;
  const isFailedTask = !!taskItem && taskItem.status === 'failed';
  const isHighPriorityTask = !!taskItem && taskItem.priority === 'high' && taskItem.status !== 'completed';

  const toolHints = React.useMemo(() => {
    if (!taskItem) return [] as Array<'search' | 'code' | 'ops'>;
    const text = `${taskItem.title || ''} ${taskItem.description || ''} ${JSON.stringify(taskItem.result || {})}`.toLowerCase();
    const hints: Array<'search' | 'code' | 'ops'> = [];
    if (/(pesquis|search|web|api|http|docs)/.test(text)) hints.push('search');
    if (/(codigo|code|refactor|fix|bug|typescript|python|implement)/.test(text)) hints.push('code');
    if (/(deploy|docker|infra|monitor|orquestra|pipeline|teste|qa)/.test(text)) hints.push('ops');
    return hints.slice(0, 3);
  }, [taskItem]);

  const estimatedCost = React.useMemo(() => {
    if (!taskItem) return null;
    const resultData = taskItem.result as Record<string, unknown> | null | undefined;
    const explicitCost = resultData && typeof resultData.cost_usd === 'number' ? Number(resultData.cost_usd) : null;
    if (explicitCost !== null && Number.isFinite(explicitCost)) {
      return explicitCost.toFixed(4);
    }

    const textSize = `${taskItem.title || ''} ${taskItem.description || ''}`.length;
    const attempts = Math.max(taskItem.attempt_count || 1, 1);
    const complexityFactor = Math.max(1, Math.min(4, textSize / 120));
    const estimate = 0.0009 * complexityFactor * attempts;
    return estimate.toFixed(4);
  }, [taskItem]);

  const getProgressBar = () => {
    if (type === 'epic') {
      const progress = status === 'completed' ? 100 : status === 'approved' ? 75 : 25;
      return progress;
    }
    return null;
  };

  const progress = getProgressBar();

  // Blueprint style for Planning, Vivo style for Execution
  const blueprintClass = cardStyle === 'blueprint' 
    ? 'border-dashed border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-transparent'
    : 'border border-l-4 border-gray-metallic/40 shadow-inner bg-gradient-to-br from-surface/60 to-surface-alt/40';

  const hoverEffect = cardStyle === 'blueprint'
    ? 'hover:shadow-glow-primary hover:border-primary/60'
    : 'hover:shadow-glow-primary hover:border-secondary/60';

  const taskStatusOptions: TaskStatus[] = ['queue', 'processing', 'blocked', 'review', 'completed', 'failed'];
  const epicStatusOptions: EpicStatus[] = ['backlog', 'refinement', 'approved', 'completed', 'failed'];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`
        ${compactMode ? 'p-1.5 lg:p-2' : 'p-2 lg:p-3'} rounded-lg group cursor-grab active:cursor-grabbing overflow-x-hidden
        transition-all duration-300 backdrop-blur-sm
        ${blueprintClass}
        ${hoverEffect}
        ${isFailedTask ? 'bg-red-950/30 border-red-500/40' : ''}
        ${isHighPriorityTask ? 'shadow-[0_0_0_1px_rgba(248,113,113,0.45)]' : ''}
        ${status === 'processing' && cardStyle === 'vivo' ? 'animate-pulse-glow' : ''}
      `}
    >
      {/* Title row with edit/delete buttons */}
      <div className="flex items-start gap-1 mb-2">
        <p className={`flex-1 min-w-0 font-semibold ${compactMode ? 'text-[11px] lg:text-xs' : 'text-xs lg:text-sm'} leading-tight text-text-title group-hover:text-primary transition-colors break-words`}>
          {title}
        </p>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
            className="p-1 rounded hover:bg-primary/20 text-gray-light hover:text-primary transition-colors"
            title="Editar"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item); }}
            className="p-1 rounded hover:bg-red-500/20 text-gray-light hover:text-red-400 transition-colors"
            title="Excluir"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Priority Badge with better contrast */}
      <div className={`${compactMode ? 'flex items-center justify-between mb-1.5 lg:mb-2' : 'flex items-center justify-between mb-2 lg:mb-3'}`}>
        <span className={`${compactMode ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-1.5 lg:px-2 py-0.5'} font-mono font-bold rounded-md ${colors.text} bg-black/40 border border-gray-metallic/20`}>
          {priority.toUpperCase()}
        </span>
        {type === 'task' && status && statusDots[status as keyof typeof statusDots] && (
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full animate-pulse ${statusDots[status as keyof typeof statusDots].color}`} />
            <span className={`${compactMode ? 'text-[10px]' : 'text-xs'} text-gray-light`}>{statusDots[status as keyof typeof statusDots].label}</span>
          </div>
        )}
      </div>

      {/* Epic Badge for Tasks */}
      {type === 'task' && 'epic_goal' in item && item.epic_goal && (
        <div className={`flex items-center gap-1 ${compactMode ? 'mb-1.5' : 'mb-2'} overflow-hidden`}>
          <span className={`${compactMode ? 'text-[9px] lg:text-[10px]' : 'text-[10px] lg:text-xs'} text-primary/70 font-mono truncate max-w-full block`}>
            📎 {item.epic_goal}
          </span>
        </div>
      )}

      {/* Tool + Cost hints */}
      {type === 'task' && taskItem && (
        <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
          <div className="flex items-center gap-1 text-[10px] text-gray-light min-w-0">
            {toolHints.includes('search') && <Globe size={11} className="text-cyan-300" title="Pesquisa/Web" />}
            {toolHints.includes('code') && <Code2 size={11} className="text-violet-300" title="Código" />}
            {toolHints.includes('ops') && <Wrench size={11} className="text-amber-300" title="Ops/QA" />}
            {toolHints.length === 0 && <span className="text-[10px] text-gray-dim">sem ferramentas detectadas</span>}
          </div>
          <span className="text-[10px] font-mono text-emerald-300/90 whitespace-nowrap" title="Custo estimado por tarefa">
            ${estimatedCost}
          </span>
        </div>
      )}

      {/* Progress Bar for Epics */}
      {progress !== null && (
        <motion.div
          className="mb-1 lg:mb-2"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="h-1 lg:h-1.5 rounded-full bg-black/30 overflow-hidden border border-primary/20">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-secondary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-xs text-gray-light mt-1 font-mono">
            {progress === 100 ? '✓ Completo' : `${progress}%`}
          </p>
        </motion.div>
      )}

      {/* Agent Assignment with Avatar */}
      {type === 'task' && 'assigned_to' in item && item.assigned_to && (
        <motion.div
          className="pt-1.5 lg:pt-2 border-t border-gray-metallic/30 text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center gap-1.5 lg:gap-2 min-w-0">
            <div className="w-4 lg:w-5 h-4 lg:h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <User size={10} className="text-primary lg:w-3 lg:h-3" />
            </div>
            <span className="text-gray-lighter font-medium text-xs lg:text-sm truncate block max-w-full">{item.assigned_to}</span>
          </div>
        </motion.div>
      )}

      {/* Execution Time for Tasks */}
      {type === 'task' && item.created_at && (
        <motion.div
          className="pt-1.5 lg:pt-2 flex items-center gap-1 text-xs text-gray-light"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Timer size={10} className="lg:w-3 lg:h-3" />
          <span className="font-mono">~5min</span>
        </motion.div>
      )}

      {type === 'task' && taskItem?.error && (
        <div className="mt-1 mb-1.5 rounded border border-red-500/30 bg-red-950/30 px-2 py-1 text-[10px] text-red-300/90 line-clamp-2">
          {taskItem.error}
        </div>
      )}

      <div className={`${compactMode ? 'pt-1.5 mt-1.5 gap-1.5' : 'pt-2 mt-2 gap-2'} border-t border-gray-metallic/20 flex flex-col`}>
        {type === 'task' && (
          <button
            onClick={() => onTaskAction(item as Task, 'viewResult')}
            className="w-full text-[11px] px-2 py-1 rounded bg-surface/60 border border-gray-metallic/30 text-gray-light hover:text-text-title hover:border-primary/40 transition-colors"
          >
            Ver trace
          </button>
        )}

        {type === 'task' ? (
          <select
            value={(item as Task).status}
            onChange={(e) => onStatusChange(item, e.target.value as TaskStatus, 'task')}
            className="bg-black/40 border border-gray-metallic/40 rounded text-xs px-2 py-1 text-gray-lighter"
          >
            {taskStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={(item as Epic).status}
            onChange={(e) => onStatusChange(item, e.target.value as EpicStatus, 'epic')}
            className="bg-black/40 border border-gray-metallic/40 rounded text-xs px-2 py-1 text-gray-lighter"
          >
            {epicStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}

        {/* Queue → Executar com Claude */}
        {type === 'task' && (item as Task).status === 'queue' && (
          <button
            onClick={() => onTaskAction(item as Task, 'execute')}
            className="w-full text-xs px-2 py-1.5 rounded bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-colors font-medium"
          >
            ▶ Executar com Claude
          </button>
        )}

        {/* Processing → spinner + botões manuais */}
        {type === 'task' && (item as Task).status === 'processing' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-primary/80">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
              <span>Claude executando...</span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => onTaskAction(item as Task, 'complete')}
                className="flex-1 text-xs px-2 py-1 rounded bg-green-500/20 border border-green-500/40 text-green-300 hover:bg-green-500/30 transition-colors"
              >
                ✓ Concluir
              </button>
              <button
                onClick={() => onTaskAction(item as Task, 'fail')}
                className="flex-1 text-xs px-2 py-1 rounded bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-colors"
              >
                ✕ Falhar
              </button>
            </div>
          </div>
        )}

        {/* Completed → Ver resultado */}
        {type === 'task' && (item as Task).status === 'completed' && (item as Task).result && (
          <button
            onClick={() => onTaskAction(item as Task, 'viewResult')}
            className="w-full text-xs px-2 py-1.5 rounded bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors"
          >
            📋 Ver resultado
          </button>
        )}

        {/* Failed → Retry */}
        {type === 'task' && (item as Task).status === 'failed' && (
          <div className="flex gap-1.5">
            <button
              onClick={() => onTaskAction(item as Task, 'viewResult')}
              className="flex-1 text-xs px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Ver erro
            </button>
            <button
              onClick={() => onTaskAction(item as Task, 'retry')}
              className="flex-1 text-xs px-2 py-1 rounded bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-colors"
            >
              ↺ Retry
            </button>
          </div>
        )}

        {/* Blocked → Human-in-the-loop */}
        {type === 'task' && (item as Task).status === 'blocked' && (
          <div className="space-y-1.5">
            {'latest_question' in item && item.latest_question && (
              <p className="text-[10px] text-orange-300/80 line-clamp-2">❓ {item.latest_question}</p>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={() => onStatusChange(item, 'review', 'task')}
                className="flex-1 text-xs px-2 py-1 rounded bg-green-500/20 border border-green-400/40 text-green-300 hover:bg-green-500/30 transition-colors"
              >
                Aprovar
              </button>
              <button
                onClick={() => onStatusChange(item, 'queue', 'task')}
                className="flex-1 text-xs px-2 py-1 rounded bg-yellow-500/20 border border-yellow-400/40 text-yellow-300 hover:bg-yellow-500/30 transition-colors"
              >
                Ajustar
              </button>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => onTaskAction(item as Task, 'clarify')}
                className="flex-1 text-xs px-2 py-1 rounded bg-orange-500/20 border border-orange-400/40 text-orange-300 hover:bg-orange-500/30 transition-colors"
              >
                Responder duvida
              </button>
              <button
                onClick={() => onTaskAction(item as Task, 'retry')}
                className="flex-1 text-xs px-2 py-1 rounded bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-colors"
              >
                Reexecutar
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
