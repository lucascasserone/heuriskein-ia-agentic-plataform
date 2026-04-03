'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, Clock3, Gauge, ListChecks, AlertTriangle } from 'lucide-react';
import LayoutPremium from '@/components/Layout/LayoutPremium';
import { apiClient, MetricsOverview } from '@/lib/api';

interface StatusMap {
  [key: string]: number;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricsOverview | null>(null);
  const [taskByStatus, setTaskByStatus] = useState<StatusMap>({});
  const [epicByStatus, setEpicByStatus] = useState<StatusMap>({});
  const [activeAgents, setActiveAgents] = useState<number>(0);
  const [healthUp, setHealthUp] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [metricsRes, tasksRes, epicsRes, healthRes, agentsRes] = await Promise.all([
          apiClient.getMetricsOverview(),
          apiClient.getTasksByStatus(),
          apiClient.getEpicsByStatus(),
          apiClient.get('/health/'),
          apiClient.getActiveAgents(),
        ]);

        setMetrics(metricsRes.data || null);
        setTaskByStatus(tasksRes.data || {});
        setEpicByStatus(epicsRes.data || {});
        setHealthUp(Boolean(healthRes.data?.status === 'healthy' || healthRes.status === 200));

        const list = agentsRes.data?.results || agentsRes.data || [];
        setActiveAgents(Array.isArray(list) ? list.length : 0);
        setLastUpdated(new Date());
      } catch {
        setHealthUp(false);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const interval = window.setInterval(fetchData, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const kpis = [
    {
      label: 'Taxa de sucesso',
      value: metrics ? `${metrics.success_rate_percent}%` : '--',
      icon: <Gauge size={16} className="text-primary" />,
    },
    {
      label: 'Fila atual',
      value: String(metrics?.task_counts?.queue || 0),
      icon: <ListChecks size={16} className="text-yellow-300" />,
    },
    {
      label: 'Idade da fila',
      value: metrics ? `${metrics.queue_age_minutes} min` : '--',
      icon: <Clock3 size={16} className="text-orange-300" />,
    },
    {
      label: 'Agentes ativos',
      value: String(activeAgents),
      icon: <Bot size={16} className="text-secondary" />,
    },
  ];

  return (
    <LayoutPremium>
      <div className="flex-1 overflow-auto bg-dark p-4 lg:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-text-title">Dashboard</h1>
            <p className="text-xs text-gray-light">
              Visao executiva da operacao em tempo real
              {lastUpdated ? ` · atualizado ${lastUpdated.toLocaleTimeString('pt-BR', { hour12: false })}` : ''}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-md text-xs border ${
              healthUp
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                : 'border-red-400/40 bg-red-500/10 text-red-300'
            }`}
          >
            {healthUp ? 'Backend online' : 'Backend indisponivel'}
          </span>
        </div>

        {loading ? (
          <div className="text-sm text-gray-light">Carregando indicadores...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-gray-metallic/25 bg-surface/50 p-4">
                <div className="flex items-center gap-2 text-gray-light text-xs mb-2">
                  {kpi.icon}
                  <span>{kpi.label}</span>
                </div>
                <div className="text-2xl font-bold text-text-title">{kpi.value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4">
            <h2 className="text-sm font-semibold text-text-title mb-3">Tarefas por status</h2>
            <div className="space-y-2 text-xs">
              {Object.entries(taskByStatus).map(([status, items]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-gray-light capitalize">{status}</span>
                  <span className="text-text-title font-semibold">{Array.isArray(items) ? items.length : 0}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4">
            <h2 className="text-sm font-semibold text-text-title mb-3">Epicos por status</h2>
            <div className="space-y-2 text-xs">
              {Object.entries(epicByStatus).map(([status, items]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-gray-light capitalize">{status}</span>
                  <span className="text-text-title font-semibold">{Array.isArray(items) ? items.length : 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4">
          <h2 className="text-sm font-semibold text-text-title mb-3">Atalhos operacionais</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href="/execucao" className="px-3 py-1.5 rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20">
              Ir para Execucao
            </Link>
            <Link href="/chat" className="px-3 py-1.5 rounded-md border border-secondary/40 bg-secondary/10 text-secondary hover:bg-secondary/20">
              Abrir Chat
            </Link>
            <Link href="/analytics" className="px-3 py-1.5 rounded-md border border-yellow-400/40 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20">
              Ver Analytics
            </Link>
          </div>
          {(metrics?.queue_age_minutes || 0) > 30 && (
            <div className="mt-3 inline-flex items-center gap-2 text-xs text-orange-300 border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 rounded-md">
              <AlertTriangle size={14} />
              Fila acima de 30 min: priorizar tarefas bloqueadas e de alta prioridade.
            </div>
          )}
        </div>
      </div>
    </LayoutPremium>
  );
}
