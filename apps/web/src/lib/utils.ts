import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function timeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function severityColor(severity: string): string {
  const map: Record<string, string> = {
    P1: 'hsl(0 85% 65%)',
    P2: 'hsl(25 95% 60%)',
    P3: 'hsl(48 95% 58%)',
    P4: 'hsl(200 80% 57%)',
    P5: 'hsl(160 60% 55%)',
  };
  return map[severity] ?? 'hsl(var(--text-tertiary))';
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    HEALTHY: 'hsl(142 72% 45%)',
    DEGRADED: 'hsl(38 92% 50%)',
    DOWN: 'hsl(0 85% 55%)',
    UNKNOWN: 'hsl(220 14% 55%)',
    ACTIVE: 'hsl(0 85% 65%)',
    RESOLVED: 'hsl(142 72% 45%)',
    ACKNOWLEDGED: 'hsl(200 80% 57%)',
  };
  return map[status] ?? 'hsl(var(--text-tertiary))';
}
