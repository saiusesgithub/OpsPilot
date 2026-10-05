import type {
  TelemetryEvent,
  IncidentContext,
  MetricsAnalysis,
  CorrelationResult,
} from "../../shared/types";
import { asSeverity, type Severity } from "../../shared/types";

interface CalculateSeverityInput {
  incidentId: string;
  telemetry: TelemetryEvent;
  context: IncidentContext;
  metricsAnalysis: MetricsAnalysis;
  correlationResult: CorrelationResult;
}

interface CalculateSeverityOutput {
  incidentId: string;
  telemetry: TelemetryEvent;
  context: IncidentContext;
  metricsAnalysis: MetricsAnalysis;
  correlationResult: CorrelationResult;
  severity: Severity;
}

class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export function calculateSeverityScore(
  telemetry: TelemetryEvent,
  metricsAnalysis: MetricsAnalysis
): Severity {
  // Validate inputs
  if (telemetry.errorRate < 0 || telemetry.errorRate > 1) {
    throw new InvalidInputError(
      `errorRate must be in [0.0, 1.0], got ${telemetry.errorRate}`
    );
  }
  if (telemetry.p95Latency < 0) {
    throw new InvalidInputError(
      `p95Latency must be non-negative, got ${telemetry.p95Latency}`
    );
  }
  if (!Array.isArray(telemetry.severityIndicators)) {
    throw new InvalidInputError(
      "severityIndicators must be an array"
    );
  }

  // Severity algorithm
  // 1. Base score
  let score = 0;

  // 2. Error rate contribution (capped at 40)
  const errorRateScore = Math.min(40, telemetry.errorRate * 40);
  score += errorRateScore;

  // 3. Latency contribution -- logarithmic scale (capped at 20)
  const latencyScore = Math.min(20, Math.log10(telemetry.p95Latency + 1) * 10);
  score += latencyScore;

  // 4. CPU usage contribution (capped at 20)
  const cpuScore = Math.min(20, telemetry.cpuUsage * 20);
  score += cpuScore;

  // 5. Anomaly bonuses (+5 per anomaly, max 15)
  let anomalyBonus = 0;
  if (metricsAnalysis.errorRateAnomaly) anomalyBonus += 5;
  if (metricsAnalysis.latencyAnomaly) anomalyBonus += 5;
  if (metricsAnalysis.cpuAnomaly) anomalyBonus += 5;
  score += anomalyBonus;

  // 6. Critical floor
  if (telemetry.severityIndicators.includes("critical")) {
    score = Math.max(score, 75);
  }

  // 7. Clamp to [0, 100] and round to integer
  return asSeverity(Math.max(0, Math.min(100, Math.round(score))));
}

export const handler = async (
  input: CalculateSeverityInput
): Promise<CalculateSeverityOutput> => {
  const { incidentId, telemetry, metricsAnalysis } = input;

  const severity = calculateSeverityScore(telemetry, metricsAnalysis);

  console.log(
    JSON.stringify({
      level: "INFO",
      incidentId,
      message: "Severity calculated",
      severity,
    })
  );

  return { ...input, severity };
};
