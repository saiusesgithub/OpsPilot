import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getIncidents, triggerIncident } from './api/opspilot'
import { IncidentHistory } from './components/IncidentHistory'
import { IncidentPanel } from './components/IncidentPanel'
import { ServiceGrid } from './components/ServiceGrid'
import type { EventPayload, Incident, IncidentPhase } from './types/incident'
import { sortedIncidents } from './utils/incidents'

const scenarios: { title: string; subtitle: string; icon: string; tone: string; payload: EventPayload }[] = [
  { title: 'Simulate DB Failure', subtitle: 'Connection pool exhaustion', icon: '▦', tone: 'amber', payload: { service: 'orders-api', scenario: 'database_exhaustion', errorRate: 18.4, p95Latency: 2840, cpu: 64, errors: ['DB_CONNECTION_TIMEOUT', 'DB_CONNECTION_TIMEOUT'] } },
  { title: 'Simulate CPU Spike', subtitle: 'Compute saturation event', icon: '⌁', tone: 'red', payload: { service: 'media-processor', scenario: 'cpu_overload', errorRate: 7.2, p95Latency: 4190, cpu: 98, errors: ['REQUEST_TIMEOUT'] } },
  { title: 'Simulate Bad Deployment', subtitle: 'Post-release regression', icon: '⇧', tone: 'violet', payload: { service: 'auth-api', scenario: 'deployment_regression', errorRate: 21.1, p95Latency: 1730, cpu: 47, deploymentMinutesAgo: 7, previousErrorRate: 0.3, errors: ['INTERNAL_SERVER_ERROR'] } },
]

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [phase, setPhase] = useState<IncidentPhase>('idle')
  const [pendingId, setPendingId] = useState<string>()
  const [highlightId, setHighlightId] = useState<string>()
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date>()
  const pollRef = useRef(false)
  const knownIds = useRef<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    const records = await getIncidents()
    setIncidents(sortedIncidents(records))
    setLastRefresh(new Date())
    return records
  }, [])

  useEffect(() => {
    let alive = true
    const initial = async () => {
      try {
        const records = await getIncidents()
        if (alive) {
          setIncidents(sortedIncidents(records))
          setLastRefresh(new Date())
          knownIds.current = new Set(records.map((item) => item.incidentId).filter((id): id is string => Boolean(id)))
        }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Unable to load incidents.') }
    }
    void initial()
    const timer = window.setInterval(async () => {
      if (!pollRef.current) {
        try { const records = await getIncidents(); if (alive) { setIncidents(sortedIncidents(records)); setLastRefresh(new Date()) } }
        catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Unable to refresh incidents.') }
      }
    }, 10_000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])

  const active = useMemo(() => sortedIncidents(incidents).find((item) => String(item.status ?? '').toLowerCase() !== 'resolved'), [incidents])
  const criticalCount = incidents.filter((item) => String(item.status ?? '').toLowerCase() !== 'resolved' && Number(item.severity) >= 75).length
  const degradedCount = incidents.filter((item) => String(item.status ?? '').toLowerCase() !== 'resolved' && Number(item.severity) > 0 && Number(item.severity) < 75).length
  const health = criticalCount ? 'CRITICAL' : degradedCount ? 'DEGRADED' : 'HEALTHY'

  async function simulate(payload: EventPayload) {
    pollRef.current = true
    setPhase('processing'); setPendingId(undefined); setError('')
    try {
      const result = await triggerIncident(payload)
      setPendingId(result.incidentId)
      setPhase('waiting')
      const deadline = Date.now() + 120_000
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_000))
        const records = await refresh()
        const found = result.incidentId ? records.find((item) => item.incidentId === result.incidentId) : records.find((item) => item.incidentId && !knownIds.current.has(item.incidentId) && String(item.service ?? item.telemetry?.serviceName ?? '').toLowerCase() === payload.service)
        if (found) {
          setHighlightId(found.incidentId); window.setTimeout(() => setHighlightId(undefined), 8_000)
          setPhase('idle'); setPendingId(undefined); return
        }
      }
      setPhase('timeout')
      setError('The event was accepted but is not visible yet. Background refresh will continue every 10 seconds.')
    } catch (e) {
      setPhase('idle')
      setError(e instanceof Error ? e.message : 'Unable to submit the simulation.')
    } finally { pollRef.current = false }
  }

  return <main className="app-shell"><header className="topbar"><div className="brand"><div className="brand-mark"><span>O</span><i /></div><div><strong>OPSPILOT</strong><span>AI INCIDENT COMMAND CENTER</span></div></div><div className="topbar-right"><div className="region-chip"><span>⌖</span> us-east-1 <i /></div><div className="top-divider" /><div className="live-indicator"><i /> SYSTEM LIVE</div><div className="avatar">SRE</div></div></header>
    <section className="page-heading"><div><div className="eyebrow"><span /> OPERATIONS OVERVIEW <span className="eyebrow-line" /></div><h1>Incident command</h1><p className="heading-sub">Real-time visibility across your production services.</p></div><div className={`health-card ${health.toLowerCase()}`}><div className="health-icon">{health === 'HEALTHY' ? '✓' : '!'}</div><div><span>SYSTEM HEALTH</span><strong>{health}</strong><small>{health === 'HEALTHY' ? 'All systems operational' : `${criticalCount + degradedCount} active incident${criticalCount + degradedCount === 1 ? '' : 's'}`}</small></div><span className="health-pulse" /></div></section>
    <section className="section-block"><div className="section-title"><div><div className="section-kicker">SERVICE FLEET</div><h2>Production services</h2></div><div className="section-meta"><span className="health-legend"><i /> OPERATIONAL</span><span className="health-legend warn"><i /> DEGRADED</span><span className="fleet-count">04 SERVICES</span></div></div><ServiceGrid incidents={incidents} /></section>
    <section className="simulation-section"><div className="simulation-intro"><div className="section-kicker">CONTROL PLANE</div><h2>Incident simulation</h2><p>Inject a scenario to exercise the response pipeline.</p></div><div className="simulation-controls">{scenarios.map((scenario) => <button key={scenario.payload.scenario} className={`scenario-button ${scenario.tone}`} disabled={phase === 'processing' || phase === 'waiting'} onClick={() => void simulate(scenario.payload)}><span className="scenario-icon">{scenario.icon}</span><span className="scenario-copy"><strong>{scenario.title}</strong><small>{scenario.subtitle}</small></span><span className="scenario-arrow">↗</span></button>)}</div>{phase !== 'idle' && <div className="processing-banner"><span className="spinner" /><div><strong>{phase === 'processing' ? 'Submitting event…' : phase === 'waiting' ? 'Incident processing…' : 'Processing continues in background'}</strong><span>{pendingId ? `Incident ID · ${pendingId}` : phase === 'processing' ? 'Connecting to incident pipeline' : 'Waiting for the workflow to persist this incident'}</span></div><span className="polling-label">{phase === 'waiting' ? 'POLLING · 2S' : phase === 'timeout' ? 'REFRESH · 10S' : ''}</span></div>}{error && <div className="error-banner"><span>!</span><p>{error}</p><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}</section>
    <section className="section-block incident-block"><div className="section-title"><div><div className="section-kicker">COMMAND VIEW</div><h2>Active incident</h2></div><div className="refresh-state"><i /> UPDATED {lastRefresh?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '—'}</div></div><IncidentPanel incident={active} /></section>
    <IncidentHistory incidents={incidents} highlightId={highlightId} />
    <footer className="footer"><span><span className="brand-mini">O</span> OPSPILOT <i /> INCIDENT RESPONSE PLATFORM</span><span>API SYNC <b className={error ? 'sync-error' : ''}>{error ? 'ATTENTION' : 'CONNECTED'}</b><i /> AUTO REFRESH 10S</span></footer>
  </main>
}
