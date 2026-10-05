# Requirements Document

## Introduction

OpsPilot is a serverless, AI-assisted cloud incident response platform built on AWS. It simulates operational incidents from distributed services and processes them through a real, event-driven AWS architecture. A user triggers one of three predefined incident simulations from a React dashboard; the simulated telemetry flows through API Gateway → Lambda → EventBridge → SQS → Step Functions → Bedrock → DynamoDB, and the result is displayed on the dashboard. The platform is optimized for a hackathon MVP and is intended to demonstrate spec-driven development, property-based testing, and the AWS serverless ecosystem.

---

## Glossary

- **OpsPilot**: The overall platform described in this document.
- **Dashboard**: The React + Vite + TypeScript single-page application served from S3 + CloudFront.
- **Ingest_Lambda**: The AWS Lambda function that receives raw events from API Gateway and publishes them to EventBridge.
- **EventBridge_Bus**: The Amazon EventBridge custom event bus that routes incident events.
- **SQS_Queue**: The Amazon SQS queue that buffers incident events between EventBridge and the Processor Lambda.
- **Processor_Lambda**: The AWS Lambda function that consumes messages from the SQS queue and starts the Step Functions workflow.
- **Workflow**: The AWS Step Functions state machine that orchestrates incident processing.
- **Load_Context_Lambda**: The Lambda function that loads baseline context for an incident.
- **Analyze_Metrics_Lambda**: The Lambda function that analyzes telemetry metrics.
- **Correlate_Events_Lambda**: The Lambda function that correlates related events.
- **Calculate_Severity_Lambda**: The Lambda function that computes a numeric severity score (0-100) for an incident.
- **Generate_Analysis_Lambda**: The Lambda function that calls Amazon Bedrock to produce an AI analysis.
- **Store_Incident_Lambda**: The Lambda function that persists the incident record to DynamoDB.
- **Send_Notification_Lambda**: The Lambda function that publishes a notification to SNS.
- **Bedrock**: Amazon Bedrock, used via the Converse API for AI analysis generation.
- **DynamoDB**: Amazon DynamoDB, used as the persistent incident store.
- **SNS**: Amazon Simple Notification Service, used for optional incident notifications.
- **TelemetryEvent**: A structured data object containing `serviceName`, `errorRate`, `p95Latency`, `cpuUsage`, `errorCodes`, `deploymentMetadata`, `timestamp`, and `severityIndicators`.
- **Incident**: A persisted record containing `incidentId`, `service`, `status`, `severity`, `telemetry`, `aiAnalysis`, `createdAt`, and `updatedAt`.
- **AnalysisResult**: The structured output from Bedrock containing `rootCause`, `evidence`, `impact`, and `remediationSteps` (exactly three items).
- **Severity**: A numeric score in the range 0-100 (inclusive), where higher values represent greater impact.
- **FallbackAnalysis**: A deterministic, hardcoded AnalysisResult returned when Bedrock is unavailable.
- **SAM_Template**: The AWS SAM `template.yaml` that defines all infrastructure as code.

---

## Requirements

### Requirement 1: Incident Simulation Triggering

**User Story:** As a platform operator, I want to trigger one of three predefined incident simulations from the dashboard, so that I can observe the full incident-response pipeline end-to-end without needing real infrastructure failures.

#### Acceptance Criteria

