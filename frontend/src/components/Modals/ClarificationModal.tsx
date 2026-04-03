'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface Clarification {
  id: string;
  question: string;
  status: 'pending' | 'answered' | 'expired';
  created_at: string;
}

interface Task {
  id: string;
  title: string;
}

interface ClarificationModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onAnswered?: () => void;
}

export default function ClarificationModal({ isOpen, task, onClose, onAnswered }: ClarificationModalProps) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [item, setItem] = useState<Clarification | null>(null);
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    if (!isOpen || !task) return;
    setLoading(true);
    apiClient.getTaskClarifications(task.id)
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        const pending = list.find((x: Clarification) => x.status === 'pending') || null;
        setItem(pending);
      })
      .catch(() => setItem(null))
      .finally(() => setLoading(false));
  }, [isOpen, task?.id]);

  const submitAnswer = async () => {
    if (!item || !answer.trim()) return;
    setSending(true);
    try {
      await apiClient.answerClarification(item.id, answer.trim());
      onAnswered?.();
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
          >
            <div className="w-full max-w-xl bg-dark border border-primary/20 rounded-xl shadow-2xl">
              <div className="p-4 border-b border-gray-metallic/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HelpCircle size={16} className="text-yellow-400" />
                  <h3 className="text-sm font-semibold text-text-title">Esclarecimento da IA</h3>
                </div>
                <button onClick={onClose} className="p-1 rounded hover:bg-gray-metallic/20 text-gray-light">
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <p className="text-xs text-gray-light">Tarefa: <span className="text-text-title">{task?.title}</span></p>

                {loading ? (
                  <p className="text-sm text-gray-light">Carregando pergunta...</p>
                ) : !item ? (
                  <p className="text-sm text-gray-light">Nenhuma pergunta pendente.</p>
                ) : (
                  <>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                      <p className="text-xs text-yellow-300 font-mono mb-1">PERGUNTA</p>
                      <p className="text-sm text-yellow-100">{item.question}</p>
                    </div>

                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={4}
                      placeholder="Responda com contexto suficiente para a IA continuar..."
                      className="w-full bg-black/40 border border-gray-metallic/30 rounded-lg p-3 text-sm text-gray-lighter focus:outline-none focus:border-primary/50"
                    />

                    <div className="flex justify-end gap-2">
                      <button onClick={onClose} className="px-3 py-2 text-xs border border-gray-metallic/30 rounded text-gray-light">
                        Cancelar
                      </button>
                      <button
                        onClick={submitAnswer}
                        disabled={sending || !answer.trim()}
                        className="px-3 py-2 text-xs rounded bg-primary/20 border border-primary/40 text-primary disabled:opacity-50"
                      >
                        {sending ? 'Enviando...' : 'Responder e destravar'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
