'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useNotify } from '@/lib/toast';

interface CreateEpicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: EpicFormData) => void;
  onSuccess?: () => void;
}

interface EpicFormData {
  goal: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

export default function CreateEpicModal({
  isOpen,
  onClose,
  onSubmit,
  onSuccess,
}: CreateEpicModalProps) {
  const [formData, setFormData] = useState<EpicFormData>({
    goal: '',
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

    const toastId = notify.loading('Criando épica...');

    try {
      if (onSubmit) {
        // Use custom handler if provided
        await onSubmit(formData);
      } else {
        // Use API client
        await apiClient.createEpic(formData);
      }

      notify.success('Épica criada com sucesso!');
      setFormData({ goal: '', description: '', priority: 'medium' });
      onClose();
      onSuccess?.();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Erro ao criar épica';
      notify.error(errorMsg);
      console.error('Error creating epic:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="animate-slide-in-up w-full max-w-md">
        <div className="glassmorphism-strong rounded-xl border border-primary/30 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-primary/20 bg-primary text-dark flex items-center justify-between">
            <h2 className="text-lg font-bold">+ Nova Épica</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-black/20 rounded transition-colors"
            >
              <X size={20} className="text-dark" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Goal Input */}
            <div>
              <label className="block text-sm font-semibold text-text-title mb-2">
                Objetivo da Épica
              </label>
              <input
                type="text"
                name="goal"
                value={formData.goal}
                onChange={handleChange}
                placeholder="Ex: Implementar sistema de autenticação"
                required
                disabled={loading}
                className="
                  w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                  text-text-default placeholder-gray-light
                  focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:animate-blink-focus
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
                placeholder="Descreva os objetivos e contexto da épica..."
                rows={4}
                disabled={loading}
                className="
                  w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                  text-text-default placeholder-gray-light
                  focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:animate-blink-focus
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
                  focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50
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
                  border-2 border-primary/50 text-primary
                  hover:bg-primary/15 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !formData.goal}
                className="
                  flex-1 px-4 py-2.5 rounded-lg font-bold
                  bg-primary text-dark
                  hover:shadow-glow-primary-lg active:scale-95
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-300
                  border border-primary-light
                "
              >
                {loading ? 'Criando...' : 'Criar Épica'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
