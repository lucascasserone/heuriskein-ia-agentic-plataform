'use client';

import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { apiClient } from '@/lib/api';
import { LayoutGrid, Plus } from 'lucide-react';

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

const taskStatuses = ['queue', 'processing', 'review', 'completed', 'failed'];
const epicStatuses = ['backlog', 'refinement', 'approved', 'completed', 'failed'];

const priorityColors = {
  low: 'border-l-4 border-blue-500',
  medium: 'border-l-4 border-yellow-500',
  high: 'border-l-4 border-red-500',
};

const statusColors = {
  queue: 'bg-gray-600',
  processing: 'bg-blue-500',
  review: 'bg-yellow-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  backlog: 'bg-gray-600',
  refinement: 'bg-purple-500',
  approved: 'bg-blue-500',
};

export default function KanbanBoard() {
  const [tasks, setTasks] = useState<{ [key: string]: Task[] }>({});
  const [epics, setEpics] = useState<{ [key: string]: Epic[] }>({});
  const [view, setView] = useState<'epics' | 'tasks'>('epics');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [view]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (view === 'epics') {
        const response = await apiClient.getEpicsByStatus();
        setEpics(response.data);
      } else {
        const response = await apiClient.getTasksByStatus();
        setTasks(response.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statuses = view === 'epics' ? epicStatuses : taskStatuses;
  const data = view === 'epics' ? epics : tasks;

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <LayoutGrid size={24} className="text-accent" />
          <h2 className="text-2xl font-bold">Kanban Board</h2>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setView('epics')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              view === 'epics'
                ? 'bg-accent text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Épicos
          </button>
          <button
            onClick={() => setView('tasks')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              view === 'tasks'
                ? 'bg-accent text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Tarefas
          </button>
        </div>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <p className="text-gray-400">Carregando...</p>
        </div>
      ) : (
        <div className="flex gap-6 overflow-x-auto pb-4">
          {statuses.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              items={data[status] || []}
              view={view}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ColumnProps {
  status: string;
  items: any[];
  view: 'epics' | 'tasks';
}

function KanbanColumn({ status, items, view }: ColumnProps) {
  const statusName =
    {
      queue: 'Fila',
      processing: 'Processando',
      review: 'Revisão',
      completed: 'Completado',
      failed: 'Falhou',
      backlog: 'Backlog',
      refinement: 'Refinamento',
      approved: 'Aprovado',
    }[status] || status;

  return (
    <div className="flex-shrink-0 w-80 bg-gray-700 rounded-lg p-4 flex flex-col max-h-96">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${statusColors[status as keyof typeof statusColors]}`}
          />
          <h3 className="font-bold text-sm">{statusName}</h3>
        </div>
        <span className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded">
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {items.length === 0 ? (
          <div className="text-gray-400 text-xs text-center py-8">
            Nenhum {view === 'epics' ? 'épico' : 'tarefa'}
          </div>
        ) : (
          items.map((item) => (
            <Card
              key={item.id}
              item={item}
              view={view}
              priority={item.priority}
            />
          ))
        )}
      </div>

      {/* Add Button */}
      <button className="mt-3 w-full py-2 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-accent hover:text-accent transition text-sm flex items-center justify-center gap-2">
        <Plus size={16} /> Adicionar
      </button>
    </div>
  );
}

interface CardProps {
  item: any;
  view: 'epics' | 'tasks';
  priority?: string;
}

function Card({ item, view, priority }: CardProps) {
  const title = view === 'epics' ? item.goal : item.title;
  const priorityClass =
    priorityColors[priority as keyof typeof priorityColors] || '';

  return (
    <div
      className={`bg-gray-600 rounded-lg p-3 cursor-pointer hover:bg-gray-500 transition ${priorityClass}`}
    >
      <p className="font-medium text-sm line-clamp-2">{title}</p>
      {item.description && (
        <p className="text-xs text-gray-300 mt-1 line-clamp-1">
          {item.description}
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        {item.assigned_to && (
          <span className="text-xs bg-gray-700 px-2 py-1 rounded">
            {item.assigned_to}
          </span>
        )}
        {priority && (
          <span className="text-xs text-gray-300">
            {priority === 'low' ? '🟢' : priority === 'medium' ? '🟡' : '🔴'}
          </span>
        )}
      </div>
    </div>
  );
}
