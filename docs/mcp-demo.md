# OpsPilot MCP Demo: Filesystem Server

This document demonstrates using the **filesystem MCP server** (configured in `.kiro/mcp/config.json`) to read OpsPilot deployment artifacts and incident data from within the IDE.

## MCP Server Configuration

The filesystem server is registered as `filesystem` in `.kiro/mcp/config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceRoot}"],
      "description": "Filesystem MCP server providing structured read access to OpsPilot project files."
    }
  }
}
```

The server is launched via `npx` (no install needed) and scoped to the workspace root, giving read access to all project files.

---

## Demo 1: Read Terraform Outputs (Deployment State)

The file `docs/deployment-state.json` contains the live Terraform outputs captured from the deployed AWS infrastructure:

```json
{
  "api_endpoint": {
    "value": "https://5ke5lm6rke.execute-api.us-east-1.amazonaws.com/"
  },
  "dynamodb_table_name": {
    "value": "ops-pilot-incidents"
  },
  "event_bus_name": {
    "value": "ops-pilot"
  },
  "sqs_queue_url": {
    "value": "https://sqs.us-east-1.amazonaws.com/104044935681/ops-pilot-incidents"
  },
  "state_machine_arn": {
    "value": "arn:aws:states:us-east-1:104044935681:stateMachine:ops-pilot-incident-workflow"
  }
}
```

**MCP call:** `filesystem/read_file` with path `docs/deployment-state.json`

The ops-pilot-engineer agent can read this file to determine the live API endpoint and DynamoDB table name without hardcoding them.

---

## Demo 2: Read Terraform Infrastructure Definition

**MCP call:** `filesystem/read_file` with path `infra/outputs.tf`

This allows the agent to understand what outputs are declared in Terraform and cross-reference them with `deployment-state.json` to verify the deployed state matches the declared outputs.

**Why this is useful:** When troubleshooting a misconfigured Lambda (wrong env var, missing IAM permission), the agent can read `infra/lambda.tf` and `infra/iam.tf` directly to diagnose the gap without leaving the conversation.

---

## Demo 3: Inspect a Shared Type

**MCP call:** `filesystem/read_file` with path `backend/shared/types.ts`

The agent can verify the `TelemetryEvent` interface fields and their constraints (e.g., `errorRate: [0.0, 1.0]`) when a user reports unexpected severity scores. This removes the need to copy-paste code into the chat.

---

## Workflow: Agent + MCP for Incident Debugging

```
User: "Severity came back 0 for my media-processor incident"

ops-pilot-engineer agent:
1. MCP: read backend/shared/types.ts       → confirm TelemetryEvent fields
2. MCP: read backend/functions/calculateSeverity/handler.ts
                                           → inspect the scoring algorithm
3. MCP: read docs/deployment-state.json   → get live API endpoint
4. Agent reasons: cpuUsage field was 0.98 but submitted as 98 (integer, not ratio)
5. Agent: "errorRate and cpuUsage must be in [0.0, 1.0] -- submit 0.98 not 98"
```

This avoids switching to a file browser or terminal; the agent has full read access through the MCP server.

---

## Regenerating deployment-state.json

Run this from `infra/` after any `terraform apply`:

```bash
terraform output -json > ../docs/deployment-state.json
```

The ops-pilot-engineer agent reads this file as a source of truth for all deployed resource ARNs and URLs.
