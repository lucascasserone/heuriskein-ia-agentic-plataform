import { Bot, CheckCircle2, CircleDashed, Clock3, XCircle } from 'lucide-react';
import { OrgTaskNode } from '@/lib/api';

const STATUS_STYLE: Record<OrgTaskNode['status'], string> = {
  queued: 'border-gray-metallic/40 bg-surface/40 text-gray-light',
  in_progress: 'border-primary/50 bg-primary/10 text-primary',
  awaiting_approval: 'border-yellow-400/50 bg-yellow-500/10 text-yellow-300',
  approved: 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300',
  rejected: 'border-red-500/45 bg-red-500/10 text-red-300',
  done: 'border-secondary/45 bg-secondary/10 text-secondary',
};

const LEVEL_STYLE: Record<OrgTaskNode['level'], string> = {
  ceo: 'from-pink-500/30 to-accent/10 border-accent/40',
  director: 'from-primary/25 to-primary-dark/10 border-primary/35',
  head: 'from-secondary/25 to-secondary-dark/10 border-secondary/35',
  analyst: 'from-surface/70 to-surface-alt/40 border-gray-metallic/35',
};

function StatusIcon({ status }: { status: OrgTaskNode['status'] }) {
  if (status === 'done') return <CheckCircle2 size={14} />;
  if (status === 'rejected') return <XCircle size={14} />;
  if (status === 'in_progress') return <Clock3 size={14} className="animate-pulse" />;
  if (status === 'awaiting_approval') return <CircleDashed size={14} />;
  return <Bot size={14} />;
}

interface OrgNodeCardProps {
  task: OrgTaskNode;
  onClick: () => void;
}

export default function OrgNodeCard({ task, onClick }: OrgNodeCardProps) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full rounded-xl border p-3 text-left transition-all',
        'bg-gradient-to-br hover:scale-[1.01] hover:shadow-medium',
        LEVEL_STYLE[task.level],
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-light">{task.level}</p>
          <h3 className="text-sm font-semibold text-text-title line-clamp-1">{task.title}</h3>
        </div>
        <span className={[
          'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold',
          STATUS_STYLE[task.status],
        ].join(' ')}>
          <StatusIcon status={task.status} />
          {task.status}
        </span>
      </div>

      <p className="mt-2 text-xs text-gray-light line-clamp-2">{task.objective}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-light">
        <span>Complexidade: {task.complexity}</span>
        <span>Dependencias: {task.dependencies.length}</span>
      </div>
    </button>
  );
}
