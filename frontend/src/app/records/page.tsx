'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ReactFlow, { Background, Controls, Edge, Node } from 'reactflow';
import { BrainCircuit, FileText, Flame, Link2, Send, Sparkles, UploadCloud } from 'lucide-react';
import LayoutPremium from '@/components/Layout/LayoutPremium';
import {
  apiClient,
  ContextGraphResponse,
  CorporateDocumentItem,
  CorporateMemoryEntryItem,
  CorporatePromptContextResponse,
} from '@/lib/api';

const GRAPH_COLUMNS: Record<string, number> = {
  area: 0,
  initiative: 1,
  tag: 1,
  document: 2,
  memory: 3,
};

const GRAPH_COLORS: Record<string, string> = {
  area: '#22d3ee',
  initiative: '#10b981',
  tag: '#f59e0b',
  document: '#60a5fa',
  memory: '#f472b6',
};

export default function RecordsPage() {
  const [documents, setDocuments] = useState<CorporateDocumentItem[]>([]);
  const [memory, setMemory] = useState<CorporateMemoryEntryItem[]>([]);
  const [graph, setGraph] = useState<ContextGraphResponse>({ nodes: [], edges: [] });
  const [promptContext, setPromptContext] = useState<CorporatePromptContextResponse | null>(null);
  const [knowledgeQuery, setKnowledgeQuery] = useState('');
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<CorporateDocumentItem['doc_type']>('brief');
  const [area, setArea] = useState('');
  const [initiative, setInitiative] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const buildMediaUrl = (storedPath: string) => {
    const cleaned = (storedPath || '').replace(/^\/+/, '');
    if (!cleaned) return '';

    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
      const host = window.location.hostname || '127.0.0.1';
      const encodedPath = cleaned.split('/').map((segment) => encodeURIComponent(segment)).join('/');
      return `${protocol}//${host}:8001/media/${encodedPath}`;
    }

    return `http://127.0.0.1:8001/media/${cleaned}`;
  };

  const load = async () => {
    try {
      const [docsRes, memoryRes, graphRes] = await Promise.all([
        apiClient.getCorporateDocuments(),
        apiClient.getCorporateMemory(),
        apiClient.getCorporateContextGraph(),
      ]);
      const docs = (docsRes.data as any)?.results || docsRes.data || [];
      const mem = (memoryRes.data as any)?.results || memoryRes.data || [];
      setDocuments(Array.isArray(docs) ? docs : []);
      setMemory(Array.isArray(mem) ? mem : []);
      setGraph(graphRes.data || { nodes: [], edges: [] });
    } catch {
      setDocuments([]);
      setMemory([]);
      setGraph({ nodes: [], edges: [] });
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setSelectedNodeIds((prev) => prev.filter((id) => graph.nodes.some((node) => node.id === id)));
  }, [graph.nodes]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiClient.createCorporateDocument({
        title: title.trim(),
        doc_type: docType,
        status: 'active',
        scope: 'org',
        area: area.trim(),
        initiative: initiative.trim(),
        summary: summary.trim(),
        content: content.trim(),
        tags: [docType, area.trim()].filter(Boolean),
      });
      setTitle('');
      setArea('');
      setInitiative('');
      setSummary('');
      setContent('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    try {
      await apiClient.uploadCorporateDocument({
        file: uploadFile,
        title: title.trim() || undefined,
        doc_type: docType,
        scope: 'org',
        area: area.trim() || undefined,
        initiative: initiative.trim() || undefined,
        summary: summary.trim() || undefined,
        tags: [docType, area.trim(), initiative.trim()].filter(Boolean),
      });
      setUploadFile(null);
      setTitle('');
      setArea('');
      setInitiative('');
      setSummary('');
      await load();
    } finally {
      setUploading(false);
    }
  };

  const searchContext = async () => {
    if (!knowledgeQuery.trim()) {
      setPromptContext(null);
      return;
    }
    const response = await apiClient.getCorporatePromptContext({
      q: knowledgeQuery.trim(),
      area: area.trim() || undefined,
      initiative: initiative.trim() || undefined,
    });
    setPromptContext(response.data);
  };

  const flowNodes = useMemo<Node[]>(() => {
    const counters: Record<string, number> = {};
    return graph.nodes.map((item) => {
      const column = GRAPH_COLUMNS[item.type] ?? 0;
      const row = counters[item.type] ?? 0;
      counters[item.type] = row + 1;
      const selected = selectedNodeIds.includes(item.id);

      return {
        id: item.id,
        data: {
          label: (
            <div className="min-w-[160px] max-w-[220px] [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">{item.type}</p>
              <p className="text-xs font-semibold text-white leading-tight">{item.label}</p>
              <p className="mt-1 text-[10px] text-gray-400">{selected ? 'Selecionado para prompt' : 'Clique para preparar contexto'}</p>
            </div>
          ),
        },
        position: { x: 40 + column * 250, y: 24 + row * 90 },
        style: {
          background: selected ? 'linear-gradient(165deg, rgba(6,18,27,0.98), rgba(4,11,20,0.96))' : 'rgba(6, 10, 18, 0.92)',
          border: `1px solid ${selected ? '#22d3ee' : GRAPH_COLORS[item.type] || '#334155'}`,
          borderRadius: 16,
          color: '#fff',
          boxShadow: selected
            ? '0 0 0 1px rgba(34,211,238,0.35), 0 0 26px rgba(34,211,238,0.28), 0 14px 30px rgba(0,0,0,0.3)'
            : `0 0 0 1px ${GRAPH_COLORS[item.type] || '#334155'}20, 0 14px 30px rgba(0,0,0,0.24)`,
        },
      };
    });
  }, [graph.nodes, selectedNodeIds]);

  const nodeTemperature = useMemo(() => {
    const heat = new Map<string, number>();
    graph.nodes.forEach((node) => heat.set(node.id, 0));

    memory.forEach((entry) => {
      const sourceId = entry.source_id || '';
      const byId = graph.nodes.find((node) => node.id === sourceId);
      const byLabel = graph.nodes.find((node) => node.label.toLowerCase() === entry.title.toLowerCase());
      const targetNode = byId || byLabel;
      if (!targetNode) return;
      const current = heat.get(targetNode.id) || 0;
      heat.set(targetNode.id, current + Math.max(1, entry.times_reused || 0));
    });

    return heat;
  }, [graph.nodes, memory]);

  const flowEdges = useMemo<Edge[]>(() => {
    return graph.edges.map((edge) => ({
      ...(function () {
        const sourceHeat = nodeTemperature.get(edge.source) || 0;
        const targetHeat = nodeTemperature.get(edge.target) || 0;
        const temperature = (sourceHeat + targetHeat) / 2;
        const hot = temperature >= 3;

        return {
          animated: hot || edge.label === 'deriva',
          style: {
            stroke: hot ? '#f97316' : '#64748b',
            strokeWidth: hot ? 2 : 1.2,
            strokeDasharray: hot ? '5 4' : undefined,
            opacity: hot ? 0.95 : 0.72,
          },
        };
      })(),
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      labelStyle: { fill: '#cbd5e1', fontSize: 10 },
    }));
  }, [graph.edges, nodeTemperature]);

  const selectedNodes = useMemo(
    () => graph.nodes.filter((node) => selectedNodeIds.includes(node.id)),
    [graph.nodes, selectedNodeIds],
  );

  const selectedDocuments = useMemo(() => {
    return selectedNodes
      .filter((node) => node.type === 'document')
      .map((node) => {
        const byId = documents.find((doc) => doc.id === node.id || node.id.includes(doc.id));
        const byTitle = documents.find((doc) => doc.title.toLowerCase() === node.label.toLowerCase());
        return byId || byTitle || null;
      })
      .filter((doc): doc is CorporateDocumentItem => Boolean(doc));
  }, [documents, selectedNodes]);

  const selectedMemory = useMemo(() => {
    return selectedNodes
      .filter((node) => node.type === 'memory')
      .map((node) => memory.find((entry) => entry.id === node.id || entry.title.toLowerCase() === node.label.toLowerCase()) || null)
      .filter((entry): entry is CorporateMemoryEntryItem => Boolean(entry));
  }, [memory, selectedNodes]);

  const assembledPromptMarkdown = useMemo(() => {
    if (selectedDocuments.length === 0 && selectedMemory.length === 0 && !promptContext?.prompt_markdown) {
      return '';
    }

    const lines: string[] = [];
    lines.push('# Contexto Corporativo Selecionado');
    lines.push('');

    if (selectedDocuments.length > 0) {
      lines.push('## Documentos chave');
      selectedDocuments.forEach((doc) => {
        lines.push(`### ${doc.title}`);
        lines.push(`- Tipo: ${doc.doc_type}`);
        lines.push(`- Área: ${doc.area || 'n/a'}`);
        lines.push(`- Iniciativa: ${doc.initiative || 'n/a'}`);
        lines.push(`- Resumo: ${doc.summary || 'Sem resumo.'}`);
        if (doc.content) {
          lines.push('```txt');
          lines.push(doc.content.slice(0, 800));
          lines.push('```');
        }
        lines.push('');
      });
    }

    if (selectedMemory.length > 0) {
      lines.push('## Memória estratégica');
      selectedMemory.forEach((entry) => {
        lines.push(`- ${entry.title} (${entry.source_type}, reuso ${entry.times_reused}x): ${entry.summary || 'Sem resumo.'}`);
      });
      lines.push('');
    }

    if (promptContext?.prompt_markdown) {
      lines.push('## Bridge semântica automática');
      lines.push(promptContext.prompt_markdown);
      lines.push('');
    }

    return lines.join('\n').trim();
  }, [promptContext?.prompt_markdown, selectedDocuments, selectedMemory]);

  const toggleNode = (nodeId: string) => {
    setSelectedNodeIds((prev) => (prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]));
  };

  const copyPrompt = async () => {
    if (!assembledPromptMarkdown) return;
    await navigator.clipboard.writeText(assembledPromptMarkdown);
  };

  const hottestMemory = memory.slice().sort((a, b) => b.times_reused - a.times_reused).slice(0, 3);

  return (
    <LayoutPremium>
      <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.1),transparent_38%),#05070A] p-4 lg:p-5 space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/80 [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">CRYSTAL BRAIN</p>
          <h1 className="text-xl lg:text-2xl font-semibold text-white [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Corporate Records</h1>
          <p className="text-xs text-gray-300 [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Cérebro operacional da organização com ponte semântica para prompts LLM.</p>
        </div>

        <section className="grid grid-cols-1 2xl:grid-cols-[1.32fr_0.68fr] gap-4">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.26em] text-cyan-200/80">Obsidian Graph</p>
                <h2 className="text-sm text-white [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Mapa vivo do conhecimento</h2>
                <p className="text-xs text-gray-300">Clique em nós para montar o prompt. Arestas quentes indicam memória em alta consulta.</p>
              </div>
              <div className="text-[11px] text-cyan-200/80 [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">{graph.nodes.length} nós · {graph.edges.length} relações</div>
            </div>
            <div className="h-[520px] rounded-xl border border-white/10 bg-black/25 overflow-hidden">
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                fitView
                onNodeClick={(_, node) => toggleNode(node.id)}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#1f2937" gap={18} size={1} />
                <Controls showInteractive={false} position="bottom-right" />
              </ReactFlow>
            </div>

            <div className="mt-3 rounded-xl border border-orange-300/20 bg-orange-500/[0.08] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="h-4 w-4 text-orange-300" />
                <p className="text-[10px] uppercase tracking-[0.24em] text-orange-100/85">Temperatura da memória</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {hottestMemory.length === 0 ? <p className="text-xs text-orange-100/75">Sem dados de reuso ainda.</p> : hottestMemory.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-orange-300/25 bg-black/20 p-2.5">
                    <p className="text-xs text-white">{entry.title}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-orange-100/80">{entry.times_reused}x consultado</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3 backdrop-blur-xl">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-emerald-200/80">Semantic Bridge</p>
              <h2 className="text-sm text-white [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Área de preparação de prompt</h2>
              <p className="text-xs text-gray-300">Selecione nós no grafo. Os documentos aparecem aqui para montagem automática do bloco Markdown.</p>
            </div>
            <input value={knowledgeQuery} onChange={(e) => setKnowledgeQuery(e.target.value)} placeholder="Pergunta, tema ou missão" className="w-full bg-transparent border-0 border-b border-white/10 px-0 py-2 text-sm text-white outline-none transition focus:border-emerald-300/60" />
            <button onClick={searchContext} className="rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-emerald-100/85 transition hover:border-emerald-300/45 hover:shadow-[0_0_24px_rgba(16,185,129,0.22)]">
              Gerar contexto para prompt
            </button>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3 min-h-[160px]">
              <div className="flex items-center gap-2 mb-2">
                <BrainCircuit className="h-4 w-4 text-emerald-300" />
                <p className="text-[10px] uppercase tracking-[0.24em] text-emerald-200/80">Prompt Drawer</p>
              </div>
              {selectedDocuments.length === 0 ? <p className="text-xs text-gray-300">Nenhum documento selecionado no grafo.</p> : (
                <div className="space-y-2">
                  {selectedDocuments.map((doc, idx) => (
                    <div
                      key={doc.id}
                      className="rounded-lg border border-cyan-300/20 bg-cyan-500/[0.05] p-2.5 transition duration-300"
                      style={{ transform: `translateX(${Math.max(0, 8 - idx * 2)}px)` }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-white">{doc.title}</p>
                        <FileText className="h-3.5 w-3.5 text-cyan-200" />
                      </div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/70">{doc.doc_type} · {doc.area || 'sem área'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3 min-h-[240px]">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/80">Markdown otimizado</p>
                <button onClick={copyPrompt} disabled={!assembledPromptMarkdown} className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-gray-200 hover:border-emerald-300/45 disabled:opacity-45">Copiar</button>
              </div>
              {assembledPromptMarkdown ? (
                <pre className="whitespace-pre-wrap text-[11px] leading-5 text-gray-200 [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">{assembledPromptMarkdown}</pre>
              ) : (
                <p className="text-xs text-gray-300">Selecione documentos e memórias no grafo para montar automaticamente o contexto corporativo.</p>
              )}
            </div>

            <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/[0.06] p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/80 mb-1">Deploy para Chat</p>
              <Link
                href={`/chat?q=${encodeURIComponent('Use o contexto corporativo selecionado para orientar a execução com alta precisão.')}&area=${encodeURIComponent(area || '')}&initiative=${encodeURIComponent(initiative || '')}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-cyan-100/85 transition hover:border-cyan-300/45 hover:shadow-[0_0_24px_rgba(34,211,238,0.22)]"
              >
                <Send className="h-3.5 w-3.5" /> Abrir no chat com contexto
              </Link>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-4">
          <form onSubmit={submit} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm text-white [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Registro executivo</h2>
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="w-full bg-transparent border-0 border-b border-white/10 px-0 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60" />
            <select value={docType} onChange={(e) => setDocType(e.target.value as CorporateDocumentItem['doc_type'])} className="w-full bg-transparent border-0 border-b border-white/10 px-0 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60">
              <option value="brief">Brief</option>
              <option value="spec">Spec</option>
              <option value="report">Report</option>
              <option value="sop">SOP</option>
              <option value="retro">Retro</option>
              <option value="memo">Memo</option>
              <option value="playbook">Playbook</option>
            </select>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Área" className="w-full bg-transparent border-0 border-b border-white/10 px-0 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60" />
            <input value={initiative} onChange={(e) => setInitiative(e.target.value)} placeholder="Iniciativa" className="w-full bg-transparent border-0 border-b border-white/10 px-0 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60" />
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Resumo executivo" className="w-full h-20 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-gray-100" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Conteúdo técnico" className="w-full h-40 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-gray-100 [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]" />
            <button disabled={saving || !title.trim()} className="rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-cyan-100/85 transition hover:border-cyan-300/45 hover:shadow-[0_0_24px_rgba(34,211,238,0.24)] disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar documento'}
            </button>
          </form>

          <div className="space-y-3">
            <form onSubmit={upload} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <UploadCloud className="h-4 w-4 text-cyan-300" />
                <h2 className="text-sm text-white [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Ingestão de anexos</h2>
              </div>
              <p className="text-xs text-gray-300">Indexação automática para uso em prompts semânticos.</p>
              <input type="file" accept=".md,.txt,.pdf" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-text-default file:mr-3 file:rounded-md file:border-0 file:bg-cyan-500/15 file:px-3 file:py-1.5 file:text-cyan-200" />
              {uploadFile ? <p className="text-xs text-cyan-200">Selecionado: {uploadFile.name}</p> : null}
              <button disabled={uploading || !uploadFile} className="rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-cyan-100/85 transition hover:border-cyan-300/45 hover:shadow-[0_0_24px_rgba(34,211,238,0.24)] disabled:opacity-50">
                {uploading ? 'Processando arquivo...' : 'Anexar e indexar'}
              </button>
            </form>

            <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-sm text-white [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Documentos recentes</h2>
                <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70 inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> Linked to graph</p>
              </div>
              <div className="space-y-2 max-h-[340px] overflow-auto pr-1">
                {documents.length === 0 ? <p className="text-xs text-gray-light">Nenhum documento cadastrado.</p> : documents.map((doc) => (
                  <div key={doc.id} className="rounded-xl border border-white/10 bg-black/20 p-3 transition hover:border-cyan-300/30 hover:bg-cyan-500/[0.05]">
                    {(() => {
                      const attachment = ((doc.metadata as Record<string, unknown> | undefined)?.attachment || null) as Record<string, unknown> | null;
                      const attachmentName = String(attachment?.file_name || 'anexo');
                      const storedPath = String(attachment?.stored_path || '');
                      const mediaUrl = buildMediaUrl(storedPath);

                      return (
                        <>
                    <p className="text-sm font-medium text-text-title">{doc.title}</p>
                    <p className="text-xs text-gray-light">{doc.doc_type} · {doc.area || 'sem área'} · {doc.initiative || 'sem iniciativa'} · v{doc.version}</p>
                    <p className="text-xs text-gray-light mt-1">{doc.summary || 'Sem resumo.'}</p>
                    {attachment ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] text-cyan-200/80">Arquivo indexado: {attachmentName}</p>
                        {mediaUrl ? (
                          <a
                            href={mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-lg border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100/85 transition hover:border-cyan-300/45 hover:shadow-[0_0_20px_rgba(34,211,238,0.18)]"
                          >
                            Baixar / visualizar anexo
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <Link
                        href={`/chat?q=${encodeURIComponent(`Use os documentos sobre ${doc.title} para orientar os próximos passos.`)}&area=${encodeURIComponent(doc.area || '')}&initiative=${encodeURIComponent(doc.initiative || '')}`}
                        className="inline-flex rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100/85 transition hover:border-cyan-300/45 hover:shadow-[0_0_20px_rgba(34,211,238,0.18)]"
                      >
                        Usar no chat
                      </Link>
                    </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 backdrop-blur-xl">
              <h2 className="text-sm text-white mb-3 [font-family:'IBM_Plex_Sans',ui-sans-serif,system-ui]">Memória corporativa</h2>
              <div className="space-y-2 max-h-[340px] overflow-auto pr-1">
                {memory.length === 0 ? <p className="text-xs text-gray-light">Nenhuma memória registrada.</p> : memory.map((entry) => (
                  <button key={entry.id} onClick={() => apiClient.markCorporateMemoryReused(entry.id).then(load).catch(() => undefined)} className="w-full text-left rounded-xl border border-white/10 bg-black/20 p-3 transition hover:border-orange-300/35 hover:bg-orange-500/[0.06]">
                    <p className="text-sm font-medium text-text-title">{entry.title}</p>
                    <p className="text-xs text-gray-light">{entry.source_type} · reuso {entry.times_reused}x</p>
                    <p className="text-xs text-gray-light mt-1">{entry.summary || 'Sem resumo.'}</p>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </LayoutPremium>
  );
}
