'use client';

import { useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Edge,
  MarkerType,
  Node,
  Position,
} from 'reactflow';
import { AlertTriangle } from 'lucide-react';
import { OrgTaskNode } from '@/lib/api';
import AgentDetailModal from './AgentDetailModal';

interface LiveOrgChartProps {
  taskTree: Record<string, OrgTaskNode>;
  rootTaskId?: string;
  agentProfiles?: Record<string, {
    id: string;
    name: string;
    state: string;
    model: string;
    type: string;
    capabilities: string[];
    level: 'ceo' | 'director' | 'head' | 'analyst';
  }>;
  chatHistoryByTaskId: Record<string, Array<{ role: 'user' | 'agent'; content: string; timestamp: string }>>;
  onSendMessage: (task: OrgTaskNode, content: string) => Promise<void>;
}

const LEVEL_ORDER: Array<OrgTaskNode['level']> = ['ceo', 'director', 'head', 'analyst'];
const LEVEL_Y: Record<OrgTaskNode['level'], number> = {
  ceo: 40,
  director: 210,
  head: 380,
  analyst: 550,
};

const STATUS_STYLE: Record<OrgTaskNode['status'], string> = {
  queued: 'border-gray-metallic/40 bg-surface/40 text-gray-light',
  in_progress: 'border-primary/50 bg-primary/10 text-primary shadow-glow-primary',
  awaiting_approval: 'border-yellow-400/50 bg-yellow-500/10 text-yellow-300',
  approved: 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300',
  rejected: 'border-red-500/45 bg-red-500/10 text-red-300',
  done: 'border-secondary/45 bg-secondary/10 text-secondary',
};

function TaskFlowCard({ task }: { task: OrgTaskNode }) {
  return (
    <div className={[
      'w-[250px] rounded-xl border p-3 text-left transition-all',
      STATUS_STYLE[task.status],
    ].join(' ')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider opacity-80">{task.level}</p>
          <h3 className="text-xs font-semibold text-text-title line-clamp-1">{task.title}</h3>
        </div>
        {task.status === 'rejected' && task.approval_notes ? (
          <span title={task.approval_notes}>
            <AlertTriangle size={14} className="text-red-300" />
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] text-gray-light line-clamp-2">{task.objective}</p>
      <div className="mt-2 flex items-center justify-between text-[10px] text-gray-light">
        <span>C: {task.complexity}</span>
        <span>{task.status}</span>
      </div>
    </div>
  );
}

export default function LiveOrgChart({
  taskTree,
  rootTaskId,
  agentProfiles,
  chatHistoryByTaskId,
  onSendMessage,
}: LiveOrgChartProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const byLevel: Record<OrgTaskNode['level'], OrgTaskNode[]> = {
      ceo: [],
      director: [],
      head: [],
      analyst: [],
    };

    Object.values(taskTree || {}).forEach((task) => {
      byLevel[task.level].push(task);
    });

    LEVEL_ORDER.forEach((level) => {
      byLevel[level].sort((a, b) => a.title.localeCompare(b.title));
    });

    return byLevel;
  }, [taskTree]);

  const flowNodes = useMemo<Node[]>(() => {
    const byLevelIndex: Record<OrgTaskNode['level'], number> = {
      ceo: 0,
      director: 0,
      head: 0,
      analyst: 0,
    };

    return Object.values(taskTree || {}).map((task) => {
      const index = byLevelIndex[task.level]++;
      const x = 120 + index * 290;
      const y = LEVEL_Y[task.level];
      return {
        id: task.id,
        data: {
          label: <TaskFlowCard task={task} />,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        position: { x, y },
      };
    });
  }, [taskTree]);

  const flowEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    Object.values(taskTree || {}).forEach((task) => {
      if (!task.parent_id || !taskTree[task.parent_id]) return;
      const parent = taskTree[task.parent_id];
      const animated = parent.status === 'in_progress' || task.status === 'in_progress' || task.status === 'awaiting_approval';
      edges.push({
        id: `${task.parent_id}-${task.id}`,
        source: task.parent_id,
        target: task.id,
        animated,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        style: {
          stroke: animated ? '#00F2FF' : '#4A5568',
          strokeWidth: animated ? 2.2 : 1.4,
          filter: animated ? 'drop-shadow(0 0 8px rgba(0,242,255,0.6))' : 'none',
        },
      });
    });
    return edges;
  }, [taskTree]);

  const selectedTask = selectedTaskId ? taskTree[selectedTaskId] || null : null;
  const selectedChatHistory = selectedTaskId ? (chatHistoryByTaskId[selectedTaskId] || []) : [];

  return (
    <>
      <div className="rounded-xl border border-gray-metallic/25 bg-surface/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-title">Organograma vivo</h2>
          <p className="text-xs text-gray-light">Root task: {rootTaskId || '-'}</p>
        </div>

        <div className="h-[640px] rounded-xl border border-primary/15 bg-darker/60 overflow-hidden mb-3">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => setSelectedTaskId(node.id)}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background color="#1f2937" gap={16} size={1} />
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
          {LEVEL_ORDER.map((level) => (
            <section key={level} className="rounded-lg border border-gray-metallic/25 bg-dark/45 p-3">
              <header className="mb-3 flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-wider text-gray-light">{level}</h3>
                <span className="text-[11px] text-primary">{grouped[level].length}</span>
              </header>

              <div className="space-y-2">
                {grouped[level].length === 0 ? (
                  Object.values(agentProfiles || {}).filter((item) => item.level === level).length > 0 ? (
                    Object.values(agentProfiles || {})
                      .filter((item) => item.level === level)
                      .map((agent) => (
                        <div key={agent.id} className="rounded-md border border-gray-metallic/20 bg-surface/30 p-2 text-[11px]">
                          <p className="text-text-title font-semibold">{agent.name}</p>
                          <p className="text-gray-light">Status: {agent.state}</p>
                          <p className="text-gray-light/80 line-clamp-1">{agent.model || 'model n/a'}</p>
                        </div>
                      ))
                  ) : (
                    <div className="rounded-md border border-gray-metallic/20 bg-surface/30 p-2 text-[11px] text-gray-light">
                      Sem tarefas neste nivel.
                    </div>
                  )
                ) : (
                  grouped[level].map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className="w-full rounded-md border border-gray-metallic/20 bg-surface/30 p-2 text-left text-[11px] hover:border-primary/35"
                    >
                      <p className="text-text-title font-semibold line-clamp-1">{task.title}</p>
                      <p className="text-gray-light">{task.status}</p>
                    </button>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </div>

      <AgentDetailModal
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTaskId(null)}
        task={selectedTask}
        chatHistory={selectedChatHistory}
        onSendMessage={onSendMessage}
      />
    </>
  );
}
