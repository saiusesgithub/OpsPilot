import type {
  TelemetryEvent,
  IncidentContext,
  MetricsAnalysis,
} from "../../shared/types";

interface AnalyzeMetricsInput {
  incidentId: string;
  telemetry: TelemetryEvent;
  context: IncidentContext;
}

// Parallel branch: return ONLY the new data (metricsAnalysis).
// The Step Functions ResultSelector will pick this up as $[0].metricsAnalysis.
interface AnalyzeMetricsOutput {
  metricsAnalysis: MetricsAnalysis;
}

export const handler = async (
  input: AnalyzeMetricsInput
): Promise<AnalyzeMetricsOutput> => {
  const { incidentId, telemetry, context } = input;
  const thresholds = context.baselineThresholds;

  const errorRateAnomaly = telemetry.errorRate > thresholds.errorRate;
  const latencyAnomaly = telemetry.p95Latency > thresholds.p95Latency;
  const cpuAnomaly = telemetry.cpuUsage > thresholds.cpuUsage;

  const deviations: Record<string, number> = {};
  if (errorRateAnomaly && thresholds.errorRate > 0) {
    deviations["errorRate"] =
      ((telemetry.errorRate - thresholds.errorRate) / thresholds.errorRate) * 100;
  }
  if (latencyAnomaly && thresholds.p95Latency > 0) {
    deviations["p95Latency"] =
      ((telemetry.p95Latency - thresholds.p95Latency) / thresholds.p95Latency) * 100;
  }
  if (cpuAnomaly && thresholds.cpuUsage > 0) {
    deviations["cpuUsage"] =
      ((telemetry.cpuUsage - thresholds.cpuUsage) / thresholds.cpuUsage) * 100;
  }

  const metricsAnalysis: MetricsAnalysis = {
    errorRateAnomaly,
    latencyAnomaly,
    cpuAnomaly,
    deviations,
  };

  console.log(
    JSON.stringify({
      level: "INFO",
      incidentId,
      message: "Metrics analysis complete",
      errorRateAnomaly,
      latencyAnomaly,
      cpuAnomaly,
    })
  );

  return { metricsAnalysis };
};
