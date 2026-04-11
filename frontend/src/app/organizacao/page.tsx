'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, Pencil, Play, Send, Settings, Sparkles, Trash2, Users, UserPlus, X } from 'lucide-react';
import LayoutPremium from '@/components/Layout/LayoutPremium';
import LiveOrgChart from '@/components/Organization/LiveOrgChart';
import AgentEditModal from '@/components/Modals/AgentEditModal';
import ApiKeysModal from '@/components/Modals/ApiKeysModal';
import { AgentItem, AgentMessageItem, CompanyStateResponse, apiClient } from '@/lib/api';

const EMPTY_STATE: CompanyStateResponse = {
  mission_id: '',
  mission_brief: '',
  mission_constraints: [],
  corporate_memory_hits: [],
  task_tree: {},
  root_task_id: '',
  active_task_id: '',
  active_agent_id: '',
  pending_queue: [],
  awaiting_approval_queue: [],
  rejected_queue: [],
  completed_tasks: [],
  final_report: '',
  execution_trace: [],
  estimated_tokens: 0,
  avg_resolution_minutes: 0,
  delegation_events: 0,
  agent_profiles: {},
};

interface ViabilityResult {
  score_percent: number;
  verdict: string;
  reasons: string[];
  complexity: number;
}

interface AgentChatMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

interface OrgFocusPayload {
  taskId?: string;
  title?: string;
  status?: string;
  priority?: string;
  agentId?: string;
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function OrganizacaoAutonomaPage() {
  const [state, setState] = useState<CompanyStateResponse>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);
  const [loadingViability, setLoadingViability] = useState(false);
  const [viability, setViability] = useState<ViabilityResult | null>(null);
  const [missionBrief, setMissionBrief] = useState('Lancar nova vertical de produto IA em 45 dias com plano comercial e tecnico.');
  const [constraints, setConstraints] = useState('Budget maximo de R$ 200k; equipe atual de 5 pessoas; manter compliance LGPD.');

