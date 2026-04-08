'use client';

import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Edge,
  MarkerType,
  Node,
  Position,
} from 'reactflow';
import { AlertTriangle, Brain, Briefcase, Crown, Sparkles, Wrench } from 'lucide-react';
import { OrgTaskNode } from '@/lib/api';

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
  selectedTaskId?: string | null;
  onSelectTask?: (taskId: string | null) => void;
  onOpenFactory?: () => void;
}

const LEVEL_ORDER: Array<OrgTaskNode['level']> = ['ceo', 'director', 'head', 'analyst'];
const LEVEL_X: Record<OrgTaskNode['level'], number> = {
  ceo: 110,
  director: 390,
  head: 670,
  analyst: 950,
};

const ROLE_ICON: Record<OrgTaskNode['level'], any> = {
  ceo: Crown,
  director: Briefcase,
  head: Brain,
  analyst: Wrench,
};

const STATUS_STYLE: Record<OrgTaskNode['status'], string> = {
  queued: 'border-gray-metallic/40 bg-surface/40 text-gray-light',
  in_progress: 'border-primary/50 bg-primary/10 text-primary shadow-glow-primary',
  awaiting_approval: 'border-yellow-400/50 bg-yellow-500/10 text-yellow-300',
  approved: 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300',
  rejected: 'border-red-500/45 bg-red-500/10 text-red-300',
  done: 'border-secondary/45 bg-secondary/10 text-secondary',
};

const FLOW_PRO_OPTIONS = { hideAttribution: true };
const FLOW_DEFAULT_EDGE_OPTIONS = { type: 'smoothstep' as const };

function statusNarrative(task: OrgTaskNode) {
  if (task.status === 'in_progress') return 'Decompondo missao...';
  if (task.status === 'awaiting_approval') return 'Aguardando validacao';
  if (task.status === 'queued') return 'Aguardando fila';
  if (task.status === 'approved' || task.status === 'done') return 'Fluxo concluido';
  return 'Replanejar com feedback';
}

function statusShort(task: OrgTaskNode) {
  if (task.status === 'in_progress') return 'Pensando...';
  if (task.status === 'awaiting_approval') return 'Delegando...';
  if (task.status === 'queued') return 'Na fila';
  if (task.status === 'approved' || task.status === 'done') return 'Concluido';
  return 'Revisar';
}

