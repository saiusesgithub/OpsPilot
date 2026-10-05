---
inclusion: auto
name: typescript-conventions
description: TypeScript conventions for Lambda functions and the frontend in OpsPilot
---

# TypeScript Conventions

## Compiler Settings

All TypeScript in this project compiles under `strict: true`. Required tsconfig flags:

- `strict: true` (enables noImplicitAny, strictNullChecks, strictFunctionTypes, strictPropertyInitialization)
- `target: ES2022`  
- `module: Node16` (backend) / `ESNext` (frontend/Vite)
- `moduleResolution: Node16` (backend)
- `esModuleInterop: true`  
- `skipLibCheck: true`  

Run `tsc --noEmit` as the first step in every CI check.

## Lambda Handler Exports

Every Lambda handler file exports a **named** `handler` function. No default exports.

## Shared Types

All domain interfaces live in `backend/shared/types.ts`. Import via relative paths or a configured path alias.

Key types:

- `TelemetryEvent` - wire format for incoming telemetry
- `Incident` - persisted DynamoDB record
- `AnalysisResult` - Bedrock output with `remediationSteps: [string, string, string]` tuple
- `Severity` - branded number 0-100; use `asSeverity(n)` to construct; never use `as Severity`  
- `IncidentStatus` - `'active' | 'investigating' | 'resolved'`  

## Naming Conventions

- Files: kebab-case (e.g. `handler.ts`)
- Interfaces/Types: PascalCase
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Env vars: UPPER_SNAKE_CASE

## Environment Variables

Always use `process.env.VAR_NAME ?? 'default'`. Never use bare `process.env.VAR_NAME` without a null check.
Reject empty string where the variable is required.

## Structured Logging

All Lambda functions log JSON objects to CloudWatch with minimum fields: `level`, `incidentId`, `message`.