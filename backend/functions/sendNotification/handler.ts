import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

let snsClient: SNSClient | null = null;

function getSnsClient(): SNSClient {
  if (!snsClient) {
    snsClient = new SNSClient({});
  }
  return snsClient;
}

interface SendNotificationInput {
  incidentId: string;
  severity: number;
  updatedAt?: string;
  [key: string]: unknown;
}

export const handler = async (
  input: SendNotificationInput
): Promise<{ success: true }> => {
  const topicArn = process.env["SNS_TOPIC_ARN"];

  if (!topicArn) {
    console.log(
      JSON.stringify({
        level: "WARN",
        incidentId: input.incidentId,
        message: "SNS_TOPIC_ARN not configured -- skipping notification",
      })
    );
    return { success: true };
  }

  if (!input.incidentId || input.severity === undefined) {
    console.log(
      JSON.stringify({
        level: "ERROR",
        incidentId: input.incidentId ?? "unknown",
        message: "Missing incidentId or severity -- skipping notification",
      })
    );
    return { success: true };
  }

  try {
    await getSnsClient().send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: `OpsPilot Incident Alert -- Severity ${input.severity}`,
        Message: JSON.stringify({
          incidentId: input.incidentId,
          severity: input.severity,
          timestamp: input.updatedAt ?? new Date().toISOString(),
        }),
      })
    );
    console.log(
      JSON.stringify({
        level: "INFO",
        incidentId: input.incidentId,
        message: "SNS notification sent",
        severity: input.severity,
      })
    );
  } catch (err) {
    console.log(
      JSON.stringify({
        level: "ERROR",
        incidentId: input.incidentId,
        message: "SNS publish failed -- continuing",
        error: String(err),
      })
    );
  }

  return { success: true };
};
