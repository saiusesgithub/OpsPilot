---
name: interpret-telemetry
description: Interpret OpsPilot telemetry, normalize metrics, identify the matching incident scenario, and calculate expected severity from error rate, p95 latency, CPU, error codes, and severity indicators.
---

# Interpret Telemetry

Interpret raw telemetry values and identify which OpsPilot incident scenario they match.

## Instructions

When given telemetry fields, follow this process:

### Step 1: Normalize input

The ingest Lambda accepts shorthand field names. Normalize before analysis:
- `service` or `serviceName` → service name
- `cpu` or `cpuUsage` → cpuUsage; if value > 1, divide by 100 (percentage → fraction)
- `errorRate` → if value > 1, divide by 100
- `errors` or `errorCodes` → error codes array
- `scenario` → maps to severityIndicators:
  - `cpu_overload` → `["critical"]`
  - `database_exhaustion` → `["db-failure"]`
  - `deployment_regression` → `["deployment-regression"]`

### Step 2: Match scenario

Map the normalized telemetry to one of the three OpsPilot scenarios:

| Scenario | Service | Signal |
|---|---|---|
| `database_exhaustion` | orders-api | High errorRate + high latency + DB_CONNECTION_TIMEOUT errors + normal CPU |
| `cpu_overload` | media-processor | CPU > 0.90 + REQUEST_TIMEOUT errors + "critical" severity indicator |
| `deployment_regression` | auth-api | errorRate spike + INTERNAL_SERVER_ERROR + recent deploymentMetadata timestamp |

### Step 3: Calculate severity

Apply the OpsPilot severity formula exactly:

```
errorRateScore = min(40, errorRate * 40)
latencyScore   = min(20, log10(p95Latency + 1) * 10)
cpuScore       = min(20, cpuUsage * 20)
anomalyBonus   = (errorRateAnomaly ? 5 : 0) + (latencyAnomaly ? 5 : 0) + (cpuAnomaly ? 5 : 0)
rawScore       = errorRateScore + latencyScore + cpuScore + anomalyBonus
criticalFloor  = "critical" in severityIndicators ? max(rawScore, 75) : rawScore
severity       = round(clamp(criticalFloor, 0, 100))
```

Baseline thresholds for anomaly detection:
- orders-api: errorRate > 0.01, p95Latency > 500ms, cpuUsage > 0.70
- media-processor: errorRate > 0.02, p95Latency > 1000ms, cpuUsage > 0.80
- auth-api: errorRate > 0.005, p95Latency > 200ms, cpuUsage > 0.60

### Example

Input: `{ service: "orders-api", errorRate: 18.4, p95Latency: 2840, cpu: 64, errors: ["DB_CONNECTION_TIMEOUT"] }`

Normalized: errorRate=0.184, cpuUsage=0.64, severityIndicators=["db-failure"]

Scenario: `database_exhaustion`

Severity: `min(40, 0.184*40) + min(20, log10(2841)*10) + min(20, 0.64*20) + 10(anomalies) = 7.36 + 20 + 12.8 + 10 = 50.16 → 50`
