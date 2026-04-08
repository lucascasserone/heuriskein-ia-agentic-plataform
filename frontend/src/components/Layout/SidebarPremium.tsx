'use client';

import React, { useState, useEffect } from 'react';
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

const agentStateColor: Record<string, string> = {
  idle: 'bg-gray-500',
  thinking: 'bg-yellow-400 animate-led-pulse',
  executing: 'bg-primary animate-led-pulse shadow-glow-primary',
  blocked: 'bg-orange-400',
  error: 'bg-red-500',
};

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
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

  // Load agents from API
  useEffect(() => {
    const loadAgents = () => {
      apiClient.get('/agents/')
        .then((res) => {
          const list = res.data?.results || res.data || [];
          setAgents(list);
        })
        .catch(() => setAgents([]));
    };
    loadAgents();
    const interval = window.setInterval(loadAgents, 15000);
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

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`
          ${collapsed ? 'w-20' : 'w-[212px]'} h-full min-h-0 shrink-0 bg-darker border-r border-primary/10 flex flex-col relative z-10
          transition-all duration-300
        `}
      >
        {/* ===== HEADER ===== */}
        <div className={`${collapsed ? 'p-3' : 'p-6'} shrink-0 border-b border-primary/10 bg-surface`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} mb-2`}>
            <div className="p-2 rounded-lg bg-gradient-neon">
              <Zap size={20} className="text-dark" />
            </div>
            {!collapsed && (
              <div>
                <h1 className="text-lg font-bold text-gradient-primary">Heuriskein</h1>
                <p className="text-xs text-gray-light">IA Agentic System</p>
              </div>
            )}
          </div>
          <div className={`flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-md border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title={collapsed ? 'Expandir menu' : 'Compactar menu'}
            >
              {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
          </div>
        </div>

        {/* ===== AGENT STATUS ===== */}
        <div className={`${collapsed ? 'p-2.5' : 'p-4'} shrink-0 border-b border-primary/10`}>
          <div className="flex items-center justify-between mb-3">
            {!collapsed && (
              <h3 className="text-xs font-bold text-text-title uppercase tracking-widest">
                Agentes
              </h3>
            )}
            <span className="text-xs font-mono text-primary">
              {agents.filter((a) => a.state === 'executing' || a.state === 'thinking').length} ativos
            </span>
          </div>
          {agents.length === 0 ? (
            <p className="text-xs text-gray-dim text-center py-2">Sem agentes cadastrados</p>
          ) : (
            <div className={`${collapsed ? 'space-y-1.5 max-h-36' : 'space-y-2 max-h-44'} overflow-y-auto pr-1`}>
              {agents.slice(0, 5).map((agent) => (
                <div key={agent.id} className={`glassmorphism px-3 py-2 rounded-lg flex items-center ${collapsed ? 'justify-center' : 'gap-2'}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${agentStateColor[agent.state] || 'bg-gray-500'}`} />
                  {!collapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-title truncate">{agent.name}</p>
                      <p className="text-xs text-gray-dim font-mono">{agent.state}</p>
                    </div>
                  )}
                  <Bot size={12} className="text-gray-dim shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== NAVIGATION ===== */}
        <nav className={`${collapsed ? 'p-2.5 space-y-1.5' : 'p-4 space-y-2'} flex-1 min-h-0 overflow-y-auto`}>
          <NavItem icon={<Home size={18} />} label="Dashboard" href="/dashboard" active={isActivePath(pathname, '/dashboard')} collapsed={collapsed} />
          <NavItem icon={<Zap size={18} />} label="Execução" href="/execucao" active={isActivePath(pathname, '/execucao')} collapsed={collapsed} />
          <NavItem icon={<BarChart3 size={18} />} label="Analytics" href="/analytics" active={isActivePath(pathname, '/analytics')} collapsed={collapsed} />
          <NavItem icon={<GitBranch size={18} />} label="Organização" href="/organizacao" active={isActivePath(pathname, '/organizacao')} collapsed={collapsed} />
          <NavItem icon={<MessageSquare size={18} />} label="Chat" href="/chat" active={isActivePath(pathname, '/chat')} collapsed={collapsed} />
          <NavItem icon={<Settings size={18} />} label="Configurações" href="/configuracoes" active={isActivePath(pathname, '/configuracoes')} collapsed={collapsed} />
        </nav>

        {/* ===== FOOTER/USER ===== */}
        <div className={`${collapsed ? 'p-2.5' : 'p-4'} shrink-0 border-t border-primary/10 space-y-3 bg-surface`}>
          {isAuthenticated && user ? (
            <>
              <div className="glassmorphism p-3 rounded-lg border border-primary/20">
                <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
                  <div className="w-10 h-10 rounded-lg bg-primary text-dark flex items-center justify-center font-bold">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  {!collapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-title truncate">{user.username}</p>
                      <p className="text-xs text-gray-light truncate">{user.email}</p>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Sair"
                className="
                  w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                  bg-red-900/20 text-red-400 font-bold text-xs
                  border border-red-500/30
                  hover:bg-red-900/30 transition-all
                "
              >
                <LogOut size={18} />
                {!collapsed && 'Sair'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setLoginModalOpen(true)}
              title="Entrar"
              className="
                w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                bg-primary text-dark font-bold text-xs
                border border-primary-light
                hover:shadow-glow-primary-lg transition-all
              "
            >
              <LogIn size={18} />
              {!collapsed && 'Entrar'}
            </button>
          )}
        </div>
      </aside>
    </>
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
        flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-4 py-2.5 rounded-lg transition-all duration-300 font-medium
        ${
          active
            ? 'bg-primary/20 text-primary border border-primary/40 shadow-glow-primary'
            : 'text-gray-light hover:text-text-title hover:bg-primary/10 border border-transparent'
        }
      `}
    >
      <span>{icon}</span>
      {!collapsed && <span className="text-xs">{label}</span>}
    </Link>
  );
}
