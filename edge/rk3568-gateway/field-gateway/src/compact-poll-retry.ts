export type CompactPollTimerDecision = "complete" | "retry" | "timeout";

export type CompactPollTelemetryClassification =
  | "matched"
  | "matched-after-retry-dispatch"
  | "redundant-retry"
  | "duplicate"
  | "unmatched";

export function decideCompactPollTimer(params: {
  receivedNodes: number;
  expectedNodes: number;
  retriesSent: number;
  maxRetries: number;
}): CompactPollTimerDecision {
  if (params.expectedNodes > 0 && params.receivedNodes >= params.expectedNodes) {
    return "complete";
  }
  if (params.receivedNodes <= 0) {
    return "timeout";
  }
  return params.retriesSent < params.maxRetries ? "retry" : "timeout";
}

export function classifyCompactPollTelemetry(params: {
  expected: boolean;
  alreadyReceived: boolean;
  retryDispatched: boolean;
  retryResponseAlreadyObserved: boolean;
  missingAtRetryDispatch: boolean;
}): CompactPollTelemetryClassification {
  if (!params.expected) return "unmatched";
  if (params.alreadyReceived) {
    return params.retryDispatched && !params.retryResponseAlreadyObserved
      ? "redundant-retry"
      : "duplicate";
  }
  return params.missingAtRetryDispatch ? "matched-after-retry-dispatch" : "matched";
}

export function compactPollTelemetryIsPublishable(
  classification: CompactPollTelemetryClassification
): boolean {
  return classification === "matched" || classification === "matched-after-retry-dispatch";
}
