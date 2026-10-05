---
inclusion: auto
name: aws-serverless-rules
description: AWS and serverless architecture rules for OpsPilot Lambda functions and SAM template
---

# AWS and Serverless Architecture Rules

## SAM Template

- All resources are defined in `template.yaml`. No resource is provisioned outside this file.
- Use `AWS::Serverless::Function` for all Lambdas.
- All Lambda functions: `Runtime: nodejs22.x`, `Architectures: [x86_64]`.
- Run `sam validate` before every deploy. Zero validation errors required.
- Deploy with `sam build && sam deploy` to `us-east-1` by default.

## Lambda Function Design

- Each Lambda is **small and single-purpose**: one handler, one responsibility.
- File layout: `backend/functions/{functionName}/handler.ts`  
- Default timeout: 10 seconds. GenerateAnalysisFunction: 35 seconds.
- Default memory: 256 MB.

## Event Pipeline

- API Gateway: `POST /events` triggers IngestFunction
- EventBridge event: `{ source: 'ops-pilot', 'detail-type': 'IncidentEvent', detail: { incidentId, telemetry } }`  
- SQS: `VisibilityTimeout: 30`, `MessageRetentionPeriod: 86400`, DLQ configured
- Processor Lambda SQS trigger: batch size 1

## Step Functions Retry Block

Every Lambda task state must include a Retry block with MaxAttempts 3, IntervalSeconds 2, BackoffRate 2.0.
The SendNotification state catches all errors and returns success - never fails the workflow.

## DynamoDB

- Use `DynamoDBDocumentClient` from `@aws-sdk/lib-dynamodb`  
- Upsert: `UpdateCommand` with `SET createdAt = if_not_exists(createdAt, :now)`  
- Partition key: `incidentId` (string). No sort key. Billing: `PAY_PER_REQUEST`  

## Bedrock Converse API

- Client: `@aws-sdk/client-bedrock-runtime`  
- Model: from `BEDROCK_MODEL_ID` env var, default `amazon.nova-micro-v1:0`  
- Always handle errors with FallbackAnalysis - never propagate Bedrock failures

## Out of Scope

Do not add: authentication, WebSockets, X-Ray, RDS, ECS, or any AWS service not in the architecture spec.