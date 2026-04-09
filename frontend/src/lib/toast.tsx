'use client';

import React, { ReactNode } from 'react';
import toast, { Toaster } from 'react-hot-toast';

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: '#0f172a',
            color: '#e2e8f0',
            border: '1px solid #334155',
          },
          success: {
            style: {
              border: '1px solid #16a34a',
            },
          },
          error: {
            style: {
              border: '1px solid #dc2626',
            },
          },
        }}
      />
    </>
  );
}

export function useNotify() {
  return {
    success: (message: string) => toast.success(message),
    error: (message: string) => toast.error(message),
    info: (message: string) => toast(message),
    loading: (message: string) => toast.loading(message),
    dismiss: (id?: string) => toast.dismiss(id),
  };
}