1. THE Dashboard SHALL present exactly three simulation trigger buttons labeled "DB Failure", "CPU Spike", and "Bad Deployment", each in an enabled and interactive state on initial load.
2. WHEN the user clicks a simulation trigger button, THE Dashboard SHALL send an HTTP POST request to the `/events` endpoint on API Gateway with a JSON body conforming to the TelemetryEvent schema within 2 seconds of the click event.
3. WHILE a simulation POST request is in progress, THE Dashboard SHALL disable all three simulation trigger buttons until the request completes or fails.
4. WHEN a "DB Failure" simulation is triggered, THE Dashboard SHALL populate the TelemetryEvent with a `cpuUsage` within the normal range (0-70%), an `errorRate` above 10%, a `p95Latency` above 2000ms, and at least one error code indicating a database connection failure.
5. WHEN a "CPU Spike" simulation is triggered, THE Dashboard SHALL populate the TelemetryEvent with a `cpuUsage` above 90%, an `errorRate` within the normal range (0-5%), and a severity indicator of "critical".
6. WHEN a "Bad Deployment" simulation is triggered, THE Dashboard SHALL populate the TelemetryEvent with a `deploymentMetadata` field containing a deployment timestamp within the past 10 minutes and an `errorRate` above 10%.
7. IF the POST request to `/events` fails due to a network error or a non-2xx response, THEN THE Dashboard SHALL display an error message indicating the failure to the user and restore all three simulation trigger buttons to an enabled state.

---

### Requirement 2: Event Ingestion

**User Story:** As a platform operator, I want all submitted telemetry events to be reliably ingested and routed into the processing pipeline, so that no incident simulation is lost.

#### Acceptance Criteria

1. WHEN API Gateway receives a POST to `/events` with a valid JSON TelemetryEvent body, THE Ingest_Lambda SHALL publish the event to the EventBridge_Bus as a custom event with `source` set to `"ops-pilot"` and `detail-type` set to `"IncidentEvent"`.
2. IF the POST request body is missing one or more required TelemetryEvent fields (`serviceName`, `errorRate`, `p95Latency`, `cpuUsage`, `timestamp`), THEN THE Ingest_Lambda SHALL return an HTTP 400 response with a JSON body containing an error message that identifies each missing field by name.
3. IF the POST request body is not valid JSON, THEN THE Ingest_Lambda SHALL return an HTTP 400 response with a JSON body containing an error message indicating the payload is not parseable as JSON.
4. WHEN the Ingest_Lambda successfully publishes to EventBridge_Bus, THE Ingest_Lambda SHALL return an HTTP 202 response with a JSON body containing the system-generated `incidentId` (a UUID) assigned to the event.
5. IF the Ingest_Lambda fails to publish the event to EventBridge_Bus, THEN THE Ingest_Lambda SHALL return an HTTP 502 response with a JSON body containing an error message indicating the event could not be forwarded, and SHALL NOT persist or partially process the event.
6. THE EventBridge_Bus SHALL route all events with `source` equal to `"ops-pilot"` to the SQS_Queue via an EventBridge rule.
7. THE SQS_Queue SHALL buffer events with a retention period of at least 24 hours and a visibility timeout of at least 30 seconds, and SHALL deliver each event to the Processor_Lambda at least once.

---

### Requirement 3: Incident Processing Workflow

**User Story:** As a platform operator, I want each ingested incident to be processed through a structured, observable workflow, so that the platform produces consistent, auditable incident records.

#### Acceptance Criteria

1. WHEN the Processor_Lambda receives a message from the SQS_Queue, THE Processor_Lambda SHALL start one Workflow execution per message, passing the TelemetryEvent as input, and SHALL reject duplicate messages with the same `incidentId` without starting a new Workflow execution.
2. THE Workflow SHALL execute steps in the following order: Load_Context_Lambda -> Parallel(Analyze_Metrics_Lambda, Correlate_Events_Lambda) -> Calculate_Severity_Lambda -> Generate_Analysis_Lambda -> Store_Incident_Lambda -> Send_Notification_Lambda.
3. WHEN the Workflow reaches the parallel step, THE Workflow SHALL invoke Analyze_Metrics_Lambda and Correlate_Events_Lambda concurrently and wait for both to complete before proceeding.
4. THE Calculate_Severity_Lambda SHALL produce a Severity score as an integer in the range 0-100 (inclusive) based on the outputs of Analyze_Metrics_Lambda and Correlate_Events_Lambda.
5. WHEN an error rate increases, THE Calculate_Severity_Lambda SHALL produce a Severity score greater than or equal to the score produced for the lower error rate, given all other inputs held constant.
6. WHEN the telemetry contains critical severity indicators, THE Calculate_Severity_Lambda SHALL produce a Severity score of 75 or higher.
7. THE Workflow SHALL log each state transition to CloudWatch Logs, including the step name, transition timestamp in ISO 8601 format, and execution status (started, succeeded, or failed).
8. IF any Lambda step in the Workflow fails after 3 consecutive execution attempts, THEN THE Workflow SHALL halt execution, mark the Workflow execution as failed, and emit an error log entry to CloudWatch Logs indicating the failed step name and the `incidentId`.
9. IF the Processor_Lambda fails to start a Workflow execution, THEN THE Processor_Lambda SHALL not delete the message from the SQS_Queue, allowing the message to be reprocessed up to the SQS_Queue configured maximum receive count before being moved to the dead-letter queue.

