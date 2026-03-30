'use client';

import React, { ReactNode, useState, useEffect } from 'react';
import SidebarPremium from './SidebarPremium';
import CreateEpicModal from '@/components/Modals/CreateEpicModal';
import CreateTaskModal from '@/components/Modals/CreateTaskModal';
import LoginModal from '@/components/Modals/LoginModal';
import { ToastProvider } from '@/lib/toast';
import { useAppStore } from '@/store/appStore';
import { apiClient } from '@/lib/api';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [isCreateEpicOpen, setIsCreateEpicOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  
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
    
    if (storedAccessToken && storedRefreshToken) {
      setTokens(storedAccessToken, storedRefreshToken);
      // Set authorization header
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${storedAccessToken}`;
    }
  }, []);

  // Save tokens to localStorage when they change
  useEffect(() => {
    if (accessToken) {
      localStorage.setItem('accessToken', accessToken);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    }
  }, [accessToken]);

  const handleCreateEpic = async (data: any) => {
    try {
      // TODO: Call API to create epic
      console.log('Creating epic:', data);
      // const response = await apiClient.createEpic(data);
    } catch (error) {
      console.error('Error creating epic:', error);
    }
  };

  const handleCreateTask = async (data: any) => {
    try {
      // TODO: Call API to create task
      console.log('Creating task:', data);
      // const response = await apiClient.createTask(data);
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

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
          onCreateEpic={() => setIsCreateEpicOpen(true)}
          onCreateTask={() => setIsCreateTaskOpen(true)}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>

        {/* Modals */}
        <CreateEpicModal
          isOpen={isCreateEpicOpen}
          onClose={() => setIsCreateEpicOpen(false)}
          onSubmit={handleCreateEpic}
        />

        <CreateTaskModal
          isOpen={isCreateTaskOpen}
          onClose={() => setIsCreateTaskOpen(false)}
          onSubmit={handleCreateTask}
        />

        {/* Login Modal */}
        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setLoginModalOpen(false)}
        />
      </div>
    </ToastProvider>
  );
}
