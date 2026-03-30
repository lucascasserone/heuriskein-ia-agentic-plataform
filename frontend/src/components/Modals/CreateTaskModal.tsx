'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useNotify } from '@/lib/toast';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: TaskFormData) => void;
  onSuccess?: () => void;
}

interface TaskFormData {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  epic_id?: string;
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  onSubmit,
  onSuccess,
}: CreateTaskModalProps) {
  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    priority: 'medium',
  });
  const [loading, setLoading] = useState(false);
  const notify = useNotify();

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toastId = notify.loading('Criando tarefa...');

    try {
      if (onSubmit) {
        // Use custom handler if provided
        await onSubmit(formData);
      } else {
        // Use API client
        await apiClient.createTask({
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          status: 'queue',
          epic: formData.epic_id || null,
        });
      }

      notify.success('Tarefa criada com sucesso!');
      setFormData({ title: '', description: '', priority: 'medium' });
      onClose();
      onSuccess?.();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Erro ao criar tarefa';
      notify.error(errorMsg);
      console.error('Error creating task:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="animate-slide-in-up w-full max-w-md">
        <div className="glassmorphism-strong rounded-xl border border-success/30 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-success/20 bg-success text-dark flex items-center justify-between">
            <h2 className="text-lg font-bold">+ Nova Tarefa</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-black/20 rounded transition-colors"
            >
              <X size={20} className="text-dark" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Title Input */}
            <div>
              <label className="block text-sm font-semibold text-text-title mb-2">
                Título da Tarefa
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Ex: Implementar autenticação OAuth"
                required
                disabled={loading}
                className="
                  w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                  text-text-default placeholder-gray-light
                  focus:outline-none focus:border-success focus:ring-2 focus:ring-success/50 focus:animate-blink-focus
                  transition-all duration-300
                  disabled:opacity-50 disabled:cursor-not-allowed
                  font-medium
                "
              />
            </div>

            {/* Description Input */}
            <div>
              <label className="block text-sm font-semibold text-text-title mb-2">
                Descrição
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Descreva os requisitos e especificações..."
                rows={4}
                disabled={loading}
                className="
                  w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                  text-text-default placeholder-gray-light
                  focus:outline-none focus:border-success focus:ring-2 focus:ring-success/50 focus:animate-blink-focus
                  transition-all duration-300
                  resize-none
                  disabled:opacity-50 disabled:cursor-not-allowed
                  font-medium
                "
              />
            </div>

            {/* Priority Select */}
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
                  w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                  text-text-default font-medium
                  focus:outline-none focus:border-success focus:ring-2 focus:ring-success/50
                  transition-all duration-300
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="
                  flex-1 px-4 py-2.5 rounded-lg font-bold
                  border-2 border-success/50 text-success
                  hover:bg-success/15 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !formData.title}
                className="
                  flex-1 px-4 py-2.5 rounded-lg font-bold
                  bg-success text-dark
                  hover:shadow-lg hover:shadow-success/50 active:scale-95
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-300
                  border border-success/80
                "
              >
                {loading ? 'Criando...' : 'Criar Tarefa'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
