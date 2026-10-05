---
inclusion: auto
name: project-scope
description: MVP boundaries, project structure, and what is explicitly out of scope for OpsPilot
---

# Project Scope

## What OpsPilot Is

A serverless, event-driven cloud incident response **demonstration platform** for the Kiro University Challenge.
The cloud pipeline is **real**. The service failures are **simulated**.

## MVP Boundaries

The MVP is complete when:
1. A user can click a simulation button and see a processed incident with AI analysis appear on the dashboard.
2. All infrastructure deploys via `sam build && sam deploy` with no manual steps.
3. Property-based tests pass for all 15 correctness properties.
4. Steering documents are in place and followed.

## Project Structure

`frontend/` - React + Vite + TypeScript SPA
`frontend/src/api.ts` - typed wrappers for POST /events and GET /incidents
`frontend/src/payloads.ts` - simulation payload factories
`frontend/src/components/` - SimulationPanel, HealthIndicator, IncidentList
`backend/shared/types.ts` - single source of truth for all domain types
`backend/functions/ingest/` - validate + publish to EventBridge
`backend/functions/processor/` - SQS trigger + start Step Functions
`backend/functions/loadContext/` - enrich with baseline context
`backend/functions/analyzeMetrics/` - anomaly detection
`backend/functions/correlateEvents/` - pattern correlation
`backend/functions/calculateSeverity/` - integer 0-100 severity score
`backend/functions/generateAnalysis/` - Bedrock AI analysis + fallback
`backend/functions/storeIncident/` - DynamoDB upsert
`backend/functions/sendNotification/` - SNS publish (optional)
`tests/unit/` - Jest unit tests
`tests/property/` - fast-check property tests
`template.yaml` - SAM infrastructure as code

## Explicitly Out of Scope

Do NOT add:
- Authentication (Cognito, JWT, API keys)
- WebSockets or real-time push
- AWS X-Ray
- RDS, Aurora, ElastiCache
- ECS, EKS, Fargate
- Real infrastructure monitoring agents
- Multi-region support
- CI/CD pipelines
- Any AWS service not listed in aws-serverless-rules.md

## Kiro Feature Showcase Phases

**Phase 1 (MVP - current):** Spec-driven development + steering documents + property-based testing
**Phase 2 (after MVP):** Hooks, MCP integrations, Custom Agents, Powers

Do NOT implement Phase 2 features during Phase 1.

## Testing Philosophy

- Property-based tests (`tests/property/`, fast-check): universal invariants over randomised inputs
- Unit tests (`tests/unit/`, Jest + ts-jest): specific examples and error paths
- Tag all property tests: `// Feature: ops-pilot, Property N: <description>`  
- No integration tests against live AWS - mock all SDK calls in tests.