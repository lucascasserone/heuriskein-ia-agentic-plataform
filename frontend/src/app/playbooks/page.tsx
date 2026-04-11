'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import ReactFlow, { Background, Controls, Edge, MarkerType, Node } from 'reactflow';
import { ArrowUpRight, Bot, Rocket, Sparkles, Workflow } from 'lucide-react';
import LayoutPremium from '@/components/Layout/LayoutPremium';
import { apiClient, WorkflowPlaybookItem, WorkflowRunItem } from '@/lib/api';

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<WorkflowPlaybookItem[]>([]);
  const [runs, setRuns] = useState<WorkflowRunItem[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('operations');
  const [scope, setScope] = useState<'task' | 'epic' | 'org' | 'global'>('global');
  const [graphText, setGraphText] = useState('[\n  {"action":"create_task","title":"Nova task: {initiative}","description":"Criada pelo workflow","priority":"medium","status":"queue"}\n]');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activePlaybookId, setActivePlaybookId] = useState<string | null>(null);
  const [deployPlaybook, setDeployPlaybook] = useState<WorkflowPlaybookItem | null>(null);
  const [deployPayloadText, setDeployPayloadText] = useState('{\n  "area": "operations",\n  "initiative": "Playbook Launch"\n}');

  const load = async () => {
    try {
      const [playbooksRes, runsRes] = await Promise.all([
        apiClient.getWorkflowPlaybooks(),
        apiClient.getWorkflowRuns(),
      ]);
      const playbooksList = (playbooksRes.data as any)?.results || playbooksRes.data || [];
      const runsList = (runsRes.data as any)?.results || runsRes.data || [];
      setPlaybooks(Array.isArray(playbooksList) ? playbooksList : []);
      setRuns(Array.isArray(runsList) ? runsList : []);
    } catch {
      setPlaybooks([]);
      setRuns([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!activePlaybookId && playbooks.length > 0) {
      setActivePlaybookId(playbooks[0].id);
    }
  }, [activePlaybookId, playbooks]);

  const seedTemplates = async () => {
    await apiClient.seedWorkflowPlaybooks();
    await load();
  };

  const createPlaybook = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const parsedGraph = JSON.parse(graphText);
      await apiClient.createWorkflowPlaybook({
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        description,
        category,
        scope,
        status: 'active',
        is_template: false,
        trigger_phrases: [],
        graph: Array.isArray(parsedGraph) ? parsedGraph : [],
      });
      setName('');
      setDescription('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const runPlaybook = async (playbook: WorkflowPlaybookItem) => {
    setRunningId(playbook.id);
    try {
      await apiClient.runWorkflowPlaybook(playbook.id, {
        scope: playbook.scope,
        input_payload: {
          area: playbook.category,
          initiative: playbook.name,
        },
      });
      await load();
    } finally {
      setRunningId(null);
    }
  };

  const parsedDraftSteps = (() => {
    try {
      const parsed = JSON.parse(graphText);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const activePlaybook = playbooks.find((item) => item.id === activePlaybookId) || null;
  const activeSteps = activePlaybook ? (Array.isArray(activePlaybook.graph) ? activePlaybook.graph : []) : parsedDraftSteps;

  const previewNodes: Node[] = activeSteps.map((step, index) => {
    const action = String(step?.action || `step_${index + 1}`);
    const titleValue = String(step?.title || step?.description || `Passo ${index + 1}`);

    return {
      id: `step-${index}`,
      position: { x: 60 + index * 260, y: 84 + ((index % 2) * 120) },
      data: {
        label: (
          <div className="min-w-[180px]">
            <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/80">STEP {index + 1}</p>
            <p className="mt-1 text-xs font-semibold text-white">{action}</p>
            <p className="mt-1 text-[11px] leading-5 text-gray-300">{titleValue}</p>
          </div>
        ),
      },
      style: {
        background: 'linear-gradient(165deg, rgba(6,11,22,0.96), rgba(8,16,28,0.92))',
        border: '1px solid rgba(34,211,238,0.35)',
        borderRadius: 18,
        color: '#fff',
        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.32), inset 0 0 0 1px rgba(255,255,255,0.03)',
      },
    };
  });

  const previewEdges: Edge[] = activeSteps.slice(1).map((_, index) => ({
    id: `edge-${index}`,
    source: `step-${index}`,
    target: `step-${index + 1}`,
    animated: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#22d3ee',
    },
    style: {
      stroke: '#22d3ee',
      strokeOpacity: 0.65,
      strokeWidth: 1.6,
    },
  }));

  const deployPayload = (() => {
    try {
      return JSON.parse(deployPayloadText);
    } catch {
      return null;
    }
  })();

  const deploySummary = (() => {
    if (!deployPlaybook) return null;
    const syntheticPrompt = `${deployPlaybook.name}\n${deployPlaybook.description || ''}\n${JSON.stringify(deployPlaybook.graph || [])}\n${JSON.stringify(deployPayload || {})}`;
    const estimatedTokens = Math.max(1, Math.ceil(syntheticPrompt.length / 4));
    const payloadBytes = new Blob([JSON.stringify(deployPayload || {})]).size;
    return {
      estimatedTokens,
      payloadBytes,
      stepCount: Array.isArray(deployPlaybook.graph) ? deployPlaybook.graph.length : 0,
    };
  })();

  return (
    <LayoutPremium>
      <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_42%),#05070A] p-4 lg:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] tracking-[0.28em] uppercase text-cyan-200/70 [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">CHAIN LAB</p>
            <h1 className="text-xl lg:text-2xl font-semibold text-white [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Playbooks & Workflows</h1>
            <p className="text-xs text-gray-300 [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Laboratório de chains com deploy contextual para IA.</p>
          </div>
          <button onClick={seedTemplates} className="group rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100/80 transition hover:border-cyan-300/40 hover:text-cyan-100 hover:shadow-[0_0_28px_rgba(34,211,238,0.25)]">
            Seed Templates
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4">
          <aside className="rounded-2xl border border-white/5 bg-white/[0.02] p-3 backdrop-blur-xl h-[calc(100vh-170px)] min-h-[620px] flex flex-col">
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/80 [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Template Library</p>
            </div>
            <div className="space-y-2 overflow-auto pr-1">
              {playbooks.length === 0 ? <p className="text-xs text-gray-400">Nenhum playbook cadastrado.</p> : playbooks.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActivePlaybookId(item.id)}
                  className={`group w-full rounded-xl border p-3 text-left transition ${activePlaybookId === item.id ? 'border-cyan-300/35 bg-cyan-500/10' : 'border-white/5 bg-white/[0.01] hover:border-cyan-300/25 hover:bg-cyan-500/5'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/65">{item.scope}</p>
                      <p className="mt-1 text-sm text-white [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">{item.name}</p>
                    </div>
                    <span className="text-[10px] text-gray-300">{item.run_count} runs</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-gray-300">{item.description || 'Sem descrição.'}</p>
                </button>
              ))}
            </div>

            <section className="mt-3 border-t border-white/5 pt-3 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">Recent Runs</p>
              <div className="max-h-[180px] overflow-auto pr-1 space-y-2">
                {runs.length === 0 ? <p className="text-xs text-gray-400">Sem execuções.</p> : runs.slice(0, 8).map((run) => (
                  <div key={run.id} className="rounded-lg border border-white/5 bg-black/20 p-2.5">
                    <p className="text-xs text-white">{run.playbook_name || 'Playbook'}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-[0.18em]">{run.status} · {run.scope}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-xl p-4 lg:p-5 space-y-4 min-h-[620px]">
            <div className="grid grid-cols-1 2xl:grid-cols-[1.15fr_0.85fr] gap-4">
              <form onSubmit={createPlaybook} className="rounded-2xl border border-white/5 bg-black/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.26em] text-cyan-200/70">Playbook Editor</p>
                    <h2 className="text-base text-white [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Laboratório de Chains</h2>
                  </div>
                  <Sparkles className="h-4 w-4 text-cyan-300" />
                </div>

                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da chain" className="w-full bg-transparent border-0 border-b border-white/10 px-0 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60" />
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição executiva" className="w-full bg-transparent border-0 border-b border-white/10 px-0 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categoria" className="w-full bg-transparent border-0 border-b border-white/10 px-0 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60" />
                  <select value={scope} onChange={(e) => setScope(e.target.value as 'task' | 'epic' | 'org' | 'global')} className="w-full bg-transparent border-0 border-b border-white/10 px-0 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60">
                    <option value="global" className="bg-darker">Global</option>
                    <option value="org" className="bg-darker">Org</option>
                    <option value="epic" className="bg-darker">Epic</option>
                    <option value="task" className="bg-darker">Task</option>
                  </select>
                </div>

                <textarea value={graphText} onChange={(e) => setGraphText(e.target.value)} className="w-full h-32 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] leading-5 text-cyan-100/90 [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]" />

                <div className="flex flex-wrap items-center gap-2">
                  <button disabled={saving || !name.trim()} className="rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-cyan-100/80 transition hover:border-cyan-300/45 hover:shadow-[0_0_26px_rgba(34,211,238,0.24)] disabled:opacity-50">
                    {saving ? 'Salvando...' : 'Salvar Chain'}
                  </button>
                  {activePlaybook ? (
                    <>
                      <button type="button" onClick={() => runPlaybook(activePlaybook)} disabled={runningId === activePlaybook.id} className="rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-cyan-100/80 transition hover:border-cyan-300/45 hover:shadow-[0_0_26px_rgba(34,211,238,0.24)] disabled:opacity-50">
                        {runningId === activePlaybook.id ? 'Executando...' : 'Executar Chain'}
                      </button>
                      <button type="button" onClick={() => setDeployPlaybook(activePlaybook)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-cyan-100/80 transition hover:border-cyan-300/45 hover:shadow-[0_0_26px_rgba(34,211,238,0.24)]">
                        <Rocket className="h-3.5 w-3.5" /> Deploy de Contexto
                      </button>
                    </>
                  ) : null}
                </div>
              </form>

              <section className="rounded-2xl border border-white/5 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">Graph View</p>
                    <p className="text-xs text-gray-300">Fluxo visual da operação recorrente</p>
                  </div>
                  <Workflow className="h-4 w-4 text-cyan-300" />
                </div>
                <div className="h-[360px] rounded-xl border border-white/10 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.07),transparent_45%),#05070A]">
                  <ReactFlow
                    nodes={previewNodes}
                    edges={previewEdges}
                    fitView
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background color="#1f2937" gap={20} size={1} />
                    <Controls showInteractive={false} position="bottom-right" />
                  </ReactFlow>
                </div>
              </section>
            </div>

            {deployPlaybook && deploySummary ? (
              <section className="rounded-2xl border border-cyan-300/25 bg-cyan-500/[0.06] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/80">Deploy de Contexto</p>
                    <h3 className="text-sm text-white [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">{deployPlaybook.name}</h3>
                  </div>
                  <button type="button" onClick={() => setDeployPlaybook(null)} className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-gray-200 hover:border-cyan-300/40">Fechar</button>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">Tokens estimados</p>
                    <p className="text-sm text-white">~{deploySummary.estimatedTokens}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">Payload</p>
                    <p className="text-sm text-white">{deploySummary.payloadBytes} bytes</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">Steps da chain</p>
                    <p className="text-sm text-white">{deploySummary.stepCount}</p>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/70 mb-1.5">Payload de injeção</p>
                  <textarea
                    value={deployPayloadText}
                    onChange={(e) => setDeployPayloadText(e.target.value)}
                    className={`w-full h-24 rounded-lg border px-3 py-2 text-[11px] leading-5 ${deployPayload ? 'border-white/10 text-cyan-100' : 'border-danger/45 text-red-200'} bg-black/30 [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]`}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/chat?playbook_id=${encodeURIComponent(deployPlaybook.id)}&playbook=${encodeURIComponent(deployPlaybook.slug)}&area=${encodeURIComponent(deployPlaybook.category || '')}&initiative=${encodeURIComponent(deployPlaybook.name)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-cyan-100/80 transition hover:border-cyan-300/45 hover:shadow-[0_0_26px_rgba(34,211,238,0.24)]"
                  >
                    <Bot className="h-3.5 w-3.5" /> Abrir sessão no chat
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                  <p className="text-[11px] text-gray-300">Resumo visível antes do envio para reduzir custo e ruído no contexto.</p>
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </div>
    </LayoutPremium>
  );
}
