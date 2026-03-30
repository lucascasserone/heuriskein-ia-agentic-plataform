'use client';

import React, { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { Terminal, X } from 'lucide-react';

const logLevelColors = {
  debug: 'text-blue-400',
  info: 'text-green-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
};

const logLevelIcons = {
  debug: '🔍',
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
};

export default function LogsConsole() {
  const [logs, clearLogs] = useAppStore((state) => [
    state.logs,
    state.clearLogs,
  ]);

  // Scroll to bottom when new logs arrive
  useEffect(() => {
    const logsContainer = document.getElementById('logs-container');
    if (logsContainer) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-darker">
        <div className="flex items-center gap-2 text-accent">
          <Terminal size={20} />
          <h3 className="font-bold text-sm">Logs de Pensamento</h3>
        </div>
        <button
          onClick={clearLogs}
          className="p-1 hover:bg-gray-700 rounded transition"
          title="Limpar logs"
        >
          <X size={16} />
        </button>
      </div>

      {/* Logs */}
      <div
        id="logs-container"
        className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs"
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            Nenhum log ainda. Aguardando agentes...
          </div>
        ) : (
          logs.map((log, idx) => (
            <LogEntry key={idx} log={log} />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2 text-xs text-gray-500 border-t border-gray-700 bg-darker">
        {logs.length} logs carregados
      </div>
    </div>
  );
}

interface LogEntry {
  id?: string;
  agent_name?: string;
  agent?: string;
  message: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  timestamp?: string;
  context?: any;
}

function LogEntry({ log }: { log: LogEntry }) {
  const levelColor = logLevelColors[log.level] || logLevelColors.info;
  const levelIcon = logLevelIcons[log.level] || '•';
  const agentName = log.agent_name || log.agent || 'System';
  const timestamp = log.timestamp
    ? new Date(log.timestamp).toLocaleTimeString()
    : new Date().toLocaleTimeString();

  return (
    <div className={`${levelColor} break-words`}>
      <span className="text-gray-600">[{timestamp}]</span>
      <span className="ml-2">{levelIcon}</span>
      <span className="ml-2 text-gray-400">{agentName}</span>
      <span className="ml-2">{log.message}</span>
    </div>
  );
}
