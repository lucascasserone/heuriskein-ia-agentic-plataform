'use client';

import React from 'react';
import { motion } from 'framer-motion';

export function CardSkeleton() {
  return (
    <motion.div
      className="card"
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      <div className="h-4 bg-gradient-to-r from-transparent via-primary/20 to-transparent rounded animate-pulse mb-3" />
      <div className="h-3 bg-gradient-to-r from-transparent via-primary/20 to-transparent rounded w-2/3 animate-pulse mb-2" />
      <div className="h-8 bg-gradient-to-r from-transparent via-primary/20 to-transparent rounded animate-pulse" />
    </motion.div>
  );
}

export function KanbanColumnSkeleton() {
  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-surface-alt/40 rounded-xl border border-gray-metallic/20 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-metallic/20">
        <div className="h-5 bg-gradient-to-r from-transparent via-primary/20 to-transparent rounded animate-pulse w-1/2" />
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 min-h-96">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function DualKanbanSkeleton() {
  return (
    <div className="p-8 h-full flex flex-col bg-dark overflow-hidden">
      {/* Header */}
      <div className="mb-8">
        <div className="h-8 bg-gradient-to-r from-transparent via-primary/20 to-transparent rounded animate-pulse w-1/3 mb-2" />
        <div className="h-4 bg-gradient-to-r from-transparent via-primary/20 to-transparent rounded animate-pulse w-1/4" />
      </div>

      {/* Kanban Boards */}
      <div className="grid grid-cols-2 gap-8 flex-1 overflow-hidden">
        <div className="flex flex-col">
          <div className="mb-4">
            <div className="h-6 bg-gradient-to-r from-transparent via-primary/20 to-transparent rounded animate-pulse w-1/2" />
          </div>
          <div className="flex gap-6 overflow-x-auto pb-4 flex-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <KanbanColumnSkeleton key={i} />
            ))}
          </div>
        </div>
        <div className="flex flex-col">
          <div className="mb-4">
            <div className="h-6 bg-gradient-to-r from-transparent via-primary/20 to-transparent rounded animate-pulse w-1/2" />
          </div>
          <div className="flex gap-6 overflow-x-auto pb-4 flex-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <KanbanColumnSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
