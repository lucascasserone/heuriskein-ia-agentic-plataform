'use client';

import React, { useState } from 'react';
import {
  Menu,
  X,
  Home,
  Zap,
  MessageSquare,
  Settings,
  LogOut,
  LogIn,
  Plus,
  BarChart3,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';

interface SidebarProps {
  onCreateEpic?: () => void;
  onCreateTask?: () => void;
}

export default function Sidebar({ onCreateEpic, onCreateTask }: SidebarProps) {
  const [sidebarOpen, setSidebarOpen] = useAppStore((state) => [
    state.sidebarOpen,
    state.setSidebarOpen,
  ]);
  
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const user = useAppStore((state) => state.user);
  const setLoginModalOpen = useAppStore((state) => state.setLoginModalOpen);
  const logout = useAppStore((state) => state.logout);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    logout();
  };

  const [agentStats] = useState({
    coordinator: { name: 'Coordenador', active: 0, capacity: 3 },
    executor: { name: 'Executor', active: 0, capacity: 5 },
    analyst: { name: 'Analista', active: 0, capacity: 2 },
  });

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden absolute top-4 left-4 z-50 p-2 bg-surface-alt rounded-lg transition-all hover:bg-surface"
      >
        {sidebarOpen ? <X size={24} className="text-primary" /> : <Menu size={24} className="text-primary" />}
      </button>

      {/* Sidebar Overlay (Mobile) */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          w-80 bg-darker border-r border-primary/10 flex flex-col transition-all duration-300
          ${!sidebarOpen ? '-translate-x-full md:translate-x-0' : ''}
          md:relative md:translate-x-0 z-40
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
            onClick={onCreateEpic}
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
            onClick={onCreateTask}
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

        {/* ===== AGENT STATUS - LED SEGMENTS ===== */}
        <div className="p-4 border-b border-primary/10">
          <h3 className="text-xs font-bold text-text-title uppercase tracking-widest mb-3">
            Status dos Agentes
          </h3>
          <div className="space-y-3">
            {Object.entries(agentStats).map(([key, agent]) => (
              <div key={key} className="glassmorphism p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-text-title">{agent.name}</span>
                  <span className="text-xs font-mono text-primary font-bold">
                    {agent.active}/{agent.capacity}
                  </span>
                </div>
                {/* LED Segment Display */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: agent.capacity }).map((_, i) => (
                    <div
                      key={i}
                      className={`
                        flex-1 h-3 rounded-sm transition-all duration-300 border border-gray-metallic/30
                        ${
                          i < agent.active 
                            ? 'bg-primary animate-led-pulse shadow-glow-primary' 
                            : 'bg-gray-metallic/20'
                        }
                      `}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
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
