import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type {
  TelemetryEvent,
  AnalysisResult,
  Severity,
  MetricsAnalysis,
  CorrelationResult,
  IncidentContext,
} from "../../shared/types";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface StoreIncidentInput {
  incidentId: string;
  telemetry: TelemetryEvent;
  severity: Severity;
  aiAnalysis: AnalysisResult;
  context?: IncidentContext;
  metricsAnalysis?: MetricsAnalysis;
  correlationResult?: CorrelationResult;
}

interface StoreIncidentOutput {
  incidentId: string;
  updatedAt: string;
}

const REQUIRED_FIELDS: (keyof StoreIncidentInput)[] = [
  "incidentId",
  "telemetry",
  "severity",
  "aiAnalysis",
];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertIncident(
  tableName: string,
  incidentId: string,
  telemetry: TelemetryEvent,
  severity: Severity,
  aiAnalysis: AnalysisResult,
  updatedAt: string,
  attempt = 0
): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { incidentId },
        UpdateExpression:
          "SET #svc = :svc, #status = :status, #sev = :sev, #tel = :tel, #ai = :ai, #ua = :ua, #ca = if_not_exists(#ca, :ca)",
        ExpressionAttributeNames: {
          "#svc": "service",
          "#status": "status",
          "#sev": "severity",
          "#tel": "telemetry",
          "#ai": "aiAnalysis",
          "#ua": "updatedAt",
          "#ca": "createdAt",
        },
        ExpressionAttributeValues: {
          ":svc": telemetry.serviceName,
          ":status": "active",
          ":sev": severity,
          ":tel": telemetry,
          ":ai": aiAnalysis,
          ":ua": updatedAt,
          ":ca": updatedAt,
        },
      })
    );
  } catch (err) {
    const isThrottle =
      err instanceof Error &&
      (err.name === "ProvisionedThroughputExceededException" ||
        err.name === "ThrottlingException");

    if (isThrottle && attempt < 2) {
      const backoffMs = 400 * Math.pow(2, attempt); // 400, 800, 1600
      console.log(
        JSON.stringify({
          level: "WARN",
          incidentId,
          message: `DynamoDB throttled â€” retrying in ${backoffMs}ms`,
          attempt: attempt + 1,
        })
      );
      await sleep(backoffMs);
      return upsertIncident(tableName, incidentId, telemetry, severity, aiAnalysis, updatedAt, attempt + 1);
    }

    throw err;
  }
}

export const handler = async (
  input: StoreIncidentInput
): Promise<StoreIncidentOutput> => {
  // Validate required fields before touching DynamoDB
  const missingFields = REQUIRED_FIELDS.filter(
    (f) => input[f] === undefined || input[f] === null
  );
  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields: ${missingFields.join(", ")}`
    );
  }

  const { incidentId, telemetry, severity, aiAnalysis } = input;
  const tableName = process.env["INCIDENTS_TABLE"] ?? "ops-pilot-incidents";
  const updatedAt = new Date().toISOString();

  console.log(
    JSON.stringify({
      level: "INFO",
      incidentId,
      message: "Storing incident",
      tableName,
    })
  );

  await upsertIncident(tableName, incidentId, telemetry, severity, aiAnalysis, updatedAt);

  console.log(
    JSON.stringify({
      level: "INFO",
      incidentId,
      message: "Incident stored successfully",
      updatedAt,
    })
  );

  return { incidentId, updatedAt };
};
