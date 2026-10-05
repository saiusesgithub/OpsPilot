---
name: severity-reasoning
description: Explain and validate OpsPilot severity calculations, including error-rate score, latency score, CPU score, anomaly bonus, critical floor behavior, and severity invariants.
---

# Severity Reasoning

Explain why a given severity score was calculated and verify it satisfies all OpsPilot invariants.

## Instructions

For any severity score request, walk through each component of the formula step by step, then verify invariants.

### Formula breakdown

```
Component         Formula                           Max contribution
─────────────────────────────────────────────────────────────────────
Error rate        errorRate × 40                    40 pts
Latency           min(20, log10(p95Latency+1) × 10) 20 pts
CPU               cpuUsage × 20                     20 pts
Anomaly bonus     +5 per anomaly flag (max 3)        15 pts
                                           ─────────────────
                                           Subtotal  95 pts
Critical floor    if "critical" → max(score, 75)
Clamp             round(clamp(score, 0, 100))        100 pts max
```

### Invariant verification checklist

After calculating, confirm all seven property-based invariants hold:

1. **Range** [0, 100]: result is an integer between 0 and 100 inclusive
2. **Error rate monotonicity**: a higher errorRate with all else equal must not decrease severity
3. **CPU monotonicity**: a higher cpuUsage with all else equal must not decrease severity
4. **Latency monotonicity**: a higher p95Latency with all else equal must not decrease severity
5. **Critical floor**: if "critical" is in severityIndicators, severity ≥ 75
6. **Idempotence**: calling the formula twice with the same input returns the same value
7. **Input rejection**: errorRate outside [0,1] or negative p95Latency should throw an error

### Reference scores for the three scenarios

| Scenario | Service | Expected severity | Critical floor? |
|---|---|---|---|
| database_exhaustion | orders-api | 50 | No (db-failure indicator) |
| cpu_overload | media-processor | 75 | Yes (critical indicator floors to 75) |
| deployment_regression | auth-api | 48 | No |

These match the live DynamoDB records in the `ops-pilot-incidents` table.
