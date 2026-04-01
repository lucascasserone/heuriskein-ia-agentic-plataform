'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDeleteModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Excluir',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
      >
        <motion.div
          className="w-full max-w-sm glassmorphism-strong rounded-xl border border-red-500/40 overflow-hidden"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-red-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/30">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <h2 className="text-base font-bold text-text-title">Confirmar Exclusão</h2>
            </div>
            <button
              onClick={onCancel}
              disabled={loading}
              className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
            >
              <X size={18} className="text-gray-light" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            <p className="text-sm font-semibold text-text-title mb-1">{title}</p>
            {description && (
              <p className="text-xs text-gray-light mt-1">{description}</p>
            )}
            <p className="text-xs text-red-400 mt-3 font-mono">
              ⚠ Esta ação não pode ser desfeita.
            </p>
          </div>

          {/* Actions */}
          <div className="px-6 pb-5 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
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
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="
                flex-1 px-4 py-2.5 rounded-lg font-bold text-sm
                bg-red-600 text-white border border-red-500
                hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/30
                active:scale-95 transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {loading ? 'Excluindo...' : confirmLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