---

### Requirement 4: AI-Assisted Incident Analysis

**User Story:** As a platform operator, I want each incident to include an AI-generated analysis, so that I can quickly understand the probable root cause and recommended remediation steps.

#### Acceptance Criteria

1. WHEN the Workflow reaches the Generate_Analysis_Lambda step, THE Generate_Analysis_Lambda SHALL invoke Bedrock using the Converse API with a prompt containing the structured TelemetryEvent, where the prompt includes the event service name, timestamp, metric values, and anomaly indicators.
2. THE Generate_Analysis_Lambda SHALL use the model identifier specified in the `BEDROCK_MODEL_ID` environment variable, defaulting to `amazon.nova-micro-v1:0`, and SHALL reject any model identifier that is an empty string with an error indicating invalid configuration before invoking Bedrock.
3. WHEN Bedrock returns a successful response within 30 seconds, THE Generate_Analysis_Lambda SHALL parse the response into an AnalysisResult containing a `rootCause` string of 1-500 characters, an `evidence` list of 1-10 items, an `impact` string of 1-300 characters, and exactly three `remediationSteps` strings each of 1-300 characters.
4. IF the Bedrock response does not contain all four required fields (`rootCause`, `evidence`, `impact`, `remediationSteps`) or `remediationSteps` does not contain exactly three items, THEN THE Generate_Analysis_Lambda SHALL return a FallbackAnalysis instead of propagating a parse error.
5. IF Bedrock returns an error response, is unreachable, or does not respond within 30 seconds, THEN THE Generate_Analysis_Lambda SHALL return a FallbackAnalysis that is a valid AnalysisResult with all four required fields populated with non-empty placeholder values, ensuring the Workflow always proceeds to the next step.
6. FOR ALL valid TelemetryEvent inputs, parsing the Bedrock response then serializing the resulting AnalysisResult to its wire format then parsing it again SHALL produce an AnalysisResult where `rootCause`, `impact`, each `remediationSteps` string, and each `evidence` item are byte-for-byte identical to the original (round-trip property).

---

### Requirement 5: Incident Persistence

**User Story:** As a platform operator, I want every processed incident to be stored durably, so that I can retrieve and display incident history on the dashboard.

#### Acceptance Criteria

1. WHEN the Workflow reaches the Store_Incident_Lambda step, THE Store_Incident_Lambda SHALL write an Incident record to the DynamoDB `incidents` table with fields: `incidentId`, `service`, `status`, `severity`, `telemetry`, `aiAnalysis`, `createdAt`, and `updatedAt`.
2. THE Store_Incident_Lambda SHALL use `incidentId` as the DynamoDB partition key.
3. WHEN a new Incident is stored, THE Store_Incident_Lambda SHALL set `status` to `"active"`.
4. IF an Incident with the same `incidentId` already exists in DynamoDB, THEN THE Store_Incident_Lambda SHALL update the existing record rather than creating a duplicate.
5. THE Store_Incident_Lambda SHALL set `updatedAt` to the current UTC timestamp on every write.
6. IF the DynamoDB write operation fails, THEN THE Store_Incident_Lambda SHALL retry the write up to 3 times with exponential backoff before marking the step as failed and propagating an error to the Workflow.
7. IF the Incident record is missing any required field (`incidentId`, `service`, `status`, `severity`, `telemetry`, `aiAnalysis`, `createdAt`, or `updatedAt`), THEN THE Store_Incident_Lambda SHALL reject the write and propagate an error indicating which field is absent to the Workflow without writing a partial record.
8. WHEN the Store_Incident_Lambda completes a successful write, THE Store_Incident_Lambda SHALL return a confirmation to the Workflow containing the `incidentId` and the final `updatedAt` timestamp.

