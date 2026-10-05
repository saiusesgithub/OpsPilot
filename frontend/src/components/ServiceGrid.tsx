import type { Incident } from '../types/incident'
import { formatAgo, metricPercent, serviceKey, sortedIncidents } from '../utils/incidents'

const services = [
  { key: 'auth', name: 'Authentication API', short: 'AUTH', icon: '◈' },
  { key: 'payments', name: 'Payment API', short: 'PAY', icon: '◇' },
  { key: 'orders', name: 'Orders API', short: 'ORD', icon: '▤' },
  { key: 'media', name: 'Media Processor', short: 'MED', icon: '◉' },
]

export function ServiceGrid({ incidents }: { incidents: Incident[] }) {
  const sorted = sortedIncidents(incidents)
  return <div className="service-grid">{services.map((service) => {
    const incident = sorted.find((item) => serviceKey(item) === service.key)
    const active = incident && String(incident.status ?? '').toLowerCase() !== 'resolved'
    const telemetry = incident?.telemetry
    const status = !incident || !active ? 'Operational' : Number(incident.severity) >= 75 ? 'Critical' : 'Degraded'
    return <article className={`service-card ${status.toLowerCase()}`} key={service.key}>
      <div className="service-top"><div className="service-icon">{service.icon}</div><span className={`service-status ${status.toLowerCase()}`}><i />{status}</span></div>
      <div className="service-name">{service.name}</div><div className="service-short">{service.short} · AWS / us-east-1</div>
      <div className="service-metrics"><div><span>P95</span><b>{telemetry?.p95Latency != null ? <>{Number(telemetry.p95Latency).toLocaleString()}<small> ms</small></> : '—'}</b></div><div><span>ERROR RATE</span><b>{metricPercent(telemetry?.errorRate) != null ? <>{metricPercent(telemetry?.errorRate)?.toFixed(1)}<small>%</small></> : '—'}</b></div><div><span>CPU</span><b>{metricPercent(telemetry?.cpuUsage) != null ? <>{metricPercent(telemetry?.cpuUsage)?.toFixed(0)}<small>%</small></> : '—'}</b></div></div>
      <div className="service-updated"><span>LAST SIGNAL</span><span>{formatAgo(incident?.updatedAt ?? incident?.createdAt)}</span></div>
    </article>
  })}</div>
}
