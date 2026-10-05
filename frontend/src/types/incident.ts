export type Scenario = 'database_exhaustion' | 'cpu_overload' | 'deployment_regression'

export interface EventPayload {
  service: string
  scenario: Scenario
  errorRate: number
  p95Latency: number
  cpu: number
  errors: string[]
  deploymentMinutesAgo?: number
  previousErrorRate?: number
}

export interface Telemetry {
  serviceName?: string
  errorRate?: number
  p95Latency?: number
  cpuUsage?: number
  cpu?: number
  errorCodes?: string[]
  errors?: string[]
  timestamp?: string
  [key: string]: unknown
}

export interface Incident {
  incidentId?: string
  service?: string
  status?: string
  severity?: number | string
  telemetry?: Telemetry
  aiAnalysis?: Record<string, unknown>
  analysis?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export type IncidentPhase = 'idle' | 'processing' | 'waiting' | 'timeout'
