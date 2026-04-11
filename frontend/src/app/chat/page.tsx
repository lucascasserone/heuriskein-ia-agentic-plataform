'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import LayoutPremium from '@/components/Layout/LayoutPremium';
import LLMChatInterface from '@/components/LLMChatInterface';

const quickPrompts = [
  'Crie um epico para melhorar observabilidade da execucao.',
  'Crie uma tarefa para validar acessibilidade do dashboard.',
  'Criar brief: Revisão do lançamento Q2; área: Marketing; iniciativa: Expansão SMB.',
  'Executar playbook: incident-response; área: TI; iniciativa: API 500.',
  'Mostre o status atual das tarefas bloqueadas e proximas a vencer.',
  'Sugira priorizacao das tarefas de maior impacto.',
];

function ChatPageContent() {
  const searchParams = useSearchParams();

  const chatSeed = useMemo(() => {
    const q = searchParams.get('q') || '';
    const area = searchParams.get('area') || '';
    const initiative = searchParams.get('initiative') || '';
    const taskId = searchParams.get('task_id') || '';
    const epicId = searchParams.get('epic_id') || '';
    const playbookId = searchParams.get('playbook_id') || '';
    const playbook = searchParams.get('playbook') || playbookId;

    const context: Record<string, unknown> = {
      area: area || undefined,
      initiative: initiative || undefined,
      task_id: taskId || undefined,
      epic_id: epicId || undefined,
      playbook_id: playbookId || undefined,
      playbook_hint: playbook || undefined,
      source: 'chat-page-query',
    };

    const prefill = q || (playbook ? `Executar playbook: ${playbook}; área: ${area || 'operations'}; iniciativa: ${initiative || playbook}.` : '');

    return {
      prefill,
      context,
    };
  }, [searchParams]);

  return (
    <div className="flex-1 overflow-hidden bg-dark p-4 lg:p-5">
      <div className="h-full grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3">
        <div className="min-h-0">
          <LLMChatInterface initialPrompt={chatSeed.prefill} initialContext={chatSeed.context} />
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
  );
}

export default function ChatPage() {
  return (
    <LayoutPremium>
      <Suspense fallback={<div className="flex-1 overflow-hidden bg-dark p-4 lg:p-5 text-sm text-gray-light">Carregando contexto do chat...</div>}>
        <ChatPageContent />
      </Suspense>
    </LayoutPremium>
  );
}