---

### Requirement 6: Incident Notifications

**User Story:** As a platform operator, I want to receive a notification when an incident is stored, so that I am alerted to new incidents without polling the dashboard.

#### Acceptance Criteria

1. WHEN the Workflow reaches the Send_Notification_Lambda step, THE Send_Notification_Lambda SHALL publish a message to the configured SNS topic containing the `incidentId`, `severity`, and `timestamp` of the incident.
2. IF the SNS publish call returns an error or does not receive a successful acknowledgement within 5 seconds, THEN THE Send_Notification_Lambda SHALL log an error message indicating the SNS failure and the associated `incidentId` to CloudWatch Logs and return a success response so that the Workflow reaches the `Success` terminal state.
3. WHERE SNS topic configuration is absent from environment variables, THE Send_Notification_Lambda SHALL skip publication and log a warning message indicating missing SNS configuration to CloudWatch Logs.
4. IF the `incidentId` or `severity` fields are absent from the Workflow input to the Send_Notification_Lambda step, THEN THE Send_Notification_Lambda SHALL skip publication, log an error message indicating which required fields are missing to CloudWatch Logs, and return a success response so that the Workflow reaches the `Success` terminal state.

---

### Requirement 7: Incident Dashboard Display

**User Story:** As a platform operator, I want the dashboard to display active incidents and overall system health, so that I can assess the current state of the platform at a glance.

#### Acceptance Criteria

1. THE Dashboard SHALL display an overall system health indicator as one of three discrete statuses ("Healthy", "Degraded", or "Critical") derived from the highest severity score among all active incidents, where no active incidents maps to "Healthy", at least one incident with severity 1-49 maps to "Degraded", and at least one incident with severity 50 or above maps to "Critical".
2. THE Dashboard SHALL display a service card for each distinct `service` value present in the `incidents` table, where each card shows the service name and its highest active incident severity status, or "Healthy" if no active incidents exist for that service.
3. WHEN an active incident exists, THE Dashboard SHALL display an incident card showing: `severity` (numeric score), `errorRate` (percentage), `p95Latency` (milliseconds), `cpuUsage` (percentage), `rootCause` (text), `evidence` (text), and `remediationSteps` (text).
4. WHEN the dashboard loads, THE Dashboard SHALL fetch the current list of incidents from the backend within 5 seconds and render them without requiring a page refresh, displaying a loading indicator until the fetch completes.
5. IF no active incidents exist, THE Dashboard SHALL display a message indicating that all services are healthy.
6. IF the backend fetch fails or does not respond within 5 seconds, THEN THE Dashboard SHALL display an error message indicating that incident data could not be retrieved and preserve any previously rendered incident data on screen.

---

### Requirement 8: Infrastructure as Code

**User Story:** As a developer, I want the entire platform infrastructure defined in a single SAM template, so that the platform can be deployed repeatably to AWS with a single command.

#### Acceptance Criteria

1. THE SAM_Template SHALL define all Lambda functions, API Gateway, EventBridge_Bus, SQS_Queue, DynamoDB table, and SNS topic as SAM/CloudFormation resources, with no platform resource provisioned outside the SAM_Template.
2. THE SAM_Template SHALL configure all Lambda functions to use the Node.js 22 runtime and specify esbuild as the build method in the function metadata.
3. THE SAM_Template SHALL set `us-east-1` as the default value of the AWS region parameter such that deploying without overriding the region parameter targets `us-east-1`.
4. THE SAM_Template SHALL expose the `BEDROCK_MODEL_ID` environment variable on the Generate_Analysis_Lambda with a default value of `amazon.nova-micro-v1:0`, and the value SHALL be overridable via a SAM/CloudFormation template parameter at deploy time.
5. THE SAM_Template SHALL attach an IAM policy to Generate_Analysis_Lambda that grants the `bedrock:InvokeModel` action on all Bedrock model resources in the `us-east-1` region, and grants no broader permissions than required to invoke Bedrock models.
6. WHEN `sam build && sam deploy` is executed against the SAM_Template, THE SAM_Template SHALL complete without prompting for any required parameter values that lack defaults or prior saved configuration.
7. IF the SAM_Template references a resource name or ARN that is not defined within the same SAM_Template or passed as an explicit parameter with a default value, THEN THE SAM_Template SHALL fail template validation before deployment begins.

