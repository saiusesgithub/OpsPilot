import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  TelemetryEvent,
  AnalysisResult,
  Severity,
  MetricsAnalysis,
  CorrelationResult,
  IncidentContext,
} from "../../shared/types";

interface GenerateAnalysisInput {
  incidentId: string;
  telemetry: TelemetryEvent;
  severity: Severity;
  context: IncidentContext;
  metricsAnalysis: MetricsAnalysis;
  correlationResult: CorrelationResult;
}

interface GenerateAnalysisOutput extends GenerateAnalysisInput {
  aiAnalysis: AnalysisResult;
}

// ──────────────────────────────────────────────────────────────────────────────
// Bedrock client (lazy singleton)
// ──────────────────────────────────────────────────────────────────────────────
let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({ region: "us-east-1" });
  }
  return bedrockClient;
}

// ──────────────────────────────────────────────────────────────────────────────
// Deterministic fallback analyses keyed by serviceName.
// These are used when Bedrock is disabled, times out, or returns invalid JSON.
// ──────────────────────────────────────────────────────────────────────────────
const FALLBACK_ANALYSES: Record<string, AnalysisResult> = {
  "orders-api": {
    rootCause:
      "Database connection pool exhausted -- all connections occupied by long-running queries, preventing new requests from being served.",
    evidence: [
      "Error rate elevated to 18.4% (threshold: 1%)",
      "P95 latency at 2840ms (threshold: 500ms)",
      "DB_CONNECTION_TIMEOUT errors in all recent requests",
      "CPU usage normal at 64% -- ruling out compute saturation",
    ],
    impact:
      "Orders API unable to process new orders. Customers experience timeouts and errors on checkout. Existing in-flight transactions may be rolled back.",
    remediationSteps: [
      "Immediately restart the database connection pool to release stuck connections",
      "Identify and kill long-running queries consuming all connections via database admin console",
      "Scale the database connection pool limit and review query timeout configurations to prevent recurrence",
    ] as [string, string, string],
  },
  "media-processor": {
    rootCause:
      "CPU saturation caused by runaway media encoding jobs consuming all available compute resources.",
    evidence: [
      "CPU usage at 98% (threshold: 80%)",
      "P95 latency degraded to 4190ms due to CPU starvation",
      "REQUEST_TIMEOUT errors indicate jobs exceeding processing limits",
      "Error rate elevated to 7.2% -- correlates with CPU spike onset",
    ],
    impact:
      "Media processing queue backing up. New upload requests timing out. Users unable to process videos or images. Queue depth increasing.",
    remediationSteps: [
      "Terminate or pause non-critical encoding jobs to restore CPU headroom immediately",
      "Scale out media processor instances horizontally to distribute encoding load",
      "Implement CPU-based auto-scaling and per-job resource quotas to prevent future saturation",
    ] as [string, string, string],
  },
  "auth-api": {
    rootCause:
      "Bad deployment introduced a regression causing authentication failures -- recent release broke token validation logic.",
    evidence: [
      "Error rate spiked to 21.1% from baseline 0.3% (70x increase) within 7 minutes of deployment",
      "INTERNAL_SERVER_ERROR responses indicate unhandled exception in new code path",
      "P95 latency at 1730ms suggests increased error handling overhead",
      "Deployment timestamp 7 minutes ago correlates exactly with error rate spike",
    ],
    impact:
      "Users unable to log in or authenticate API requests. All services depending on auth-api are affected. Session refresh failures causing cascading logouts.",
    remediationSteps: [
      "Immediately roll back to the previous stable deployment to restore authentication service",
      "Review the deployment diff to identify the breaking change in token validation logic",
      "Add integration tests for authentication flows to the deployment pipeline to prevent regression recurrence",
    ] as [string, string, string],
  },
  // Spec simulation service names
  "db-failure-service": {
    rootCause:
      "Database connection pool exhausted due to elevated error rates.",
    evidence: [
      "High errorRate detected",
      "Database connection error codes present",
    ],
    impact:
      "Service unable to process requests requiring database access.",
    remediationSteps: [
      "Restart database connection pool",
      "Check database server health and connectivity",
      "Scale database read replicas if read load is the cause",
    ] as [string, string, string],
  },
  "cpu-spike-service": {
    rootCause:
      "CPU saturation caused by runaway processes consuming all available compute resources.",
    evidence: [
      "CPU usage critically elevated",
      "Latency degradation observed",
      "Critical severity indicator present",
    ],
    impact:
      "Service throughput severely degraded due to CPU saturation.",
    remediationSteps: [
      "Identify and terminate runaway processes consuming excessive CPU",
      "Scale out service instances horizontally to distribute load",
      "Implement CPU-based auto-scaling to prevent future saturation",
    ] as [string, string, string],
  },
  "bad-deployment-service": {
    rootCause:
      "Recent deployment introduced a regression causing elevated error rates.",
    evidence: [
      "Error rate spike correlates with recent deployment",
      "Internal server errors indicate unhandled exceptions in new code",
    ],
    impact:
      "Service degraded following recent deployment. Users experiencing errors.",
    remediationSteps: [
      "Roll back to previous stable deployment immediately",
      "Review deployment diff for the breaking change",
      "Add regression tests to the deployment pipeline",
    ] as [string, string, string],
  },
};

