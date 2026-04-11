'use client';

import { useEffect, useState } from 'react';
import { Bot, Key, Pencil, Trash2 } from 'lucide-react';
import LayoutPremium from '@/components/Layout/LayoutPremium';
import AgentEditModal from '@/components/Modals/AgentEditModal';
import ApiKeysModal from '@/components/Modals/ApiKeysModal';
import { AgentItem, apiClient } from '@/lib/api';

interface ToggleItem {
  key: string;
  title: string;
  description: string;
}

const preferences: ToggleItem[] = [
  {
    key: 'kanban_compact_mode',
    title: 'Layout denso no Kanban',
    description: 'Mostra mais cards por coluna para operacao intensiva.',
  },
  {
    key: 'chat_panel_collapsed',
    title: 'Chat recolhido por padrao',
    description: 'Abre a area de execucao com foco no Kanban.',
  },
  {
    key: 'left_sidebar_collapsed',
    title: 'Menu lateral compacto',
    description: 'Reduz largura da barra lateral para ganhar area util.',
  },
];

export default function ConfiguracoesPage() {
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [editingAgent, setEditingAgent] = useState<AgentItem | null>(null);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);

  const loadAgents = async () => {
    try {
      const res = await apiClient.getAgents();
      const list = (res.data as any)?.results || res.data || [];
      setAgents(Array.isArray(list) ? list : []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const next: Record<string, boolean> = {};
    preferences.forEach((pref) => {
      next[pref.key] = localStorage.getItem(pref.key) === '1';
    });
    setValues(next);
    loadAgents();
  }, []);

  const togglePreference = (key: string) => {
    setValues((prev) => {
      const nextValue = !prev[key];
      localStorage.setItem(key, nextValue ? '1' : '0');
      window.dispatchEvent(
        new CustomEvent('ui:preference-changed', {
          detail: { key, value: nextValue },
        })
      );
      return { ...prev, [key]: nextValue };
    });
  };

  const startEditAgent = (agent: AgentItem) => {
    setEditingAgent(agent);
  };

  const deleteAgent = async (agent: AgentItem) => {
    const ok = window.confirm(`Excluir o agente "${agent.name}"? Esta ação não pode ser desfeita.`);
    if (!ok) return;

    setDeletingAgentId(agent.id);
    try {
      await apiClient.deleteAgent(agent.id);
      if (editingAgent?.id === agent.id) {
        setEditingAgent(null);
      }
      await loadAgents();
    } catch {
      window.alert('Falha ao excluir agente. Tente novamente.');
    } finally {
      setDeletingAgentId(null);
    }
  };

  return (
    <LayoutPremium>
      <div className="flex-1 overflow-auto bg-dark p-4 lg:p-5 space-y-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-text-title">Configurações</h1>
          <p className="text-xs text-gray-light">
            Gerencie preferências de interface, chaves de API e configurações dos agentes.
          </p>
        </div>

        {/* Interface preferences */}
        <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-title">Interface</h2>
          {preferences.map((pref) => (
            <div key={pref.key} className="flex items-center justify-between gap-3 rounded-lg border border-gray-metallic/20 bg-black/20 p-3">
              <div>
                <p className="text-sm text-text-title font-medium">{pref.title}</p>
                <p className="text-xs text-gray-light">{pref.description}</p>
              </div>
              <button
                onClick={() => togglePreference(pref.key)}
                className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                  values[pref.key]
                    ? 'border-primary/40 bg-primary/20 text-primary'
                    : 'border-gray-metallic/40 bg-surface/50 text-gray-light'
                }`}
              >
                {values[pref.key] ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          ))}
        </div>

        {/* API Keys — quick access card */}
        <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                <Key size={16} className="text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-title">Chaves de API</h2>
                <p className="text-xs text-gray-light">Anthropic · OpenAI · xAI · Google — armazenadas com criptografia.</p>
              </div>
            </div>
            <button
              onClick={() => setShowApiKeys(true)}
              className="px-4 py-2 rounded-lg border border-primary/40 bg-primary/15 text-xs text-primary hover:bg-primary/25 transition-colors"
            >
              Gerenciar chaves
            </button>
          </div>
        </div>

        {/* Agents */}
        <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
                <Bot size={16} className="text-cyan-300" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-title">Agentes</h2>
                <p className="text-xs text-gray-light">Edite organização, função, contexto e modelo de IA de cada agente.</p>
              </div>
            </div>
          </div>

          {agents.length === 0 ? (
            <p className="text-xs text-gray-light pl-1">Nenhum agente cadastrado.</p>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-black/20 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-text-title font-medium">{agent.name}</p>
                    <p className="text-xs text-gray-400">
                      {agent.organization || 'Geral'} · {agent.type} · {agent.llm_provider || 'anthropic'}: {agent.llm_model || agent.model}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => startEditAgent(agent)}
                      className="flex items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Pencil size={11} />
                      Editar
                    </button>
                    <button
                      onClick={() => deleteAgent(agent)}
                      disabled={deletingAgentId === agent.id}
                      className="flex items-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={11} />
                      {deletingAgentId === agent.id ? 'Excluindo...' : 'Excluir'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AgentEditModal
        agent={editingAgent}
        isOpen={editingAgent !== null}
        onClose={() => setEditingAgent(null)}
        onSaved={() => { loadAgents(); setEditingAgent(null); }}
      />

      <ApiKeysModal
        isOpen={showApiKeys}
        onClose={() => setShowApiKeys(false)}
      />
    </LayoutPremium>
  );
}
