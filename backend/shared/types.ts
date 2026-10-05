declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };
export type Severity = Brand<number, "Severity">;

export function asSeverity(n: number): Severity {
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new RangeError(`Severity must be an integer in [0, 100], got ${n}`);
  }
  return n as Severity;
}

export interface TelemetryEvent {
  serviceName: string;
  errorRate: number;           // [0.0, 1.0]
  p95Latency: number;          // milliseconds, non-negative
  cpuUsage: number;            // [0.0, 1.0]
  errorCodes: string[];
  deploymentMetadata: Record<string, string | number>;
  timestamp: string;           // ISO 8601
  severityIndicators: string[];
}

export type IncidentStatus = "active" | "investigating" | "resolved";

export interface AnalysisResult {
  rootCause: string;
  evidence: string[];
  impact: string;
  remediationSteps: [string, string, string]; // tuple: exactly 3
}

export interface Incident {
  incidentId: string;
  service: string;
  status: IncidentStatus;
  severity: Severity;
  telemetry: TelemetryEvent;
  aiAnalysis: AnalysisResult;
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
}

export interface MetricsAnalysis {
  errorRateAnomaly: boolean;
  latencyAnomaly: boolean;
  cpuAnomaly: boolean;
  deviations: Record<string, number>;
}

export interface CorrelationResult {
  dominantPattern: string;     // e.g., "database-timeout", "cpu-saturation"
  relatedErrorCodes: string[];
  patternConfidence: number;   // 0.0–1.0
}

export interface IncidentContext {
  serviceTier: string;
  region: string;
  baselineThresholds: {
    errorRate: number;
    p95Latency: number;
    cpuUsage: number;
  };
}
