---
inclusion: auto
name: security-least-privilege
description: IAM least-privilege and security rules for OpsPilot
---

# Security and Least-Privilege IAM Rules

## Core Principle

Every Lambda has exactly the permissions it needs. No Lambda has `Resource: '*'` on any sensitive action.

## Per-Function IAM Permissions

| Function | Required Permissions | Resource Scope |
|----------|---------------------|----------------|
| IngestFunction | `events:PutEvents` | EventBridge bus ARN only |
| ProcessorFunction | `states:StartExecution` | State machine ARN only |
| LoadContextFunction | (none beyond basic execution) | - |
| AnalyzeMetricsFunction | (none beyond basic execution) | - |
| CorrelateEventsFunction | (none beyond basic execution) | - |
| CalculateSeverityFunction | (none beyond basic execution) | - |
| GenerateAnalysisFunction | `bedrock:InvokeModel` | `arn:aws:bedrock:us-east-1::foundation-model/*` only |
| StoreIncidentFunction | `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:GetItem` | DynamoDB table ARN only |
| SendNotificationFunction | `sns:Publish` | SNS topic ARN only |

## Rules

1. No wildcard resources on write actions.
2. No hardcoded credentials anywhere in source code or template.yaml.
3. No broad Bedrock permissions - `bedrock:InvokeModel` only, not `bedrock:*`  
4. SQS queue policy: allow `sqs:SendMessage` from EventBridge rule ARN only.
5. Step Functions execution role: `lambda:InvokeFunction` on specific Lambda ARNs only.
6. All resources in same account and us-east-1 region.

## .gitignore Requirements

Never commit: `.env` files, `samconfig.toml`, `node_modules/`, `dist/`, `.aws-sam/`