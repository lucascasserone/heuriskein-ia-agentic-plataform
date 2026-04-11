'use client';

import { useEffect, useMemo, useState } from 'react';

function withCacheBust(url: string) {
  const base = url || window.location.href;
  const next = new URL(base, window.location.origin);
  next.searchParams.set('reload', Date.now().toString());
  return next.toString();
}

export default function ChunkRecoveryToast() {
  const [failedSrc, setFailedSrc] = useState('');

  useEffect(() => {
    const onChunkFailure = (event: Event) => {
      const detail = (event as CustomEvent<{ src?: string }>).detail;
      setFailedSrc(detail?.src || 'recurso principal da interface');
    };

    window.addEventListener('app:chunk-load-failed', onChunkFailure as EventListener);
    return () => {
      window.removeEventListener('app:chunk-load-failed', onChunkFailure as EventListener);
    };
  }, []);

  const displaySrc = useMemo(() => {
    if (!failedSrc) return '';
    try {
      const parsed = new URL(failedSrc, window.location.origin);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return failedSrc;
    }
  }, [failedSrc]);

  if (!failedSrc) return null;

  return (
    <div className="fixed left-3 right-3 top-3 z-[9999] rounded-xl border border-amber-300/40 bg-[#2a1b09]/95 p-3 text-amber-100 shadow-[0_10px_35px_rgba(0,0,0,0.4)] md:left-auto md:right-4 md:top-4 md:w-[520px]">
      <p className="text-sm font-semibold">Falha ao carregar recursos da interface</p>
      <p className="mt-1 text-xs text-amber-100/85">
        Detectamos uma falha de asset ({displaySrc}). Isso pode ocorrer após restart do dev server ou cache antigo no navegador.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => {
            sessionStorage.removeItem('chunk-reload-attempted');
            window.location.assign(withCacheBust(window.location.href));
          }}
          className="rounded-md border border-amber-200/45 bg-amber-300/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-300/25"
        >
          Recarregar página
        </button>
        <button
          onClick={() => setFailedSrc('')}
          className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white/85 hover:bg-white/10"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
