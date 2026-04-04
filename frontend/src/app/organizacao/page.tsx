'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import LayoutPremium from '@/components/Layout/LayoutPremium';
import LiveOrgChart from '@/components/Organization/LiveOrgChart';
import { CompanyStateResponse, apiClient } from '@/lib/api';

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

interface AgentMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
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
  const [chatHistoryByTaskId, setChatHistoryByTaskId] = useState<Record<string, AgentMessage[]>>({});

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

  useEffect(() => {
    loadLatest();
  }, []);

  const runMission = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await apiClient.runOrgMission({
        mission_brief: missionBrief,
        constraints: constraints
          .split(';')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setState({ ...EMPTY_STATE, ...response.data.state });
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
      const agentContent = String(response.data?.agent_response || response.data?.response || 'Sem resposta do agente.');
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

  return (
    <LayoutPremium>
      <div className="flex-1 overflow-auto bg-dark p-4 lg:p-5 space-y-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-text-title">Organizacao Autonoma</h1>
          <p className="text-xs text-gray-light">
            Estrutura hierarquica corporativa (CEO, Diretores, Heads e Analistas) com delegacao recursiva no LangGraph.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-6 gap-3">
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 shadow-glow-primary">
            <p className="text-[11px] uppercase tracking-wider text-primary">Total de tarefas</p>
            <p className="mt-1 text-2xl font-bold text-text-title">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 shadow-[0_0_24px_rgba(16,185,129,0.28)]">
            <p className="text-[11px] uppercase tracking-wider text-emerald-300">Concluidas</p>
            <p className="mt-1 text-2xl font-bold text-text-title">{stats.done}</p>
          </div>
          <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 p-3 shadow-[0_0_24px_rgba(234,179,8,0.2)]">
            <p className="text-[11px] uppercase tracking-wider text-yellow-300">Em fluxo</p>
            <p className="mt-1 text-2xl font-bold text-text-title">{stats.running}</p>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 shadow-[0_0_24px_rgba(239,68,68,0.22)]">
            <p className="text-[11px] uppercase tracking-wider text-red-300">Rejeitadas</p>
            <p className="mt-1 text-2xl font-bold text-text-title">{stats.rejected}</p>
          </div>
          <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3">
            <p className="text-[11px] uppercase tracking-wider text-cyan-300">Custo estimado</p>
            <p className="mt-1 text-2xl font-bold text-text-title">{stats.estimatedTokens.toLocaleString()} tk</p>
          </div>
          <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
            <p className="text-[11px] uppercase tracking-wider text-violet-300">Tempo medio</p>
            <p className="mt-1 text-2xl font-bold text-text-title">{stats.avgResolutionMinutes} min</p>
            <p className="text-[10px] text-violet-200 mt-1">Delegações: {stats.delegationEvents}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <form onSubmit={runMission} className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-title">Iniciar missao corporativa</h2>
            <textarea
              value={missionBrief}
              onChange={(e) => setMissionBrief(e.target.value)}
              className="w-full h-24 rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-sm text-text-default"
            />
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              className="w-full h-16 rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-xs text-gray-light"
            />
            <button
              disabled={loading}
              className="rounded-md border border-primary/35 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {loading ? 'Executando missao...' : 'Executar missao'}
            </button>
            <button
              type="button"
              onClick={analyzeViability}
              disabled={loadingViability}
              className="ml-2 rounded-md border border-yellow-400/35 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-50"
            >
              {loadingViability ? 'Analisando...' : 'Analisar viabilidade'}
            </button>

            {viability ? (
              <div className="rounded-md border border-primary/25 bg-dark/35 p-3 text-xs space-y-1">
                <p className="text-text-title font-semibold">Viabilidade: {viability.score_percent}% ({viability.verdict})</p>
                <p className="text-gray-light">Complexidade: {viability.complexity}/10</p>
                {viability.reasons.map((reason, idx) => (
                  <p key={`viability-${idx}`} className="text-gray-light">• {reason}</p>
                ))}
              </div>
            ) : null}
          </form>

          <form onSubmit={hireAgent} className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-title">Agent Factory (Hiring)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={hireName}
                onChange={(e) => setHireName(e.target.value)}
                placeholder="Nome"
                className="rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-sm text-text-default"
              />
              <input
                value={hireDepartment}
                onChange={(e) => setHireDepartment(e.target.value)}
                placeholder="Departamento"
                className="rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-sm text-text-default"
              />
              <select
                value={hireLevel}
                onChange={(e) => setHireLevel(e.target.value as 'ceo' | 'director' | 'head' | 'analyst')}
                className="rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-sm text-text-default"
              >
                <option value="ceo">CEO</option>
                <option value="director">Diretor</option>
                <option value="head">Head</option>
                <option value="analyst">Analista</option>
              </select>
              <input
                value={hireCapabilities}
                onChange={(e) => setHireCapabilities(e.target.value)}
                placeholder="Capacidades separadas por virgula"
                className="rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-sm text-text-default"
              />
            </div>
            <textarea
              value={hireBio}
              onChange={(e) => setHireBio(e.target.value)}
              placeholder="Bio/persona do agente"
              className="w-full h-16 rounded-md bg-darker border border-gray-metallic/35 px-3 py-2 text-xs text-gray-light"
            />
            <button
              type="button"
              onClick={suggestTemplate}
              className="rounded-md border border-yellow-400/35 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300 hover:bg-yellow-500/20"
            >
              Sugestao de perfil
            </button>
            <button className="rounded-md border border-secondary/35 bg-secondary/10 px-3 py-2 text-sm text-secondary hover:bg-secondary/20">
              Contratar agente
            </button>
          </form>
        </div>

        <LiveOrgChart
          taskTree={state.task_tree}
          rootTaskId={state.root_task_id}
          agentProfiles={state.agent_profiles}
          chatHistoryByTaskId={chatHistoryByTaskId}
          onSendMessage={sendMicroMessage}
        />

        <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4">
          <h2 className="text-sm font-semibold text-text-title mb-2">Memoria corporativa recuperada pelo CEO</h2>
          <div className="space-y-2 text-xs text-gray-light">
            {(state.corporate_memory_hits || []).length === 0 ? (
              <p>Nenhuma experiencia similar encontrada ainda.</p>
            ) : (
              state.corporate_memory_hits.map((hit, idx) => (
                <div key={`hit-${idx}`} className="rounded-md border border-gray-metallic/25 bg-dark/40 p-2">
                  <p className="text-text-title">{String(hit.summary || 'Sem resumo')}</p>
                  <p className="opacity-80">Similarity: {String(hit.similarity || '-')}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </LayoutPremium>
  );
}
