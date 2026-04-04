'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard runtime error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-dark text-white flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-xl border border-red-500/35 bg-surface/70 p-5 space-y-3">
        <h2 className="text-base font-semibold text-text-title">Falha ao carregar dashboard</h2>
        <p className="text-sm text-gray-light">
          Ocorreu um erro de runtime na pagina. Use o botao abaixo para tentar novamente.
        </p>
        <div className="text-xs text-gray-light/80 break-all">
          {error?.message || 'Erro desconhecido'}
        </div>
        <button
          onClick={reset}
          className="px-3 py-2 rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-sm"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
