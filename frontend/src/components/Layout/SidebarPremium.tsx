'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Zap,
  MessageSquare,
  Settings,
  LogOut,
  LogIn,
  BarChart3,
  Bot,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { apiClient } from '@/lib/api';
import { useAgentRealtime } from '@/hooks/useWebRealtime';

interface Agent {
  id: string;
  name: string;
  type: string;
  state: 'idle' | 'thinking' | 'executing' | 'blocked' | 'error';
  model?: string;
}

type AgentLevel = 'ceo' | 'director' | 'head' | 'analyst';

const agentStateColor: Record<Agent['state'], string> = {
  idle: 'text-slate-300',
  thinking: 'text-yellow-300',
  executing: 'text-cyan-300',
  blocked: 'text-orange-300',
  error: 'text-red-300',
};

const agentStateLabel: Record<Agent['state'], string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  executing: 'Executing',
  blocked: 'Blocked',
  error: 'Error',
};

const levelBadge: Record<AgentLevel, string> = {
  ceo: 'CEO',
  director: 'Diretor',
  head: 'Head',
  analyst: 'Analista',
};

function inferAgentLevel(agent: Agent): AgentLevel {
  const normalized = `${agent.name} ${agent.type}`.toLowerCase();
  if (normalized.includes('ceo')) return 'ceo';
  if (normalized.includes('director') || normalized.includes('diretor') || normalized.includes('coordinator')) return 'director';
  if (normalized.includes('head')) return 'head';
  return 'analyst';
}

