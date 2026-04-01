'use client';

import React, { useEffect, useState } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { apiClient } from '@/lib/api';
import { LayoutGrid, Zap, CheckCircle2, Clock, AlertCircle, User, Timer, Eye, EyeOff, Pencil, Trash2, Search, X as XIcon } from 'lucide-react';
import { useNotify } from '@/lib/toast';
import EditEpicModal from '@/components/Modals/EditEpicModal';
import EditTaskModal from '@/components/Modals/EditTaskModal';
import ConfirmDeleteModal from '@/components/Modals/ConfirmDeleteModal';

interface Task {
  id: string;
  title: string;
  status: 'queue' | 'processing' | 'review' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  assigned_to?: string;
  epic?: string | null;
  epic_goal?: string;
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
  review: { color: 'bg-orange-400', label: 'Revisão' },
  completed: { color: 'bg-blue-400', label: 'Concluído' },
};

export default function DualKanbanDragDrop() {
  const [epics, setEpics] = useState<{ [key: string]: Epic[] }>({});
  const [tasks, setTasks] = useState<{ [key: string]: Task[] }>({});
  const [loading, setLoading] = useState(true);
  const [showFlowGraph, setShowFlowGraph] = useState(false);
  const notify = useNotify();

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<'all' | 'low' | 'medium' | 'high'>('all');

  // Edit/Delete state
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ item: Task | Epic; type: 'task' | 'epic' } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    let isActive = true;

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
      const [epicsRes, tasksRes] = await Promise.all([
        withTimeout(apiClient.getEpicsByStatus(), 8000),
        withTimeout(apiClient.getTasksByStatus(), 8000),
      ]);
      setEpics(epicsRes.data || {});
      setTasks(tasksRes.data || {});
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
  const filterItems = <T extends Task | Epic>(items: T[]): T[] => {
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

  const handleTaskAction = async (task: Task, action: 'execute' | 'complete' | 'fail') => {
    try {
      if (action === 'execute') {
        await apiClient.executeTask(task.id);
      } else if (action === 'complete') {
        await apiClient.completeTask(task.id, { completed_by: 'ui' });
      } else {
        await apiClient.failTask(task.id, 'Falha registrada via UI');
      }

      await fetchData();
      notify.success('Tarefa atualizada com sucesso');
    } catch (error: any) {
      const detail = error?.response?.data?.error || 'Não foi possível executar a ação';
      notify.error(detail);
    }
  };

  return (
    <>
      <EditEpicModal
        isOpen={!!editingEpic}
        epic={editingEpic}
        onClose={() => setEditingEpic(null)}
        onSuccess={() => {
          setEditingEpic(null);
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
      <div className="p-4 lg:p-5 h-full flex flex-col bg-dark overflow-hidden">
      {loading && (
        <div className="mb-3 text-xs text-gray-light flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span>Carregando dados...</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-4 lg:mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 lg:gap-3">
            <motion.div
              className="p-1.5 lg:p-2 rounded-lg glassmorphism"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <LayoutGrid size={20} className="text-primary lg:w-6 lg:h-6" />
            </motion.div>
            <h1 className="text-xl lg:text-2xl font-bold text-text-title">Orquestração</h1>
          </div>
          {/* Flow Graph Toggle */}
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
        <p className="text-xs lg:text-sm text-gray-light ml-8 lg:ml-9">{showFlowGraph ? 'Fluxo de Trabalho' : 'Planejamento e Execução em tempo real'}</p>

        {/* Search + Priority Filter */}
        {!showFlowGraph && (
          <div className="flex items-center gap-2 mt-3">
            {/* Search box */}
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-light pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar épicas e tarefas…"
                className="
                  w-full pl-8 pr-8 py-1.5 text-xs bg-surface border border-gray-metallic/30 rounded-lg
                  text-text-default placeholder-gray-dim
                  focus:outline-none focus:border-primary/60 transition-colors
                "
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

            {/* Active filter count badge */}
            {(searchQuery || filterPriority !== 'all') && (
              <button
                onClick={() => { setSearchQuery(''); setFilterPriority('all'); }}
                className="text-xs text-gray-dim hover:text-red-400 transition-colors ml-1"
                title="Limpar filtros"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Kanban or Flow Graph - Toggle View */}
      {!showFlowGraph ? (
      <div className="flex flex-col gap-4 lg:gap-6 flex-1 overflow-hidden">
        {/* PLANNING BOARD - Blueprint Style */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-3 lg:mb-4 pb-2 lg:pb-3 border-b border-primary/20">
            <div className="p-1 lg:p-1.5 rounded-md bg-primary/10">
              <LayoutGrid size={16} className="text-primary lg:w-4.5 lg:h-4.5" />
            </div>
            <div>
              <h2 className="text-base lg:text-lg font-bold text-text-title">Planejamento</h2>
              <p className="text-xs text-gray-light">Gestão Estratégica</p>
            </div>
          </div>

          <div className="flex gap-3 lg:gap-4 overflow-x-auto pb-2 lg:pb-3 flex-1">
            {planningStatuses.map(({ key, label, icon }) => (
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
              />
            ))}
          </div>
        </div>

        {/* EXECUTION BOARD - Vivo Style */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-3 lg:mb-4 pb-2 lg:pb-3 border-b border-secondary/20">
            <div className="p-1 lg:p-1.5 rounded-md bg-secondary/10">
              <Zap size={16} className="text-secondary lg:w-4.5 lg:h-4.5" />
            </div>
            <div>
              <h2 className="text-base lg:text-lg font-bold text-text-title">Execução</h2>
              <p className="text-xs text-gray-light">Operacional</p>
            </div>
          </div>

          <div className="flex gap-3 lg:gap-4 overflow-x-auto pb-2 lg:pb-3 flex-1">
            {executionStatuses.map(({ key, label, icon }) => (
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
              />
            ))}
          </div>
        </div>
      </div>
      ) : (
        /* Flow Graph Placeholder */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 flex items-center justify-center border border-primary/20 rounded-lg bg-gradient-to-br from-primary/5 to-transparent"
        >
          <div className="text-center">
            <Zap size={32} className="text-primary mx-auto mb-3 animate-glow-icon" />
            <p className="text-gray-light">Fluxo de trabalho</p>
            <p className="text-xs text-gray-dim mt-1">Visualização de grafo - Em desenvolvimento</p>
          </div>
        </motion.div>
      )}
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
  onTaskAction: (task: Task, action: 'execute' | 'complete' | 'fail') => Promise<void>;
  onEdit: (item: Task | Epic) => void;
  onDelete: (item: Task | Epic) => void;
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
}: ColumnProps) {
  const [orderedItems, setOrderedItems] = React.useState(items);
  const isProcessing = status === 'processing';

  React.useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  return (
    <motion.div
      className="flex-shrink-0 w-56 lg:w-64 flex flex-col bg-surface-alt/40 rounded-lg lg:rounded-xl border border-gray-metallic/20 overflow-hidden"
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
        <motion.span
          className="ml-auto px-1.5 py-0.5 rounded text-xs font-mono text-gray-light bg-black/30"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          key={items.length}
        >
          {items.length}
        </motion.span>
      </div>

      {/* Cards Container with Reorder */}
      <div className="flex-1 overflow-y-auto px-2 lg:px-3 py-3 lg:py-4 space-y-2 lg:space-y-3 min-h-80 lg:min-h-96">
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
  onTaskAction: (task: Task, action: 'execute' | 'complete' | 'fail') => Promise<void>;
  onEdit: (item: Task | Epic) => void;
  onDelete: (item: Task | Epic) => void;
}

function DragDropCard({ item, type, status, cardStyle, onStatusChange, onTaskAction, onEdit, onDelete }: CardProps) {
  const title = 'goal' in item ? item.goal : item.title;
  const priority = item.priority || 'medium';
  const colors = priorityColors[priority as keyof typeof priorityColors];

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

  const taskStatusOptions: TaskStatus[] = ['queue', 'processing', 'review', 'completed', 'failed'];
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
        p-2 lg:p-3 rounded-lg group cursor-grab active:cursor-grabbing 
        transition-all duration-300 backdrop-blur-sm
        ${blueprintClass}
        ${hoverEffect}
        ${status === 'processing' && cardStyle === 'vivo' ? 'animate-pulse-glow' : ''}
      `}
    >
      {/* Title row with edit/delete buttons */}
      <div className="flex items-start gap-1 mb-2">
        <p className="flex-1 font-semibold text-xs lg:text-sm leading-tight text-text-title group-hover:text-primary transition-colors">
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
      <div className="flex items-center justify-between mb-2 lg:mb-3">
        <span className={`text-xs font-mono font-bold px-1.5 lg:px-2 py-0.5 rounded-md ${colors.text} bg-black/40 border border-gray-metallic/20`}>
          {priority.toUpperCase()}
        </span>
        {type === 'task' && status && statusDots[status as keyof typeof statusDots] && (
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full animate-pulse ${statusDots[status as keyof typeof statusDots].color}`} />
            <span className="text-xs text-gray-light">{statusDots[status as keyof typeof statusDots].label}</span>
          </div>
        )}
      </div>

      {/* Epic Badge for Tasks */}
      {type === 'task' && 'epic_goal' in item && item.epic_goal && (
        <div className="flex items-center gap-1 mb-2 overflow-hidden">
          <span className="text-[10px] lg:text-xs text-primary/70 font-mono truncate max-w-full">
            📎 {item.epic_goal}
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
          <div className="flex items-center gap-1.5 lg:gap-2">
            <div className="w-4 lg:w-5 h-4 lg:h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <User size={10} className="text-primary lg:w-3 lg:h-3" />
            </div>
            <span className="text-gray-lighter font-medium text-xs lg:text-sm">{item.assigned_to}</span>
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

      <div className="pt-2 mt-2 border-t border-gray-metallic/20 flex flex-col gap-2">
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

        {type === 'task' && (item as Task).status === 'queue' && (
          <button
            onClick={() => onTaskAction(item as Task, 'execute')}
            className="text-xs px-2 py-1 rounded bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30"
          >
            Executar
          </button>
        )}

        {type === 'task' && (item as Task).status === 'processing' && (
          <div className="flex gap-2">
            <button
              onClick={() => onTaskAction(item as Task, 'complete')}
              className="flex-1 text-xs px-2 py-1 rounded bg-green-500/20 border border-green-500/40 text-green-300 hover:bg-green-500/30"
            >
              Concluir
            </button>
            <button
              onClick={() => onTaskAction(item as Task, 'fail')}
              className="flex-1 text-xs px-2 py-1 rounded bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30"
            >
              Falhar
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
