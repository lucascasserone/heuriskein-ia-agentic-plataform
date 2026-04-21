'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Trash2, Bot, Upload, FileText, FileSpreadsheet,
  MessageSquare, AlertTriangle, CheckCircle, Sparkles, Zap,
  FileArchive, Clock, Activity, ChevronDown, Star, Shield, Check,
} from 'lucide-react';
import { apiClient, EpicPayload } from '@/lib/api';
import { useNotify } from '@/lib/toast';

// Add font imports for typography (assumes Tailwind CSS with @import in globals.css)
// @import 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Epic {
  id: string;
  goal: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'backlog' | 'refinement' | 'approved' | 'completed' | 'failed';
  complexity?: number | null;
  lead_time?: string | null;
  due_date?: string | null;
  checklist_items?: Array<{
    text: string;
    agent_ready?: boolean;
    critical?: boolean;
    requires_validation?: boolean;
  }>;
  context_files?: Array<{
    name?: string;
    size?: number;
    type?: string;
  }>;
  feedback?: Array<{
    text?: string;
    time?: string;
  }>;
}

interface ChecklistItem {
  id: string;
  text: string;
  agentReady: boolean;
  critical?: boolean;
  requiresValidation?: boolean;
}

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface EpicMasterViewProps {
  isOpen: boolean;
  /** null = create mode; Epic = edit mode */
  epic: Epic | null;
  onClose: () => void;
  onSuccess?: (updatedEpic?: Epic) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FIBONACCI = [1, 2, 3, 5, 8, 13] as const;
type FibValue = typeof FIBONACCI[number];

const COMPLEXITY_DAYS: Record<FibValue, string> = {
  1: '~0,5 dia útil',
  2: '~1 dia útil',
  3: '~2 dias úteis',
  5: '~3 dias úteis',
  8: '~5 dias úteis',
  13: '~8 dias úteis',
};

const COMPLEXITY_TOOLTIPS: Record<FibValue, string> = {
  1: 'Tarefa trivial, sem dependências',
  2: 'Automação simples, sem integrações',
  3: 'Integração padrão, validação básica',
  5: 'Múltiplos passos, complexidade intermediária',
  8: 'Integrações complexas, múltiplas validações',
  13: 'Projeto complexo, várias dependências',
};

const STATUS_LABELS: Record<Epic['status'], string> = {
  backlog: 'Backlog',
  refinement: 'Refinamento',
  approved: 'Aprovado',
  completed: 'Concluído',
  failed: 'Falhou',
};

const PRIORITY_COLORS: Record<Epic['priority'], string> = {
  high: 'border-red-400/50 bg-red-500/10 text-red-300',
  medium: 'border-yellow-400/50 bg-yellow-500/10 text-yellow-300',
  low: 'border-gray-400/40 bg-gray-500/10 text-gray-300',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeFeasibility(
  goal: string,
  description: string,
  checklist: ChecklistItem[],
): number {
  let score = 0;
  if (goal.length >= 10) score += 15;
  if (goal.length >= 30) score += 10;
  if (goal.length >= 60) score += 5;
  if (description.length >= 20) score += 20;
  if (description.length >= 100) score += 15;
  if (description.length >= 300) score += 10;
  if (checklist.length > 0) score += 10;
  if (checklist.length >= 3) score += 10;
  if (checklist.some((i) => i.agentReady)) score += 5;
  const words = new Set(
    description.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
  );
  if (words.size >= 10) score += 5;
  if (words.size >= 20) score += 5;
  return Math.min(100, score);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: string }) {
  if (type.includes('pdf')) return <FileText size={13} className="text-red-400 shrink-0" />;
  if (type.includes('spreadsheet') || type.includes('csv'))
    return <FileSpreadsheet size={13} className="text-green-400 shrink-0" />;
  return <FileArchive size={13} className="text-blue-400 shrink-0" />;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EpicMasterView({
  isOpen,
  epic,
  onClose,
  onSuccess,
}: EpicMasterViewProps) {
  const isEdit = !!epic;
  const notify = useNotify();

  // Form state
  const [goal, setGoal] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Epic['priority']>('medium');
  const [status, setStatus] = useState<Epic['status']>('backlog');
  const [complexity, setComplexity] = useState<FibValue | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [activityInput, setActivityInput] = useState('');
  const [activityLog, setActivityLog] = useState<
    { id: string; text: string; time: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [isDragover, setIsDragover] = useState(false);
  const [feasibility, setFeasibility] = useState<number | null>(null);
  const [complexityHovered, setComplexityHovered] = useState<FibValue | null>(null);
  const [isRoadmapOpen, setIsRoadmapOpen] = useState(true);
  const [freshEpic, setFreshEpic] = useState<Epic | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Fetch fresh data from API when opening in edit mode ────────────────────
  useEffect(() => {
    if (!isOpen || !epic?.id) {
      setFreshEpic(null);
      return;
    }
    let cancelled = false;
    apiClient.getEpic(epic.id).then((res) => {
      if (!cancelled) setFreshEpic(res.data as Epic);
    }).catch(() => {
      if (!cancelled) setFreshEpic(epic); // fallback to prop
    });
    return () => { cancelled = true; };
  }, [isOpen, epic?.id]);

  // ── Populate on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    // In edit mode, wait for fresh data; in create mode use empty defaults
    const source = freshEpic ?? epic;
    if (source) {
      setGoal(source.goal ?? '');
      setDescription(source.description ?? '');
      setPriority(source.priority ?? 'medium');
      setStatus(source.status ?? 'backlog');
      setComplexity(
        source.complexity && FIBONACCI.includes(source.complexity as FibValue)
          ? (source.complexity as FibValue)
          : null,
      );
      setDueDate((source.lead_time || source.due_date || '').slice(0, 10));
      setChecklist(
        (source.checklist_items || []).map((item, index) => ({
          id: `${Date.now()}_${index}`,
          text: item.text || '',
          agentReady: Boolean(item.agent_ready),
          critical: Boolean(item.critical),
          requiresValidation: Boolean(item.requires_validation),
        })),
      );
      setAttachments(
        (source.context_files || [])
          .filter((file) => Boolean(file?.name))
          .map((file, index) => ({
            id: `${Date.now()}_ctx_${index}`,
            name: file.name || `arquivo_${index + 1}`,
            size: Number(file.size || 0),
            type: file.type || 'application/octet-stream',
          })),
      );
      setActivityLog(
        (source.feedback || [])
          .filter((entry) => Boolean(entry?.text))
          .map((entry, index) => ({
            id: `${Date.now()}_fb_${index}`,
            text: entry.text || '',
            time: entry.time || new Date().toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          })),
      );
    } else {
      setGoal('');
      setDescription('');
      setPriority('medium');
      setStatus('backlog');
      setComplexity(null);
      setDueDate('');
      setChecklist([]);
      setAttachments([]);
      setActivityLog([]);
    }
    setFeasibility(null);
  }, [freshEpic, isOpen]);

  // ── Debounced feasibility score ─────────────────────────────────────────────
  useEffect(() => {
    if (!goal && !description) {
      setFeasibility(null);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setFeasibility(computeFeasibility(goal, description, checklist));
    }, 600);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [goal, description, checklist]);

  // Keep instructions field growing vertically to avoid internal scroll friction.
  useEffect(() => {
    const textarea = descriptionRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, 190)}px`;
  }, [description]);

  // ── Checklist helpers ──────────────────────────────────────────────────────
  const addItem = () => {
    if (!newItemText.trim()) return;
    setChecklist((p) => [
      ...p,
      { id: `${Date.now()}`, text: newItemText.trim(), agentReady: false },
    ]);
    setNewItemText('');
  };

  const removeItem = (id: string) =>
    setChecklist((p) => p.filter((i) => i.id !== id));

  const toggleAgent = (id: string) =>
    setChecklist((p) =>
      p.map((i) => (i.id === id ? { ...i, agentReady: !i.agentReady } : i)),
    );

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFiles = useCallback((files: FileList) => {
    const next: AttachedFile[] = Array.from(files).map((f) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    setAttachments((p) => [...p, ...next]);
  }, []);

  const openFilePicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.docx,.csv,.txt,.md';
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) handleFiles(files);
    };
    input.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragover(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  // Simple strategic prompt helpers for common markdown blocks.
  const applyMarkdown = (format: 'bold' | 'list' | 'code') => {
    const textarea = descriptionRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = description.slice(start, end);

    let replacement = '';
    if (format === 'bold') replacement = `**${selected || 'texto-chave'}**`;
    if (format === 'list') replacement = selected ? `- ${selected}` : '- item estrategico';
    if (format === 'code') replacement = `\`${selected || 'comando'}\``;

    const next = `${description.slice(0, start)}${replacement}${description.slice(end)}`;
    setDescription(next);

    requestAnimationFrame(() => {
      const cursor = start + replacement.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  // ── Activity log ──────────────────────────────────────────────────────────
  const addActivity = () => {
    if (!activityInput.trim()) return;
    setActivityLog((p) => [
      ...p,
      {
        id: `${Date.now()}`,
        text: activityInput.trim(),
        time: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    ]);
    setActivityInput('');
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!goal.trim()) {
      notify.error('O objetivo é obrigatório.');
      return;
    }
    setLoading(true);
    notify.loading(isEdit ? 'Atualizando épica...' : 'Criando épica...');
    try {
      const epicPayload: EpicPayload = {
        goal,
        description,
        priority,
        ...(isEdit ? { status } : {}),
      };
      const base = {
        ...epicPayload,
          complexity: complexity ?? null,
          lead_time: dueDate || null,
          checklist_items: checklist.map((i) => ({
            text: i.text,
            agent_ready: i.agentReady,
            critical: Boolean(i.critical),
            requires_validation: Boolean(i.requiresValidation),
          })),
          context_files: attachments.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
          })),
          feedback: activityLog.map((entry) => ({
            text: entry.text,
            time: entry.time,
          })),
      };
      let savedEpic: Epic | undefined;
      if (isEdit && epic) {
        const response = await apiClient.updateEpic(epic.id, base);
        savedEpic = response.data as Epic;
      } else {
        const response = await apiClient.createEpic(base);
        savedEpic = response.data as Epic;
      }
      notify.success(isEdit ? 'Épica atualizada com sucesso!' : 'Épica criada com sucesso!');
      onClose();
      onSuccess?.(savedEpic);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Erro ao salvar épica';
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived UI values ──────────────────────────────────────────────────────
  const fScore = feasibility ?? 0;
  const feasColor =
    feasibility === null
      ? 'text-gray-500'
      : fScore >= 70
      ? 'text-green-400'
      : fScore >= 40
      ? 'text-yellow-400'
      : 'text-red-400';
  const feasBarColor =
    feasibility === null ? '' : fScore >= 70 ? 'bg-green-500' : fScore >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  const saveBtnAlert = feasibility !== null && fScore < 40 && goal.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            transition={{ duration: 0.18 }}
          />

          {/* Drawer */}
          <motion.div
            className="fixed top-0 right-0 bottom-0 z-50 w-full md:w-[52%] lg:w-[48%] xl:w-[44%] flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Container */}
            <div
              className="flex-1 flex flex-col overflow-hidden"
              style={{
                background:
                  'linear-gradient(140deg, rgba(15,23,42,0.95) 0%, rgba(10,18,30,0.95) 100%)',
              }}
            >
              {/* ── Header ──────────────────────────────────────────────────────── */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
                  <h1
                    className="text-sm font-semibold tracking-[0.12em] text-cyan-400/80 uppercase"
                    style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                  >
                    {isEdit ? 'Editar' : 'Nova'} Épica
                  </h1>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                  aria-label="Fechar"
                >
                  <X size={16} className="text-gray-600 hover:text-white" />
                </button>
              </div>

              {/* ── Content: 70/30 Layout ──────────────────────────────────────── */}
              <div className="flex-1 flex flex-col lg:flex-row overflow-x-hidden overflow-y-auto min-h-0">

                {/* ── MAIN (70%) ────────────────────────────────────────────────── */}
                <div className="flex-1 flex flex-col w-full overflow-x-hidden overflow-y-auto sidebar-scroll epic-scroll-cyan px-8 py-7 gap-y-8 lg:basis-[58%] lg:pr-7 order-2 lg:order-1 min-h-0">

                  {/* Title */}
                  <div>
                    <input
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="Nome do Épico..."
                      className="w-full max-w-full bg-transparent border-none outline-none text-3xl font-bold text-slate-100 placeholder:text-slate-400 leading-tight"
                      style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                    />
                    <div className="mt-2.5 h-[1px] bg-gradient-to-r from-cyan-500/30 via-cyan-500/5 to-transparent" />
                  </div>

                  {/* Description */}
                  <div className="w-full">
                    <label
                      className="text-[11px] tracking-widest text-slate-400 uppercase font-medium mb-3 block"
                      style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                    >
                      Instruções para Agentes
                    </label>
                    <div className="mb-2 flex items-center gap-1.5 p-1.5 rounded-lg border border-white/5 bg-white/[0.01] w-full">
                      <button
                        type="button"
                        onClick={() => applyMarkdown('bold')}
                        className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                        title="Negrito"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => applyMarkdown('list')}
                        className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                        title="Lista"
                      >
                        Lista
                      </button>
                      <button
                        type="button"
                        onClick={() => applyMarkdown('code')}
                        className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                        title="Código"
                      >
                        {'</>'}
                      </button>
                    </div>
                    <textarea
                      ref={descriptionRef}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={
                        'Contexto, critérios de sucesso, diretrizes.\n\n**Markdown**: _itálico_, **negrito**, - listas'
                      }
                      rows={1}
                      className="w-full max-w-full min-h-[190px] bg-white/[0.015] border border-white/5 rounded-xl px-4 py-3 text-[13px] font-medium text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 resize-none overflow-hidden transition-all leading-relaxed"
                      style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                    />
                  </div>

                  {/* AI Feasibility Floating Card */}
                  <AnimatePresence>
                    {feasibility !== null && (
                      <motion.div
                        key="feasibility-float"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2 }}
                        className={`rounded-lg border p-3 backdrop-blur-md ${
                          fScore >= 70
                            ? 'border-green-500/20 bg-green-500/[0.05]'
                            : fScore >= 40
                            ? 'border-yellow-500/20 bg-yellow-500/[0.05]'
                            : 'border-red-500/20 bg-red-500/[0.05]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Sparkles size={12} className={feasColor} />
                            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">
                              Clarity Score
                            </span>
                          </div>
                          <span className={`text-lg font-bold tabular-nums shrink-0 ${feasColor}`}>
                            {feasibility}%
                          </span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${feasBarColor}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${feasibility}%` }}
                            transition={{ duration: 0.4 }}
                          />
                        </div>
                        {fScore < 40 && (
                          <p className="text-[10px] text-red-400/70 mt-1.5 leading-tight">
                            Adicione mais contexto nas instruções.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Agent Roadmap Checklist */}
                  <div className="w-full">
                    <button
                      type="button"
                      onClick={() => setIsRoadmapOpen((p) => !p)}
                      className="w-full text-left"
                    >
                      <span
                        className="text-[11px] tracking-widest text-slate-400 uppercase font-medium mb-3 block flex items-center justify-between"
                        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                      >
                        <span>Agent Roadmap</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-slate-400">
                            {checklist.filter((i) => i.agentReady).length}/{checklist.length}
                          </span>
                          <ChevronDown
                            size={12}
                            className={`text-slate-400 transition-transform ${isRoadmapOpen ? 'rotate-180' : ''}`}
                          />
                        </span>
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isRoadmapOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <div className="relative mb-4 pl-1">
                            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />
                            <div className="space-y-4">
                            {checklist.map((item) => (
                              <div
                                key={item.id}
                                className="relative flex items-start gap-3 group"
                              >
                                <button
                                  title={item.agentReady ? 'IA ativa' : 'IA inativa'}
                                  onClick={() => toggleAgent(item.id)}
                                  className={`relative z-10 mt-1 h-4 w-4 rounded-full border transition-all shrink-0 ${
                                    item.agentReady
                                      ? 'border-cyan-300 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.7)]'
                                      : 'border-white/15 bg-slate-950 hover:border-cyan-400/50'
                                  }`}
                                />
                                <div className="min-w-0 flex-1 pb-1.5">
                                  <div className="flex items-start gap-2.5">
                                    <Bot
                                      size={13}
                                      className={`mt-0.5 shrink-0 ${item.agentReady ? 'text-cyan-300' : 'text-slate-500'}`}
                                    />
                                    <div className="min-w-0">
                                      <p className="text-[13px] font-medium text-slate-100 leading-snug break-words">
                                        {item.text}
                                      </p>
                                      {(item.critical || item.requiresValidation) && (
                                        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400 uppercase tracking-wide">
                                          {item.critical && (
                                            <span className="inline-flex items-center gap-1 text-amber-300/90">
                                              <Star size={10} className="fill-current" />
                                              Crítico
                                            </span>
                                          )}
                                          {item.requiresValidation && (
                                            <span className="inline-flex items-center gap-1 text-blue-300/90">
                                              <Shield size={10} />
                                              Validação humana
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-0.5 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => setChecklist((p) =>
                                      p.map((i) => (i.id === item.id ? { ...i, critical: !i.critical } : i))
                                    )}
                                    className={`p-0.5 transition-colors ${
                                      item.critical ? 'text-amber-400' : 'hover:text-amber-400/60'
                                    }`}
                                    title={item.critical ? 'Remover crítico' : 'Marcar crítico'}
                                  >
                                    <Star size={10} />
                                  </button>
                                  <button
                                    onClick={() => setChecklist((p) =>
                                      p.map((i) => (i.id === item.id ? { ...i, requiresValidation: !i.requiresValidation } : i))
                                    )}
                                    className={`p-0.5 transition-colors ${
                                      item.requiresValidation ? 'text-blue-400' : 'hover:text-blue-400/60'
                                    }`}
                                    title={item.requiresValidation ? 'Remover validação' : 'Validação humana'}
                                  >
                                    <Shield size={10} />
                                  </button>
                                  <button
                                    onClick={() => removeItem(item.id)}
                                    className="p-0.5 text-slate-500 hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              </div>
                            ))}
                            </div>
                          </div>

                          <div className="flex gap-2 w-full max-w-full">
                            <input
                              value={newItemText}
                              onChange={(e) => setNewItemText(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && addItem()}
                              placeholder="Novo passo..."
                              className="flex-1 min-w-0 bg-white/[0.008] border border-white/5 rounded-lg px-3 py-2 text-[12px] font-medium text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500/25 transition-all"
                              style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                            />
                            <button
                              onClick={addItem}
                              className="px-2 py-2 bg-cyan-500/10 hover:bg-cyan-500/12 border border-cyan-500/15 rounded-lg text-cyan-400 transition-all shrink-0"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* ── METADATA SIDEBAR (30%) ───────────────────────────────────── */}
                {/* Desktop: Right column, Mobile/Tablet: Chips row at top */}
                <div
                  className="w-full lg:basis-[42%] flex flex-col gap-6 px-8 py-7 lg:pl-7 lg:border-l lg:border-white/5 overflow-x-hidden overflow-y-auto sidebar-scroll epic-scroll-cyan order-1 lg:order-2 min-h-0 lg:min-h-auto"
                >
                  {/* ── GROUP: ESTRATÉGIA ────────────────────────────────────── */}
                  <div className="space-y-4">
                    <div className="h-px bg-gradient-to-r from-white/5 via-white/2 to-transparent" />
                    
                    {/* Complexity Poker - Circular Minimalist with Tooltip */}
                    <div className="pt-6">
                      <label
                        className="mb-3 block text-[11px] tracking-widest text-slate-400 uppercase font-medium"
                        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                      >
                        Complexidade
                      </label>
                      <div className="grid grid-cols-3 gap-2.5 relative">
                        {FIBONACCI.map((n) => (
                          <div key={n} className="relative group flex justify-center">
                            <motion.button
                              onClick={() => setComplexity(complexity === n ? null : n)}
                              onMouseEnter={() => setComplexityHovered(n)}
                              onMouseLeave={() => setComplexityHovered(null)}
                              layoutId={`complexity-${n}`}
                              className={`relative h-10 w-full max-w-[68px] rounded-full border transition-all duration-200 text-xs font-bold flex items-center justify-center shrink-0 ${
                                complexity === n
                                  ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.25)]'
                                  : 'border-white/5 bg-white/[0.02] text-slate-200 hover:border-white/10 hover:text-white'
                              }`}
                            >
                              {complexity === n && (
                                <motion.span
                                  layoutId="complexity-glow"
                                  className="absolute inset-0 rounded-full border border-cyan-400/15 animate-pulse"
                                  transition={{ duration: 0.3 }}
                                />
                              )}
                              {n}
                            </motion.button>
                            
                            {/* Tooltip */}
                            <AnimatePresence>
                              {(complexity === n || complexityHovered === n) && (
                                <motion.div
                                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden md:block px-2 py-1.5 bg-black/70 backdrop-blur-sm rounded-lg text-[9px] text-slate-100 whitespace-nowrap pointer-events-none border border-white/10"
                                  initial={{ opacity: 0, y: 2 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 2 }}
                                  transition={{ duration: 0.15 }}
                                >
                                  {COMPLEXITY_TOOLTIPS[n]}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                      <AnimatePresence>
                        {complexity !== null && (
                          <motion.div
                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                            className="text-[9px] text-cyan-400/70 flex items-center gap-1"
                          >
                            <Zap size={9} />
                            <span>{COMPLEXITY_DAYS[complexity]}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Priority */}
                    <div className="pt-6">
                      <label
                        className="mb-3 block text-[11px] tracking-widest text-slate-400 uppercase font-medium"
                        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                      >
                        Prioridade
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['high', 'medium', 'low'] as const).map((p) => (
                          <motion.button
                            key={p}
                            onClick={() => setPriority(p)}
                            whileHover={{ scale: 1.02 }}
                            className={`min-w-0 px-2 py-2 rounded-lg text-[9px] font-bold border transition-all uppercase tracking-wide ${
                              priority === p
                                ? `${PRIORITY_COLORS[p].replace('border-', 'border-').replace('bg-', 'bg-').replace('text-', 'text-')} shadow-[0_0_8px_rgba(${
                                    p === 'high' ? '220,52,52' : p === 'medium' ? '202,138,4' : '107,114,128'
                                  },0.2)]`
                                : 'border-white/5 bg-white/[0.01] text-slate-200 hover:border-white/8 hover:text-white'
                            }`}
                          >
                            {p === 'high' ? 'Alta' : p === 'medium' ? 'Média' : 'Baixa'}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {/* Status (edit only) */}
                    {isEdit && (
                      <div className="pt-6">
                        <label
                          className="mb-3 block text-[11px] tracking-widest text-slate-400 uppercase font-medium"
                          style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                        >
                          Status
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(Object.keys(STATUS_LABELS) as Epic['status'][]).map((s) => (
                            <motion.button
                              key={s}
                              onClick={() => setStatus(s)}
                              whileHover={{ scale: 1.01 }}
                              className={`py-1 px-2 rounded-lg text-[8px] font-bold border transition-all text-center uppercase tracking-wide ${
                                status === s
                                  ? 'border-cyan-400/50 bg-cyan-500/12 text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.15)]'
                                  : 'border-white/5 bg-white/[0.01] text-slate-200 hover:border-white/8 hover:text-white'
                              }`}
                            >
                              {STATUS_LABELS[s]}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── GROUP: EXECUÇÃO ────────────────────────────────────────── */}
                  <div className="space-y-4 pt-2">
                    <div className="h-px bg-gradient-to-r from-white/5 via-white/2 to-transparent" />

                    {/* Lead Time */}
                    <div className="pt-6">
                      <label
                        className="mb-3 block text-[11px] tracking-widest text-slate-400 uppercase font-medium"
                        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                      >
                        Lead Time
                      </label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full bg-white/[0.008] border border-white/5 rounded-lg px-3 py-2 text-[11px] font-medium text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500/25 transition-all [color-scheme:dark]"
                        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                      />
                      {complexity !== null && !dueDate && (
                        <p className="text-[9px] text-slate-400 mt-1.5 italic">
                          Sugestão: {COMPLEXITY_DAYS[complexity]}
                        </p>
                      )}
                    </div>

                    {/* Knowledge Base - Premium Dropzone */}
                    <div className="pt-6">
                      <label
                        className="mb-3 block text-[11px] tracking-widest text-slate-400 uppercase font-medium"
                        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                      >
                        Context Files
                      </label>
                      <div
                        role="button"
                        tabIndex={0}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragover(true);
                        }}
                        onDragLeave={() => setIsDragover(false)}
                        onDrop={handleDrop}
                        onClick={openFilePicker}
                        onKeyDown={(e) => e.key === 'Enter' && openFilePicker()}
                        className={`cursor-pointer rounded-lg border border-dashed p-3 text-center transition-all select-none ${
                          isDragover
                            ? 'border-cyan-400/40 bg-cyan-500/[0.06]'
                            : 'border-white/5 hover:border-white/8 bg-white/[0.002]'
                        }`}
                      >
                        <Upload
                          size={13}
                          className={`mx-auto mb-1.5 transition-colors ${
                            isDragover ? 'text-cyan-400' : 'text-slate-400'
                          }`}
                        />
                        <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                          PDF, Docx, CSV
                        </p>
                      </div>

                      {attachments.length > 0 && (
                        <div className="mt-2.5 flex items-center gap-1">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Files:</span>
                          {attachments.map((f) => (
                            <div
                              key={f.id}
                              className="relative group"
                              title={f.name}
                            >
                              <button
                                onClick={() =>
                                  setAttachments((p) => p.filter((a) => a.id !== f.id))
                                }
                                className="p-1.5 rounded-lg bg-white/[0.01] border border-white/5 hover:border-red-500/25 hover:bg-red-500/[0.06] transition-all group-hover:opacity-100"
                              >
                                <FileIcon type={f.type} />
                              </button>
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block px-2 py-1 bg-black/70 rounded text-[8px] text-white whitespace-nowrap pointer-events-none border border-white/10">
                                {f.name}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Activity Log */}
                    <div className="pt-6">
                      <label
                        className="mb-3 block text-[11px] tracking-widest text-slate-400 uppercase font-medium flex items-center gap-1"
                        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                      >
                        <Activity size={9} />
                        Feedback
                      </label>

                      <div className="space-y-1 max-h-16 overflow-y-auto sidebar-scroll mb-2">
                        {activityLog.length === 0 ? (
                          <p className="text-[9px] text-slate-400 px-1 italic">—</p>
                        ) : (
                          activityLog.map((entry) => (
                            <div
                              key={entry.id}
                              className="px-2 py-1.5 bg-white/[0.005] border border-white/5 rounded text-[9px] text-slate-200"
                            >
                              <p className="line-clamp-1">{entry.text}</p>
                              <p className="text-slate-400 text-[8px] mt-0.5">{entry.time}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="flex gap-1.5">
                        <input
                          value={activityInput}
                          onChange={(e) => setActivityInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addActivity()}
                          placeholder="Nota..."
                          className="flex-1 bg-white/[0.008] border border-white/5 rounded px-2.5 py-1.5 text-[10px] font-medium text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500/25 transition-all"
                          style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                        />
                        <button
                          onClick={addActivity}
                          className="px-2 py-1.5 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded text-slate-400 hover:text-slate-100 transition-all"
                        >
                          <MessageSquare size={10} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Footer ───────────────────────────────────────────────────────── */}
              <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/5 shrink-0">
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  {feasibility !== null && (
                    <>
                      <Sparkles size={10} className={feasColor} />
                      <span className={feasColor}>{feasibility}%</span>
                    </>
                  )}
                  {complexity !== null && (
                    <>
                      <span>·</span>
                      <span>Complexidade {complexity}</span>
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-white/[0.1] rounded-lg transition-all hover:bg-white/[0.03] disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading || !goal.trim()}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      saveBtnAlert
                        ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/15'
                        : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15'
                    }`}
                  >
                    {loading ? '...' : isEdit ? 'Atualizar' : 'Criar'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
