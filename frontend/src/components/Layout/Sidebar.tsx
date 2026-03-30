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
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';

export default function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useAppStore((state) => [
    state.sidebarOpen,
    state.setSidebarOpen,
  ]);

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden absolute top-4 left-4 z-50 p-2 bg-darker rounded-lg"
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`w-72 bg-darker border-r border-gray-700 flex flex-col transition-all duration-300 ${
          !sidebarOpen ? '-translate-x-full md:translate-x-0' : ''
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-2xl font-bold text-accent">🤖 Heuriskein</h1>
          <p className="text-sm text-gray-400 mt-1">IA Agentic Platform</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          <NavItem icon={<Home size={20} />} label="Dashboard" href="#" />
          <NavItem icon={<Zap size={20} />} label="Tasks" href="#" />
          <NavItem icon={<MessageSquare size={20} />} label="Chat" href="#" />
          <NavItem icon={<Settings size={20} />} label="Settings" href="#" />
        </nav>

        {/* Quick Actions */}
        <div className="p-4 border-t border-gray-700 space-y-2">
          <button className="w-full px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-red-600 transition">
            + New Epic
          </button>
          <button className="w-full px-4 py-2 bg-success text-dark rounded-lg font-medium hover:opacity-90 transition">
            + New Task
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-warning" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Admin User</p>
            <p className="text-xs text-gray-400">Online</p>
          </div>
          <button className="p-2 hover:bg-gray-700 rounded-lg transition">
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
}

function NavItem({ icon, label, href }: NavItemProps) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-gray-700 transition text-gray-300 hover:text-white"
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}