  const [hireName, setHireName] = useState('Head de Performance');
  const [hireDepartment, setHireDepartment] = useState('Marketing');
  const [hireLevel, setHireLevel] = useState<'ceo' | 'director' | 'head' | 'analyst'>('head');
  const [hireCapabilities, setHireCapabilities] = useState('growth,analytics,performance-media');
  const [hireBio, setHireBio] = useState('');
  const [chatHistoryByTaskId, setChatHistoryByTaskId] = useState<Record<string, AgentChatMessage[]>>({});
  const [showFactoryDrawer, setShowFactoryDrawer] = useState(false);
  const [showAdvancedMissionFields, setShowAdvancedMissionFields] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusSourceLabel, setFocusSourceLabel] = useState('');
  const [missionError, setMissionError] = useState<string | null>(null);

  // Team / agent editing
  const [dbAgents, setDbAgents] = useState<AgentItem[]>([]);
  const [editingAgent, setEditingAgent] = useState<AgentItem | null>(null);
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [trafficAgentId, setTrafficAgentId] = useState<string>('');
  const [agentTraffic, setAgentTraffic] = useState<AgentMessageItem[]>([]);
  const [trafficLoading, setTrafficLoading] = useState(false);

  const stats = useMemo(() => {
    const tasks = Object.values(state.task_tree || {});
    return {
      total: tasks.length,
      done: tasks.filter((t) => t.status === 'done' || t.status === 'approved').length,
      rejected: tasks.filter((t) => t.status === 'rejected').length,
      running: tasks.filter((t) => t.status === 'in_progress' || t.status === 'awaiting_approval').length,
      estimatedTokens: state.estimated_tokens || 0,
      avgResolutionMinutes: state.avg_resolution_minutes || 0,
      delegationEvents: state.delegation_events || 0,
    };
  }, [state]);

  const agents = useMemo(() => {
    return Object.values(state.agent_profiles || {});
  }, [state.agent_profiles]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return state.task_tree[selectedTaskId] || null;
  }, [selectedTaskId, state.task_tree]);

  const selectedTaskDelegation = useMemo(() => {
    if (!selectedTask) return null;

    const immediateParent = selectedTask.parent_id ? state.task_tree[selectedTask.parent_id] : null;
    let headSupervisor = null as typeof immediateParent;
    let cursor = immediateParent;

    while (cursor) {
      if (cursor.level === 'head') {
        headSupervisor = cursor;
        break;
      }
      cursor = cursor.parent_id ? state.task_tree[cursor.parent_id] : null;
    }

    return {
      parent: immediateParent,
      head: headSupervisor,
    };
  }, [selectedTask, state.task_tree]);

  const selectedChatHistory = useMemo(() => {
    if (!selectedTaskId) return [];
    return chatHistoryByTaskId[selectedTaskId] || [];
  }, [selectedTaskId, chatHistoryByTaskId]);

  const trafficAgent = useMemo(() => {
    if (!trafficAgentId) return null;
    return dbAgents.find((agent) => agent.id === trafficAgentId) || null;
  }, [dbAgents, trafficAgentId]);

  const [microMessage, setMicroMessage] = useState('');
  const [sendingMicroMessage, setSendingMicroMessage] = useState(false);

  const loadLatest = async () => {
    try {
      const response = await apiClient.getOrgState();
      if (response.data?.state) {
        setState({ ...EMPTY_STATE, ...response.data.state });
      }
    } catch {
      // keep local empty state
    }
  };

  const loadDbAgents = async () => {
    try {
      const res = await apiClient.getAgents();
      const list = (res.data as any)?.results || res.data || [];
      setDbAgents(Array.isArray(list) ? list : []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadLatest();
    loadDbAgents();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadDbAgents();
    }, 15000);

    const onFocus = () => loadDbAgents();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!dbAgents.length) {
      setTrafficAgentId('');
      return;
    }

    setTrafficAgentId((current) => {
      if (current && dbAgents.some((agent) => agent.id === current)) {
        return current;
      }
      if (selectedTask?.agent_id && dbAgents.some((agent) => agent.id === selectedTask.agent_id)) {
        return selectedTask.agent_id;
      }
      return dbAgents[0].id;
    });
  }, [dbAgents, selectedTask]);

  useEffect(() => {
    if (!trafficAgentId) {
      setAgentTraffic([]);
      return;
    }

    let cancelled = false;

    const loadTraffic = async () => {
      setTrafficLoading(true);
      try {
        const [inboxRes, outboxRes] = await Promise.all([
          apiClient.getAgentInbox(trafficAgentId),
          apiClient.getAgentOutbox(trafficAgentId),
        ]);

        if (cancelled) return;

        const merged = [...(inboxRes.data || []), ...(outboxRes.data || [])]
          .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
          .slice(0, 12);

        setAgentTraffic(merged);
      } catch {
        if (!cancelled) {
          setAgentTraffic([]);
        }
      } finally {
        if (!cancelled) {
          setTrafficLoading(false);
        }
      }
    };

    loadTraffic();
    const intervalId = window.setInterval(loadTraffic, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [trafficAgentId]);

  const formatTrafficTimestamp = (value: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    const applyFocusByAgent = (agentId: string) => {
      if (!agentId) return;
      const firstTask = Object.values(state.task_tree || {}).find((task) => task.agent_id === agentId);
      if (firstTask) {
        setSelectedTaskId(firstTask.id);
      }
    };

    const applyFocusByPayload = (payload: OrgFocusPayload) => {
      const tasks = Object.values(state.task_tree || {});
      if (tasks.length === 0) return;

      const titleNorm = normalize(payload.title || '');
      let bestId: string | null = null;
      let bestScore = -1;

      tasks.forEach((task) => {
        let score = 0;
        if (payload.agentId && task.agent_id === payload.agentId) score += 5;
        if (titleNorm) {
          const objectiveNorm = normalize(task.objective || '');
          const taskTitleNorm = normalize(task.title || '');
          if (objectiveNorm.includes(titleNorm) || titleNorm.includes(objectiveNorm)) score += 4;
          if (taskTitleNorm.includes(titleNorm) || titleNorm.includes(taskTitleNorm)) score += 3;
        }

        if (score > bestScore) {
          bestScore = score;
          bestId = task.id;
        }
      });

      if (bestId) {
        setSelectedTaskId(bestId);
      }
    };

    const fromStorage = typeof window !== 'undefined' ? localStorage.getItem('org_focus_agent') : null;
    if (fromStorage) {
      applyFocusByAgent(fromStorage);
      localStorage.removeItem('org_focus_agent');
      setFocusSourceLabel('Foco aplicado por agente vindo do kanban');
    }

    const fromPayloadRaw = typeof window !== 'undefined' ? localStorage.getItem('org_focus_payload') : null;
    if (fromPayloadRaw) {
      try {
        const payload = JSON.parse(fromPayloadRaw) as OrgFocusPayload;
        applyFocusByPayload(payload);
        setFocusSourceLabel(`Foco aplicado para: ${payload.title || 'task do kanban'}`);
      } catch {
        // ignore malformed payload
      }
      localStorage.removeItem('org_focus_payload');
    }

    const onOrgFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      if (detail?.agentId) {
        applyFocusByAgent(detail.agentId);
      }
    };

    window.addEventListener('org:focus-agent', onOrgFocus as EventListener);
    return () => {
      window.removeEventListener('org:focus-agent', onOrgFocus as EventListener);
    };
  }, [state.task_tree]);

  useEffect(() => {
    if (!selectedTask?.agent_id || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('kanban:filter-agent', { detail: { agentId: selectedTask.agent_id } }));
  }, [selectedTask]);

  const runMission = async () => {
    setLoading(true);
    setMissionError(null);
    try {
      const response = await apiClient.runOrgMission({
        mission_brief: missionBrief,
        constraints: constraints
          .split(';')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setState({ ...EMPTY_STATE, ...response.data.state });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kanban:refresh'));
      }
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message || '')
          : '';
      setMissionError(message || 'Falha ao executar missão no backend. Tente novamente em alguns instantes.');
    } finally {
      setLoading(false);
    }
  };

  const analyzeViability = async () => {
    setLoadingViability(true);
    try {
      const response = await apiClient.analyzeOrgFeasibility({
        mission_brief: missionBrief,
        constraints: constraints
          .split(';')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setViability(response.data?.viability || null);
    } finally {
      setLoadingViability(false);
    }
  };

  const suggestTemplate = async () => {
    const response = await apiClient.getOrgAgentTemplate({
      department: hireDepartment,
      level: hireLevel,
    });
    const template = response.data?.template;
    if (!template) return;
    setHireCapabilities((template.capabilities || []).join(','));
    setHireBio(template.bio || '');
  };

  const hireAgent = async (e: FormEvent) => {
    e.preventDefault();
    const response = await apiClient.hireOrgAgent({
      name: hireName,
      department: hireDepartment,
      level: hireLevel,
      capabilities: hireCapabilities
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    });
    const generatedBio = String((response.data?.agent as any)?.bio || '');
    if (generatedBio) {
      setHireBio(generatedBio);
    }
    await loadLatest();
    setShowFactoryDrawer(false);
  };

  const sendMicroMessage = async (task: any, content: string) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    setChatHistoryByTaskId((prev) => ({
      ...prev,
      [task.id]: [...(prev[task.id] || []), { role: 'user', content, timestamp }],
    }));

    try {
      const response = await apiClient.sendChatMessage(task.agent_id, content, {
        source: 'organizacao_microgerenciar',
        task_id: task.id,
        task_title: task.title,
      });
      const payload = response.data as { agent_response?: string; response?: string } | null;
      const agentContent = String(payload?.agent_response || payload?.response || 'Sem resposta do agente.');
      setChatHistoryByTaskId((prev) => ({
        ...prev,
        [task.id]: [
          ...(prev[task.id] || []),
          {
            role: 'agent',
            content: agentContent,
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
          },
        ],
      }));
    } catch {
      setChatHistoryByTaskId((prev) => ({
        ...prev,
        [task.id]: [
          ...(prev[task.id] || []),
          {
            role: 'agent',
            content: 'Falha ao consultar agente. Verifique se o backend/chat está ativo.',
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
          },
        ],
      }));
    }
  };

  const deleteAgent = async (agent: AgentItem) => {
    const ok = window.confirm(`Excluir o agente "${agent.name}"? Esta ação não pode ser desfeita.`);
    if (!ok) return;

    setDeletingAgentId(agent.id);
    try {
      await apiClient.deleteAgent(agent.id);
      if (editingAgent?.id === agent.id) {
        setEditingAgent(null);
      }
      await loadDbAgents();
    } catch {
      window.alert('Falha ao excluir agente. Tente novamente.');
    } finally {
      setDeletingAgentId(null);
    }
  };

  const handleSendFromSidebar = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !microMessage.trim() || sendingMicroMessage) return;
    setSendingMicroMessage(true);
    try {
      await sendMicroMessage(selectedTask, microMessage.trim());
      setMicroMessage('');
    } finally {
      setSendingMicroMessage(false);
    }
  };

  const liveFeed = useMemo(() => {
    const trace = state.execution_trace || [];
    return [...trace].slice(-8).reverse();
  }, [state.execution_trace]);

  return (
    <LayoutPremium>
      <div className="flex-1 overflow-auto bg-dark p-4 lg:p-5 space-y-4">
        <div className="sticky top-0 z-20 bg-dark/90 backdrop-blur-sm pb-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-text-title">Mission Control</h1>
              <p className="text-xs text-gray-light">CEO, Diretores, Heads e Analistas com delegacao recursiva em tempo real.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-2">
              <p className="text-[10px] uppercase tracking-wider text-primary">Total</p>
              <p className="text-lg font-bold text-text-title">{stats.total}</p>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
              <p className="text-[10px] uppercase tracking-wider text-emerald-300">Concluidas</p>
              <p className="text-lg font-bold text-text-title">{stats.done}</p>
            </div>
            <div className="rounded-lg border border-yellow-400/30 bg-yellow-500/10 p-2">
              <p className="text-[10px] uppercase tracking-wider text-yellow-300">Em fluxo</p>
              <p className="text-lg font-bold text-text-title">{stats.running}</p>
            </div>
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2">
              <p className="text-[10px] uppercase tracking-wider text-red-300">Rejeitadas</p>
              <p className="text-lg font-bold text-text-title">{stats.rejected}</p>
            </div>
            <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-2">
              <p className="text-[10px] uppercase tracking-wider text-cyan-300">Tokens</p>
              <p className="text-lg font-bold text-text-title">{stats.estimatedTokens.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-violet-400/30 bg-violet-500/10 p-2">
              <p className="text-[10px] uppercase tracking-wider text-violet-300">Tempo medio</p>
              <p className="text-lg font-bold text-text-title">{stats.avgResolutionMinutes}m</p>
            </div>
          </div>
          {focusSourceLabel ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-cyan-300/35 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200">
              <Sparkles size={12} />
              {focusSourceLabel}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
          <aside className={selectedTask ? 'xl:col-span-4 space-y-3' : 'xl:col-span-6 space-y-3'}>
            <section className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface/40 to-cyan-500/5 p-4 space-y-3 shadow-[0_0_20px_rgba(14,165,233,0.08)]">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-title">Qual o desafio de hoje?</h2>
                <Sparkles size={14} className="text-primary" />
              </div>
              <textarea
                value={missionBrief}
                onChange={(e) => setMissionBrief(e.target.value)}
                className="w-full h-20 rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-sm text-text-default"
                placeholder="Descreva a missao principal"
              />

              <button
                type="button"
                onClick={() => setShowAdvancedMissionFields((prev) => !prev)}
                className="text-xs text-gray-light hover:text-text-title"
              >
                {showAdvancedMissionFields ? 'Ocultar campos avancados' : 'Mostrar campos avancados'}
              </button>

              {showAdvancedMissionFields ? (
                <textarea
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  className="w-full h-16 rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-xs text-gray-light"
                  placeholder="Budget, compliance, limites..."
                />
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runMission}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-md border border-primary/35 bg-primary/10 px-3 py-2 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  <Play size={14} />
                  {loading ? 'Executando...' : 'Executar missao'}
                </button>
                <button
                  type="button"
                  onClick={analyzeViability}
                  disabled={loadingViability}
                  className="rounded-full border border-yellow-400/35 bg-yellow-500/10 px-3 py-1 text-[11px] text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-50"
                >
                  {loadingViability ? 'Analisando...' : 'Viabilidade'}
                </button>
              </div>

              {missionError ? (
                <div className="rounded-md border border-red-500/35 bg-red-500/10 p-2 text-xs text-red-200">
                  {missionError}
                </div>
              ) : null}

              {viability ? (
                <div className="rounded-md border border-primary/25 bg-dark/35 p-2 text-[11px] space-y-1">
                  <p className="text-text-title font-semibold">Viabilidade: {viability.score_percent}% ({viability.verdict})</p>
                  <p className="text-gray-light">Complexidade: {viability.complexity}/10</p>
                </div>
              ) : null}
            </section>

            <section className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-3">
              <h3 className="text-sm font-semibold text-text-title mb-2">Live Feed</h3>
              <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                {liveFeed.length === 0 ? (
                  <p className="text-xs text-gray-light">Sem eventos ainda.</p>
                ) : (
                  liveFeed.map((entry, idx) => (
                    <div key={`feed-${idx}`} className="rounded-md border border-cyan-300/20 bg-dark/45 p-2 text-[11px] text-gray-light">
                      {entry}
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Team section */}
            <section className="rounded-xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-surface/50 to-transparent p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={13} className="text-primary" />
                  <h3 className="text-sm font-semibold text-text-title">Team Builder</h3>
                  <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{dbAgents.length} agentes</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowFactoryDrawer(true)}
                    className="flex items-center gap-1 rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                    title="Abrir Agent Factory"
                  >
                    <UserPlus size={11} />
                    Montar time
                  </button>
                  <button
                    onClick={() => setShowApiKeysModal(true)}
                    className="rounded-md border border-gray-metallic/30 bg-surface/50 p-1.5 text-gray-light hover:text-text-title transition-colors"
                    title="Gerenciar chaves de API"
                    aria-label="Gerenciar chaves de API"
                  >
                    <Settings size={12} />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-gray-light">
                Defina a composição ideal de agentes por papel, modelo e especialidade para acelerar a execução.
              </p>
              {dbAgents.length === 0 ? (
                <p className="text-xs text-gray-light">Nenhum agente cadastrado.</p>
              ) : (
                <div className="space-y-1.5 max-h-[320px] overflow-auto pr-1">
                  {dbAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-text-title truncate">{agent.name}</p>
                        <p className="text-[10px] text-gray-400 truncate">
                          {agent.organization || 'Geral'} · {agent.llm_provider || 'anthropic'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setEditingAgent(agent)}
                          className="rounded-md border border-primary/30 bg-primary/10 p-1.5 text-primary hover:bg-primary/20 transition-colors"
                          title="Editar agente"
                          aria-label="Editar agente"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => deleteAgent(agent)}
                          disabled={deletingAgentId === agent.id}
                          className="rounded-md border border-red-500/35 bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          title={deletingAgentId === agent.id ? 'Excluindo agente...' : 'Excluir agente'}
                          aria-label={deletingAgentId === agent.id ? 'Excluindo agente' : 'Excluir agente'}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 via-surface/50 to-transparent p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft size={13} className="text-violet-300" />
                  <h3 className="text-sm font-semibold text-text-title">Tráfego node-to-node</h3>
                </div>
                {trafficAgent ? (
                  <span className="rounded border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200">
                    {trafficAgent.name}
                  </span>
                ) : null}
              </div>

              {dbAgents.length > 0 ? (
                <select
                  value={trafficAgentId}
                  onChange={(e) => setTrafficAgentId(e.target.value)}
                  className="w-full rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-xs text-text-default"
                >
                  {dbAgents.map((agent) => (
                    <option key={`traffic-agent-${agent.id}`} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              ) : null}

              <div className="space-y-2 max-h-[300px] overflow-auto pr-1">
                {trafficLoading ? (
                  <p className="text-xs text-gray-light">Carregando tráfego recente...</p>
                ) : agentTraffic.length === 0 ? (
                  <p className="text-xs text-gray-light">Nenhuma mensagem recente para este agente.</p>
                ) : (
                  agentTraffic.map((message) => {
                    const outbound = message.from_agent === trafficAgentId;
                    return (
                      <div
                        key={message.id}
                        className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-violet-200">
                            {message.message_type}
                          </span>
                          <span className="text-[10px] text-gray-500">{formatTrafficTimestamp(message.created_at)}</span>
                        </div>
                        <p className="text-xs font-medium text-text-title line-clamp-2">
                          {message.subject || 'Mensagem sem assunto'}
                        </p>
                        <p className="text-[11px] text-gray-light line-clamp-3">
                          {message.body || 'Sem corpo adicional.'}
                        </p>
                        <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
                          <span>
                            {outbound ? `Saída para ${message.to_agent_name || 'destino'}` : `Entrada de ${message.from_agent_name || 'origem'}`}
                          </span>
                          <span className="uppercase">{message.status}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </aside>

          <section className={selectedTask ? 'xl:col-span-5' : 'xl:col-span-6'}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-title">Organograma vivo</h3>
              <span className="text-[11px] text-gray-light">Estrutura em tempo real</span>
            </div>
            <LiveOrgChart
              taskTree={state.task_tree}
              rootTaskId={state.root_task_id}
              activeTaskId={state.active_task_id}
              pendingQueue={state.pending_queue}
              agentProfiles={state.agent_profiles}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onOpenFactory={() => setShowFactoryDrawer(true)}
            />
          </section>

          {selectedTask ? (
            <aside className="xl:col-span-3 rounded-xl border border-gray-metallic/25 bg-surface/40 p-3 space-y-3 h-[72vh] min-h-[620px] overflow-auto">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-text-title line-clamp-2">{selectedTask.title}</h3>
                  <p className="text-xs text-gray-light">Agente: {selectedTask.agent_id}</p>
                </div>
                <button
                  onClick={() => setSelectedTaskId(null)}
                  className="p-1.5 rounded-md border border-gray-metallic/30 text-gray-light hover:text-text-title"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="rounded-md border border-gray-metallic/25 bg-dark/35 p-2 text-xs text-gray-light">
                <p className="text-text-title font-semibold mb-1">Estado atual</p>
                <p>{selectedTask.status}</p>
                <p className="mt-1">Complexidade: {selectedTask.complexity}</p>
              </div>

              <div className="rounded-md border border-cyan-400/25 bg-cyan-500/10 p-2 text-xs text-cyan-100">
                <p className="font-semibold mb-1">Contexto de delegacao</p>
                <p>Head responsável: {selectedTaskDelegation?.head?.title || 'Nao identificado'}</p>
                <p className="mt-1">Origem imediata: {selectedTaskDelegation?.parent?.title || 'Raiz da missão'}</p>
                <div className="mt-2">
                  <Link
                    href={`/chat?q=${encodeURIComponent(`Continuar execução da task ${selectedTask.title}`)}&task_id=${encodeURIComponent(selectedTask.id)}&initiative=${encodeURIComponent(selectedTask.title)}`}
                    className="inline-flex rounded-md border border-cyan-300/40 bg-cyan-500/15 px-2.5 py-1.5 text-[11px] text-cyan-100 hover:bg-cyan-500/25"
                  >
                    Continuar no chat
                  </Link>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-text-title">Execucao</p>
                <div className="space-y-2 max-h-40 overflow-auto pr-1">
                  {selectedTask.execution_logs.length === 0 ? (
                    <p className="text-xs text-gray-light">Sem logs ainda.</p>
                  ) : (
                    selectedTask.execution_logs.map((log, idx) => (
                      <div key={`${selectedTask.id}-log-${idx}`} className="rounded-md border border-gray-metallic/25 bg-dark/40 p-2 text-xs text-gray-light">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-text-title">Chat do agente</p>
                <div className="h-52 overflow-auto space-y-2 rounded-md border border-gray-metallic/25 bg-dark/35 p-2">
                  {selectedChatHistory.length === 0 ? (
                    <p className="text-xs text-gray-light">Sem mensagens ainda.</p>
                  ) : (
                    selectedChatHistory.map((item, idx) => (
                      <div
                        key={`${selectedTask.id}-chat-${idx}`}
                        className={[
                          'rounded-md px-2 py-1.5 text-xs',
                          item.role === 'user'
                            ? 'bg-primary/10 border border-primary/25 text-primary'
                            : 'bg-surface/60 border border-gray-metallic/30 text-text-default',
                        ].join(' ')}
                      >
                        <p className="font-semibold mb-1">{item.role === 'user' ? 'Voce' : 'Agente'}</p>
                        <p>{item.content}</p>
                        <p className="opacity-60 mt-1">{item.timestamp}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSendFromSidebar} className="flex items-center gap-2">
                  <input
                    value={microMessage}
                    onChange={(e) => setMicroMessage(e.target.value)}
                    placeholder="Orientar agente..."
                    className="flex-1 rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-xs text-text-default"
                  />
                  <button
                    type="submit"
                    disabled={sendingMicroMessage || !microMessage.trim()}
                    className="inline-flex items-center gap-1 rounded-md border border-secondary/40 bg-secondary/10 px-3 py-2 text-xs text-secondary hover:bg-secondary/20 disabled:opacity-50"
                  >
                    <Send size={13} />
                  </button>
                </form>
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {showFactoryDrawer ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
          <div className="absolute right-0 top-0 h-full w-full max-w-xl border-l border-primary/25 bg-darker p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-text-title">Agent Factory</h2>
                <p className="text-xs text-gray-light">Contrate novos agentes sob demanda.</p>
              </div>
              <button
                onClick={() => setShowFactoryDrawer(false)}
                className="p-1.5 rounded-md border border-gray-metallic/30 text-gray-light hover:text-text-title"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={hireAgent} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={hireName}
                  onChange={(e) => setHireName(e.target.value)}
                  placeholder="Nome"
                  className="rounded-md bg-surface border border-gray-metallic/35 px-3 py-2 text-sm text-text-default"
                />
                <input
                  value={hireDepartment}
                  onChange={(e) => setHireDepartment(e.target.value)}
                  placeholder="Departamento"
                  className="rounded-md bg-surface border border-gray-metallic/35 px-3 py-2 text-sm text-text-default"
                />
                <select
                  value={hireLevel}
                  onChange={(e) => setHireLevel(e.target.value as 'ceo' | 'director' | 'head' | 'analyst')}
                  className="rounded-md bg-surface border border-gray-metallic/35 px-3 py-2 text-sm text-text-default"
                >
                  <option value="ceo">CEO</option>
                  <option value="director">Diretor</option>
                  <option value="head">Head</option>
                  <option value="analyst">Analista</option>
                </select>
                <input
                  value={hireCapabilities}
                  onChange={(e) => setHireCapabilities(e.target.value)}
                  placeholder="Capacidades (virgula)"
                  className="rounded-md bg-surface border border-gray-metallic/35 px-3 py-2 text-sm text-text-default"
                />
              </div>

              <textarea
                value={hireBio}
                onChange={(e) => setHireBio(e.target.value)}
                placeholder="Bio/persona"
                className="w-full h-24 rounded-md bg-surface border border-gray-metallic/35 px-3 py-2 text-xs text-gray-light"
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={suggestTemplate}
                  className="rounded-md border border-yellow-400/35 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300 hover:bg-yellow-500/20"
                >
                  Sugestao de perfil
                </button>
                <button className="inline-flex items-center gap-2 rounded-md border border-secondary/35 bg-secondary/10 px-3 py-2 text-sm text-secondary hover:bg-secondary/20">
                  <UserPlus size={14} />
                  Contratar agente
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Agent edit drawer */}
      <AgentEditModal
        agent={editingAgent}
        isOpen={editingAgent !== null}
        onClose={() => setEditingAgent(null)}
        onSaved={() => { loadDbAgents(); setEditingAgent(null); }}
      />

      {/* API keys modal */}
      <ApiKeysModal
        isOpen={showApiKeysModal}
        onClose={() => setShowApiKeysModal(false)}
      />
    </LayoutPremium>
  );
}