---

### Requirement 9: Shared TypeScript Interfaces

**User Story:** As a developer, I want shared TypeScript interfaces used consistently across all Lambda functions and the frontend, so that data contracts are enforced at compile time.

#### Acceptance Criteria

1. THE shared module SHALL export a `TelemetryEvent` interface with fields: `serviceName` (string), `errorRate` (number), `p95Latency` (number), `cpuUsage` (number), `errorCodes` (string[]), `deploymentMetadata` (Record<string, string | number>), `timestamp` (string, ISO 8601 format), and `severityIndicators` (string[]).
2. THE shared module SHALL export an `Incident` interface with fields: `incidentId` (string), `service` (string), `status` (one of: `"active"`, `"investigating"`, `"resolved"`), `severity` (Severity), `telemetry` (TelemetryEvent), `aiAnalysis` (AnalysisResult), `createdAt` (string, ISO 8601 format), and `updatedAt` (string, ISO 8601 format).
3. THE shared module SHALL export an `AnalysisResult` interface with fields: `rootCause` (string), `evidence` (string[]), `impact` (string), and `remediationSteps` typed as a tuple of exactly three strings (`[string, string, string]`).
4. THE shared module SHALL export a `Severity` type as a branded numeric type constrained to the integer range 0-100 inclusive, such that assigning a value outside this range causes a TypeScript compile-time error.
5. WHEN any Lambda function or frontend component imports a shared interface, THE TypeScript compiler SHALL resolve the import without type errors.

---

### Requirement 10: Severity Invariants and Property-Based Testing Targets

**User Story:** As a developer, I want the severity calculation logic to satisfy verifiable invariants, so that property-based tests can confirm correctness across all possible telemetry inputs.

#### Acceptance Criteria

1. THE Calculate_Severity_Lambda SHALL produce a Severity value in the closed integer range [0, 100] for every valid TelemetryEvent input where `errorRate` is in [0.0, 1.0], `p95Latency` is a non-negative number, and `severityIndicators` is a list of zero or more non-empty strings.
2. FOR ALL pairs of valid TelemetryEvent inputs A and B, where B is identical to A except that B `errorRate` is strictly greater than A `errorRate`, THE Calculate_Severity_Lambda SHALL produce a Severity for B that is greater than or equal to the Severity for A (monotonicity invariant), holding all other fields constant.
3. FOR ALL valid TelemetryEvent inputs where `severityIndicators` contains the string `"critical"`, THE Calculate_Severity_Lambda SHALL produce a Severity of 75 or higher (critical floor invariant), regardless of the values of all other fields.
4. FOR ALL valid TelemetryEvent inputs, THE Calculate_Severity_Lambda SHALL produce the same Severity value when called two or more times with the same input without any intervening state mutation (idempotence invariant).
5. WHEN Store_Incident_Lambda is called with an `incidentId` that already exists as a record in DynamoDB, THE Store_Incident_Lambda SHALL return a success response indicating the existing record was matched without creating a second distinct DynamoDB record for that `incidentId` (duplicate-prevention invariant).
6. IF a TelemetryEvent input has an `errorRate` outside [0.0, 1.0], a negative `p95Latency`, or a `severityIndicators` field that is absent or not a list, THEN THE Calculate_Severity_Lambda SHALL reject the input with an error response indicating invalid input without producing a Severity value.
