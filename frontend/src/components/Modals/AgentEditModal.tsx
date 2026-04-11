'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Brain, ChevronDown, Cpu, Eye, EyeOff, Save, Sparkles, X, Zap } from 'lucide-react';
import { AgentItem, AgentProviderOption, apiClient } from '@/lib/api';

interface AgentEditModalProps {
  agent: AgentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (updated: AgentItem) => void;
}

const PROVIDER_META: Record<string, { label: string; color: string; accent: string }> = {
  anthropic: { label: 'Anthropic', color: 'border-orange-400/40 bg-orange-500/10 text-orange-200', accent: 'text-orange-300' },
  openai: { label: 'OpenAI', color: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200', accent: 'text-emerald-300' },
  xai: { label: 'xAI (Grok)', color: 'border-violet-400/40 bg-violet-500/10 text-violet-200', accent: 'text-violet-300' },
  google: { label: 'Google (Gemini)', color: 'border-blue-400/40 bg-blue-500/10 text-blue-200', accent: 'text-blue-300' },
};

const AGENT_TYPES = ['coordinator', 'executor', 'analyst'] as const;

const inputCls =
  'w-full rounded-lg bg-[#060d18] border border-white/10 px-3 py-2 text-xs text-text-default placeholder:text-gray-500 focus:border-primary/60 focus:outline-none transition-colors';

const labelCls = 'block text-[10px] uppercase tracking-wider text-gray-400 mb-1';

export default function AgentEditModal({ agent, isOpen, onClose, onSaved }: AgentEditModalProps) {
  const [draft, setDraft] = useState<Partial<AgentItem>>({});
  const [providers, setProviders] = useState<AgentProviderOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const providerMap = useMemo(() => {
    const map: Record<string, AgentProviderOption> = {};
    providers.forEach((p) => { map[p.id] = p; });
    return map;
  }, [providers]);

  const selectedProvider = (draft.llm_provider as string) || 'anthropic';
  const availableModels = providerMap[selectedProvider]?.models || [];

  useEffect(() => {
    if (!isOpen) return;
    apiClient.getAgentProviders()
      .then((res) => setProviders(res.data?.providers || []))
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!agent || !isOpen) return;
    setDraft({
      id: agent.id,
      name: agent.name,
      organization: agent.organization || 'Geral',
      type: agent.type,
      llm_provider: agent.llm_provider || 'anthropic',
      llm_model: agent.llm_model || agent.model || '',
      llm_version: agent.llm_version || 'latest',
      role_prompt: agent.role_prompt || '',
      context: agent.context || '',
      capabilities: agent.capabilities || [],
    });
    setError('');
    setSuccess(false);
  }, [agent, isOpen]);

  const set = (key: keyof AgentItem, value: unknown) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!agent) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const payload = {
        name: (draft.name || '').trim(),
        organization: (draft.organization || '').trim() || 'Geral',
        type: draft.type,
        llm_provider: draft.llm_provider,
        llm_model: (draft.llm_model || '').trim(),
        llm_version: (draft.llm_version || '').trim() || 'latest',
        role_prompt: draft.role_prompt || '',
        context: draft.context || '',
        capabilities: Array.isArray(draft.capabilities)
          ? draft.capabilities
          : String(draft.capabilities || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
      };
      const res = await apiClient.updateAgent(agent.id, payload);
      setSuccess(true);
      onSaved?.(res.data);
      setTimeout(onClose, 900);
    } catch (err: any) {
      const detail = err?.response?.data;
      if (detail?.non_field_errors) setError(String(detail.non_field_errors));
      else if (detail?.llm_provider) setError(String(detail.llm_provider));
      else if (detail?.llm_model) setError(String(detail.llm_model));
      else setError('Falha ao salvar. Verifique os campos e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !agent) return null;

  const meta = PROVIDER_META[selectedProvider] || PROVIDER_META.anthropic;

  return (
    <div className="fixed inset-0 z-[80] flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <aside className="relative ml-auto flex h-full w-full max-w-[520px] flex-col border-l border-primary/20 bg-[#08101f] shadow-[0_0_48px_rgba(0,0,0,0.8)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <Bot size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-title">{agent.name}</p>
              <p className="text-[10px] text-gray-400">{agent.organization || 'Sem organização'} · {agent.type}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-gray-400 hover:text-text-title transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">

          {/* Identidade */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-cyan-200/70">
              <Sparkles size={11} />
              Identidade
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nome</label>
                <input
                  value={draft.name || ''}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Nome do agente"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Organização</label>
                <input
                  value={draft.organization || ''}
                  onChange={(e) => set('organization', e.target.value)}
                  placeholder="Ex: Marketing, TI"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Tipo / Papel</label>
              <div className="flex gap-2">
                {AGENT_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => set('type', t)}
                    className={[
                      'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors capitalize',
                      draft.type === t
                        ? 'border-primary/50 bg-primary/15 text-primary'
                        : 'border-white/10 bg-white/3 text-gray-400 hover:text-text-default',
                    ].join(' ')}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Capacidades (separadas por vírgula)</label>
              <input
                value={Array.isArray(draft.capabilities) ? draft.capabilities.join(', ') : ''}
                onChange={(e) =>
                  set('capabilities', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
                }
                placeholder="Ex: pesquisa, redação, análise"
                className={inputCls}
              />
            </div>
          </div>

          {/* Modelo de IA */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-cyan-200/70">
              <Cpu size={11} />
              Modelo de IA
            </h3>

            {/* Provider selector */}
            <div>
              <label className={labelCls}>Provedor</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(PROVIDER_META).map(([id, meta]) => (
                  <button
                    key={id}
                    onClick={() => {
                      const firstModel = providerMap[id]?.models?.[0] || '';
                      set('llm_provider', id);
                      set('llm_model', firstModel);
                    }}
                    className={[
                      'rounded-lg border px-3 py-2 text-xs font-medium text-left transition-colors',
                      selectedProvider === id
                        ? meta.color + ' ring-1 ring-white/20'
                        : 'border-white/10 bg-white/3 text-gray-400 hover:text-text-default',
                    ].join(' ')}
                  >
                    {meta.label}
                  </button>
                ))}
              </div>
              {!agent.api_key_configured && (
                <p className="mt-1.5 text-[10px] text-yellow-300/80">
                  ⚠ Chave de API para {meta.label} não configurada em Configurações.
                </p>
              )}
            </div>

            {/* Model select */}
            <div>
              <label className={labelCls}>Modelo</label>
              {availableModels.length > 0 ? (
                <select
                  value={draft.llm_model || ''}
                  onChange={(e) => set('llm_model', e.target.value)}
                  className={inputCls}
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={draft.llm_model || ''}
                  onChange={(e) => set('llm_model', e.target.value)}
                  placeholder="Ex: gpt-4o, claude-3-5-sonnet"
                  className={inputCls}
                />
              )}
            </div>

            {/* Version */}
            <div>
              <label className={labelCls}>Versão / Snapshot</label>
              <input
                value={draft.llm_version || ''}
                onChange={(e) => set('llm_version', e.target.value)}
                placeholder="latest · 2025-01 · 20250401"
                className={inputCls}
              />
            </div>
          </div>

          {/* Função e Contexto */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-cyan-200/70">
              <Brain size={11} />
              Instrução e Contexto
            </h3>

            <div>
              <label className={labelCls}>Função / System Prompt</label>
              <textarea
                value={draft.role_prompt || ''}
                onChange={(e) => set('role_prompt', e.target.value)}
                rows={5}
                placeholder="Descreva a função principal, responsabilidades e tom deste agente..."
                className={inputCls + ' resize-none'}
              />
            </div>

            <div>
              <label className={labelCls}>Contexto Operacional</label>
              <textarea
                value={draft.context || ''}
                onChange={(e) => set('context', e.target.value)}
                rows={3}
                placeholder="Informações de negócio, restrições, dados que este agente deve sempre considerar..."
                className={inputCls + ' resize-none'}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/8 px-5 py-4 space-y-2">
          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              Agente salvo com sucesso!
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/15 bg-white/5 py-2 text-xs text-gray-300 hover:text-text-title transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/15 py-2 text-xs text-primary hover:bg-primary/25 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <>
                  <Zap size={12} className="animate-pulse" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save size={12} />
                  Salvar alterações
                </>
              )}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
