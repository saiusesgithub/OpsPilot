import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { Incident } from "../../shared/types";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  const tableName = process.env["INCIDENTS_TABLE"] ?? "ops-pilot-incidents";

  try {
    const result = await docClient.send(
      new ScanCommand({ TableName: tableName })
    );

    const incidents: Incident[] = (result.Items ?? []) as Incident[];

    // Sort by createdAt descending (newest first)
    incidents.sort((a, b) => {
      const ta = a.createdAt ?? "";
      const tb = b.createdAt ?? "";
      return tb.localeCompare(ta);
    });

    console.log(
      JSON.stringify({
        level: "INFO",
        incidentId: "N/A",
        message: "Incidents retrieved",
        count: incidents.length,
      })
    );

    return jsonResponse(200, incidents);
  } catch (err) {
    console.log(
      JSON.stringify({
        level: "ERROR",
        incidentId: "N/A",
        message: "Failed to retrieve incidents",
        error: String(err),
      })
    );
    return jsonResponse(500, { error: "Failed to retrieve incidents" });
  }
};
