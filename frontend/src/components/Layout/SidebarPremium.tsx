'use client';

import React, { useState, useEffect } from 'react';
import {
  Home,
  Zap,
  MessageSquare,
  Settings,
  LogOut,
  LogIn,
  Plus,
  BarChart3,
  Bot,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import CreateEpicModal from '@/components/Modals/CreateEpicModal';
import CreateTaskModal from '@/components/Modals/CreateTaskModal';
import { apiClient } from '@/lib/api';

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
  onCreateEpic?: () => void;
  onCreateTask?: () => void;
}

export default function Sidebar({ onCreateEpic, onCreateTask }: SidebarProps) {
  const [isCreateEpicOpen, setIsCreateEpicOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

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

  const openCreateEpic = () => {
    setIsCreateEpicOpen(true);
    onCreateEpic?.();
  };

  const openCreateTask = () => {
    setIsCreateTaskOpen(true);
    onCreateTask?.();
  };

  const handleModalSuccess = () => {
    window.dispatchEvent(new CustomEvent('kanban:refresh'));
  };

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`
          w-80 shrink-0 bg-darker border-r border-primary/10 flex flex-col relative z-10
        `}
      >
        {/* ===== HEADER ===== */}
        <div className="p-6 border-b border-primary/10 bg-surface">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-gradient-neon">
              <Zap size={20} className="text-dark" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gradient-primary">Heuriskein</h1>
              <p className="text-xs text-gray-dim">IA Agentic System</p>
            </div>
          </div>
        </div>

        {/* ===== QUICK ACTIONS ===== */}
        <div className="p-4 border-b border-primary/10 space-y-2">
          <button
            type="button"
            onClick={openCreateEpic}
            className="
              w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
              bg-primary text-dark font-bold text-sm
              border border-primary-light shadow-glow-primary
              transition-all duration-300
              hover:shadow-glow-primary-lg hover:scale-105
              active:scale-95
            "
          >
            <Plus size={18} />
            + Nova Épica
          </button>
          <button
            type="button"
            onClick={openCreateTask}
            className="
              w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
              bg-success text-dark font-bold text-sm
              border border-success shadow-glow-success
              transition-all duration-300
              hover:shadow-glow-primary hover:scale-105
              active:scale-95
            "
          >
            <Plus size={18} />
            + Nova Tarefa
          </button>
        </div>

        {/* ===== AGENT STATUS ===== */}
        <div className="p-4 border-b border-primary/10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-text-title uppercase tracking-widest">
              Agentes
            </h3>
            <span className="text-xs font-mono text-primary">
              {agents.filter((a) => a.state === 'executing' || a.state === 'thinking').length} ativos
            </span>
          </div>
          {agents.length === 0 ? (
            <p className="text-xs text-gray-dim text-center py-2">Sem agentes cadastrados</p>
          ) : (
            <div className="space-y-2">
              {agents.slice(0, 5).map((agent) => (
                <div key={agent.id} className="glassmorphism px-3 py-2 rounded-lg flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${agentStateColor[agent.state] || 'bg-gray-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-title truncate">{agent.name}</p>
                    <p className="text-xs text-gray-dim font-mono">{agent.state}</p>
                  </div>
                  <Bot size={12} className="text-gray-dim shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== NAVIGATION ===== */}
        <nav className="flex-1 p-4 space-y-2">
          <NavItem icon={<Home size={18} />} label="Dashboard" href="#" active />
          <NavItem icon={<Zap size={18} />} label="Execução" href="#" />
          <NavItem icon={<BarChart3 size={18} />} label="Analytics" href="#" />
          <NavItem icon={<MessageSquare size={18} />} label="Chat" href="#" />
          <NavItem icon={<Settings size={18} />} label="Configurações" href="#" />
        </nav>

        {/* ===== FOOTER/USER ===== */}
        <div className="p-4 border-t border-primary/10 space-y-3 bg-surface">
          {isAuthenticated && user ? (
            <>
              <div className="glassmorphism p-3 rounded-lg border border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary text-dark flex items-center justify-center font-bold">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-title truncate">{user.username}</p>
                    <p className="text-xs text-gray-light truncate">{user.email}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="
                  w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                  bg-red-900/20 text-red-400 font-bold text-sm
                  border border-red-500/30
                  hover:bg-red-900/30 transition-all
                "
              >
                <LogOut size={18} />
                Sair
              </button>
            </>
          ) : (
            <button
              onClick={() => setLoginModalOpen(true)}
              className="
                w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                bg-primary text-dark font-bold text-sm
                border border-primary-light
                hover:shadow-glow-primary-lg transition-all
              "
            >
              <LogIn size={18} />
              Entrar
            </button>
          )}
        </div>
      </aside>

      <CreateEpicModal
        isOpen={isCreateEpicOpen}
        onClose={() => setIsCreateEpicOpen(false)}
        onSuccess={handleModalSuccess}
      />

      <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        onSuccess={handleModalSuccess}
      />
    </>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
}

function NavItem({ icon, label, href, active = false }: NavItemProps) {
  return (
    <a
      href={href}
      className={`
        flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-300 font-medium
        ${
          active
            ? 'bg-primary/20 text-primary border border-primary/40 shadow-glow-primary'
            : 'text-gray-light hover:text-text-title hover:bg-primary/10 border border-transparent'
        }
      `}
    >
      <span>{icon}</span>
      <span className="text-sm">{label}</span>
    </a>
  );
}
