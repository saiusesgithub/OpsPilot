---
name: root-cause-analysis
description: Analyze OpsPilot incidents to identify likely root cause, supporting evidence, operational impact, and structured AnalysisResult output from telemetry and error patterns.
---

# Root Cause Analysis

Identify the likely root cause from incident telemetry and produce a structured AnalysisResult following the OpsPilot format.

## Instructions

Produce an `AnalysisResult` object with exactly these four fields. Match the structure used in `backend/functions/generateAnalysis/handler.ts`.

### Output format

```typescript
{
  rootCause: string          // 1-500 chars: the probable technical cause
  evidence: string[]         // 1-10 items: specific metric observations with numbers
  impact: string             // 1-300 chars: effect on users/services
  remediationSteps: [string, string, string]  // EXACTLY 3 steps
}
```

### Analysis rules per scenario

**database_exhaustion (orders-api)**
- rootCause: connection pool exhausted by long-running queries
- evidence must cite: specific errorRate%, specific p95Latency ms, error code names, CPU value ruling out compute cause
- impact: orders cannot be processed, checkout timeouts, in-flight transactions at risk
- remediationSteps: restart pool → kill long-running queries → scale pool + review timeouts

**cpu_overload (media-processor)**
- rootCause: CPU saturation from runaway encoding jobs
- evidence must cite: CPU% value vs 80% threshold, latency degradation, REQUEST_TIMEOUT correlation
- impact: encoding queue backing up, uploads timing out, users cannot process media
- remediationSteps: terminate non-critical jobs → scale out horizontally → add CPU auto-scaling

**deployment_regression (auth-api)**
- rootCause: recent deployment broke token validation logic
- evidence must cite: errorRate spike amount, baseline comparison, INTERNAL_SERVER_ERROR pattern, deployment timestamp correlation
- impact: users cannot authenticate, dependent services affected, cascading session failures
- remediationSteps: rollback deployment → review diff for breaking change → add regression tests to pipeline

### Quality rules

- Each evidence item must cite a specific number (percentage, milliseconds, count)
- The three remediation steps must be ordered: immediate mitigation → investigation → prevention
- rootCause must not exceed 500 characters
- Never produce a fourth remediation step — the tuple is always exactly [string, string, string]

### Bedrock vs fallback

The live generateAnalysis Lambda calls Amazon Bedrock (amazon.nova-micro-v1:0) first. If Bedrock fails for any reason, it falls back to the deterministic FALLBACK_ANALYSES map keyed by serviceName. The workflow always succeeds — Bedrock failure never causes Step Functions to fail.
