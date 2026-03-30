'use client';

import React from 'react';
import { motion } from 'framer-motion';

export interface BadgeProps {
  variant: 'success' | 'danger' | 'warning' | 'info' | 'primary';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  variant,
  size = 'md',
  animated = false,
  children,
  className = '',
}: BadgeProps) {
  const variants = {
    success: 'bg-success/20 text-success border border-success/30',
    danger: 'bg-danger/20 text-danger border border-danger/30',
    warning: 'bg-warning/20 text-warning border border-warning/30',
    info: 'bg-primary/20 text-primary border border-primary/30',
    primary: 'bg-primary/20 text-primary border border-primary/30',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const Component = animated ? motion.div : 'div';
  const animationProps = animated
    ? {
        animate: { opacity: [0.7, 1, 0.7] },
        transition: { duration: 2, repeat: Infinity },
      }
    : {};

  return (
    <Component
      className={`rounded-lg font-medium inline-block ${variants[variant]} ${sizes[size]} ${className}`}
      {...animationProps}
    >
      {children}
    </Component>
  );
}

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'busy' | 'idle';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function StatusIndicator({
  status,
  size = 'md',
  label,
}: StatusIndicatorProps) {
  const sizes = {
    sm: { dot: 'w-2 h-2', text: 'text-xs' },
    md: { dot: 'w-3 h-3', text: 'text-sm' },
    lg: { dot: 'w-4 h-4', text: 'text-base' },
  };

  const statusConfig = {
    online: { color: 'bg-success', label: 'Online' },
    offline: { color: 'bg-gray-500', label: 'Offline' },
    busy: { color: 'bg-warning', label: 'Ocupado' },
    idle: { color: 'bg-primary', label: 'Disponível' },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <motion.div
        className={`${sizes[size].dot} rounded-full ${config.color}`}
        animate={{
          scale: status === 'online' || status === 'busy' ? [1, 1.2, 1] : 1,
        }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <span className={`${sizes[size].text} text-gray-light`}>
        {label || config.label}
      </span>
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'success' | 'danger';
}

export function LoadingSpinner({
  size = 'md',
  color = 'primary',
}: LoadingSpinnerProps) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-4',
  };

  const colors = {
    primary: 'border-primary border-t-transparent',
    success: 'border-success border-t-transparent',
    danger: 'border-danger border-t-transparent',
  };

  return (
    <motion.div
      className={`rounded-full ${sizes[size]} ${colors[color]}`}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    />
  );
}

interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  label?: string;
}

export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  animated = true,
  label,
}: ProgressBarProps) {
  const percentage = (value / max) * 100;

  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div>
      {label && <p className="text-xs text-gray-light mb-1">{label}</p>}
      <div className={`${sizes[size]} rounded-full bg-black/30 overflow-hidden`}>
        <motion.div
          className="h-full bg-gradient-neon"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: animated ? 0.5 : 0 }}
        />
      </div>
      {label && (
        <p className="text-xs text-gray-dim mt-1">{Math.round(percentage)}%</p>
      )}
    </div>
  );
}
