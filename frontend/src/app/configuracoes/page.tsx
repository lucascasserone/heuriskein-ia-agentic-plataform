'use client';

import { useEffect, useState } from 'react';
import LayoutPremium from '@/components/Layout/LayoutPremium';

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

  useEffect(() => {
    const next: Record<string, boolean> = {};
    preferences.forEach((pref) => {
      next[pref.key] = localStorage.getItem(pref.key) === '1';
    });
    setValues(next);
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

  return (
    <LayoutPremium>
      <div className="flex-1 overflow-auto bg-dark p-4 lg:p-5 space-y-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-text-title">Configuracoes</h1>
          <p className="text-xs text-gray-light">Preferencias da interface e comportamento operacional</p>
        </div>

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

        <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4">
          <h2 className="text-sm font-semibold text-text-title mb-2">Governanca HITL</h2>
          <p className="text-xs text-gray-light">
            Proximo passo sugerido: habilitar regras por risco/custo para envio automatico para aprovacao humana.
          </p>
        </div>
      </div>
    </LayoutPremium>
  );
}
