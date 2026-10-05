import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import type { TelemetryEvent } from "../../shared/types";

const eventBridgeClient = new EventBridgeClient({});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

// Normalize a raw payload (supports both canonical TelemetryEvent format and
// the shorthand sample format) into a TelemetryEvent.
function normalizePayload(raw: Record<string, unknown>): TelemetryEvent {
  // serviceName: accept "service" or "serviceName"
  const serviceName = (raw["serviceName"] ?? raw["service"]) as string;

  // errorRate: accept raw value; if > 1 it is a percentage â€” convert to fraction
  let errorRate = Number(raw["errorRate"] ?? 0);
  if (errorRate > 1) errorRate = errorRate / 100;

  // p95Latency
  const p95Latency = Number(raw["p95Latency"] ?? 0);

  // cpuUsage: accept "cpu" or "cpuUsage"; if > 1 treat as percentage
  let cpuUsage = Number(raw["cpuUsage"] ?? raw["cpu"] ?? 0);
  if (cpuUsage > 1) cpuUsage = cpuUsage / 100;

  // errorCodes: accept "errors" or "errorCodes"
  const errorCodesRaw = raw["errorCodes"] ?? raw["errors"];
  const errorCodes: string[] = Array.isArray(errorCodesRaw)
    ? (errorCodesRaw as string[])
    : [];

  // severityIndicators: derive from "scenario" field if not already present
  let severityIndicators: string[] = Array.isArray(raw["severityIndicators"])
    ? (raw["severityIndicators"] as string[])
    : [];

  const scenario = raw["scenario"] as string | undefined;
  if (scenario && severityIndicators.length === 0) {
    const scenarioMap: Record<string, string[]> = {
      cpu_overload: ["critical"],
      database_exhaustion: ["db-failure"],
      deployment_regression: ["deployment-regression"],
    };
    severityIndicators = scenarioMap[scenario] ?? [];
  }

  // deploymentMetadata: construct from deploymentMinutesAgo if present
  let deploymentMetadata: Record<string, string | number> =
    (raw["deploymentMetadata"] as Record<string, string | number>) ?? {};
  if (raw["deploymentMinutesAgo"] !== undefined && !deploymentMetadata["deployedAt"]) {
    const deployedAt = new Date(
      Date.now() - Number(raw["deploymentMinutesAgo"]) * 60 * 1000
    ).toISOString();
    deploymentMetadata = { ...deploymentMetadata, deployedAt };
  }
  if (raw["previousErrorRate"] !== undefined) {
    deploymentMetadata = {
      ...deploymentMetadata,
      previousErrorRate: Number(raw["previousErrorRate"]),
    };
  }

  const timestamp =
    typeof raw["timestamp"] === "string"
      ? raw["timestamp"]
      : new Date().toISOString();

  return {
    serviceName,
    errorRate,
    p95Latency,
    cpuUsage,
    errorCodes,
    deploymentMetadata,
    timestamp,
    severityIndicators,
  };
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  // Parse body
  let raw: Record<string, unknown>;
  try {
    if (!event.body) throw new Error("Empty body");
    raw = JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: "Request body is not parseable as JSON" });
  }

  // Validate required fields (accepting both naming conventions)
  const missingFields: string[] = [];
  if (!raw["serviceName"] && !raw["service"]) missingFields.push("serviceName");
  if (raw["errorRate"] === undefined) missingFields.push("errorRate");
  if (raw["p95Latency"] === undefined) missingFields.push("p95Latency");
  if (raw["cpuUsage"] === undefined && raw["cpu"] === undefined) missingFields.push("cpuUsage");

  if (missingFields.length > 0) {
    return jsonResponse(400, {
      error: "Missing required fields",
      missingFields,
    });
  }

  const telemetry = normalizePayload(raw);
  const incidentId = crypto.randomUUID();

  console.log(
    JSON.stringify({ level: "INFO", incidentId, message: "Ingesting telemetry event", serviceName: telemetry.serviceName })
  );

  const eventBusName = process.env["EVENT_BUS_NAME"] ?? "ops-pilot";

  try {
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: "ops-pilot",
            DetailType: "IncidentEvent",
            Detail: JSON.stringify({ incidentId, telemetry }),
            EventBusName: eventBusName,
          },
        ],
      })
    );
  } catch (err) {
    console.log(
      JSON.stringify({
        level: "ERROR",
        incidentId,
        message: "Failed to publish to EventBridge",
        error: String(err),
      })
    );
    return jsonResponse(502, { error: "Failed to forward event to processing pipeline" });
  }

  console.log(
    JSON.stringify({ level: "INFO", incidentId, message: "Event published to EventBridge" })
  );

  return jsonResponse(202, { incidentId });
};