function TaskFlowCard({
  task,
  isSelected,
  agentName,
}: {
  task: OrgTaskNode;
  isSelected: boolean;
  agentName: string;
}) {
  const isThinking = task.status === 'in_progress' || task.status === 'awaiting_approval';
  const RoleIcon = ROLE_ICON[task.level];
  const missionTokens = Math.max(18, task.complexity * 18);
  const childCount = task.children?.length || 0;

  return (
    <div className={[
      'w-[182px] rounded-lg border p-2.5 text-left transition-all backdrop-blur-md',
      'bg-[#0f172a]/85 shadow-[0_8px_22px_rgba(15,23,42,0.55)]',
      STATUS_STYLE[task.status],
      isSelected ? 'ring-2 ring-cyan-300/70 shadow-[0_0_16px_rgba(34,211,238,0.45)]' : '',
    ].join(' ')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-cyan-200/90">
            <RoleIcon size={11} />
            <span>{task.level}</span>
          </div>
          <h3 className="text-[11px] font-semibold text-text-title line-clamp-1">{agentName || task.title}</h3>
        </div>
        <span className="rounded border border-cyan-300/40 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-200">{missionTokens} tk</span>
        {task.status === 'rejected' && task.approval_notes ? (
          <span title={task.approval_notes}>
            <AlertTriangle size={14} className="text-red-300" />
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[10px] text-gray-light line-clamp-2">{task.objective}</p>
      <p className="mt-1 text-[10px] text-cyan-100/75 line-clamp-1">{statusNarrative(task)}</p>
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <span className="text-gray-light">{statusShort(task)}</span>
        {isThinking ? <span className="h-2 w-2 rounded-full bg-primary animate-pulse" /> : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[9px] text-gray-light">
        <span>Sub: {childCount}</span>
        <span>C: {task.complexity}</span>
      </div>
    </div>
  );
}

export default function LiveOrgChart({
  taskTree,
  rootTaskId,
  agentProfiles,
  selectedTaskId,
  onSelectTask,
  onOpenFactory,
}: LiveOrgChartProps) {
  const flowNodes = useMemo<Node[]>(() => {
    const byLevelIndex: Record<OrgTaskNode['level'], number> = {
      ceo: 0,
      director: 0,
      head: 0,
      analyst: 0,
    };

    return Object.values(taskTree || {}).map((task) => {
      const index = byLevelIndex[task.level]++;
      const x = LEVEL_X[task.level];
      const y = 120 + index * 158;
      const agentName = agentProfiles?.[task.agent_id]?.name || task.title;
      return {
        id: task.id,
        data: {
          label: <TaskFlowCard task={task} isSelected={selectedTaskId === task.id} agentName={agentName} />,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        position: { x, y },
      };
    });
  }, [taskTree, selectedTaskId, agentProfiles]);

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

  const levelStats = useMemo(() => {
    const counts: Record<OrgTaskNode['level'], number> = {
      ceo: 0,
      director: 0,
      head: 0,
      analyst: 0,
    };
    Object.values(taskTree || {}).forEach((task) => {
      counts[task.level] += 1;
    });
    return counts;
  }, [taskTree]);

  return (
    <div className="rounded-xl border border-gray-metallic/25 bg-surface/30 p-3 h-[72vh] min-h-[620px]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text-title">Organograma vivo</h2>
        <p className="text-xs text-gray-light">Root: {rootTaskId || '-'} · Agentes: {Object.keys(agentProfiles || {}).length}</p>
      </div>

      <div className="h-[calc(72vh-64px)] min-h-[550px] rounded-xl border border-primary/15 bg-darker/60 overflow-hidden relative">
        <div className="pointer-events-none absolute inset-0 z-[1] grid grid-cols-4">
          {LEVEL_ORDER.map((level, idx) => (
            <div
              key={`lane-${level}`}
              className={[
                'h-full border-r border-dashed border-cyan-300/20',
                idx % 2 === 0 ? 'bg-gradient-to-b from-cyan-500/6 to-transparent' : 'bg-gradient-to-b from-blue-500/5 to-transparent',
                idx === LEVEL_ORDER.length - 1 ? 'border-r-0' : '',
              ].join(' ')}
            />
          ))}
        </div>

        <div className="pointer-events-none absolute inset-x-3 top-2 z-10 grid grid-cols-4 gap-2 text-[11px]">
          {LEVEL_ORDER.map((level) => {
            const Icon = ROLE_ICON[level];
            return (
              <div key={level} className="rounded border border-cyan-300/25 bg-[#0f172a]/70 px-2 py-1.5 text-cyan-100 uppercase tracking-wider flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <Icon size={12} />
                  {level}
                </span>
                <span className="text-primary">{levelStats[level]}</span>
              </div>
            );
          })}
        </div>

        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          fitView
          proOptions={FLOW_PRO_OPTIONS}
          onPaneClick={() => onSelectTask?.(null)}
          onNodeClick={(_, node) => onSelectTask?.(node.id)}
          defaultEdgeOptions={FLOW_DEFAULT_EDGE_OPTIONS}
        >
          <Background color="#1f2937" gap={16} size={1} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>

        {onOpenFactory ? (
          <button
            onClick={onOpenFactory}
            className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-1.5 rounded-full border border-cyan-300/45 bg-[#0f172a]/85 px-3 py-2 text-xs text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.28)] hover:bg-[#0f172a]"
          >
            <Sparkles size={13} />
            Contratar
          </button>
        ) : null}
      </div>
    </div>
  );
}
