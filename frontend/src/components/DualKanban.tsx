'use client';

import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { apiClient } from '@/lib/api';
import { LayoutGrid, Zap, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigned_to?: string;
  epic?: string;
}

interface Epic {
  id: string;
  goal: string;
  status: string;
  priority: string;
}

// Planning Board (Epics)
const planningStatuses = [
  { key: 'backlog', label: 'Backlog', icon: <Clock size={16} /> },
  { key: 'refinement', label: 'Refinamento', icon: <AlertCircle size={16} /> },
  { key: 'approved', label: 'Aprovado', icon: <CheckCircle2 size={16} /> },
  { key: 'completed', label: 'Completado', icon: <CheckCircle2 size={16} /> },
];

// Execution Board (Tasks)
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

export default function DualKanban() {
  const [epics, setEpics] = useState<{ [key: string]: Epic[] }>({});
  const [tasks, setTasks] = useState<{ [key: string]: Task[] }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    // Poll for updates every 5 seconds
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 h-full flex flex-col bg-dark overflow-hidden">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg glassmorphism">
            <LayoutGrid size={24} className="text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-gradient-primary">Command Center</h1>
        </div>
        <p className="text-gray-light ml-12">Orquestração em tempo real de Épicas e Tarefas</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="text-center">
            <div className="animate-spin mb-4">
              <Zap className="text-primary mx-auto" size={32} />
            </div>
            <p className="text-gray-light">Carregando dados...</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-8 flex-1 overflow-hidden">
          {/* ===== PLANNING BOARD (LEFT) ===== */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-primary/20">
              <div className="p-1.5 rounded-md bg-primary/10">
                <LayoutGrid size={18} className="text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Planejamento</h2>
                <p className="text-xs text-gray-dim">Gestão Estratégica</p>
              </div>
            </div>

            <div className="flex gap-6 overflow-x-auto pb-4 flex-1">
              {planningStatuses.map(({ key, label, icon }) => (
                <KanbanColumn
                  key={key}
                  status={key}
                  label={label}
                  icon={icon}
                  items={epics[key] || []}
                  type="epic"
                />
              ))}
            </div>
          </div>

          {/* ===== EXECUTION BOARD (RIGHT) ===== */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-secondary/20">
              <div className="p-1.5 rounded-md bg-secondary/10">
                <Zap size={18} className="text-secondary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Execução</h2>
                <p className="text-xs text-gray-dim">Operacional</p>
              </div>
            </div>

            <div className="flex gap-6 overflow-x-auto pb-4 flex-1">
              {executionStatuses.map(({ key, label, icon }) => (
                <KanbanColumn
                  key={key}
                  status={key}
                  label={label}
                  icon={icon}
                  items={tasks[key] || []}
                  type="task"
                />
              ))}
            </div>
          </div>
        </div>
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
}

function KanbanColumn({ status, label, icon, items, type }: ColumnProps) {
  const isProcessing = status === 'processing';

  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-surface-alt/40 rounded-xl border border-gray-metallic/20 overflow-hidden">
      {/* Column Header */}
      <div
        className={`
          px-4 py-3 border-b border-gray-metallic/20 flex items-center gap-2
          ${isProcessing ? 'bg-primary/10' : 'bg-transparent'}
        `}
      >
        <span className="text-primary/70">{icon}</span>
        <h3 className="font-semibold text-sm">{label}</h3>
        <span className="ml-auto px-2 py-0.5 rounded text-xs font-mono text-gray-light bg-black/30">
          {items.length}
        </span>
      </div>

      {/* Cards Container */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 min-h-96">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-dim text-sm">
            <p>Sem itens</p>
          </div>
        ) : (
          items.map((item) => (
            <KanbanCard
              key={item.id}
              item={item}
              type={type}
              isProcessing={isProcessing}
              status={status}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface CardProps {
  item: Task | Epic;
  type: 'epic' | 'task';
  isProcessing: boolean;
  status: string;
}

function KanbanCard({ item, type, isProcessing, status }: CardProps) {
  const title = 'goal' in item ? item.goal : item.title;
  const priority = item.priority || 'medium';
  const colors = priorityColors[priority as keyof typeof priorityColors];

  const getProgressBar = () => {
    if (type === 'epic') {
      const epic = item as Epic;
      // Mock progress calculation
      const progress = status === 'completed' ? 100 : status === 'approved' ? 75 : 25;
      return progress;
    }
    return null;
  };

  const progress = getProgressBar();

  return (
    <div
      className={`
        card group cursor-move transition-all duration-300
        ${colors.bg} ${colors.border} border-l-4
        ${isProcessing ? 'pulse-border' : ''}
        hover:shadow-glow-primary-lg
      `}
    >
      {/* Title */}
      <p className="font-medium text-sm leading-tight mb-2 group-hover:text-primary transition-colors">
        {title}
      </p>

      {/* Priority Badge */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-mono px-2 py-1 rounded-md ${colors.text} bg-black/30`}>
          {priority.toUpperCase()}
        </span>
        {type === 'epic' && 'assigned_to' in item && (
          <span className="text-xs text-gray-dim">ID: {item.id?.slice(0, 8)}</span>
        )}
      </div>

      {/* Progress Bar for Epics */}
      {progress !== null && (
        <div className="mb-2">
          <div className="h-1 rounded-full bg-black/30 overflow-hidden">
            <div
              className="h-full bg-gradient-neon transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-dim mt-1">
            {progress === 100 ? '✓ Completo' : `${progress}%`}
          </p>
        </div>
      )}

      {/* Agent Assignment (for Tasks) */}
      {type === 'task' && 'assigned_to' in item && item.assigned_to && (
        <div className="pt-2 border-t border-gray-metallic/20 text-xs text-gray-light">
          Agente: {item.assigned_to}
        </div>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="mt-2 pt-2 border-t border-primary/20 text-xs text-primary animate-pulse">
          ⚡ Processando...
        </div>
      )}
    </div>
  );
}
