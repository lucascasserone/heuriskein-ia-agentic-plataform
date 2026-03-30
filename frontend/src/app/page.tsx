'use client';

import { useAppStore } from '@/store/appStore';
import LayoutPremium from '@/components/Layout/LayoutPremium';
import DualKanbanDragDrop from '@/components/DualKanbanDragDrop';
import LLMChatInterface from '@/components/LLMChatInterface';

export default function Home() {
  const theme = useAppStore((state) => state.theme);

  return (
    <LayoutPremium>
      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 overflow-hidden p-4 lg:p-6 bg-dark">
        {/* Left: Dual Kanban Board with Drag & Drop */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <DualKanbanDragDrop />
        </div>

        {/* Right: LLM Chat Interface - Phase 2 Feature */}
        <div className="w-full lg:w-96 flex flex-col overflow-hidden">
          <LLMChatInterface />
        </div>
      </div>
    </LayoutPremium>
  );
}
