'use client';

import React, { useEffect, useState } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { apiClient } from '@/lib/api';
import { useTaskRealtime, useEpicRealtime } from '@/hooks/useWebRealtime';
import { LayoutGrid, Zap, CheckCircle2, Clock, AlertCircle, User, Timer, Eye, EyeOff } from 'lucide-react';
import { useNotify } from '@/lib/toast';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigned_to?: string;
  epic?: string;
  created_at?: string;
}

interface Epic {
  id: string;
  goal: string;
  status: string;
  priority: string;
  created_at?: string;
}

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
  
  // WebSocket for real-time updates
  const taskWs = useTaskRealtime();
  const epicWs = useEpicRealtime();

  useEffect(() => {
    fetchData();
  }, []);

  // Subscribe to task updates via WebSocket
  useEffect(() => {
    const unsubscribeTasks = taskWs.subscribe('task_updated', (message) => {
      console.log('📡 Task update received:', message);
      // Re-fetch data to get updated list
      fetchData();
    });

    const unsubscribeList = taskWs.subscribe('task_list', (message) => {
      console.log('📡 Task list received:', message);
      if (message.tasks) {
        // Group tasks by status
        const groupedTasks: { [key: string]: Task[] } = {};
        message.tasks.forEach((task: Task) => {
          const status = task.status || 'queue';
          if (!groupedTasks[status]) groupedTasks[status] = [];
          groupedTasks[status].push(task);
        });
        setTasks(groupedTasks);
      }
    });

    return () => {
      unsubscribeTasks();
      unsubscribeList();
    };
  }, [taskWs]);

  // Subscribe to epic updates via WebSocket
  useEffect(() => {
    const unsubscribeEpics = epicWs.subscribe('epic_updated', (message) => {
      console.log('📡 Epic update received:', message);
      fetchData();
    });

    const unsubscribeList = epicWs.subscribe('epics_list', (message) => {
      console.log('📡 Epic list received:', message);
      if (message.epics) {
        const groupedEpics: { [key: string]: Epic[] } = {};
        message.epics.forEach((epic: Epic) => {
          const status = epic.status || 'backlog';
          if (!groupedEpics[status]) groupedEpics[status] = [];
          groupedEpics[status].push(epic);
        });
        setEpics(groupedEpics);
      }
    });

    return () => {
      unsubscribeEpics();
      unsubscribeList();
    };
  }, [epicWs]);

  const fetchData = async () => {
    try {
      const [epicsRes, tasksRes] = await Promise.all([
        apiClient.getEpicsByStatus(),
        apiClient.getTasksByStatus(),
      ]);
      setEpics(epicsRes.data || {});
      setTasks(tasksRes.data || {});
    } catch (error) {
      console.error('Error fetching data:', error);
      notify.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (
    item: Epic | Task,
    newStatus: string,
    type: 'epic' | 'task'
  ) => {
    try {
      notify.loading('Atualizando status...');

      if (type === 'epic') {
        await apiClient.updateEpic(item.id, { status: newStatus });
      } else {
        await apiClient.updateTask(item.id, { status: newStatus });
      }

      notify.success(`Status atualizado para "${newStatus}"`);
      fetchData();
    } catch (error) {
      notify.error('Erro ao atualizar status');
      console.error('Error updating status:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <Zap className="text-primary mx-auto" size={32} />
          </div>
          <p className="text-gray-light">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-5 h-full flex flex-col bg-dark overflow-hidden">
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
      </div>

      {/* Kanban or Flow Graph - Toggle View */}
      {!showFlowGraph ? (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 flex-1 overflow-hidden">
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
                items={epics[key] || []}
                type="epic"
                cardStyle="blueprint"
                onDragEnd={(item) => handleDragEnd(item, key, 'epic')}
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
                items={tasks[key] || []}
                type="task"
                cardStyle="vivo"
                onDragEnd={(item) => handleDragEnd(item, key, 'task')}
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
}

function KanbanColumnWithDragDrop({
  status,
  label,
  icon,
  items,
  type,
  cardStyle,
  onDragEnd,
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
}

function DragDropCard({ item, type, status, cardStyle }: CardProps) {
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
      {/* Title - Improved contrast */}
      <p className="font-semibold text-xs lg:text-sm leading-tight mb-2 text-text-title group-hover:text-primary transition-colors">
        {title}
      </p>

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
    </motion.div>
  );
}
