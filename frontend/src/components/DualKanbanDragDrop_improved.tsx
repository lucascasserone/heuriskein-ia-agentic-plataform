'use client';

import React, { useEffect, useState } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { apiClient } from '@/lib/api';
import { LayoutGrid, Zap, CheckCircle2, Clock, AlertCircle, User, Timer } from 'lucide-react';
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
  const notify = useNotify();

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

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
    <div className="p-8 h-full flex flex-col bg-dark overflow-hidden">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <motion.div
            className="p-2 rounded-lg glassmorphism"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <LayoutGrid size={24} className="text-primary" />
          </motion.div>
          <h1 className="text-3xl font-bold text-text-title">Orquestração</h1>
        </div>
        <p className="text-gray-light ml-12">Planejamento e Execução em tempo real</p>
      </div>

      <div className="grid grid-cols-2 gap-8 flex-1 overflow-hidden">
        {/* PLANNING BOARD - Blueprint Style */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-primary/20">
            <div className="p-1.5 rounded-md bg-primary/10">
              <LayoutGrid size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-title">Planejamento</h2>
              <p className="text-xs text-gray-light">Gestão Estratégica</p>
            </div>
          </div>

          <div className="flex gap-6 overflow-x-auto pb-4 flex-1">
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
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-secondary/20">
            <div className="p-1.5 rounded-md bg-secondary/10">
              <Zap size={18} className="text-secondary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-title">Execução</h2>
              <p className="text-xs text-gray-light">Operacional</p>
            </div>
          </div>

          <div className="flex gap-6 overflow-x-auto pb-4 flex-1">
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
      className="flex-shrink-0 w-72 flex flex-col bg-surface-alt/40 rounded-xl border border-gray-metallic/20 overflow-hidden"
      whileHover={{ borderColor: 'rgba(0, 242, 255, 0.4)' }}
      transition={{ duration: 0.3 }}
    >
      {/* Column Header */}
      <div
        className={`
          px-4 py-3 border-b border-gray-metallic/20 flex items-center gap-2
          ${isProcessing ? 'bg-primary/10' : 'bg-transparent'}
        `}
      >
        <span className="text-primary/70">{icon}</span>
        <h3 className="font-semibold text-sm text-text-title">{label}</h3>
        <motion.span
          className="ml-auto px-2 py-0.5 rounded text-xs font-mono text-gray-light bg-black/30"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          key={items.length}
        >
          {items.length}
        </motion.span>
      </div>

      {/* Cards Container with Reorder */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 min-h-96">
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
        p-3 rounded-lg group cursor-grab active:cursor-grabbing 
        transition-all duration-300 backdrop-blur-sm
        ${blueprintClass}
        ${hoverEffect}
        ${status === 'processing' && cardStyle === 'vivo' ? 'animate-pulse-glow' : ''}
      `}
    >
      {/* Title - Improved contrast */}
      <p className="font-semibold text-sm leading-tight mb-2 text-text-title group-hover:text-primary transition-colors">
        {title}
      </p>

      {/* Priority Badge with better contrast */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-mono font-bold px-2 py-1 rounded-md ${colors.text} bg-black/40 border border-gray-metallic/20`}>
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
          className="mb-2"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="h-1.5 rounded-full bg-black/30 overflow-hidden border border-primary/20">
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
          className="pt-2 border-t border-gray-metallic/30 text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <User size={12} className="text-primary" />
            </div>
            <span className="text-gray-lighter font-medium">{item.assigned_to}</span>
          </div>
        </motion.div>
      )}

      {/* Execution Time for Tasks */}
      {type === 'task' && item.created_at && (
        <motion.div
          className="pt-2 flex items-center gap-1 text-xs text-gray-light"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Timer size={12} />
          <span className="font-mono">~5min</span>
        </motion.div>
      )}
    </motion.div>
  );
}