function levelIndent(level: AgentLevel): string {
  if (level === 'ceo') return 'pl-0';
  if (level === 'director') return 'pl-2';
  if (level === 'head') return 'pl-3.5';
  return 'pl-5';
}

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [teamHubCollapsed, setTeamHubCollapsed] = useState(false);
  const agentRealtime = useAgentRealtime();
  const pathname = usePathname();

  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const user = useAppStore((state) => state.user);
  const setLoginModalOpen = useAppStore((state) => state.setLoginModalOpen);
  const logout = useAppStore((state) => state.logout);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    logout();
  };

  useEffect(() => {
    const loadAgents = () => {
      apiClient
        .get('/agents/')
        .then((res) => {
          const list = res.data?.results || res.data || [];
          setAgents(list);
        })
        .catch(() => setAgents([]));
    };

    loadAgents();
    const interval = window.setInterval(loadAgents, 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsub = agentRealtime.subscribe('agent_status_changed', (message) => {
      const agentId = String(message.agent_id || '');
      const state = String(message.state || 'idle') as Agent['state'];

      setAgents((prev) => {
        if (!prev.some((a) => String(a.id) === agentId)) return prev;
        return prev.map((a) => (String(a.id) === agentId ? { ...a, state } : a));
      });
    });

    return () => {
      unsub();
    };
  }, [agentRealtime.subscribe]);

  const effectiveCollapsed = collapsed && !hoverExpanded;

  const orderedAgents = [...agents]
    .map((agent) => ({ ...agent, level: inferAgentLevel(agent) }))
    .sort((a, b) => {
      const order: Record<AgentLevel, number> = { ceo: 0, director: 1, head: 2, analyst: 3 };
      if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level];
      return a.name.localeCompare(b.name);
    });

  const navSections = [
    {
      title: 'VISÃO GERAL',
      items: [
        { icon: <Home size={18} />, label: 'Dashboard', href: '/dashboard' },
        { icon: <BarChart3 size={18} />, label: 'Analytics', href: '/analytics' },
        { icon: <GitBranch size={18} />, label: 'Playbooks', href: '/playbooks' },
      ],
    },
    {
      title: 'OPERACOES',
      items: [
        { icon: <Zap size={18} />, label: 'Execucao', href: '/execucao' },
        { icon: <GitBranch size={18} />, label: 'Organizacao', href: '/organizacao' },
      ],
    },
    {
      title: 'SUPORTE',
      items: [
        { icon: <MessageSquare size={18} />, label: 'Chat', href: '/chat' },
        { icon: <Settings size={18} />, label: 'Records', href: '/records' },
      ],
    },
  ];

  return (
    <aside
      onMouseEnter={() => {
        if (collapsed) setHoverExpanded(true);
      }}
      onMouseLeave={() => {
        if (collapsed) setHoverExpanded(false);
      }}
      className={`
        ${effectiveCollapsed ? 'w-20' : 'w-[232px]'}
        h-full min-h-0 shrink-0 border-r border-cyan-400/10 flex flex-col relative z-10
        bg-[#070d15]/70 backdrop-blur-xl transition-all duration-300
      `}
    >
      <div className={`${effectiveCollapsed ? 'p-3' : 'p-4'} shrink-0 border-b border-cyan-400/10 bg-[#0b1320]/65`}>
        <div className={`flex items-center ${effectiveCollapsed ? 'justify-center' : 'gap-3'} mb-2`}>
          <div className="p-2 rounded-lg bg-gradient-neon">
            <Zap size={20} className="text-dark" />
          </div>
          {!effectiveCollapsed && (
            <div>
              <h1 className="text-lg font-bold text-gradient-primary">Heuriskein</h1>
              <div className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                System Online
              </div>
            </div>
          )}
        </div>

      </div>

      <nav className={`sidebar-scroll ${effectiveCollapsed ? 'p-2.5 space-y-2' : 'p-3 space-y-3'} flex-1 min-h-0 overflow-y-auto`}>
        {navSections.map((section) => (
          <div key={section.title} className="space-y-1.5">
            {!effectiveCollapsed && <p className="px-1 text-[10px] uppercase tracking-[0.22em] text-slate-500">{section.title}</p>}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavItem
                  key={item.href}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  active={isActivePath(pathname, item.href)}
                  collapsed={effectiveCollapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className={`${effectiveCollapsed ? 'p-2.5' : 'p-3'} shrink-0 border-t border-cyan-400/10`}>
        <div className="flex items-center justify-between mb-2">
          {!effectiveCollapsed && <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.22em]">Team Hub</h3>}
          <div className="flex items-center gap-2">
            {!agentRealtime.isConnected && !effectiveCollapsed ? (
              <span className="rounded border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                offline
              </span>
            ) : null}
            <span className="text-xs font-mono text-primary">
              {agents.filter((a) => a.state === 'executing' || a.state === 'thinking').length} ativos
            </span>
            {!effectiveCollapsed && (
              <button
                onClick={() => setTeamHubCollapsed((v) => !v)}
                title={teamHubCollapsed ? 'Expandir agentes' : 'Compactar agentes'}
                className="p-1 rounded border border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20 transition-colors"
              >
                {teamHubCollapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
              </button>
            )}
          </div>
        </div>

        {!teamHubCollapsed && (
          agents.length === 0 ? (
            <p className="text-xs text-gray-dim text-center py-2">
              {agentRealtime.isConnected ? 'Sem agentes cadastrados' : 'Aguardando conexão com backend'}
            </p>
          ) : (
            <div className={`sidebar-scroll ${effectiveCollapsed ? 'space-y-1.5 max-h-40' : 'space-y-1 max-h-44'} overflow-y-auto pr-1`}>
              {orderedAgents.slice(0, 8).map((agent) => (
                <div
                  key={agent.id}
                  className={[
                    'group relative rounded-md px-2.5 py-2 transition-colors hover:bg-white/5',
                    levelIndent(agent.level),
                  ].join(' ')}
                >
                  <div className={`flex items-center ${effectiveCollapsed ? 'justify-center' : 'gap-2'}`}>
                    <div className="relative shrink-0">
                      {agent.state === 'executing' ? <span className="absolute -inset-1 rounded-full bg-cyan-400/20 blur-md animate-pulse" /> : null}
                      <div className="relative w-7 h-7 rounded-full bg-slate-900/85 border border-slate-700/80 flex items-center justify-center">
                        <Bot size={13} className={agentStateColor[agent.state]} />
                      </div>
                    </div>

                    {!effectiveCollapsed && (
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{agent.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{levelBadge[agent.level]} • {agentStateLabel[agent.state]}</p>
                      </div>
                    )}
                  </div>

                  {!effectiveCollapsed && agent.state === 'executing' ? (
                    <span className="absolute left-2.5 right-2.5 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
                  ) : null}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <div className={`${effectiveCollapsed ? 'p-2.5' : 'px-3 py-2.5'} shrink-0 border-t border-cyan-400/10 bg-[#0b1320]/65`}>
        <div className={`flex items-center gap-1.5 ${effectiveCollapsed ? 'flex-col justify-center' : 'justify-between'}`}>
          {isAuthenticated && user ? (
            <button
              onClick={handleLogout}
              title={`Sair (${user.username})`}
              className={`flex items-center gap-1.5 p-2 rounded-lg border border-red-500/25 text-red-300 hover:bg-red-500/10 text-xs font-medium transition-all min-w-0 ${!effectiveCollapsed ? 'flex-1' : ''}`}
            >
              <div className="w-5 h-5 rounded bg-primary/80 text-dark flex items-center justify-center font-bold text-[10px] shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
              {!effectiveCollapsed && <span className="truncate">{user.username}</span>}
            </button>
          ) : (
            <button
              onClick={() => setLoginModalOpen(true)}
              title="Entrar"
              className={`flex items-center gap-1.5 p-2 rounded-lg border border-primary/35 text-primary hover:bg-primary/10 text-xs font-medium transition-all ${!effectiveCollapsed ? 'flex-1' : ''}`}
            >
              <LogIn size={14} className="shrink-0" />
              {!effectiveCollapsed && <span>Entrar</span>}
            </button>
          )}

          <Link
            href="/configuracoes"
            title="Configurações"
            className={`p-2 rounded-lg border text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors ${
              isActivePath(pathname, '/configuracoes')
                ? 'border-primary/30 text-primary bg-primary/8'
                : 'border-white/8'
            }`}
          >
            <Settings size={15} />
          </Link>

          <button
            onClick={onToggleCollapse}
            title={effectiveCollapsed ? 'Expandir menu' : 'Compactar menu'}
            className="p-2 rounded-lg border border-white/8 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors shrink-0"
          >
            {effectiveCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>
      </div>
    </aside>
  );
}

function isActivePath(pathname: string, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
  collapsed?: boolean;
}

function NavItem({ icon, label, href, active = false, collapsed = false }: NavItemProps) {
  return (
    <Link
      href={href}
      title={label}
      className={`
        relative flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg transition-all duration-300 font-medium overflow-hidden
        ${
          active
            ? 'text-cyan-100 bg-gradient-to-r from-cyan-400/16 via-cyan-400/6 to-transparent'
            : 'text-gray-light hover:text-text-title hover:bg-cyan-500/8 border border-transparent'
        }
      `}
    >
      {active ? <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]" /> : null}
      <span>{icon}</span>
      {!collapsed && <span className="text-xs">{label}</span>}
    </Link>
  );
}
