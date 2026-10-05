// Feature: ops-pilot
// Property-based tests for the severity calculation engine.
// Uses fast-check to verify universal invariants hold across ALL valid inputs.

import * as fc from "fast-check";
import {
  calculateSeverityScore,
} from "../../backend/functions/calculateSeverity/handler";
import type { TelemetryEvent, MetricsAnalysis } from "../../backend/shared/types";

// ──────────────────────────────────────────────────────────────────────────────
// Arbitraries
// ──────────────────────────────────────────────────────────────────────────────

const validTelemetry = fc.record<TelemetryEvent>({
  serviceName: fc.string({ minLength: 1, maxLength: 40 }),
  errorRate: fc.float({ min: 0, max: 1, noNaN: true }),
  p95Latency: fc.float({ min: 0, max: 60000, noNaN: true }),
  cpuUsage: fc.float({ min: 0, max: 1, noNaN: true }),
  errorCodes: fc.array(fc.string({ minLength: 1, maxLength: 30 })),
  deploymentMetadata: fc.constant({}),
  timestamp: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }).map((d) => d.toISOString()),
  severityIndicators: fc.array(fc.string({ minLength: 1, maxLength: 20 })),
});

const validMetricsAnalysis = fc.record<MetricsAnalysis>({
  errorRateAnomaly: fc.boolean(),
  latencyAnomaly: fc.boolean(),
  cpuAnomaly: fc.boolean(),
  deviations: fc.constant({}),
});

const criticalTelemetry = validTelemetry.map((t) => ({
  ...t,
  severityIndicators: [...t.severityIndicators.filter((s) => s !== "critical"), "critical"],
}));

// ──────────────────────────────────────────────────────────────────────────────
// Property 1: Severity range invariant [0, 100]
// Validates: Requirements 1.1
// ──────────────────────────────────────────────────────────────────────────────
describe("Property 1 -- Severity range invariant", () => {
  it("always produces an integer in [0, 100] for any valid telemetry", () => {
    fc.assert(
      fc.property(validTelemetry, validMetricsAnalysis, (telemetry, metrics) => {
        const severity = calculateSeverityScore(telemetry, metrics);
        expect(Number.isInteger(severity)).toBe(true);
        expect(severity).toBeGreaterThanOrEqual(0);
        expect(severity).toBeLessThanOrEqual(100);
      }),
      { numRuns: 200 }
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Property 2: Monotonicity -- higher errorRate cannot decrease severity
// Validates: Requirements 1.2
// ──────────────────────────────────────────────────────────────────────────────
describe("Property 2 -- Error rate monotonicity", () => {
  it("severity(B) >= severity(A) when B.errorRate > A.errorRate, all else equal", () => {
    fc.assert(
      fc.property(
        validTelemetry,
        validMetricsAnalysis,
        fc.float({ min: 0, max: 1, noNaN: true }),
        (telemetry, metrics, higherErrorRate) => {
          fc.pre(higherErrorRate > telemetry.errorRate);
          const severityA = calculateSeverityScore(telemetry, metrics);
          const severityB = calculateSeverityScore({ ...telemetry, errorRate: higherErrorRate }, metrics);
          expect(severityB).toBeGreaterThanOrEqual(severityA);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Property 3: CPU monotonicity -- extreme CPU cannot lower severity
// Validates: Requirements 1.3
// ──────────────────────────────────────────────────────────────────────────────
describe("Property 3 -- CPU monotonicity", () => {
  it("severity(B) >= severity(A) when B.cpuUsage > A.cpuUsage, all else equal", () => {
    fc.assert(
      fc.property(
        validTelemetry,
        validMetricsAnalysis,
        fc.float({ min: 0, max: 1, noNaN: true }),
        (telemetry, metrics, higherCpu) => {
          fc.pre(higherCpu > telemetry.cpuUsage);
          const severityA = calculateSeverityScore(telemetry, metrics);
          const severityB = calculateSeverityScore({ ...telemetry, cpuUsage: higherCpu }, metrics);
          expect(severityB).toBeGreaterThanOrEqual(severityA);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Property 4: Latency monotonicity -- severe latency cannot lower severity
// Validates: Requirements 1.4
// ──────────────────────────────────────────────────────────────────────────────
describe("Property 4 -- Latency monotonicity", () => {
  it("severity(B) >= severity(A) when B.p95Latency > A.p95Latency, all else equal", () => {
    fc.assert(
      fc.property(
        validTelemetry,
        validMetricsAnalysis,
        fc.float({ min: 0, max: 60000, noNaN: true }),
        (telemetry, metrics, higherLatency) => {
          fc.pre(higherLatency > telemetry.p95Latency);
          const severityA = calculateSeverityScore(telemetry, metrics);
          const severityB = calculateSeverityScore({ ...telemetry, p95Latency: higherLatency }, metrics);
          expect(severityB).toBeGreaterThanOrEqual(severityA);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Property 5: Critical floor -- "critical" indicator enforces severity >= 75
// Validates: Requirements 1.5
// ──────────────────────────────────────────────────────────────────────────────
describe("Property 5 -- Critical floor invariant", () => {
  it('severity >= 75 whenever severityIndicators contains "critical"', () => {
    fc.assert(
      fc.property(criticalTelemetry, validMetricsAnalysis, (telemetry, metrics) => {
        const severity = calculateSeverityScore(telemetry, metrics);
        expect(severity).toBeGreaterThanOrEqual(75);
      }),
      { numRuns: 200 }
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Property 6: Idempotence -- same input always produces same output
// Validates: Requirements 1.6
// ──────────────────────────────────────────────────────────────────────────────
describe("Property 6 -- Idempotence", () => {
  it("calling calculateSeverityScore twice with identical input returns the same value", () => {
    fc.assert(
      fc.property(validTelemetry, validMetricsAnalysis, (telemetry, metrics) => {
        const first = calculateSeverityScore(telemetry, metrics);
        const second = calculateSeverityScore(telemetry, metrics);
        expect(first).toBe(second);
      }),
      { numRuns: 200 }
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Property 7: Input rejection -- invalid inputs throw, never return a value
// Validates: Requirements 1.7
// ──────────────────────────────────────────────────────────────────────────────
describe("Property 7 -- Input rejection for invalid telemetry", () => {
  it("throws for errorRate outside [0, 1]", () => {
    fc.assert(
      fc.property(
        validTelemetry,
        validMetricsAnalysis,
        fc.oneof(
          fc.float({ min: Math.fround(1.001), max: Math.fround(100), noNaN: true }),
          fc.float({ min: Math.fround(-100), max: Math.fround(-0.001), noNaN: true })
        ),
        (telemetry, metrics, badRate) => {
          expect(() =>
            calculateSeverityScore({ ...telemetry, errorRate: badRate }, metrics)
          ).toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("throws for negative p95Latency", () => {
    fc.assert(
      fc.property(
        validTelemetry,
        validMetricsAnalysis,
        fc.float({ min: Math.fround(-60000), max: Math.fround(-0.001), noNaN: true }),
        (telemetry, metrics, badLatency) => {
          expect(() =>
            calculateSeverityScore({ ...telemetry, p95Latency: badLatency }, metrics)
          ).toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
