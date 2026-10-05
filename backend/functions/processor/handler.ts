import type { SQSEvent } from "aws-lambda";
import {
  SFNClient,
  StartExecutionCommand,
  ExecutionAlreadyExists,
} from "@aws-sdk/client-sfn";
import type { TelemetryEvent } from "../../shared/types";

const sfnClient = new SFNClient({});

// Sanitize incidentId for use as a Step Functions execution name.
// Execution names: 1-80 chars, alphanumeric, hyphens, underscores only.
function toExecutionName(incidentId: string): string {
  return incidentId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}

interface EventBridgeEnvelope {
  detail: {
    incidentId: string;
    telemetry: TelemetryEvent;
  };
}

export const handler = async (event: SQSEvent): Promise<void> => {
  const stateMachineArn = process.env["STATE_MACHINE_ARN"] ?? "";

  for (const record of event.Records) {
    let envelope: EventBridgeEnvelope;
    try {
      envelope = JSON.parse(record.body) as EventBridgeEnvelope;
    } catch (err) {
      console.log(
        JSON.stringify({
          level: "ERROR",
          incidentId: "unknown",
          message: "Failed to parse SQS record body",
          error: String(err),
        })
      );
      // Do not re-throw parse errors â€” malformed messages should go to DLQ.
      continue;
    }

    const { incidentId, telemetry } = envelope.detail;
    const executionName = toExecutionName(incidentId);

    console.log(
      JSON.stringify({
        level: "INFO",
        incidentId,
        message: "Starting Step Functions execution",
        executionName,
      })
    );

    try {
      await sfnClient.send(
        new StartExecutionCommand({
          stateMachineArn,
          name: executionName,
          input: JSON.stringify({ incidentId, telemetry }),
        })
      );
      console.log(
        JSON.stringify({ level: "INFO", incidentId, message: "Execution started" })
      );
    } catch (err) {
      if (err instanceof ExecutionAlreadyExists) {
        console.log(
          JSON.stringify({
            level: "INFO",
            incidentId,
            message: "Execution already exists â€” treating as success (idempotent)",
          })
        );
        // Idempotent â€” do not re-throw, SQS will delete the message.
        continue;
      }
      console.log(
        JSON.stringify({
          level: "ERROR",
          incidentId,
          message: "Failed to start Step Functions execution",
          error: String(err),
        })
      );
      // Re-throw so SQS retains the message for reprocessing.
      throw err;
    }
  }
};