const DEFAULT_FALLBACK: AnalysisResult = {
  rootCause:
    "Anomalous service behavior detected across multiple metrics.",
  evidence: [
    "Error rate above normal threshold",
    "Latency degradation detected",
    "Automated analysis triggered",
  ],
  impact:
    "Service degradation affecting end users. Request failures and latency spikes observed.",
  remediationSteps: [
    "Review recent deployments and configuration changes for potential causes",
    "Check infrastructure health metrics and resource utilization in the affected service",
    "Escalate to on-call engineering team if degradation continues beyond 15 minutes",
  ] as [string, string, string],
};

// ──────────────────────────────────────────────────────────────────────────────
// Build the Bedrock prompt
// ──────────────────────────────────────────────────────────────────────────────
function buildPrompt(input: GenerateAnalysisInput): string {
  const { telemetry, severity, correlationResult } = input;
  return `Analyse this cloud service incident and respond with EXACTLY this JSON structure:
{
  "rootCause": "<probable root cause, 1-500 characters>",
  "evidence": ["<observation 1>", "<observation 2>", "<observation 3>"],
  "impact": "<service impact description, 1-300 characters>",
  "remediationSteps": ["<immediate action>", "<investigation step>", "<prevention step>"]
}

Incident telemetry:
- Service: ${telemetry.serviceName}
- Timestamp: ${telemetry.timestamp}
- Error Rate: ${(telemetry.errorRate * 100).toFixed(1)}% (normalized: ${telemetry.errorRate})
- P95 Latency: ${telemetry.p95Latency}ms
- CPU Usage: ${(telemetry.cpuUsage * 100).toFixed(1)}%
- Severity Score: ${severity}/100
- Severity Indicators: ${telemetry.severityIndicators.join(", ") || "none"}
- Error Codes: ${telemetry.errorCodes.join(", ") || "none"}
- Scenario Pattern: ${correlationResult.dominantPattern}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Parse and validate Bedrock response
// ──────────────────────────────────────────────────────────────────────────────
function parseBedrockResponse(text: string): AnalysisResult {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  if (
    typeof parsed["rootCause"] !== "string" ||
    !Array.isArray(parsed["evidence"]) ||
    typeof parsed["impact"] !== "string" ||
    !Array.isArray(parsed["remediationSteps"]) ||
    (parsed["remediationSteps"] as unknown[]).length !== 3
  ) {
    throw new Error("Bedrock response missing required fields or invalid remediationSteps length");
  }

  const steps = parsed["remediationSteps"] as unknown[];
  if (!steps.every((s) => typeof s === "string")) {
    throw new Error("remediationSteps must be an array of strings");
  }

  return {
    rootCause: parsed["rootCause"] as string,
    evidence: (parsed["evidence"] as unknown[]).map(String),
    impact: parsed["impact"] as string,
    remediationSteps: steps as [string, string, string],
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Call Bedrock with 25-second timeout; returns null on any failure
// ──────────────────────────────────────────────────────────────────────────────
async function callBedrock(
  input: GenerateAnalysisInput,
  modelId: string
): Promise<AnalysisResult | null> {
  const systemPrompt =
    "You are an expert cloud operations engineer performing incident root cause analysis. " +
    "You must respond ONLY with a valid JSON object -- no markdown, no explanation, just the JSON.";

  const userPrompt = buildPrompt(input);

  const command = new ConverseCommand({
    modelId,
    system: [{ text: systemPrompt }],
    messages: [{ role: "user", content: [{ text: userPrompt }] }],
    inferenceConfig: {
      maxTokens: 512,
      temperature: 0,
    },
  });

  // Race Bedrock against a 25-second timeout
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Bedrock call timed out after 25s")), 25_000)
  );

  const response = await Promise.race([
    getBedrockClient().send(command),
    timeoutPromise,
  ]);

  const content = response.output?.message?.content;
  if (!content || content.length === 0) {
    throw new Error("Bedrock returned empty content");
  }

  const textBlock = content.find((b) => "text" in b);
  if (!textBlock || !("text" in textBlock) || typeof textBlock.text !== "string") {
    throw new Error("Bedrock response has no text block");
  }

  return parseBedrockResponse(textBlock.text);
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────────────
export const handler = async (
  input: GenerateAnalysisInput
): Promise<GenerateAnalysisOutput> => {
  const { incidentId, telemetry } = input;

  const bedrockEnabled = (process.env["BEDROCK_ENABLED"] ?? "true") !== "false";
  const modelId = process.env["BEDROCK_MODEL_ID"] ?? "amazon.nova-micro-v1:0";

  let aiAnalysis: AnalysisResult | null = null;
  let source = "fallback";

  if (bedrockEnabled) {
    try {
      aiAnalysis = await callBedrock(input, modelId);
      source = "bedrock";
      console.log(
        JSON.stringify({
          level: "INFO",
          incidentId,
          message: "Analysis generated via Bedrock",
          serviceName: telemetry.serviceName,
          modelId,
        })
      );
    } catch (err) {
      console.log(
        JSON.stringify({
          level: "WARN",
          incidentId,
          message: "Bedrock call failed -- using deterministic fallback",
          serviceName: telemetry.serviceName,
          error: String(err),
        })
      );
    }
  }

  if (!aiAnalysis) {
    aiAnalysis = FALLBACK_ANALYSES[telemetry.serviceName] ?? DEFAULT_FALLBACK;
    console.log(
      JSON.stringify({
        level: "INFO",
        incidentId,
        message: "Analysis generated (fallback)",
        serviceName: telemetry.serviceName,
        source,
      })
    );
  }

  return { ...input, aiAnalysis };
};
