'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Edit3 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useNotify } from '@/lib/toast';

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'queue' | 'processing' | 'blocked' | 'review' | 'completed' | 'failed';
  epic?: string | null;
}

interface EpicOption {
  id: string;
  goal: string;
}

interface EditTaskModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EditTaskModal({ isOpen, task, onClose, onSuccess }: EditTaskModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    status: 'queue' as Task['status'],
    epic: '' as string | null,
  });
  const [epics, setEpics] = useState<EpicOption[]>([]);
  const [loading, setLoading] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        priority: task.priority || 'medium',
        status: task.status || 'queue',
        epic: task.epic || '',
      });
    }
  }, [task]);

  useEffect(() => {
    if (!isOpen) return;
    apiClient.getEpics()
      .then((res) => {
        const epicList = res.data?.results || res.data || [];
        setEpics(epicList);
      })
      .catch(() => setEpics([]));
  }, [isOpen]);

  if (!isOpen || !task) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    setLoading(true);

    try {
      await apiClient.updateTask(task.id, {
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        status: formData.status,
        epic: formData.epic || null,
      });
      notify.success('Tarefa atualizada com sucesso!');
      onClose();
      onSuccess?.();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Erro ao atualizar tarefa';
      notify.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-md glassmorphism-strong rounded-xl border border-success/30 overflow-hidden"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-success/20 bg-success/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Edit3 size={18} className="text-success" />
              <h2 className="text-lg font-bold text-text-title">Editar Tarefa</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
            >
              <X size={18} className="text-gray-light" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-text-title mb-2">
                Título
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Ex: Implementar autenticação"
                required
                disabled={loading}
                className="
                  w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                  text-text-default placeholder-gray-light
                  focus:outline-none focus:border-success focus:ring-2 focus:ring-success/30
                  transition-all duration-300
                  disabled:opacity-50 disabled:cursor-not-allowed font-medium
                "
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-text-title mb-2">
                Descrição
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Especificações e requisitos..."
                rows={3}
                disabled={loading}
                className="
                  w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                  text-text-default placeholder-gray-light
                  focus:outline-none focus:border-success focus:ring-2 focus:ring-success/30
                  transition-all duration-300 resize-none
                  disabled:opacity-50 disabled:cursor-not-allowed font-medium
                "
              />
            </div>

            {/* Priority + Status row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-text-title mb-2">
                  Prioridade
                </label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  disabled={loading}
                  className="
                    w-full px-3 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                    text-text-default font-medium
                    focus:outline-none focus:border-success focus:ring-2 focus:ring-success/30
                    transition-all duration-300
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-title mb-2">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  disabled={loading}
                  className="
                    w-full px-3 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                    text-text-default font-medium
                    focus:outline-none focus:border-success focus:ring-2 focus:ring-success/30
                    transition-all duration-300
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  <option value="queue">Fila</option>
                  <option value="processing">Processando</option>
                  <option value="blocked">Aprovação</option>
                  <option value="review">QA</option>
                  <option value="completed">Finalizado</option>
                  <option value="failed">Falhou</option>
                </select>
              </div>
            </div>

            {/* Epic selector */}
            <div>
              <label className="block text-sm font-semibold text-text-title mb-2">
                Épica vinculada
              </label>
              <select
                name="epic"
                value={formData.epic || ''}
                onChange={handleChange}
                disabled={loading}
                className="
                  w-full px-3 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                  text-text-default font-medium
                  focus:outline-none focus:border-success focus:ring-2 focus:ring-success/30
                  transition-all duration-300
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                <option value="">Sem épica</option>
                {epics.map((epic) => (
                  <option key={epic.id} value={epic.id}>
                    {epic.goal}
                  </option>
                ))}
              </select>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="
                  flex-1 px-4 py-2.5 rounded-lg font-bold text-sm
                  border-2 border-gray-metallic/40 text-gray-light
                  hover:bg-white/5 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !formData.title}
                className="
                  flex-1 px-4 py-2.5 rounded-lg font-bold text-sm
                  bg-success text-dark border border-success/80
                  hover:shadow-lg hover:shadow-success/30 active:scale-95
                  transition-all duration-300
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {loading ? 'Salvando...' : 'Salvar Tarefa'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
