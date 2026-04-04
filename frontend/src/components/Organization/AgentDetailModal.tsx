'use client';

import { FormEvent, useState } from 'react';
import { Send, X } from 'lucide-react';
import { OrgTaskNode } from '@/lib/api';

interface AgentMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

interface AgentDetailModalProps {
  open: boolean;
  onClose: () => void;
  task: OrgTaskNode | null;
  chatHistory: AgentMessage[];
  onSendMessage: (task: OrgTaskNode, content: string) => Promise<void>;
}

export default function AgentDetailModal({
  open,
  onClose,
  task,
  chatHistory,
  onSendMessage,
}: AgentDetailModalProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  if (!open || !task) return null;

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      await onSendMessage(task, message.trim());
      setMessage('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
      <div className="w-full max-w-4xl rounded-xl border border-primary/30 bg-darker">
        <div className="flex items-center justify-between border-b border-primary/20 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-text-title">{task.title}</h2>
            <p className="text-xs text-gray-light">Agente responsavel: {task.agent_id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md border border-gray-metallic/30 text-gray-light hover:text-text-title"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4 max-h-[70vh] overflow-auto">
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-text-title mb-2">Historico de execucao</h3>
            <div className="space-y-2">
              {task.execution_logs.length === 0 ? (
                <p className="text-xs text-gray-light">Sem logs ainda.</p>
              ) : (
                task.execution_logs.map((log, idx) => (
                  <div key={`${task.id}-log-${idx}`} className="rounded-md border border-gray-metallic/25 bg-surface/40 p-2 text-xs text-gray-light">
                    {log}
                  </div>
                ))
              )}
            </div>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button className="rounded-md border border-primary/35 bg-primary/10 px-3 py-2 text-xs text-primary hover:bg-primary/20">
                Delegar subtarefa
              </button>
              <button className="rounded-md border border-yellow-400/35 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300 hover:bg-yellow-500/20">
                Solicitar aprovacao
              </button>
              <button className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20">
                Rejeitar com feedback
              </button>
              <button className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20">
                Marcar como concluido
              </button>
            </section>

            {task.approval_notes ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                <p className="font-semibold mb-1">Feedback de rejeicao</p>
                <p>{task.approval_notes}</p>
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-xl border border-gray-metallic/25 bg-surface/30 p-3">
            <h3 className="text-sm font-semibold text-text-title">Microgerenciar (chat do agente)</h3>
            <p className="text-xs text-gray-light">
              Converse com este agente para orientar a execucao e entender decisoes em tempo real.
            </p>

            <div className="h-72 overflow-auto space-y-2 rounded-md border border-gray-metallic/25 bg-dark/35 p-2">
              {chatHistory.length === 0 ? (
                <p className="text-xs text-gray-light">Sem mensagens ainda.</p>
              ) : (
                chatHistory.map((item, idx) => (
                  <div
                    key={`${task.id}-chat-${idx}`}
                    className={[
                      'rounded-md px-2 py-1.5 text-xs',
                      item.role === 'user'
                        ? 'bg-primary/10 border border-primary/25 text-primary'
                        : 'bg-surface/60 border border-gray-metallic/30 text-text-default',
                    ].join(' ')}
                  >
                    <p className="font-semibold mb-1">{item.role === 'user' ? 'Voce' : 'Agente'}</p>
                    <p>{item.content}</p>
                    <p className="opacity-60 mt-1">{item.timestamp}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSend} className="flex items-center gap-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex: detalhe o plano para reduzir risco de compliance"
                className="flex-1 rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-xs text-text-default"
              />
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className="inline-flex items-center gap-1 rounded-md border border-secondary/40 bg-secondary/10 px-3 py-2 text-xs text-secondary hover:bg-secondary/20 disabled:opacity-50"
              >
                <Send size={13} />
                Enviar
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
