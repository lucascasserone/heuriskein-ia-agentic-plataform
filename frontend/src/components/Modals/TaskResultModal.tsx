'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot, CheckCircle2, AlertCircle, Clock, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface TaskResult {
  análise?: string;
  execução?: string;
  resultado?: string;
  próximos_passos?: string;
  raw?: string;
}

interface ThoughtLog {
  id: string;
  message: string;
  level: string;
  timestamp: string;
  agent_name?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  result?: TaskResult | null;
  error?: string;
  attempt_count?: number;
  started_at?: string;
  completed_at?: string;
}

interface TaskResultModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onRetry?: () => void;
}

const levelColors: Record<string, string> = {
  info: 'text-blue-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-green-400',
};

function Section({ title, content }: { title: string; content?: string }) {
  if (!content) return null;
  return (
    <div className="mb-4">
      <h4 className="text-xs font-mono text-primary/70 uppercase tracking-widest mb-1.5">{title}</h4>
      <div className="bg-black/40 border border-gray-metallic/20 rounded-lg p-3 text-sm text-gray-lighter whitespace-pre-wrap leading-relaxed">
        {content}
      </div>
    </div>
  );
}

export default function TaskResultModal({ isOpen, task, onClose, onRetry }: TaskResultModalProps) {
  const [logs, setLogs] = useState<ThoughtLog[]>([]);
  const [tab, setTab] = useState<'result' | 'logs'>('result');

  useEffect(() => {
    if (!isOpen || !task) return;
    setTab('result');
    setLogs([]);

    apiClient.getTaskLogs(task.id)
      .then((res) => {
        const data = res.data;
        setLogs(Array.isArray(data) ? data : data.results || []);
      })
      .catch(() => setLogs([]));
  }, [isOpen, task?.id]);

  if (!task) return null;

  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';
  const isProcessing = task.status === 'processing';

  const result = task.result as TaskResult | null;
  const hasStructuredResult = result && (result.resultado || result.análise);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel — slides in from right */}
          <motion.div
            className="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-dark border-l border-gray-metallic/30 shadow-2xl flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-gray-metallic/20 shrink-0">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  {isCompleted && <CheckCircle2 size={14} className="text-green-400 shrink-0" />}
                  {isFailed && <AlertCircle size={14} className="text-red-400 shrink-0" />}
                  {isProcessing && (
                    <span className="w-3 h-3 rounded-full bg-primary animate-pulse shrink-0" />
                  )}
                  <span className={`text-xs font-mono uppercase tracking-widest ${
                    isCompleted ? 'text-green-400' : isFailed ? 'text-red-400' : 'text-primary'
                  }`}>
                    {isCompleted ? 'Concluída' : isFailed ? 'Falhou' : 'Processando...'}
                  </span>
                  <span className="text-xs text-gray-dim font-mono">#{task.attempt_count}</span>
                </div>
                <h2 className="text-sm font-semibold text-text-title truncate">{task.title}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded hover:bg-gray-metallic/20 text-gray-light hover:text-white transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-metallic/20 shrink-0">
              {(['result', 'logs'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-5 py-2.5 text-xs font-mono tracking-wide transition-colors border-b-2 ${
                    tab === t
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-light hover:text-gray-lighter'
                  }`}
                >
                  {t === 'result' ? 'Resultado' : `Logs (${logs.length})`}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'result' && (
                <>
                  {isProcessing && (
                    <div className="flex flex-col items-center justify-center h-40 gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
                      <span className="text-sm text-gray-light">Executando com Claude...</span>
                    </div>
                  )}

                  {isFailed && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <p className="text-xs text-red-400 font-mono mb-1">ERRO</p>
                      <p className="text-sm text-red-300">{task.error || 'Erro desconhecido'}</p>
                    </div>
                  )}

                  {isCompleted && !hasStructuredResult && result?.raw && (
                    <div className="bg-black/40 border border-gray-metallic/20 rounded-lg p-4 text-sm text-gray-lighter whitespace-pre-wrap leading-relaxed">
                      {result.raw}
                    </div>
                  )}

                  {isCompleted && hasStructuredResult && (
                    <>
                      <Section title="Análise" content={result?.análise} />
                      <Section title="Execução" content={result?.execução} />
                      <Section title="Resultado" content={result?.resultado} />
                      <Section title="Próximos Passos" content={result?.próximos_passos} />
                    </>
                  )}

                  {!isProcessing && !isCompleted && !isFailed && (
                    <p className="text-sm text-gray-light text-center mt-8">Sem resultado disponível.</p>
                  )}
                </>
              )}

              {tab === 'logs' && (
                <div className="space-y-2">
                  {logs.length === 0 && (
                    <p className="text-sm text-gray-light text-center mt-8">
                      {isProcessing ? 'Aguardando logs...' : 'Sem logs disponíveis.'}
                    </p>
                  )}
                  {logs.map((log) => (
                    <div key={log.id} className="flex gap-3 group">
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${
                          log.level === 'error' ? 'bg-red-400' :
                          log.level === 'warning' ? 'bg-yellow-400' :
                          log.level === 'success' ? 'bg-green-400' : 'bg-primary'
                        }`} />
                        <div className="w-px flex-1 bg-gray-metallic/20 mt-1" />
                      </div>
                      <div className="pb-3 min-w-0">
                        <p className="text-xs text-gray-lighter leading-relaxed">{log.message}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {log.agent_name && (
                            <span className="text-[10px] text-gray-dim font-mono">{log.agent_name}</span>
                          )}
                          <span className="text-[10px] text-gray-dim/60 font-mono">
                            {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {(isFailed || isCompleted) && (
              <div className="p-4 border-t border-gray-metallic/20 shrink-0 flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs rounded border border-gray-metallic/40 text-gray-light hover:text-white transition-colors"
                >
                  Fechar
                </button>
                {isFailed && onRetry && (
                  <button
                    onClick={() => { onRetry(); onClose(); }}
                    className="px-4 py-2 text-xs rounded bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-colors"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
