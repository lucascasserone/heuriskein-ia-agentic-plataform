'use client';

import { useEffect, useMemo, useState } from 'react';
import LayoutPremium from '@/components/Layout/LayoutPremium';
import { apiClient, MetricsOverview, MetricsTimeseriesPoint } from '@/lib/api';

interface StatusCollection {
  [key: string]: any[];
}

function RatioBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-light">{label}</span>
        <span className="text-text-title">{clamped.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded bg-black/40 overflow-hidden border border-gray-metallic/25">
        <div className="h-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<MetricsOverview | null>(null);
  const [tasks, setTasks] = useState<StatusCollection>({});
  const [seriesDays, setSeriesDays] = useState<7 | 14 | 30>(14);
  const [series, setSeries] = useState<MetricsTimeseriesPoint[]>([]);
  const [seriesUnavailable, setSeriesUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [metricsRes, tasksRes] = await Promise.all([
          apiClient.getMetricsOverview(),
          apiClient.getTasksByStatus(),
        ]);
        setMetrics(metricsRes.data || null);
        setTasks(tasksRes.data || {});

        try {
          const seriesRes = await apiClient.getMetricsTimeseries(seriesDays);
          setSeries(seriesRes.data?.points || []);
          setSeriesUnavailable(false);
        } catch {
          // Keep analytics usable even if backend has not been restarted with the new endpoint.
          setSeries([]);
          setSeriesUnavailable(true);
        }
      } catch {
        setMetrics(null);
        setTasks({});
        setSeries([]);
        setSeriesUnavailable(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [seriesDays]);

  const totalTasks = useMemo(() => {
    return Object.values(tasks).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
  }, [tasks]);

  const statusStats = useMemo(() => {
    return Object.entries(tasks)
      .map(([status, arr]) => ({
        status,
        count: Array.isArray(arr) ? arr.length : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [tasks]);

  const maxDaily = useMemo(() => {
    return Math.max(
      1,
      ...series.map((point) => Math.max(point.created, point.completed, point.failed))
    );
  }, [series]);

  return (
    <LayoutPremium>
      <div className="flex-1 overflow-auto bg-dark p-4 lg:p-5 space-y-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-text-title">Analytics</h1>
          <p className="text-xs text-gray-light">Indicadores de desempenho e gargalos operacionais</p>
          <div className="mt-2 inline-flex rounded-md border border-gray-metallic/30 overflow-hidden text-xs">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setSeriesDays(days as 7 | 14 | 30)}
                className={`px-3 py-1.5 ${
                  seriesDays === days
                    ? 'bg-primary/20 text-primary'
                    : 'bg-surface/40 text-gray-light hover:text-text-title'
                }`}
              >
                {days} dias
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-gray-light">Carregando analytics...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-gray-metallic/25 bg-surface/50 p-4">
                <p className="text-xs text-gray-light">Total de tarefas</p>
                <p className="text-2xl font-bold text-text-title">{totalTasks}</p>
              </div>
              <div className="rounded-xl border border-gray-metallic/25 bg-surface/50 p-4">
                <p className="text-xs text-gray-light">Taxa de sucesso</p>
                <p className="text-2xl font-bold text-text-title">{metrics?.success_rate_percent ?? 0}%</p>
              </div>
              <div className="rounded-xl border border-gray-metallic/25 bg-surface/50 p-4">
                <p className="text-xs text-gray-light">Execucao media</p>
                <p className="text-2xl font-bold text-text-title">{metrics?.avg_execution_minutes ?? 0} min</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4 space-y-3">
                <h2 className="text-sm font-semibold text-text-title">Distribuicao por status</h2>
                {statusStats.map((item) => (
                  <RatioBar
                    key={item.status}
                    label={item.status}
                    value={totalTasks > 0 ? (item.count / totalTasks) * 100 : 0}
                  />
                ))}
              </div>

              <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4 space-y-3">
                <h2 className="text-sm font-semibold text-text-title">Qualidade operacional</h2>
                <RatioBar label="Sucesso" value={metrics?.success_rate_percent ?? 0} />
                <RatioBar
                  label="Falhas"
                  value={100 - (metrics?.success_rate_percent ?? 0)}
                />
                <div className="text-xs text-gray-light pt-2 border-t border-gray-metallic/20">
                  Idade atual da fila: <span className="text-text-title font-semibold">{metrics?.queue_age_minutes ?? 0} min</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-metallic/25 bg-surface/40 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-text-title">Serie diaria de execucao</h2>
              {seriesUnavailable && (
                <div className="text-xs text-amber-300 border border-amber-400/30 bg-amber-500/10 rounded-md px-3 py-2">
                  Serie historica indisponivel no backend atual. Reinicie o backend para habilitar `/metrics/timeseries/`.
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-gray-light">
                <span>Criadas: azul</span>
                <span>Concluidas: verde · Falhas: vermelho</span>
              </div>
              <div className="space-y-2">
                {series.map((point) => {
                  const createdWidth = (point.created / maxDaily) * 100;
                  const completedWidth = (point.completed / maxDaily) * 100;
                  const failedWidth = (point.failed / maxDaily) * 100;
                  return (
                    <div key={point.date} className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs">
                      <span className="text-gray-light">{point.date.slice(5)}</span>
                      <div className="space-y-1">
                        <div className="h-1.5 rounded bg-black/40 overflow-hidden">
                          <div className="h-full bg-cyan-400/80" style={{ width: `${createdWidth}%` }} />
                        </div>
                        <div className="h-1.5 rounded bg-black/40 overflow-hidden">
                          <div className="h-full bg-emerald-400/80" style={{ width: `${completedWidth}%` }} />
                        </div>
                        <div className="h-1.5 rounded bg-black/40 overflow-hidden">
                          <div className="h-full bg-rose-400/80" style={{ width: `${failedWidth}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </LayoutPremium>
  );
}
