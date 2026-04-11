'use client';

import { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Key, Lock, RefreshCw, X } from 'lucide-react';
import { ProviderCredentialStatus, apiClient } from '@/lib/api';

interface ApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDERS: Array<{
  id: ProviderCredentialStatus['provider'];
  label: string;
  docsUrl: string;
  placeholder: string;
  hint: string;
  color: string;
  border: string;
}> = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    docsUrl: 'https://console.anthropic.com/account/keys',
    placeholder: 'sk-ant-api03-...',
    hint: 'Começa com sk-ant-',
    color: 'text-orange-300',
    border: 'border-orange-400/30',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    docsUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-proj-...',
    hint: 'Começa com sk-proj- ou sk-',
    color: 'text-emerald-300',
    border: 'border-emerald-400/30',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    docsUrl: 'https://console.x.ai/',
    placeholder: 'xai-...',
    hint: 'Começa com xai-',
    color: 'text-violet-300',
    border: 'border-violet-400/30',
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    placeholder: 'AIzaSy...',
    hint: 'Começa com AIzaSy',
    color: 'text-blue-300',
    border: 'border-blue-400/30',
  },
];

const inputCls =
  'flex-1 rounded-lg bg-[#060d18] border border-white/10 px-3 py-2 text-xs text-text-default placeholder:text-gray-500 focus:border-primary/60 focus:outline-none transition-colors font-mono';

export default function ApiKeysModal({ isOpen, onClose }: ApiKeysModalProps) {
  const [credentials, setCredentials] = useState<ProviderCredentialStatus[]>([]);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getProviderCredentialStatus();
      setCredentials(Array.isArray(res.data) ? res.data : []);
    } catch {
      // keep empty
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCredentials();
      setKeyDrafts({});
      setShowKey({});
      setToast('');
    }
  }, [isOpen]);

  const getCredential = (id: ProviderCredentialStatus['provider']) =>
    credentials.find((c) => c.provider === id);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const saveKey = async (providerId: ProviderCredentialStatus['provider']) => {
    const key = (keyDrafts[providerId] || '').trim();
    if (key.length < 16) {
      showToast('Chave muito curta. Verifique e tente novamente.');
      return;
    }
    setSavingProvider(providerId);
    try {
      await apiClient.saveProviderCredential({ provider: providerId, api_key: key });
      setKeyDrafts((prev) => ({ ...prev, [providerId]: '' }));
      await loadCredentials();
      showToast(`Chave da ${PROVIDERS.find((p) => p.id === providerId)?.label} salva com sucesso.`);
    } catch (error: any) {
      const status = error?.response?.status;
      const detail = error?.response?.data?.error || error?.response?.data?.detail;
      if (status === 401) {
        showToast('Sessao nao autenticada para salvar chave. Faça login ou use a chave global de ambiente.');
      } else if (typeof detail === 'string' && detail.trim()) {
        showToast(`Falha ao salvar: ${detail}`);
      } else {
        showToast('Falha ao salvar. Tente novamente.');
      }
    } finally {
      setSavingProvider(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-primary/20 bg-[#08101f] shadow-[0_0_60px_rgba(0,0,0,0.9)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <Key size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-title">Chaves de API</p>
              <p className="text-[10px] text-gray-400">Armazenadas com criptografia Fernet no servidor.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadCredentials}
              disabled={loading}
              className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-gray-400 hover:text-text-title transition-colors disabled:opacity-50"
              title="Atualizar status"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-gray-400 hover:text-text-title transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {/* Security note */}
          <div className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5">
            <Lock size={12} className="mt-0.5 text-primary shrink-0" />
            <p className="text-[10px] text-gray-300 leading-relaxed">
              As chaves são criptografadas com Fernet antes de serem armazenadas. Nunca trafegam em texto plano após o envio.
            </p>
          </div>

          {/* Provider rows */}
          {PROVIDERS.map((provider) => {
            const cred = getCredential(provider.id);
            const isConfigured = cred?.configured ?? false;
            const draft = keyDrafts[provider.id] || '';
            const visible = showKey[provider.id] ?? false;
            const isSaving = savingProvider === provider.id;

            return (
              <div
                key={provider.id}
                className={[
                  'rounded-xl border p-4 space-y-3 transition-colors',
                  isConfigured ? provider.border + ' bg-black/20' : 'border-white/8 bg-black/10',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${provider.color}`}>{provider.label}</p>
                  </div>
                  {isConfigured ? (
                    <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-200">
                      <Check size={10} />
                      Configurada ···{cred?.key_hint}
                    </div>
                  ) : (
                    <div className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-[10px] text-yellow-200">
                      Não configurada
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type={visible ? 'text' : 'password'}
                    value={draft}
                    onChange={(e) =>
                      setKeyDrafts((prev) => ({ ...prev, [provider.id]: e.target.value }))
                    }
                    placeholder={provider.placeholder}
                    className={inputCls}
                    onKeyDown={(e) => e.key === 'Enter' && saveKey(provider.id)}
                  />
                  <button
                    onClick={() => setShowKey((prev) => ({ ...prev, [provider.id]: !visible }))}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:text-text-title transition-colors"
                    title={visible ? 'Ocultar' : 'Mostrar'}
                  >
                    {visible ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    onClick={() => saveKey(provider.id)}
                    disabled={isSaving || !draft}
                    className="px-3 py-2 rounded-lg border border-primary/40 bg-primary/15 text-xs text-primary hover:bg-primary/25 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isSaving ? 'Salvando...' : isConfigured ? 'Atualizar' : 'Salvar'}
                  </button>
                </div>

                <p className="text-[10px] text-gray-500">{provider.hint}</p>
              </div>
            );
          })}
        </div>

        {/* Toast feedback */}
        {toast ? (
          <div className="mx-5 mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}
