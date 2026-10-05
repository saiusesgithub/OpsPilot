import type {
  TelemetryEvent,
  IncidentContext,
  CorrelationResult,
} from "../../shared/types";

interface CorrelateEventsInput {
  incidentId: string;
  telemetry: TelemetryEvent;
  context: IncidentContext;
}

// Parallel branch: return ONLY the new data (correlationResult).
// The Step Functions ResultSelector will pick this up as $[1].correlationResult.
interface CorrelateEventsOutput {
  correlationResult: CorrelationResult;
}

interface PatternRule {
  pattern: string;
  errorCodePatterns: string[];
  indicatorPatterns: string[];
}

const PATTERN_RULES: PatternRule[] = [
  {
    pattern: "database-timeout",
    errorCodePatterns: ["DB_CONNECTION", "DATABASE", "TIMEOUT", "POOL"],
    indicatorPatterns: ["db-failure", "database"],
  },
  {
    pattern: "cpu-saturation",
    errorCodePatterns: ["REQUEST_TIMEOUT", "CPU"],
    indicatorPatterns: ["critical", "cpu"],
  },
  {
    pattern: "deployment-regression",
    errorCodePatterns: ["INTERNAL_SERVER_ERROR", "500"],
    indicatorPatterns: ["deployment-regression", "deployment"],
  },
  {
    pattern: "authentication-failure",
    errorCodePatterns: ["AUTH", "UNAUTHORIZED", "FORBIDDEN"],
    indicatorPatterns: ["auth-failure"],
  },
];

function matchPattern(
  errorCodes: string[],
  severityIndicators: string[],
  rule: PatternRule
): number {
  let score = 0;
  const upperCodes = errorCodes.map((c) => c.toUpperCase());
  const lowerIndicators = severityIndicators.map((i) => i.toLowerCase());

  for (const pat of rule.errorCodePatterns) {
    if (upperCodes.some((c) => c.includes(pat))) score += 0.4;
  }
  for (const pat of rule.indicatorPatterns) {
    if (lowerIndicators.some((i) => i.includes(pat))) score += 0.5;
  }

  return Math.min(score, 1.0);
}

export const handler = async (
  input: CorrelateEventsInput
): Promise<CorrelateEventsOutput> => {
  const { incidentId, telemetry } = input;

  let bestPattern = "unknown";
  let bestScore = 0;
  let relatedErrorCodes: string[] = [];

  for (const rule of PATTERN_RULES) {
    const score = matchPattern(
      telemetry.errorCodes,
      telemetry.severityIndicators,
      rule
    );
    if (score > bestScore) {
      bestScore = score;
      bestPattern = rule.pattern;
      relatedErrorCodes = telemetry.errorCodes.filter((code) =>
        rule.errorCodePatterns.some((pat) =>
          code.toUpperCase().includes(pat)
        )
      );
    }
  }

  const correlationResult: CorrelationResult = {
    dominantPattern: bestPattern,
    relatedErrorCodes,
    patternConfidence: bestScore,
  };

  console.log(
    JSON.stringify({
      level: "INFO",
      incidentId,
      message: "Event correlation complete",
      dominantPattern: bestPattern,
      patternConfidence: bestScore,
    })
  );

  return { correlationResult };
};
