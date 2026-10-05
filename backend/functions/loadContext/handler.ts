import type { TelemetryEvent, IncidentContext } from "../../shared/types";

interface LoadContextInput {
  incidentId: string;
  telemetry: TelemetryEvent;
}

interface LoadContextOutput {
  incidentId: string;
  telemetry: TelemetryEvent;
  context: IncidentContext;
}

// Static context map â€” keyed by serviceName.
const CONTEXT_MAP: Record<string, IncidentContext> = {
  "orders-api": {
    serviceTier: "critical",
    region: "us-east-1",
    baselineThresholds: {
      errorRate: 0.01,   // 1%
      p95Latency: 500,   // ms
      cpuUsage: 0.70,    // 70%
    },
  },
  "media-processor": {
    serviceTier: "standard",
    region: "us-east-1",
    baselineThresholds: {
      errorRate: 0.02,
      p95Latency: 1000,
      cpuUsage: 0.80,
    },
  },
  "auth-api": {
    serviceTier: "critical",
    region: "us-east-1",
    baselineThresholds: {
      errorRate: 0.005,  // 0.5%
      p95Latency: 200,
      cpuUsage: 0.60,
    },
  },
  // Spec simulation service names
  "db-failure-service": {
    serviceTier: "critical",
    region: "us-east-1",
    baselineThresholds: { errorRate: 0.01, p95Latency: 500, cpuUsage: 0.70 },
  },
  "cpu-spike-service": {
    serviceTier: "standard",
    region: "us-east-1",
    baselineThresholds: { errorRate: 0.02, p95Latency: 1000, cpuUsage: 0.80 },
  },
  "bad-deployment-service": {
    serviceTier: "critical",
    region: "us-east-1",
    baselineThresholds: { errorRate: 0.005, p95Latency: 200, cpuUsage: 0.60 },
  },
};

const DEFAULT_CONTEXT: IncidentContext = {
  serviceTier: "standard",
  region: "us-east-1",
  baselineThresholds: {
    errorRate: 0.05,
    p95Latency: 1000,
    cpuUsage: 0.80,
  },
};

export const handler = async (input: LoadContextInput): Promise<LoadContextOutput> => {
  const { incidentId, telemetry } = input;

  const context = CONTEXT_MAP[telemetry.serviceName] ?? DEFAULT_CONTEXT;

  console.log(
    JSON.stringify({
      level: "INFO",
      incidentId,
      message: "Context loaded",
      serviceName: telemetry.serviceName,
      serviceTier: context.serviceTier,
    })
  );

  return { incidentId, telemetry, context };
};
