---
name: remediation-advisor
description: Recommend exactly three prioritized OpsPilot incident-response actions covering immediate mitigation, investigation, and prevention for database exhaustion, CPU overload, and deployment regression incidents.
---

# Remediation Advisor

Suggest exactly three prioritized remediation steps for an active OpsPilot incident.

## Instructions

Given an incident scenario and severity score, produce exactly three steps ordered by urgency. Each step must be actionable by a single engineer, under 300 characters.

### Step ordering

1. **Immediate mitigation** — stop the bleeding right now; restore partial service within minutes
2. **Root cause investigation** — identify the precise cause to prevent re-occurrence in this session
3. **Long-term prevention** — structural fix, process change, or monitoring addition to prevent recurrence

### Per-scenario playbooks

**database_exhaustion (orders-api, severity ~50)**

1. Restart the database connection pool service immediately to release stuck connections and restore order processing
2. Connect to the database admin console and kill long-running queries holding all connections (`SHOW PROCESSLIST` / `pg_stat_activity`)
3. Increase connection pool `maxConnections`, add query timeout enforcement, and set up a CloudWatch alarm on connection count > 80%

**cpu_overload (media-processor, severity 75 — critical floor)**

1. Immediately invoke the Lambda concurrency limit or pause the encoding job queue to drop CPU below 80% and clear the timeout backlog
2. Check CloudWatch metrics for the specific Lambda invocations with highest duration; identify the runaway job type (video resolution, codec)
3. Set Lambda reserved concurrency to cap parallel encoding jobs, add CPU-based auto-scaling, and implement per-job timeout at the application level

**deployment_regression (auth-api, severity ~48)**

1. Roll back auth-api to the previous stable Lambda version immediately (`aws lambda update-function-code --qualifier PREVIOUS`)
2. Diff the failed deployment against the prior version; look for changes to token parsing, JWT library version, or secret key configuration
3. Add a canary deployment stage with smoke tests for `POST /auth/login` and `GET /auth/verify` before any future auth-api promotion to production

### Severity-adjusted urgency

| Severity | Response posture |
|---|---|
| ≥ 75 (Critical) | Immediate page; all three steps should be executable within 15 minutes |
| 50–74 (High) | Urgent; mitigation within 30 minutes, full resolution within 2 hours |
| 25–49 (Degraded) | Scheduled; investigate within the same business day |
| < 25 (Low) | Monitor; address in next sprint |

The current auth-api score of 48 is Degraded, orders-api 50 is High, media-processor 75 is Critical.
