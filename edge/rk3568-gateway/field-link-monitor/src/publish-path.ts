export type PublishPathLevel = "healthy" | "attention" | "critical";

export type PublishPathAssessmentInput = {
  lastPublishedAgeSeconds: number | null;
  publishFreshnessMs: number;
  spoolPending: number | null;
  publishFailures: number | null;
};

export function assessPublishPath(input: PublishPathAssessmentInput): PublishPathLevel {
  if (
    input.lastPublishedAgeSeconds === null ||
    input.lastPublishedAgeSeconds * 1000 > input.publishFreshnessMs
  ) {
    return "critical";
  }

  if ((input.spoolPending ?? 0) > 0 || (input.publishFailures ?? 0) > 0) {
    return "attention";
  }

  return "healthy";
}
