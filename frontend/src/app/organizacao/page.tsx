'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft,
  Brain,
  CheckCircle2,
  FileCode2,
  Pencil,
  Play,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Users,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import LayoutPremium from '@/components/Layout/LayoutPremium';
import LiveOrgChart from '@/components/Organization/LiveOrgChart';
import AgentEditModal from '@/components/Modals/AgentEditModal';
import ApiKeysModal from '@/components/Modals/ApiKeysModal';
import {
  AgentItem,
  OrgCapabilitiesSummaryResponse,
  OrgMissionStatsResponse,
  AgentMessageItem,
  CompanyStateResponse,
  TaskArtifact,
  TaskWorkspaceResponse,
  apiClient,
} from '@/lib/api';

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

type OrgTab = 'overview' | 'approvals' | 'capabilities';

interface CapabilityCard {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'alpha';
  icon: 'agents' | 'approvals' | 'knowledge' | 'automation';
  quickAction: string;
}

const CAPABILITY_CARDS: CapabilityCard[] = [
  {
    id: 'agents',
    title: 'Multi-Agent Collaboration',
    description: 'Coordena CEO, diretores, heads e analistas com delegacao recursiva em tempo real.',
    status: 'active',
    icon: 'agents',
    quickAction: 'Ver organograma',
  },
  {
    id: 'approvals',
    title: 'Approval Workflow',
    description: 'Exibe tarefas aguardando aprovacao e acelera decisao com foco em aprovar/rejeitar.',
    status: 'active',
    icon: 'approvals',
    quickAction: 'Abrir fila de aprovacao',
  },
  {
    id: 'knowledge',
    title: 'Corporate Knowledge',
    description: 'Conecta contexto de memoria corporativa para apoiar execucao e padroes reutilizaveis.',
    status: 'alpha',
    icon: 'knowledge',
    quickAction: 'Explorar contexto no dashboard',
  },
  {
    id: 'automation',
    title: 'Playbooks & Automation',
    description: 'Estrutura de playbooks pronta para escalar execucao com workflows repetiveis.',
    status: 'alpha',
    icon: 'automation',
    quickAction: 'Abrir workflow center',
  },
];

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
  const [activeTab, setActiveTab] = useState<OrgTab>('overview');
  const [approvalNotesByTaskId, setApprovalNotesByTaskId] = useState<Record<string, string>>({});
  const [approvingTaskId, setApprovingTaskId] = useState<string | null>(null);
  const [approvalWorkspaceByTaskId, setApprovalWorkspaceByTaskId] = useState<Record<string, TaskWorkspaceResponse>>({});
  const [loadingApprovalWorkspaceTaskId, setLoadingApprovalWorkspaceTaskId] = useState<string | null>(null);
  const [expandedApprovalDiffTaskId, setExpandedApprovalDiffTaskId] = useState<string | null>(null);
  const [approvalFilterAgent, setApprovalFilterAgent] = useState<string>('all');
  const [approvalFilterRequiresDiff, setApprovalFilterRequiresDiff] = useState(false);
  const [approvalSortMode, setApprovalSortMode] = useState<'critical' | 'title'>('critical');
  const [selectedApprovalTaskIds, setSelectedApprovalTaskIds] = useState<string[]>([]);
  const [batchActionLoading, setBatchActionLoading] = useState<'approved' | 'rejected' | null>(null);
  const [batchItemStatusByTaskId, setBatchItemStatusByTaskId] = useState<Record<string, 'processing' | 'success' | 'error'>>({});
  const [batchResultSummary, setBatchResultSummary] = useState<{
    decision: 'approved' | 'rejected';
    success: number;
    failed: number;
    total: number;
  } | null>(null);
  const [orgMissionStats, setOrgMissionStats] = useState<OrgMissionStatsResponse | null>(null);
  const [capabilitiesSummary, setCapabilitiesSummary] = useState<OrgCapabilitiesSummaryResponse['capabilities']>([]);

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

  const loadMissionStats = async () => {
    try {
      const response = await apiClient.getOrgMissionStats();
      setOrgMissionStats(response.data || null);
    } catch {
      // keep fallback to derived frontend metrics
    }
  };

  const loadCapabilitiesSummary = async () => {
    try {
      const response = await apiClient.getOrgCapabilitiesSummary();
      setCapabilitiesSummary(response.data?.capabilities || []);
    } catch {
      // keep fallback cards
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
    loadMissionStats();
    loadCapabilitiesSummary();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadDbAgents();
        loadMissionStats();
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

  const approvalQueueTaskIds = useMemo(() => {
    const fromState = state.awaiting_approval_queue || [];
    if (fromState.length > 0) return fromState;
    return Object.values(state.task_tree || {})
      .filter((task) => task.status === 'awaiting_approval')
      .map((task) => task.id);
  }, [state.awaiting_approval_queue, state.task_tree]);

  const approvalQueueTasks = useMemo(() => {
    return approvalQueueTaskIds
      .map((taskId) => state.task_tree[taskId])
      .filter(Boolean);
  }, [approvalQueueTaskIds, state.task_tree]);

  const clarificationCount = useMemo(() => {
    return Object.values(state.task_tree || {}).filter((task) => (task.approval_notes || '').trim().length > 0).length;
  }, [state.task_tree]);

  const approvalAgentOptions = useMemo(() => {
    return Array.from(new Set(approvalQueueTasks.map((task) => task.agent_id))).sort();
  }, [approvalQueueTasks]);

  const renderCapabilityIcon = (icon: CapabilityCard['icon']) => {
    if (icon === 'agents') return <Users size={16} className="text-primary" />;
    if (icon === 'approvals') return <CheckCircle2 size={16} className="text-emerald-300" />;
    if (icon === 'knowledge') return <Brain size={16} className="text-cyan-300" />;
    return <Zap size={16} className="text-yellow-300" />;
  };

  const capabilityStatusById = useMemo(() => {
    const map: Record<string, 'active' | 'alpha'> = {};
    (capabilitiesSummary || []).forEach((item) => {
      map[item.id] = item.status;
    });
    return map;
  }, [capabilitiesSummary]);

  const artifactDiffBody = (artifact?: TaskArtifact | null) => {
    if (!artifact) return '';
    if (typeof artifact.content === 'string' && artifact.content.trim()) return artifact.content;
    const payload = artifact.payload || {};
    const payloadNewContent = (payload as { new_content?: unknown }).new_content;
    if (typeof payloadNewContent === 'string' && payloadNewContent.trim()) return payloadNewContent;
    const payloadDiff = (payload as { diff?: unknown }).diff;
    if (typeof payloadDiff === 'string' && payloadDiff.trim()) return payloadDiff;
    if (typeof artifact.preview === 'string' && artifact.preview.trim()) return artifact.preview;
    return '';
  };

  const pendingApprovalForTask = (taskId: string) => {
    const workspace = approvalWorkspaceByTaskId[taskId];
    return (workspace?.approval_requests || []).find((item) => item.status === 'pending');
  };

  const pendingArtifactForTask = (taskId: string) => {
    const workspace = approvalWorkspaceByTaskId[taskId];
    const pendingApproval = pendingApprovalForTask(taskId);
    if (!pendingApproval?.artifact) return null;
    return (workspace?.artifacts || []).find((artifact) => artifact.id === pendingApproval.artifact) || null;
  };

  const hasDiffForTask = (taskId: string) => {
    const artifact = pendingArtifactForTask(taskId);
    const diffBody = artifactDiffBody(artifact);
    return Boolean(diffBody);
  };

  const filteredApprovalQueueTasks = useMemo(() => {
    let items = [...approvalQueueTasks];

    if (approvalFilterAgent !== 'all') {
      items = items.filter((task) => task.agent_id === approvalFilterAgent);
    }

    if (approvalFilterRequiresDiff) {
      items = items.filter((task) => hasDiffForTask(task.id));
    }

    if (approvalSortMode === 'critical') {
      items.sort((a, b) => {
        if (b.complexity !== a.complexity) return b.complexity - a.complexity;
        return (a.title || '').localeCompare(b.title || '');
      });
    } else {
      items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    return items;
  }, [approvalQueueTasks, approvalFilterAgent, approvalFilterRequiresDiff, approvalSortMode, approvalWorkspaceByTaskId]);

  useEffect(() => {
    const validIds = new Set(approvalQueueTasks.map((task) => task.id));
    setSelectedApprovalTaskIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [approvalQueueTasks]);

  const toggleSelectedApprovalTask = (taskId: string) => {
    setSelectedApprovalTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const toggleSelectAllFilteredApprovals = () => {
    const ids = filteredApprovalQueueTasks.map((task) => task.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedApprovalTaskIds.includes(id));
    if (allSelected) {
      setSelectedApprovalTaskIds((prev) => prev.filter((id) => !ids.includes(id)));
      return;
    }
    setSelectedApprovalTaskIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const resolveApprovalDecision = async (taskId: string, decision: 'approved' | 'rejected') => {
    const workspaceFromCache = approvalWorkspaceByTaskId[taskId];
    const workspaceData = workspaceFromCache || (await apiClient.getTaskWorkspace(taskId)).data;
    const pendingApproval = (workspaceData?.approval_requests || []).find((item) => item.status === 'pending');

    if (!pendingApproval) {
      throw new Error('Pendente não encontrada');
    }

    await apiClient.decideTaskApproval(taskId, {
      approval_id: pendingApproval.id,
      decision,
      notes: (approvalNotesByTaskId[taskId] || '').trim(),
    });

    setApprovalNotesByTaskId((prev) => ({ ...prev, [taskId]: '' }));
    setApprovalWorkspaceByTaskId((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const loadApprovalWorkspace = async (taskId: string) => {
    if (loadingApprovalWorkspaceTaskId) return;
    setLoadingApprovalWorkspaceTaskId(taskId);
    try {
      const workspaceRes = await apiClient.getTaskWorkspace(taskId);
      setApprovalWorkspaceByTaskId((prev) => ({
        ...prev,
        [taskId]: workspaceRes.data,
      }));
    } catch {
      window.alert('Falha ao carregar detalhes da aprovacao para esta task.');
    } finally {
      setLoadingApprovalWorkspaceTaskId(null);
    }
  };

  const decideApprovalForTask = async (taskId: string, decision: 'approved' | 'rejected') => {
    if (approvingTaskId || batchActionLoading) return;

    setApprovingTaskId(taskId);
    try {
      await resolveApprovalDecision(taskId, decision);
      await loadLatest();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kanban:refresh'));
      }
    } catch {
      window.alert('Falha ao registrar decisao de aprovacao. Tente novamente.');
    } finally {
      setApprovingTaskId(null);
    }
  };

  const decideSelectedApprovals = async (decision: 'approved' | 'rejected') => {
    if (batchActionLoading || approvingTaskId) return;

    const targetIds = selectedApprovalTaskIds.filter((id) => filteredApprovalQueueTasks.some((task) => task.id === id));
    if (targetIds.length === 0) {
      window.alert('Selecione pelo menos uma task para ação em lote.');
      return;
    }

    setBatchActionLoading(decision);
    setBatchResultSummary(null);
    setBatchItemStatusByTaskId({});
    let success = 0;
    let failed = 0;

    for (const taskId of targetIds) {
      setBatchItemStatusByTaskId((prev) => ({ ...prev, [taskId]: 'processing' }));
      try {
        await resolveApprovalDecision(taskId, decision);
        success += 1;
        setBatchItemStatusByTaskId((prev) => ({ ...prev, [taskId]: 'success' }));
      } catch {
        failed += 1;
        setBatchItemStatusByTaskId((prev) => ({ ...prev, [taskId]: 'error' }));
      }
    }

    await loadLatest();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kanban:refresh'));
    }
    setSelectedApprovalTaskIds([]);
    setBatchActionLoading(null);
    setBatchResultSummary({ decision, success, failed, total: targetIds.length });
  };

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

          <div className="mt-3 inline-flex rounded-lg border border-gray-metallic/25 bg-surface/50 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={[
                'rounded-md px-3 py-1.5 text-xs transition-colors',
                activeTab === 'overview'
                  ? 'bg-primary/20 text-primary border border-primary/35'
                  : 'text-gray-light hover:text-text-title',
              ].join(' ')}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('approvals')}
              className={[
                'rounded-md px-3 py-1.5 text-xs transition-colors inline-flex items-center gap-1.5',
                activeTab === 'approvals'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                  : 'text-gray-light hover:text-text-title',
              ].join(' ')}
            >
              Approvals
              {approvalQueueTasks.length > 0 ? (
                <span className="rounded-full border border-emerald-300/40 bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-200">
                  {approvalQueueTasks.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('capabilities')}
              className={[
                'rounded-md px-3 py-1.5 text-xs transition-colors',
                activeTab === 'capabilities'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-300/35'
                  : 'text-gray-light hover:text-text-title',
              ].join(' ')}
            >
              Capabilities
            </button>
          </div>
        </div>

        {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
          <aside className={selectedTask ? 'xl:col-span-4 space-y-3' : 'xl:col-span-6 space-y-3'}>
            <section className="rounded-xl border border-red-400/25 bg-gradient-to-br from-red-500/10 via-surface/50 to-transparent p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-text-title">Acao requerida</h2>
                <span className="rounded border border-red-400/35 bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-200">
                  {(orgMissionStats?.approvingPending ?? approvalQueueTasks.length) + (orgMissionStats?.clarificationsNeeded ?? clarificationCount)}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('approvals')}
                  className="rounded-md border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-left text-xs text-emerald-200 hover:bg-emerald-500/20"
                >
                  <p className="font-semibold">Aprovacoes pendentes</p>
                  <p className="opacity-85">{orgMissionStats?.approvingPending ?? approvalQueueTasks.length} itens aguardando decisao</p>
                </button>
                <div className="rounded-md border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-left text-xs text-cyan-100">
                  <p className="font-semibold">Notas para revisar</p>
                  <p className="opacity-85">{orgMissionStats?.clarificationsNeeded ?? clarificationCount} tasks com observacoes</p>
                </div>
              </div>
            </section>

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
        ) : null}

        {activeTab === 'approvals' ? (
          <section className="rounded-xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 via-surface/50 to-transparent p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-text-title">Fila de aprovacao</h2>
                <p className="text-xs text-gray-light">Itens que precisam de decisao para destravar execucao.</p>
              </div>
              <span className="rounded border border-emerald-400/35 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-200">
                {filteredApprovalQueueTasks.length}/{approvalQueueTasks.length} pendentes
              </span>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <select
                  value={approvalFilterAgent}
                  onChange={(e) => setApprovalFilterAgent(e.target.value)}
                  className="rounded-md bg-darker border border-gray-metallic/35 px-2.5 py-1.5 text-xs text-text-default"
                >
                  <option value="all">Todos os agentes</option>
                  {approvalAgentOptions.map((agentId) => (
                    <option key={`approval-agent-${agentId}`} value={agentId}>{agentId}</option>
                  ))}
                </select>

                <select
                  value={approvalSortMode}
                  onChange={(e) => setApprovalSortMode(e.target.value as 'critical' | 'title')}
                  className="rounded-md bg-darker border border-gray-metallic/35 px-2.5 py-1.5 text-xs text-text-default"
                >
                  <option value="critical">Ordenar por criticidade</option>
                  <option value="title">Ordenar por titulo</option>
                </select>

                <label className="inline-flex items-center gap-2 rounded-md border border-gray-metallic/35 bg-darker px-2.5 py-1.5 text-xs text-text-default">
                  <input
                    type="checkbox"
                    checked={approvalFilterRequiresDiff}
                    onChange={(e) => setApprovalFilterRequiresDiff(e.target.checked)}
                  />
                  Somente com diff
                </label>

                <button
                  type="button"
                  onClick={toggleSelectAllFilteredApprovals}
                  className="rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/20"
                >
                  Selecionar filtradas
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={batchActionLoading !== null || selectedApprovalTaskIds.length === 0}
                  onClick={() => decideSelectedApprovals('approved')}
                  className="rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {batchActionLoading === 'approved' ? 'Aprovando lote...' : `Aprovar selecionadas (${selectedApprovalTaskIds.length})`}
                </button>
                <button
                  type="button"
                  disabled={batchActionLoading !== null || selectedApprovalTaskIds.length === 0}
                  onClick={() => decideSelectedApprovals('rejected')}
                  className="rounded-md border border-red-400/35 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                >
                  {batchActionLoading === 'rejected' ? 'Rejeitando lote...' : `Rejeitar selecionadas (${selectedApprovalTaskIds.length})`}
                </button>
                <span className="text-[11px] text-gray-light">
                  Dica: para filtrar por diff, carregue detalhes das tasks desejadas.
                </span>
              </div>

              {batchResultSummary ? (
                <div className="rounded-md border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] text-gray-light">
                  <span className="text-text-title font-semibold mr-2">Resultado do lote:</span>
                  <span className="mr-2">acao {batchResultSummary.decision === 'approved' ? 'aprovar' : 'rejeitar'}</span>
                  <span className="mr-2 text-emerald-300">sucesso {batchResultSummary.success}</span>
                  <span className="mr-2 text-red-300">falhas {batchResultSummary.failed}</span>
                  <span>total {batchResultSummary.total}</span>
                </div>
              ) : null}
            </div>

            {filteredApprovalQueueTasks.length === 0 ? (
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-4 text-sm text-emerald-200">
                Nenhuma tarefa corresponde aos filtros atuais.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredApprovalQueueTasks.map((task) => (
                  <div key={`approval-${task.id}`} className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
                    {(() => {
                      const workspace = approvalWorkspaceByTaskId[task.id];
                      const pendingApproval = (workspace?.approval_requests || []).find((item) => item.status === 'pending');
                      const pendingArtifact = pendingApproval?.artifact
                        ? (workspace?.artifacts || []).find((artifact) => artifact.id === pendingApproval.artifact)
                        : null;
                      const diffBody = artifactDiffBody(pendingArtifact);

                      return (
                        <>
                    <div className="flex items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-xs text-gray-light">
                        <input
                          type="checkbox"
                          checked={selectedApprovalTaskIds.includes(task.id)}
                          onChange={() => toggleSelectedApprovalTask(task.id)}
                        />
                        Selecionar
                      </label>
                      {batchItemStatusByTaskId[task.id] ? (
                        <span
                          className={[
                            'rounded border px-2 py-0.5 text-[10px] uppercase',
                            batchItemStatusByTaskId[task.id] === 'processing'
                              ? 'border-yellow-300/35 bg-yellow-500/10 text-yellow-200'
                              : batchItemStatusByTaskId[task.id] === 'success'
                                ? 'border-emerald-300/35 bg-emerald-500/10 text-emerald-200'
                                : 'border-red-300/35 bg-red-500/10 text-red-200',
                          ].join(' ')}
                        >
                          {batchItemStatusByTaskId[task.id] === 'processing'
                            ? 'processando'
                            : batchItemStatusByTaskId[task.id] === 'success'
                              ? 'ok'
                              : 'falha'}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-text-title line-clamp-2">{task.title}</p>
                        <p className="text-[11px] text-gray-light">Task ID: {task.id} · Agente: {task.agent_id}</p>
                      </div>
                      <span className="rounded border border-yellow-400/35 bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-200 uppercase">
                        {task.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-light line-clamp-3">{task.objective}</p>
                    {pendingApproval ? (
                      <div className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-100 space-y-1">
                        <p>
                          <span className="font-semibold">Rationale:</span> {pendingApproval.rationale || 'Sem justificativa adicional.'}
                        </p>
                        <p>
                          <span className="font-semibold">Approval ID:</span> {pendingApproval.id}
                        </p>
                        {pendingArtifact ? (
                          <p>
                            <span className="font-semibold">Artefato:</span> {pendingArtifact.relative_path || pendingArtifact.title}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {expandedApprovalDiffTaskId === task.id && diffBody ? (
                      <pre className="rounded-md border border-cyan-400/20 bg-dark/60 p-2 text-[11px] text-cyan-100 overflow-auto max-h-48 whitespace-pre-wrap">
{diffBody}
                      </pre>
                    ) : null}
                    {task.approval_notes ? (
                      <div className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 py-1.5 text-[11px] text-cyan-100">
                        {task.approval_notes}
                      </div>
                    ) : null}
                    <textarea
                      value={approvalNotesByTaskId[task.id] || ''}
                      onChange={(e) =>
                        setApprovalNotesByTaskId((prev) => ({
                          ...prev,
                          [task.id]: e.target.value,
                        }))
                      }
                      placeholder="Notas da decisao (opcional)"
                      className="w-full h-16 rounded-md bg-darker border border-gray-metallic/35 px-2 py-1.5 text-[11px] text-text-default"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {!pendingApproval ? (
                        <button
                          type="button"
                          disabled={loadingApprovalWorkspaceTaskId === task.id}
                          onClick={() => loadApprovalWorkspace(task.id)}
                          className="rounded-md border border-cyan-300/35 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
                        >
                          {loadingApprovalWorkspaceTaskId === task.id ? 'Carregando...' : 'Carregar detalhes'}
                        </button>
                      ) : null}
                      {pendingApproval && diffBody ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedApprovalDiffTaskId((prev) => (prev === task.id ? null : task.id))
                          }
                          className="rounded-md border border-cyan-300/35 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/20"
                        >
                          {expandedApprovalDiffTaskId === task.id ? 'Ocultar diff' : 'Ver diff'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={approvingTaskId === task.id || batchActionLoading !== null}
                        onClick={() => decideApprovalForTask(task.id, 'approved')}
                        className="rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        {approvingTaskId === task.id ? 'Processando...' : 'Aprovar'}
                      </button>
                      <button
                        type="button"
                        disabled={approvingTaskId === task.id || batchActionLoading !== null}
                        onClick={() => decideApprovalForTask(task.id, 'rejected')}
                        className="rounded-md border border-red-400/35 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        {approvingTaskId === task.id ? 'Processando...' : 'Rejeitar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTaskId(task.id);
                          setActiveTab('overview');
                        }}
                        className="rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1 text-[11px] text-primary hover:bg-primary/20"
                      >
                        Abrir task
                      </button>
                      <Link
                        href={`/chat?q=${encodeURIComponent(`Revisar aprovacao da task ${task.title}`)}&task_id=${encodeURIComponent(task.id)}&initiative=${encodeURIComponent(task.title)}`}
                        className="inline-flex rounded-md border border-cyan-300/40 bg-cyan-500/15 px-2.5 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/25"
                      >
                        Revisar no chat
                      </Link>
                    </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'capabilities' ? (
          <section className="space-y-3">
            <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 via-surface/50 to-transparent p-4">
              <h2 className="text-base font-semibold text-text-title">Capabilities da organizacao</h2>
              <p className="text-xs text-gray-light mt-1">
                Visao clara do que ja esta disponivel para operacao no modo autonomo.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CAPABILITY_CARDS.map((card) => (
                <article key={card.id} className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2">
                      {renderCapabilityIcon(card.icon)}
                      <h3 className="text-sm font-semibold text-text-title">{card.title}</h3>
                    </div>
                    <span
                      className={[
                        'rounded border px-2 py-0.5 text-[10px] uppercase',
                        (capabilityStatusById[card.id] || card.status) === 'active'
                          ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
                          : 'border-cyan-300/35 bg-cyan-500/15 text-cyan-200',
                      ].join(' ')}
                    >
                      {capabilityStatusById[card.id] || card.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-light">{card.description}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {card.id === 'approvals' ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab('approvals')}
                        className="rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20"
                      >
                        {card.quickAction}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveTab('overview')}
                        className="rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1 text-[11px] text-primary hover:bg-primary/20"
                      >
                        {card.quickAction}
                      </button>
                    )}
                    {card.id === 'knowledge' ? (
                      <Link
                        href="/dashboard"
                        className="rounded-md border border-cyan-300/35 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/20"
                      >
                        Ver dashboard executivo
                      </Link>
                    ) : null}
                    {card.id === 'automation' ? (
                      <Link
                        href="/chat?q=Executar%20playbook%20de%20deploy"
                        className="rounded-md border border-yellow-400/35 bg-yellow-500/10 px-2.5 py-1 text-[11px] text-yellow-200 hover:bg-yellow-500/20"
                      >
                        Iniciar no chat
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
              Etapa 1 ativa: visibilidade + fila de aprovacao + acoes rapidas de operacao.
            </div>
          </section>
        ) : null}
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
