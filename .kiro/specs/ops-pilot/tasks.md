# Implementation Plan: OpsPilot

## Overview

Build the OpsPilot serverless incident-response platform incrementally, validating each layer before the next. The critical path is: steering docs → shared types + SAM skeleton → backend Lambda pipeline → property-based tests for core logic → frontend dashboard → smoke test. All infrastructure is TypeScript / Node.js 22 / esbuild, deployed via SAM.

---

## Tasks

- [ ] 1. Create steering documents and project scaffold
  - [ ] 1.1 Write `.kiro/steering/typescript-conventions.md`
    - Document TypeScript strict mode, `noImplicitAny`, `strictNullChecks`, import aliases, and esbuild bundling conventions used across all Lambda functions and the frontend
    - Specify that all Lambda handlers export a named `handler` function; no default exports
    - _Requirements: 9.1, 9.5_

  - [ ] 1.2 Write `.kiro/steering/aws-serverless-rules.md`
    - Document SAM resource naming conventions, environment variable patterns (`process.env.X ?? default`), structured CloudWatch JSON logging format, and Step Functions state-passing shape
    - Document SQS visibility timeout ≥ 30 s, retention ≥ 24 h, and Step Functions retry block defaults (MaxAttempts 3, BackoffRate 2, IntervalSeconds 2)
    - _Requirements: 3.7, 3.8, 8.1, 8.2_

  - [ ] 1.3 Write `.kiro/steering/security-least-privilege.md`
    - Document IAM policy rules: each Lambda gets only the permissions it needs; `GenerateAnalysisFunction` gets `bedrock:InvokeModel` on `us-east-1` Bedrock resources only
    - Document that no Lambda has `*` resource policies and no credentials are hardcoded
    - _Requirements: 8.5_

  - [ ] 1.4 Write `.kiro/steering/project-scope.md`
    - Document MVP boundaries: no authentication, no WebSockets, no extra AWS services beyond API GW + Lambda + EventBridge + SQS + Step Functions + Bedrock + DynamoDB + SNS
    - Document that the dashboard is a Vite + React + TypeScript SPA; no SSR
    - _Requirements: 8.1_

  - [ ] 1.5 Initialise monorepo project structure
    - Create `backend/shared/`, `backend/functions/` subdirectories
    - Create root `package.json` with workspaces for `backend` and `frontend`
    - Create `backend/tsconfig.json` (strict, target ES2022, module Node16)
    - Create `backend/package.json` with `typescript`, `@types/aws-lambda`, `@types/node`, `aws-sdk` (v3 clients: `@aws-sdk/client-eventbridge`, `@aws-sdk/client-sfn`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-sns`, `@aws-sdk/client-bedrock-runtime`), `esbuild`, `jest`, `ts-jest`, `fast-check` as dev dependencies
    - _Requirements: 8.2, 9.5_

- [ ] 2. Implement shared types module
  - [ ] 2.1 Create `backend/shared/types.ts`
    - Export `TelemetryEvent` interface: `serviceName`, `errorRate`, `p95Latency`, `cpuUsage`, `errorCodes`, `deploymentMetadata`, `timestamp`, `severityIndicators` — exactly as specified in Requirements 9.1
    - Export `IncidentStatus` union: `"active" | "investigating" | "resolved"`
    - Export `AnalysisResult` interface with `remediationSteps` typed as `[string, string, string]` tuple — Requirements 9.3
    - Export branded `Severity` type and `asSeverity(n)` guard that throws `RangeError` for values outside integer [0, 100] — Requirements 9.4
    - Export `Incident` interface — Requirements 9.2
    - Export `MetricsAnalysis`, `CorrelationResult`, and `IncidentContext` interfaces matching the design document shapes
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 2.2 Run `tsc --noEmit` on the shared module to verify zero type errors
    - Confirm all exports resolve without errors
    - _Requirements: 9.5_

- [ ] 3. Create SAM template skeleton
  - [ ] 3.1 Create `template.yaml` with all infrastructure resources
    - Define `Parameters`: `BedrockModelId` (default `amazon.nova-micro-v1:0`) and `AWSRegion` (default `us-east-1`) — Requirements 8.3, 8.4
    - Define `Globals.Function`: `Runtime: nodejs22.x`, `Architectures: [x86_64]`
    - Define `IncidentsApi` (`AWS::Serverless::Api`)
    - Define `EventBus` (`AWS::Events::EventBus`)
    - Define `EventRule` (`AWS::Events::Rule`) routing `source = "ops-pilot"` events to `IncidentsQueue` — Requirements 2.6
    - Define `IncidentsQueue` (`AWS::SQS::Queue`) with `VisibilityTimeout: 30`, `MessageRetentionPeriod: 86400`, and a dead-letter queue — Requirements 2.7
    - Define `IncidentsTable` (`AWS::DynamoDB::Table`) with `incidentId` string partition key, `PAY_PER_REQUEST` billing — Requirements 5.2
    - Define `IncidentsTopic` (`AWS::SNS::Topic`)
    - Define stub `AWS::Serverless::Function` resources (handlers pointing to `dist/` paths) for all 9 Lambda functions with placeholder `Handler` fields — Requirements 8.1
    - Attach IAM policy to `GenerateAnalysisFunction` granting `bedrock:InvokeModel` on `arn:aws:bedrock:us-east-1::foundation-model/*` only — Requirements 8.5
    - Expose `BEDROCK_MODEL_ID` env var on `GenerateAnalysisFunction` defaulting to SAM parameter — Requirements 8.4
    - Define `IncidentWorkflow` (`AWS::Serverless::StateMachine`) with inline ASL referencing all 9 Lambda ARNs in pipeline order with Retry blocks — Requirements 3.2, 3.8
    - Define `Outputs`: `ApiEndpoint`, `IncidentsTableName`, `StateMachineArn`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 3.2 Run `sam validate` to confirm template passes structural validation
    - Confirm zero validation errors
    - _Requirements: 8.7_

- [ ] 4. Checkpoint — shared foundation verified
  - Ensure `tsc --noEmit` and `sam validate` pass before proceeding. Ask the user if any questions arise.

- [ ] 5. Implement Ingest Lambda
  - [ ] 5.1 Create `backend/functions/ingest/handler.ts`
    - Parse and validate `APIGatewayProxyEvent` body as `TelemetryEvent`; return 400 with each missing field named if any of `serviceName`, `errorRate`, `p95Latency`, `cpuUsage`, `timestamp` are absent — Requirements 2.2
    - Return 400 if body is not valid JSON — Requirements 2.3
    - Generate UUID v4 via `crypto.randomUUID()` as `incidentId` — Requirements 2.4
    - Call `EventBridge.putEvents` with `source: "ops-pilot"`, `detail-type: "IncidentEvent"`, and envelope `{ incidentId, telemetry }` — Requirements 2.1
    - Return 202 `{ incidentId }` on success — Requirements 2.4
    - Return 502 on EventBridge failure without persisting partial state — Requirements 2.5
    - Emit structured JSON log on every path — Requirements 3.7
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 5.2 Write property test for Ingest Lambda — `tests/property/ingest.property.test.ts`
    - **Property 7: Ingest validation completeness** — for any non-empty subset of required fields removed, response is 400 and body names every removed field
    - **Validates: Requirements 2.2**
    - **Property 8: Ingest UUID generation** — for any valid `TelemetryEvent`, 202 response `incidentId` matches UUID v4 regex
    - **Validates: Requirements 2.4**

  - [ ]* 5.3 Write unit tests for Ingest Lambda — `tests/unit/ingest.test.ts`
    - Valid payload → 202 with UUID; non-JSON body → 400; missing fields → 400 with field names; EventBridge failure → 502
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

- [ ] 6. Implement Processor Lambda
  - [ ] 6.1 Create `backend/functions/processor/handler.ts`
    - For each `SQSRecord`, extract `TelemetryEvent` and `incidentId` from the EventBridge envelope in `body` — Requirements 3.1
    - Call `StepFunctions.startExecution` with `name: incidentId` (deterministic execution name for deduplication) — Requirements 3.1
    - Treat `ExecutionAlreadyExists` as success (idempotent) — Requirements 3.1
    - Re-throw any other `startExecution` error so SQS retains the message — Requirements 3.9
    - Emit structured JSON log per record — Requirements 3.7
    - _Requirements: 3.1, 3.9_

  - [ ]* 6.2 Write property test for Processor Lambda — `tests/property/processor.property.test.ts`
    - **Property 9: Processor deduplication** — two SQS records with the same `incidentId` result in exactly one Step Functions execution started
    - **Validates: Requirements 3.1, 10.5**

  - [ ]* 6.3 Write unit tests for Processor Lambda — `tests/unit/processor.test.ts`
    - `ExecutionAlreadyExists` treated as success; SFN failure re-throws; valid message starts execution
    - _Requirements: 3.1, 3.9_

- [ ] 7. Implement Load Context Lambda
  - [ ] 7.1 Create `backend/functions/loadContext/handler.ts`
    - Accept `{ incidentId, telemetry }` from Step Functions
    - Perform static lookup by `serviceName` to produce `IncidentContext` (service tier, region, baseline thresholds for `db-failure-service`, `cpu-spike-service`, `bad-deployment-service`, and `_default`)
    - Return `{ incidentId, telemetry, context: IncidentContext }`
    - Emit structured JSON log
    - _Requirements: 3.2_

- [ ] 8. Implement Analyze Metrics Lambda
  - [ ] 8.1 Create `backend/functions/analyzeMetrics/handler.ts`
    - Accept `{ incidentId, telemetry, context }` from Step Functions parallel state
    - Compare `errorRate`, `p95Latency`, `cpuUsage` against `context.baselineThresholds`
    - Return `{ metricsAnalysis: MetricsAnalysis }` with `errorRateAnomaly`, `latencyAnomaly`, `cpuAnomaly` booleans and `deviations` record
    - Emit structured JSON log
    - _Requirements: 3.2, 3.3_

- [ ] 9. Implement Correlate Events Lambda
  - [ ] 9.1 Create `backend/functions/correlateEvents/handler.ts`
    - Accept `{ incidentId, telemetry, context }` from Step Functions parallel state
    - Identify dominant pattern from `errorCodes` and `severityIndicators` (e.g. `"database-timeout"`, `"cpu-saturation"`, `"deployment-regression"`)
    - Return `{ correlationResult: CorrelationResult }` with `dominantPattern`, `relatedErrorCodes`, `patternConfidence`
    - Emit structured JSON log
    - _Requirements: 3.2, 3.3_

- [ ] 10. Implement Calculate Severity Lambda
  - [ ] 10.1 Create `backend/functions/calculateSeverity/handler.ts`
    - Validate inputs: throw `InvalidInputError` if `errorRate` outside [0,1], `p95Latency` negative, or `severityIndicators` absent or non-array — Requirements 10.6
    - Apply severity algorithm exactly as specified in the design:
      1. Base score 0
      2. `errorRate * 40` (cap 40)
      3. `Math.min(20, Math.log10(p95Latency + 1) * 10)`
      4. `cpuUsage * 20` (cap 20)
      5. +5 per anomaly flag from `MetricsAnalysis` (max 15)
      6. Critical floor: if `"critical"` in `severityIndicators`, ensure score ≥ 75
      7. Clamp and round to integer in [0, 100] via `asSeverity()`
    - Return `{ severity: Severity }`
    - Emit structured JSON log
    - _Requirements: 3.4, 3.5, 3.6, 10.1, 10.2, 10.3, 10.4, 10.6_

  - [ ]* 10.2 Write property tests for Calculate Severity — `tests/property/calculateSeverity.property.test.ts`
    - **Property 1: Severity range invariant** — result is always integer in [0, 100] for any valid input
    - **Validates: Requirements 3.4, 10.1**
    - **Property 2: Severity monotonicity** — `calculateSeverity(B) >= calculateSeverity(A)` when B has strictly higher `errorRate` and all other fields identical
    - **Validates: Requirements 3.5, 10.2**
    - **Property 3: Severity critical floor** — result ≥ 75 whenever `severityIndicators` contains `"critical"`
    - **Validates: Requirements 3.6, 10.3**
    - **Property 4: Severity idempotence** — same input always yields same result
    - **Validates: Requirements 10.4**
    - **Property 5: Severity input rejection** — throws for `errorRate` outside [0,1], negative `p95Latency`, or missing/non-array `severityIndicators`
    - **Validates: Requirements 10.6**

  - [ ]* 10.3 Write unit tests for Calculate Severity — `tests/unit/calculateSeverity.test.ts`
    - Test each algorithm step with fixed inputs; test each invalid-input error path; test critical floor boundary at severity 74 → forced to 75
    - _Requirements: 3.4, 3.5, 3.6, 10.6_

- [ ] 11. Checkpoint — pipeline core logic verified
  - Ensure all property and unit tests for steps 5–10 pass. Ask the user if any questions arise.

- [ ] 12. Implement Generate Analysis Lambda
  - [ ] 12.1 Create `backend/functions/generateAnalysis/handler.ts`
    - Reject empty `BEDROCK_MODEL_ID` env var with a thrown configuration error — Requirements 4.2
    - Build Bedrock Converse API prompt from `TelemetryEvent` fields exactly as specified in the design template — Requirements 4.1
    - Call `bedrock-runtime.converse` with 30-second timeout — Requirements 4.3
    - Parse JSON from Bedrock response; validate all four fields and exactly 3 `remediationSteps` — Requirements 4.3, 4.4
    - On any parse/validation failure, Bedrock error, or timeout: return `FallbackAnalysis` (hardcoded per `serviceName` key: `db-failure-service`, `cpu-spike-service`, `bad-deployment-service`, `_default`) — Requirements 4.4, 4.5
    - Return `{ aiAnalysis: AnalysisResult }`
    - Emit structured JSON log for every fallback path with `incidentId`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 12.2 Write property test for Generate Analysis — `tests/property/generateAnalysis.property.test.ts`
    - **Property 13: Bedrock prompt field inclusion** — for any valid `TelemetryEvent`, the constructed prompt string contains `serviceName`, `timestamp`, `errorRate`, `p95Latency`, `cpuUsage`, `severityIndicators`, and `errorCodes`
    - **Validates: Requirements 4.1**

  - [ ]* 12.3 Write property test for AnalysisResult serialization — `tests/property/analysisResult.property.test.ts`
    - **Property 6: AnalysisResult serialization round-trip** — serialize → deserialize → fields are byte-for-byte identical
    - **Validates: Requirements 4.6**

  - [ ]* 12.4 Write unit tests for Generate Analysis — `tests/unit/generateAnalysis.test.ts`
    - Empty `BEDROCK_MODEL_ID` → throws; Bedrock error → FallbackAnalysis; timeout → FallbackAnalysis; missing `remediationSteps` → FallbackAnalysis; valid response → parsed `AnalysisResult`
    - _Requirements: 4.2, 4.4, 4.5_

- [ ] 13. Implement Store Incident Lambda
  - [ ] 13.1 Create `backend/functions/storeIncident/handler.ts`
    - Validate all eight required fields (`incidentId`, `service`, `status`, `severity`, `telemetry`, `aiAnalysis`, `createdAt`, `updatedAt`) before touching DynamoDB; throw naming absent fields — Requirements 5.7
    - Use `DynamoDBDocumentClient.send(UpdateCommand)` with `SET createdAt = if_not_exists(createdAt, :now)` and update all other fields — Requirements 5.4, 5.5
    - Implement 3-attempt exponential backoff for throttling errors (400 ms → 800 ms → 1600 ms) — Requirements 5.6
    - Set `status: "active"` for all new incidents — Requirements 5.3
    - Return `{ incidentId, updatedAt }` on success — Requirements 5.8
    - Emit structured JSON log
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ]* 13.2 Write property tests for Store Incident — `tests/property/storeIncident.property.test.ts`
    - **Property 10: Incident storage completeness** — for any valid `Incident` input, DynamoDB is called with an item containing all eight required fields
    - **Validates: Requirements 5.1, 5.2**
    - **Property 11: Incident storage field-rejection** — for any non-empty subset of required fields absent, throws without calling DynamoDB
    - **Validates: Requirements 5.7**
    - **Property 12: Incident upsert idempotency** — calling with the same `incidentId` twice results in exactly one DynamoDB item (mock the `UpdateCommand` call to verify it uses `if_not_exists`)
    - **Validates: Requirements 5.4, 10.5**

  - [ ]* 13.3 Write unit tests for Store Incident — `tests/unit/storeIncident.test.ts`
    - New incident → `UpdateCommand` called with correct item; existing `incidentId` → `createdAt` preserved; DynamoDB throttle → 3 retries with backoff; all-missing-fields → throws
    - _Requirements: 5.1, 5.4, 5.6, 5.7_

- [ ] 14. Implement Send Notification Lambda
  - [ ] 14.1 Create `backend/functions/sendNotification/handler.ts`
    - Return `{ success: true }` and log warning if `SNS_TOPIC_ARN` env var is absent — Requirements 6.3
    - Return `{ success: true }` and log error if `incidentId` or `severity` absent from input — Requirements 6.4
    - Call `SNS.publish` with 5-second timeout; payload `{ incidentId, severity, timestamp }` — Requirements 6.1
    - On SNS error or timeout: log error with `incidentId`, return `{ success: true }` — Requirements 6.2
    - Never throw or propagate an error to Step Functions
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 14.2 Write property test for Send Notification — `tests/property/sendNotification.property.test.ts`
    - **Property 15: SNS message field completeness** — for any valid `{ incidentId, severity, timestamp }`, the SNS publish payload contains all three fields with original values
    - **Validates: Requirements 6.1**

  - [ ]* 14.3 Write unit tests for Send Notification — `tests/unit/sendNotification.test.ts`
    - Missing `SNS_TOPIC_ARN` → skip + warn; missing fields → skip + error log; SNS error → success response; valid input → SNS publish called with correct payload
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 15. Checkpoint — full backend pipeline verified
  - Ensure all backend Lambda unit tests and property tests pass; run `tsc --noEmit` and `sam validate`. Ask the user if any questions arise.

- [ ] 16. Build React + Vite frontend
  - [ ] 16.1 Scaffold frontend with Vite
    - Run `npm create vite@latest frontend -- --template react-ts` in the workspace root
    - Install dependencies: `axios` or native `fetch` wrappers; no additional UI framework required
    - Configure `vite.config.ts` with a dev proxy for `/events` and `/incidents` pointing to the SAM local API URL (`http://127.0.0.1:3000`)
    - _Requirements: 7.4_

  - [ ] 16.2 Create `frontend/src/types.ts`
    - Re-export or duplicate `TelemetryEvent`, `Incident`, `AnalysisResult`, and `Severity` types for frontend use (or share via path alias)
    - _Requirements: 9.5_

  - [ ] 16.3 Create `frontend/src/api.ts`
    - Export `postEvent(payload: TelemetryEvent): Promise<{ incidentId: string }>` — wraps `POST /events`, throws on non-2xx
    - Export `getIncidents(): Promise<Incident[]>` — wraps `GET /incidents` with a 5-second timeout, throws on failure
    - _Requirements: 1.2, 7.4_

  - [ ] 16.4 Create `frontend/src/payloads.ts`
    - Export `buildDbFailurePayload()`: `cpuUsage` in [0, 0.7], `errorRate > 0.1`, `p95Latency > 2000`, error code indicating DB connection failure, `serviceName: "db-failure-service"` — Requirements 1.4
    - Export `buildCpuSpikePayload()`: `cpuUsage > 0.9`, `errorRate` in [0, 0.05], `severityIndicators: ["critical"]`, `serviceName: "cpu-spike-service"` — Requirements 1.5
    - Export `buildBadDeploymentPayload()`: `deploymentMetadata.deployedAt` within past 10 minutes, `errorRate > 0.1`, `serviceName: "bad-deployment-service"` — Requirements 1.6
    - _Requirements: 1.4, 1.5, 1.6_

  - [ ]* 16.5 Write unit tests for payload factories — `tests/unit/payloads.test.ts`
    - DB Failure: `cpuUsage ≤ 0.7`, `errorRate > 0.1`, `p95Latency > 2000`, DB error code present
    - CPU Spike: `cpuUsage > 0.9`, `errorRate ≤ 0.05`, `severityIndicators` includes `"critical"`
    - Bad Deployment: `deploymentMetadata.deployedAt` is within past 10 minutes of call time
    - _Requirements: 1.4, 1.5, 1.6_

  - [ ] 16.6 Create `frontend/src/components/SimulationPanel.tsx`
    - Render three buttons: "DB Failure", "CPU Spike", "Bad Deployment" — enabled on initial load — Requirements 1.1
    - On click: disable all three buttons, call `postEvent` with the matching payload — Requirements 1.2, 1.3
    - On success or failure: re-enable all buttons — Requirements 1.3, 1.7
    - On non-2xx or network error: display an error banner above the buttons — Requirements 1.7
    - _Requirements: 1.1, 1.2, 1.3, 1.7_

  - [ ] 16.7 Create `frontend/src/components/HealthIndicator.tsx`
    - Accept `incidents: Incident[]` prop
    - Derive health status: empty list → `"Healthy"`; max severity in [1, 49] → `"Degraded"`; max severity ≥ 50 → `"Critical"` — Requirements 7.1
    - Render status label with appropriate visual treatment
    - _Requirements: 7.1_

  - [ ]* 16.8 Write unit tests for health status derivation — `tests/unit/healthStatus.test.ts`
    - Empty list → `"Healthy"`; single incident severity 25 → `"Degraded"`; single incident severity 75 → `"Critical"`; mixed list → highest determines status
    - _Requirements: 7.1_

  - [ ]* 16.9 Write property test for health status derivation — `tests/property/dashboard.property.test.ts`
    - **Property 14: Dashboard health status derivation** — for any list of active incident severity scores, health status matches the three-rule derivation
    - **Validates: Requirements 7.1**

  - [ ] 16.10 Create `frontend/src/components/IncidentList.tsx`
    - Accept `incidents: Incident[]` prop
    - Group incidents by `service`; render one service card per distinct service showing service name and highest severity
    - Render individual incident cards with: `severity`, `errorRate`, `p95Latency`, `cpuUsage`, `rootCause`, `evidence`, `remediationSteps` — Requirements 7.3
    - If no active incidents, render a "All services are healthy" message — Requirements 7.5
    - _Requirements: 7.2, 7.3, 7.5_

  - [ ] 16.11 Create `frontend/src/App.tsx` and wire everything together
    - On mount: show loading indicator, call `getIncidents()` with a 5-second timeout, render `IncidentList` and `HealthIndicator` with results — Requirements 7.4
    - If fetch fails or times out: display error message; preserve any previously rendered incident data — Requirements 7.6
    - Render `SimulationPanel` at top
    - _Requirements: 7.4, 7.6_

- [ ] 17. Checkpoint — full stack wired, frontend verified
  - Ensure `tsc --noEmit` passes for both `backend` and `frontend`; run all unit and property tests. Ask the user if any questions arise.

- [ ] 18. Wire SAM template to compiled Lambda artifacts
  - [ ] 18.1 Create `backend/jest.config.ts`
    - Configure `ts-jest` with `testMatch` for `tests/unit/**/*.test.ts` and `tests/property/**/*.test.ts`
    - Set `testTimeout: 30000` to accommodate fast-check iterations
    - _Requirements: 8.2_

  - [ ] 18.2 Update `template.yaml` handler paths and esbuild metadata
    - Update all `Handler` fields to point to the compiled handler entry points
    - Add `Metadata.BuildMethod: esbuild` and `Metadata.BuildProperties` (entry points, bundle, minify, sourcemap) to each Lambda function resource
    - Add `Timeout`, `MemorySize`, and `Environment` blocks to each function per design spec (e.g. `GenerateAnalysisFunction` timeout 35 s)
    - Confirm `IncidentWorkflow` ASL references all Lambda ARNs via `!GetAtt` and includes per-state `Retry` blocks
    - _Requirements: 8.1, 8.2, 8.6_

  - [ ]* 18.3 Run `sam build` to verify all Lambda artifacts compile and package correctly
    - Confirm zero build errors
    - _Requirements: 8.6_

- [ ] 19. Final checkpoint — deploy-ready verification
  - Run `tsc --noEmit` (backend + frontend), `sam validate`, `jest` (all unit + property tests), `sam build`. Ensure all pass. Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements clauses for full traceability
- Checkpoints at tasks 4, 11, 15, 17, and 19 provide natural break points for incremental validation
- Property tests use `fast-check` with a minimum of 100 iterations per property; tag format `// Feature: ops-pilot, Property N: <text>`
- Unit tests use `jest` + `ts-jest`; mock AWS SDK calls with `jest.mock()`
- The SAM template is created as a skeleton early (task 3) so `sam deploy` can be tested incrementally as Lambdas are added
- Steering documents (task 1) are created first so they are available as context for all subsequent implementation tasks
- The `asSeverity()` branded-type guard in `shared/types.ts` is the single source of truth for severity range enforcement

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2"] },
    { "id": 3, "tasks": ["5.1", "6.1", "7.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.2", "6.3", "8.1", "9.1"] },
    { "id": 5, "tasks": ["10.1"] },
    { "id": 6, "tasks": ["10.2", "10.3"] },
    { "id": 7, "tasks": ["12.1", "13.1"] },
    { "id": 8, "tasks": ["12.2", "12.3", "12.4", "13.2", "13.3", "14.1"] },
    { "id": 9, "tasks": ["14.2", "14.3"] },
    { "id": 10, "tasks": ["16.1"] },
    { "id": 11, "tasks": ["16.2", "16.3", "16.4"] },
    { "id": 12, "tasks": ["16.5", "16.6", "16.7"] },
    { "id": 13, "tasks": ["16.8", "16.9", "16.10"] },
    { "id": 14, "tasks": ["16.11"] },
    { "id": 15, "tasks": ["18.1", "18.2"] },
    { "id": 16, "tasks": ["18.3"] }
  ]
}
```
