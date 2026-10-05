import type { Incident } from '../types/incident'
import { analysisText, formatTime, metricPercent, severityLabel } from '../utils/incidents'

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>
}

export function IncidentPanel({ incident }: { incident?: Incident }) {
  const analysis = incident?.aiAnalysis ?? incident?.analysis
  if (!incident) return <section className="incident-panel empty-panel"><div className="section-kicker">ACTIVE INCIDENT</div><div className="empty-mark">✓</div><h2>All clear</h2><p>No incidents have been recorded. System telemetry is within expected thresholds.</p></section>
  const telemetry = incident.telemetry ?? {}
  const cause = analysisText(analysis, ['rootCause', 'probableCause', 'probable_cause', 'summary'])
  const evidence = analysisText(analysis, ['evidence', 'signals', 'findings'])
  const impact = analysisText(analysis, ['impact', 'businessImpact', 'blastRadius'])
  const actions = analysisText(analysis, ['remediationSteps', 'recommendedActions', 'recommendations', 'actions'])
  const codes = telemetry.errorCodes ?? telemetry.errors ?? []

  return <section className="incident-panel" key={incident.incidentId}>
    <div className="incident-heading"><div><div className="section-kicker"><span className="live-dot" /> ACTIVE INCIDENT</div><h2>{incident.service ?? telemetry.serviceName ?? 'Unknown service'}</h2><span className="incident-id">{incident.incidentId ?? 'Incident ID unavailable'}</span></div><div className="incident-tags"><span className={`badge severity ${severityLabel(incident.severity).toLowerCase()}`}>{severityLabel(incident.severity)} · {incident.severity ?? '—'}</span><span className={`badge status ${String(incident.status ?? 'unknown').toLowerCase()}`}>{incident.status ?? 'Unknown'}</span></div></div>
    <div className="metrics-grid"><Metric label="Error rate" value={`${metricPercent(telemetry.errorRate)?.toFixed(1) ?? '—'}%`} /><Metric label="P95 latency" value={telemetry.p95Latency != null ? `${Number(telemetry.p95Latency).toLocaleString()} ms` : '—'} /><Metric label="CPU utilization" value={`${metricPercent(telemetry.cpuUsage ?? telemetry.cpu)?.toFixed(0) ?? '—'}%`} /><Metric label="Started" value={formatTime(incident.createdAt)} /></div>
    {!!codes.length && <div className="error-codes"><span className="subtle-label">ERROR CODES</span>{codes.map((code, i) => <code key={`${code}-${i}`}>{code}</code>)}</div>}
    <div className="analysis-header"><span className="analysis-icon">✦</span><div><div className="section-kicker">AI INCIDENT ANALYSIS</div><span>Automated signal correlation</span></div><span className="analysis-ready">ANALYSIS READY</span></div>
    <div className="analysis-grid"><AnalysisBlock title="Probable cause" value={cause} /><AnalysisBlock title="Evidence" value={evidence} /><AnalysisBlock title="Impact" value={impact} /><AnalysisBlock title="Recommended actions" value={actions} /></div>
  </section>
}

function AnalysisBlock({ title, value }: { title: string; value?: string | string[] }) {
  return <div className="analysis-block"><h3>{title}</h3>{value ? Array.isArray(value) ? <ul>{value.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>{value}</p> : <p className="muted">No analysis data returned for this incident.</p>}</div>
}
