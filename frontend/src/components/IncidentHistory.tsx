import type { Incident } from '../types/incident'
import { analysisText, formatTime, serviceKey, severityLabel, sortedIncidents } from '../utils/incidents'

export function IncidentHistory({ incidents, highlightId }: { incidents: Incident[]; highlightId?: string }) {
  const rows = sortedIncidents(incidents)
  return <section className="history-section"><div className="section-title"><div><div className="section-kicker">EVENT LOG</div><h2>Incident history</h2></div><span className="count-chip">{rows.length} RECORDS</span></div>
    <div className="table-wrap"><table><thead><tr><th>Incident</th><th>Service</th><th>Severity</th><th>Status</th><th>Started</th><th>Probable cause</th></tr></thead><tbody>
      {rows.map((incident) => {
        const cause = analysisText(incident.aiAnalysis ?? incident.analysis, ['rootCause', 'probableCause', 'probable_cause', 'summary'])
        const name = String(incident.service ?? 'Unknown service')
        return <tr className={incident.incidentId === highlightId ? 'highlight-row' : ''} key={incident.incidentId ?? `${name}-${incident.createdAt}`}><td><span className="row-id">{incident.incidentId?.slice(0, 8) ?? '—'}</span></td><td><span className="service-cell"><i>{serviceKey(incident).slice(0, 1).toUpperCase() || '•'}</i>{name}</span></td><td><span className={`table-badge severity ${severityLabel(incident.severity).toLowerCase()}`}>{incident.severity ?? '—'} · {severityLabel(incident.severity)}</span></td><td><span className={`table-badge status ${String(incident.status ?? 'unknown').toLowerCase()}`}><i />{incident.status ?? 'Unknown'}</span></td><td className="time-cell">{formatTime(incident.createdAt)}</td><td className="cause-cell">{Array.isArray(cause) ? cause[0] : cause ?? 'Analysis pending'}</td></tr>
      })}
      {!rows.length && <tr><td className="no-rows" colSpan={6}>No incidents to display. Trigger a simulation to generate the first event.</td></tr>}
    </tbody></table></div>
  </section>
}
