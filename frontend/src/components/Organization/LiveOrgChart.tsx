'use client';

import { useMemo, useState } from 'react';
import ReactFlow, {
  BaseEdge,
  Background,
  Controls,
  Edge,
  EdgeProps,
  MarkerType,
  Node,
  NodeProps,
  Position,
  getSmoothStepPath,
} from 'reactflow';
import { AlertTriangle, Brain, Briefcase, Crown, LayoutGrid, Sparkles, Wrench, Zap } from 'lucide-react';
import { OrgTaskNode } from '@/lib/api';

interface LiveOrgChartProps {
  taskTree: Record<string, OrgTaskNode>;
  rootTaskId?: string;
  activeTaskId?: string;
  pendingQueue?: string[];
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

const STATUS_GLOW: Record<OrgTaskNode['status'], string> = {
  queued: 'border-slate-500/45 shadow-[0_0_10px_rgba(100,116,139,0.2)] text-slate-200',
  in_progress: 'border-cyan-400/70 shadow-[0_0_18px_rgba(34,211,238,0.45)] text-cyan-100',
  awaiting_approval: 'border-yellow-400/70 shadow-[0_0_18px_rgba(250,204,21,0.38)] text-yellow-100',
  approved: 'border-emerald-400/70 shadow-[0_0_16px_rgba(52,211,153,0.35)] text-emerald-100',
  rejected: 'border-red-400/70 shadow-[0_0_18px_rgba(248,113,113,0.45)] text-red-100',
  done: 'border-blue-400/65 shadow-[0_0_16px_rgba(96,165,250,0.35)] text-blue-100',
};

const FLOW_PRO_OPTIONS = { hideAttribution: true };
const FLOW_DEFAULT_EDGE_OPTIONS = { type: 'smoothstep' as const };

const LANE_STYLE: Record<OrgTaskNode['level'], string> = {
  ceo: 'from-[#090d1a]/92 via-[#11192f]/70 to-transparent',
  director: 'from-[#0a1324]/88 via-[#11213f]/60 to-transparent',
  head: 'from-[#09182a]/84 via-[#10304a]/55 to-transparent',
  analyst: 'from-[#0a1b2e]/80 via-[#0f3852]/52 to-transparent',
};

const PROGRESS_BY_STATUS: Record<OrgTaskNode['status'], number> = {
  queued: 16,
  in_progress: 52,
  awaiting_approval: 74,
  approved: 90,
  rejected: 32,
  done: 100,
};

type OrgFlowNodeData = {
  task: OrgTaskNode;
  taskTree: Record<string, OrgTaskNode>;
  agentName: string;
  loadStats: { active: number; queued: number; blocked: number };
  isSelected: boolean;
  isGhost?: boolean;
};

function statusNarrative(task: OrgTaskNode) {
  if (task.status === 'in_progress') return 'Executando tarefa e delegando proximos passos...';
  if (task.status === 'awaiting_approval') return 'Consolidando output para validacao...';
  if (task.status === 'queued') return 'Preparando prioridade e contexto para execucao...';
  if (task.status === 'approved' || task.status === 'done') return 'Entrega consolidada e registrada...';
  return 'Replanejando com base no feedback de bloqueio...';
}

function statusShort(task: OrgTaskNode) {
  if (task.status === 'in_progress') return 'Executando';
  if (task.status === 'awaiting_approval') return 'Pensando';
  if (task.status === 'queued') return 'Na fila';
  if (task.status === 'approved' || task.status === 'done') return 'Concluido';
  return 'Revisar';
}

function GlassOrgNode({ data }: NodeProps<OrgFlowNodeData>) {
  const { task, taskTree, isSelected, agentName, loadStats, isGhost } = data;
  const isThinking = task.status === 'in_progress' || task.status === 'awaiting_approval';
  const RoleIcon = ROLE_ICON[task.level];
  const missionTokens = Math.max(28, task.complexity * 29 + (task.dependencies?.length || 0) * 7);
  const childCount = task.children?.length || 0;
  const progress = PROGRESS_BY_STATUS[task.status] || 20;
  const peekTasks = (task.children || [])
    .map((childId) => taskTree[childId])
    .filter(Boolean)
    .slice(0, 4);
  const currentAction = statusNarrative(task).replace(/\.\.\.$/, '');
  const levelLabel = task.level === 'ceo' ? 'CEO' : task.level === 'director' ? 'Diretor' : task.level === 'head' ? 'Head' : 'Analista';

  return (
    <div className={[
      'group relative w-[220px] rounded-xl border p-3 text-left transition-all backdrop-blur-lg',
      'bg-[#060d18]/72 shadow-[0_10px_28px_rgba(2,8,23,0.62)]',
      isGhost ? 'border-dashed border-cyan-300/55 bg-[#061120]/45 opacity-75' : STATUS_GLOW[task.status],
      isSelected ? 'ring-2 ring-cyan-300/70 shadow-[0_0_22px_rgba(34,211,238,0.42)]' : 'hover:scale-[1.01]',
    ].join(' ')}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-cyan-200/95">
            <RoleIcon size={12} />
            <span>{levelLabel}</span>
          </div>
          <h3 className="text-xs font-semibold text-text-title line-clamp-1">{agentName || task.title}</h3>
        </div>
        <span className="rounded border border-cyan-300/40 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-100">{missionTokens} tk</span>
        {task.status === 'rejected' && task.approval_notes ? (
          <span title={task.approval_notes}>
            <AlertTriangle size={14} className="text-red-300" />
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] text-slate-200/95 line-clamp-1">{currentAction}</p>

      <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2">
        <div className="mb-1.5 flex items-center justify-between text-[10px] text-gray-light">
          <span>{statusShort(task)}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-800/70 overflow-hidden">
          <div
            className={[
              'h-full rounded-full transition-all duration-500',
              task.status === 'in_progress' ? 'bg-cyan-300' : task.status === 'awaiting_approval' ? 'bg-yellow-300' : task.status === 'rejected' ? 'bg-red-300' : 'bg-blue-300',
            ].join(' ')}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[9px] text-gray-light">
        <span className="rounded border border-white/10 px-1.5 py-0.5">Sub {childCount}</span>
        <span className="rounded border border-white/10 px-1.5 py-0.5">Comp {task.complexity}</span>
        {isThinking ? (
          <span className="inline-flex items-center gap-1 rounded border border-cyan-300/40 bg-cyan-400/10 px-1.5 py-0.5 text-cyan-100">
            <Zap size={9} className="animate-pulse" />
            live
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1 text-[9px]">
        <span className="rounded border border-green-300/30 bg-green-500/10 px-1.5 py-0.5 text-green-200">WIP {loadStats.active}</span>
        <span className="rounded border border-yellow-300/30 bg-yellow-500/10 px-1.5 py-0.5 text-yellow-200">Fila {loadStats.queued}</span>
        <span className="rounded border border-red-300/30 bg-red-500/10 px-1.5 py-0.5 text-red-200">Bloq {loadStats.blocked}</span>
      </div>

      <div className="pointer-events-none absolute left-[104%] top-0 z-30 hidden w-56 rounded-lg border border-cyan-300/30 bg-[#081325]/95 p-2 shadow-[0_0_18px_rgba(34,211,238,0.28)] group-hover:block">
        <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-cyan-200">Task Peek</p>
        {peekTasks.length === 0 ? (
          <p className="text-[11px] text-gray-light">Sem subtarefas ativas.</p>
        ) : (
          <div className="space-y-1.5">
            {peekTasks.map((child) => (
              <div key={child.id} className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px]">
                <p className="line-clamp-1 text-text-title">{child.title}</p>
                <p className="text-[10px] text-gray-light">{child.status}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DataPulseEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style, markerEnd }: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14,
  });

  const isAnimated = Boolean(data?.animated);
  const isGhost = Boolean(data?.ghost);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...(style || {}),
          strokeDasharray: isGhost ? '6 6' : undefined,
        }}
        markerEnd={markerEnd}
      />
      {isAnimated && (
        <circle r="3" fill="#22d3ee" opacity="0.95">
          <animateMotion dur="1.6s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </>
  );
}

const NODE_TYPES = { orgNode: GlassOrgNode };
const EDGE_TYPES = { dataPulse: DataPulseEdge };

export default function LiveOrgChart({
  taskTree,
  rootTaskId,
  activeTaskId,
  pendingQueue,
  agentProfiles,
  selectedTaskId,
  onSelectTask,
  onOpenFactory,
}: LiveOrgChartProps) {
  const [layoutVersion, setLayoutVersion] = useState(0);

  const workloadByTask = useMemo(() => {
    const byId = new Map<string, { active: number; queued: number; blocked: number }>();

    const aggregate = (taskId: string): { active: number; queued: number; blocked: number } => {
      const cached = byId.get(taskId);
      if (cached) return cached;

      const task = taskTree[taskId];
      if (!task) {
        const empty = { active: 0, queued: 0, blocked: 0 };
        byId.set(taskId, empty);
        return empty;
      }

      const own = {
        active: task.status === 'in_progress' ? 1 : 0,
        queued: task.status === 'queued' ? 1 : 0,
        blocked: task.status === 'awaiting_approval' || task.status === 'rejected' ? 1 : 0,
      };

      const total = { ...own };
      (task.children || []).forEach((childId) => {
        const child = aggregate(childId);
        total.active += child.active;
        total.queued += child.queued;
        total.blocked += child.blocked;
      });

      byId.set(taskId, total);
      return total;
    };

    Object.keys(taskTree || {}).forEach((taskId) => {
      aggregate(taskId);
    });

    return byId;
  }, [taskTree]);

  const ghostTasks = useMemo(() => {
    const queue = pendingQueue || [];
    const ghosts = queue
      .filter((taskId) => !taskTree[taskId])
      .slice(0, 6)
      .map((taskId, index) => {
        const parentId = activeTaskId && taskTree[activeTaskId]
          ? activeTaskId
          : rootTaskId && taskTree[rootTaskId]
            ? rootTaskId
            : Object.values(taskTree)[0]?.id;

        const parentLevel = parentId && taskTree[parentId] ? taskTree[parentId].level : 'head';
        const nextLevel = parentLevel === 'ceo' ? 'director' : parentLevel === 'director' ? 'head' : 'analyst';

        return {
          id: `ghost-${taskId}`,
          parentId,
          task: {
            id: `ghost-${taskId}`,
            parent_id: parentId || null,
            title: `Task fantasma ${index + 1}`,
            objective: 'Gerando desdobramento operacional...',
            level: nextLevel,
            agent_id: parentId ? taskTree[parentId]?.agent_id || '' : '',
            status: 'queued' as OrgTaskNode['status'],
            complexity: 2,
            dependencies: [],
            children: [],
            approval_notes: '',
            execution_logs: [],
          },
        };
      });

    return ghosts;
  }, [pendingQueue, taskTree, activeTaskId, rootTaskId]);

  const flowNodes = useMemo<Node[]>(() => {
    const allTasks = [
      ...Object.values(taskTree || {}),
      ...ghostTasks.map((ghost) => ghost.task),
    ];

    const perLevel = allTasks.reduce((acc, item) => {
      acc[item.level].push(item);
      return acc;
    }, {
      ceo: [] as OrgTaskNode[],
      director: [] as OrgTaskNode[],
      head: [] as OrgTaskNode[],
      analyst: [] as OrgTaskNode[],
    });

    LEVEL_ORDER.forEach((level) => {
      perLevel[level].sort((a, b) => a.title.localeCompare(b.title));
      if (layoutVersion % 2 === 1) {
        perLevel[level].reverse();
      }
    });

    const yById = new Map<string, number>();
    LEVEL_ORDER.forEach((level) => {
      const items = perLevel[level];
      if (items.length === 0) return;
      const spacing = Math.max(132, Math.min(180, Math.floor(760 / items.length)));
      const startY = Math.max(95, 300 - ((items.length - 1) * spacing) / 2);

      items.forEach((task, index) => {
        const jitter = layoutVersion % 2 === 0 ? 0 : (index % 2 === 0 ? -14 : 14);
        yById.set(task.id, startY + index * spacing + jitter);
      });
    });

    return allTasks.map((task) => {
      const x = LEVEL_X[task.level];
      const y = yById.get(task.id) || 120;
      const agentName = agentProfiles?.[task.agent_id]?.name || task.title;
      const isGhost = task.id.startsWith('ghost-');

      return {
        id: task.id,
        type: 'orgNode',
        data: {
          task,
          taskTree,
          isSelected: selectedTaskId === task.id,
          isGhost,
          agentName,
          loadStats: workloadByTask.get(task.id) || { active: 0, queued: 0, blocked: 0 },
        } as OrgFlowNodeData,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
        position: { x, y },
      };
    });
  }, [taskTree, ghostTasks, selectedTaskId, agentProfiles, workloadByTask, layoutVersion]);

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
        type: 'dataPulse',
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        style: {
          stroke: animated ? '#00F2FF' : '#4A5568',
          strokeWidth: animated ? 2.1 : 1.45,
          filter: animated ? 'drop-shadow(0 0 8px rgba(0,242,255,0.6))' : 'none',
        },
        data: { animated },
      });
    });

    ghostTasks.forEach((ghost) => {
      if (!ghost.parentId) return;
      edges.push({
        id: `${ghost.parentId}-${ghost.id}`,
        source: ghost.parentId,
        target: ghost.id,
        type: 'dataPulse',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: {
          stroke: '#67e8f9',
          strokeWidth: 1.5,
          opacity: 0.8,
        },
        data: { animated: true, ghost: true },
      });
    });

    return edges;
  }, [taskTree, ghostTasks]);

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLayoutVersion((prev) => prev + 1)}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/45 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-100 hover:bg-cyan-500/18"
            title="Reorganizar fluxo para reduzir sobreposição"
          >
            <LayoutGrid size={12} />
            Reorganizar Fluxo
          </button>
          <p className="text-xs text-gray-light">Root: {rootTaskId || '-'} · Agentes: {Object.keys(agentProfiles || {}).length}</p>
        </div>
      </div>

      <div className="h-[calc(72vh-64px)] min-h-[550px] rounded-xl border border-primary/15 bg-darker/60 overflow-hidden relative">
        <div className="pointer-events-none absolute inset-0 z-[1] grid grid-cols-4">
          {LEVEL_ORDER.map((level, idx) => (
            <div
              key={`lane-${level}`}
              className={[
                'h-full border-r border-dashed border-cyan-300/20 bg-gradient-to-b',
                LANE_STYLE[level],
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
          fitViewOptions={{ padding: 0.18 }}
          proOptions={FLOW_PRO_OPTIONS}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onPaneClick={() => onSelectTask?.(null)}
          onNodeClick={(_, node) => {
            if (String(node.id).startsWith('ghost-')) return;
            onSelectTask?.(node.id);
          }}
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
