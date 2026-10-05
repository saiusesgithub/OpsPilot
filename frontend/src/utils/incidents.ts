import type { Incident } from '../types/incident'

export const sortedIncidents = (items: Incident[]) => [...items].sort((a, b) =>
  String(b.createdAt ?? b.updatedAt ?? '').localeCompare(String(a.createdAt ?? a.updatedAt ?? '')))

export function serviceKey(incident: Incident): string {
  const name = String(incident.service ?? incident.telemetry?.serviceName ?? '').toLowerCase()
  if (name.includes('auth')) return 'auth'
  if (name.includes('payment') || name.includes('billing')) return 'payments'
  if (name.includes('order')) return 'orders'
  if (name.includes('media')) return 'media'
  return name
}

export function metricPercent(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? (n <= 1 ? n * 100 : n) : undefined
}

export function analysisText(analysis: Record<string, unknown> | undefined, keys: string[]): string | string[] | undefined {
  if (!analysis) return undefined
  for (const key of keys) {
    const value = analysis[key]
    if (typeof value === 'string' && value.trim()) return value
    if (Array.isArray(value) && value.length) return value.map(String)
  }
  return undefined
}

export function severityLabel(value: unknown): string {
  const score = Number(value)
  if (!Number.isFinite(score)) return 'Unscored'
  if (score >= 75) return 'Critical'
  if (score >= 50) return 'High'
  if (score >= 25) return 'Elevated'
  return 'Low'
}

export const formatTime = (value?: string) => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'
export const formatAgo = (value?: string) => {
  if (!value) return '—'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`
}
