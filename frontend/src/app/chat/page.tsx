'use client';

import LayoutPremium from '@/components/Layout/LayoutPremium';
import LLMChatInterface from '@/components/LLMChatInterface';

const quickPrompts = [
  'Crie um epico para melhorar observabilidade da execucao.',
  'Crie uma tarefa para validar acessibilidade do dashboard.',
  'Mostre o status atual das tarefas bloqueadas e proximas a vencer.',
  'Sugira priorizacao das tarefas de maior impacto.',
];

export default function ChatPage() {
  return (
    <LayoutPremium>
      <div className="flex-1 overflow-hidden bg-dark p-4 lg:p-5">
        <div className="h-full grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3">
          <div className="min-h-0">
            <LLMChatInterface />
          </div>

          <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4 overflow-auto">
            <h2 className="text-sm font-semibold text-text-title mb-2">Sugestoes de comando</h2>
            <p className="text-xs text-gray-light mb-3">
              Use estes prompts como base para acelerar operacoes no coordenador.
            </p>
            <div className="space-y-2">
              {quickPrompts.map((prompt) => (
                <div key={prompt} className="text-xs rounded-lg border border-gray-metallic/25 bg-black/20 p-2 text-gray-light">
                  {prompt}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </LayoutPremium>
  );
}
