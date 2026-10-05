# OpsPilot Incident Response Advisor Power

A Kiro Power that provides domain knowledge for the OpsPilot cloud incident response platform. It packages four skills that help engineers interpret telemetry, understand severity scores, identify root causes, and plan remediation.

## Skills

### interpret-telemetry
Maps raw telemetry values (`errorRate`, `p95Latency`, `cpuUsage`, `errorCodes`, `severityIndicators`) to one of the three OpsPilot incident scenarios and calculates the expected severity score using the deterministic formula.

### severity-reasoning
Given a severity score, breaks down every contributing component (error rate, latency, CPU, anomaly bonuses, critical floor) and verifies the score satisfies all seven OpsPilot invariants (range, monotonicity, critical floor, idempotence, input rejection).

### root-cause-analysis
Produces a structured `AnalysisResult` with `rootCause`, `evidence[]`, `impact`, and exactly three `remediationSteps` -- matching the format of the `FALLBACK_ANALYSES` map in `generateAnalysis/handler.ts`.

### remediation-advisor
Given a scenario and severity, returns exactly 3 ordered remediation steps: immediate mitigation, root cause investigation, and long-term prevention.

## Reference

| Scenario | Service | Key Signals |
|----------|---------|------------|
| `database_exhaustion` | orders-api | High errorRate+latency, `DB_CONNECTION_TIMEOUT`, normal CPU |
| `cpu_overload` | media-processor | CPU >90%, `REQUEST_TIMEOUT`, `critical` indicator |
| `deployment_regression` | auth-api | errorRate spike post-deploy, `INTERNAL_SERVER_ERROR` |

**Severity formula:**
```
severity = clamp(round(
  errorRate * 40
  + min(20, log10(p95Latency + 1) * 10)
  + cpuUsage * 20
  + anomalyBonus          // +5 per anomaly flag, max 15
), 0, 100)
// Critical floor: if "critical" in severityIndicators → max(score, 75)
```
