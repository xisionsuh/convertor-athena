'use client';

import { useState, useEffect } from 'react';

interface SystemInfo {
  cpu: {
    model: string;
    cores: number;
    loadAvg: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    mountpoint: string;
  }[];
  pm2: {
    name: string;
    status: string;
    cpu: number;
    memory: number;
    uptime: number;
    pid: number;
  }[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getLoadColor(load: number, cores: number): string {
  const ratio = load / cores;
  if (ratio < 0.5) return 'bg-green-500';
  if (ratio < 0.8) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'online':
      return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">online</span>;
    case 'stopped':
      return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">stopped</span>;
    case 'errored':
      return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">errored</span>;
    default:
      return <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{status}</span>;
  }
}

export default function SystemDashboard() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('/athena/api/system/status');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.success) {
        setSystemInfo(data.data);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch system info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch system info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemInfo();
    const interval = setInterval(fetchSystemInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading system info...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">&#x26A0;&#xFE0F;</div>
          <p className="text-sm font-medium text-foreground mb-1">Failed to load system info</p>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchSystemInfo(); }}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!systemInfo) return null;

  const memUsagePercent = (systemInfo.memory.used / systemInfo.memory.total) * 100;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-foreground">System Dashboard</h2>
        <button
          onClick={() => { setLoading(true); fetchSystemInfo(); }}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          title="Refresh"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* CPU */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">&#x1F4BB;</span>
          <h3 className="text-sm font-semibold text-foreground">CPU</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{systemInfo.cpu.model} ({systemInfo.cpu.cores} cores)</p>
        <div className="space-y-2">
          {systemInfo.cpu.loadAvg.map((load, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-16">{['1 min', '5 min', '15 min'][i]}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getLoadColor(load, systemInfo.cpu.cores)}`}
                  style={{ width: `${Math.min((load / systemInfo.cpu.cores) * 100, 100)}%` }}
                />
              </div>
              <span className="text-xs font-mono text-foreground w-10 text-right">{load.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Memory */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">&#x1F9E0;</span>
          <h3 className="text-sm font-semibold text-foreground">Memory</h3>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>{formatBytes(systemInfo.memory.used)} used</span>
          <span>{formatBytes(systemInfo.memory.total)} total</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${memUsagePercent > 90 ? 'bg-red-500' : memUsagePercent > 70 ? 'bg-yellow-500' : 'bg-blue-500'}`}
            style={{ width: `${memUsagePercent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">{memUsagePercent.toFixed(1)}% used | {formatBytes(systemInfo.memory.free)} free</p>
      </div>

      {/* Disk */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">&#x1F4BE;</span>
          <h3 className="text-sm font-semibold text-foreground">Disk</h3>
        </div>
        <div className="space-y-3">
          {systemInfo.disk.map((d, i) => {
            const usagePercent = (d.used / d.total) * 100;
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span className="font-mono">{d.mountpoint}</span>
                  <span>{formatBytes(d.used)} / {formatBytes(d.total)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PM2 Processes */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">&#x2699;&#xFE0F;</span>
          <h3 className="text-sm font-semibold text-foreground">PM2 Processes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-2 pr-3 font-medium">Name</th>
                <th className="text-left py-2 pr-3 font-medium">Status</th>
                <th className="text-right py-2 pr-3 font-medium">CPU</th>
                <th className="text-right py-2 pr-3 font-medium">Memory</th>
                <th className="text-right py-2 font-medium">Uptime</th>
              </tr>
            </thead>
            <tbody>
              {systemInfo.pm2.map((proc, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3 font-medium text-foreground">{proc.name}</td>
                  <td className="py-2 pr-3">{getStatusBadge(proc.status)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-foreground">{proc.cpu.toFixed(1)}%</td>
                  <td className="py-2 pr-3 text-right font-mono text-foreground">{formatBytes(proc.memory)}</td>
                  <td className="py-2 text-right font-mono text-muted-foreground">{formatUptime(proc.uptime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
