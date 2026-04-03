'use client';

import React, { ReactNode, useState, useEffect } from 'react';
import SidebarPremium from './SidebarPremium';
import LoginModal from '@/components/Modals/LoginModal';
import { ToastProvider } from '@/lib/toast';
import { useAppStore } from '@/store/appStore';
import { apiClient } from '@/lib/api';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [leftBeforeFocus, setLeftBeforeFocus] = useState<boolean | null>(null);
  // Auth state from store
  const isLoginModalOpen = useAppStore((state) => state.isLoginModalOpen);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const accessToken = useAppStore((state) => state.accessToken);
  const setLoginModalOpen = useAppStore((state) => state.setLoginModalOpen);
  const setTokens = useAppStore((state) => state.setTokens);
  const setAuthenticated = useAppStore((state) => state.setAuthenticated);

  // Load tokens from localStorage on mount
  useEffect(() => {
    const storedAccessToken = localStorage.getItem('accessToken');
    const storedRefreshToken = localStorage.getItem('refreshToken');
    const storedLeftCollapsed = localStorage.getItem('left_sidebar_collapsed');
    
    if (storedAccessToken && storedRefreshToken) {
      setTokens(storedAccessToken, storedRefreshToken);
      // Set authorization header
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${storedAccessToken}`;
    }

    if (storedLeftCollapsed !== null) {
      setLeftCollapsed(storedLeftCollapsed === '1');
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('left_sidebar_collapsed', leftCollapsed ? '1' : '0');
    } catch {
      // Ignore localStorage access errors.
    }
  }, [leftCollapsed]);

  useEffect(() => {
    const onFocusMode = (evt: Event) => {
      const custom = evt as CustomEvent<{ enabled?: boolean }>;
      const enabled = !!custom?.detail?.enabled;
      if (enabled) {
        setLeftBeforeFocus((prev) => (prev === null ? leftCollapsed : prev));
        setLeftCollapsed(true);
      } else {
        setLeftCollapsed((prev) => (leftBeforeFocus === null ? prev : leftBeforeFocus));
        setLeftBeforeFocus(null);
      }
    };

    window.addEventListener('workspace:focus-mode', onFocusMode as EventListener);

    const onPreferenceChanged = (evt: Event) => {
      const custom = evt as CustomEvent<{ key?: string; value?: boolean }>;
      if (custom?.detail?.key === 'left_sidebar_collapsed') {
        setLeftCollapsed(!!custom.detail.value);
      }
    };

    window.addEventListener('ui:preference-changed', onPreferenceChanged as EventListener);
    return () => {
      window.removeEventListener('workspace:focus-mode', onFocusMode as EventListener);
      window.removeEventListener('ui:preference-changed', onPreferenceChanged as EventListener);
    };
  }, [leftCollapsed, leftBeforeFocus]);

  // Save tokens to localStorage when they change
  useEffect(() => {
    if (accessToken) {
      localStorage.setItem('accessToken', accessToken);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    }
  }, [accessToken]);

  const handleLoginSuccess = (tokens: { access: string; refresh: string }) => {
    setTokens(tokens.access, tokens.refresh);
    localStorage.setItem('refreshToken', tokens.refresh);
    setLoginModalOpen(false);
    setAuthenticated(true);
  };

  // Handle user click - check authentication
  useEffect(() => {
    if (isAuthenticated) {
      setLoginModalOpen(false);
    }
  }, [isAuthenticated, setLoginModalOpen]);

  return (
    <ToastProvider>
      <div className="flex h-screen bg-dark text-white overflow-hidden">
        {/* Sidebar */}
        <SidebarPremium
          collapsed={leftCollapsed}
          onToggleCollapse={() => setLeftCollapsed((prev) => !prev)}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>

        {/* Login Modal */}
        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setLoginModalOpen(false)}
        />
      </div>
    </ToastProvider>
  );
}
