'use client';

import { useEffect, useState } from 'react';
import DualKanbanDragDrop from '@/components/DualKanbanDragDrop';
import LLMChatInterface from '@/components/LLMChatInterface';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function ExecutionWorkspace() {
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatBeforeFocus, setChatBeforeFocus] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('chat_panel_collapsed');
      setChatCollapsed(saved === '1');
    } catch {
      // Ignore localStorage access errors.
    }
  }, []);

  const toggleChatPanel = () => {
    setChatCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('chat_panel_collapsed', next ? '1' : '0');
      } catch {
        // Ignore localStorage access errors.
      }
      return next;
    });
  };

  useEffect(() => {
    const onFocusMode = (evt: Event) => {
      const custom = evt as CustomEvent<{ enabled?: boolean }>;
      const enabled = !!custom?.detail?.enabled;
      if (enabled) {
        setChatBeforeFocus((prev) => (prev === null ? chatCollapsed : prev));
        setChatCollapsed(true);
      } else {
        setChatCollapsed((prev) => (chatBeforeFocus === null ? prev : chatBeforeFocus));
        setChatBeforeFocus(null);
      }
    };

    window.addEventListener('workspace:focus-mode', onFocusMode as EventListener);

    const onPreferenceChanged = (evt: Event) => {
      const custom = evt as CustomEvent<{ key?: string; value?: boolean }>;
      if (custom?.detail?.key === 'chat_panel_collapsed') {
        setChatCollapsed(!!custom.detail.value);
      }
    };

    window.addEventListener('ui:preference-changed', onPreferenceChanged as EventListener);
    return () => {
      window.removeEventListener('workspace:focus-mode', onFocusMode as EventListener);
      window.removeEventListener('ui:preference-changed', onPreferenceChanged as EventListener);
    };
  }, [chatCollapsed, chatBeforeFocus]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-3 lg:gap-4 overflow-hidden p-3 lg:p-4 bg-dark">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <DualKanbanDragDrop />
      </div>

      <div
        className={`
          ${chatCollapsed ? 'w-full lg:w-14' : 'w-full lg:w-[280px] xl:w-[308px]'}
          self-stretch min-h-0 flex flex-col overflow-hidden transition-all duration-300
        `}
      >
        <div className="h-full min-h-0 rounded-xl border border-primary/15 bg-darker/40 backdrop-blur-sm overflow-hidden flex flex-col">
          <div className="h-10 shrink-0 px-2 flex items-center justify-end border-b border-primary/10 bg-surface/60">
            <button
              onClick={toggleChatPanel}
              className="p-1.5 rounded-md border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title={chatCollapsed ? 'Expandir chat' : 'Minimizar chat'}
            >
              {chatCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>

          <div className="flex-1 min-h-0">
            {chatCollapsed ? <div className="h-full" /> : <LLMChatInterface />}
          </div>
        </div>
      </div>
    </div>
  );
}
