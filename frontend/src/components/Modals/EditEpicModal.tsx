'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Edit3 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useNotify } from '@/lib/toast';

interface Epic {
  id: string;
  goal: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'backlog' | 'refinement' | 'approved' | 'completed' | 'failed';
}

interface EditEpicModalProps {
  isOpen: boolean;
  epic: Epic | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EditEpicModal({ isOpen, epic, onClose, onSuccess }: EditEpicModalProps) {
  const [formData, setFormData] = useState({
    goal: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    status: 'backlog' as Epic['status'],
  });
  const [loading, setLoading] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    if (epic) {
      setFormData({
        goal: epic.goal || '',
        description: epic.description || '',
        priority: epic.priority || 'medium',
        status: epic.status || 'backlog',
      });
    }
  }, [epic]);

  if (!isOpen || !epic) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!epic) return;
    setLoading(true);

    try {
      await apiClient.updateEpic(epic.id, formData);
      notify.success('Épica atualizada com sucesso!');
      onClose();
      onSuccess?.();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Erro ao atualizar épica';
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
          className="w-full max-w-md glassmorphism-strong rounded-xl border border-primary/30 overflow-hidden"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-primary/20 bg-primary/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Edit3 size={18} className="text-primary" />
              <h2 className="text-lg font-bold text-text-title">Editar Épica</h2>
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
            {/* Goal */}
            <div>
              <label className="block text-sm font-semibold text-text-title mb-2">
                Objetivo
              </label>
              <input
                type="text"
                name="goal"
                value={formData.goal}
                onChange={handleChange}
                placeholder="Ex: Lançar MVP em produção"
                required
                disabled={loading}
                className="
                  w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                  text-text-default placeholder-gray-light
                  focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30
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
                placeholder="Descreva o contexto e critérios de sucesso..."
                rows={3}
                disabled={loading}
                className="
                  w-full px-4 py-2.5 bg-darker border-2 border-gray-metallic/40 rounded-lg
                  text-text-default placeholder-gray-light
                  focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30
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
                    focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30
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
                    focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30
                    transition-all duration-300
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  <option value="backlog">Backlog</option>
                  <option value="refinement">Refinamento</option>
                  <option value="approved">Aprovado</option>
                  <option value="completed">Completado</option>
                  <option value="failed">Falhou</option>
                </select>
              </div>
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
                disabled={loading || !formData.goal}
                className="
                  flex-1 px-4 py-2.5 rounded-lg font-bold text-sm
                  bg-primary text-dark border border-primary-light
                  hover:shadow-glow-primary active:scale-95
                  transition-all duration-300
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {loading ? 'Salvando...' : 'Salvar Épica'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
