import type { CompactTelemetryV6Scope } from "./compact-telemetry";

export type CompactLayeredExtensionScope = Exclude<CompactTelemetryV6Scope, "core">;

export function nextCompactLayeredExtensionScopes(params: {
  completedCoreRounds: number;
  environmentEveryRounds: number;
  auditEveryRounds: number;
}): CompactLayeredExtensionScope[] {
  if (!Number.isInteger(params.completedCoreRounds) || params.completedCoreRounds <= 0) {
    throw new Error("completedCoreRounds must be a positive integer");
  }
  if (!Number.isInteger(params.environmentEveryRounds) || params.environmentEveryRounds <= 0) {
    throw new Error("environmentEveryRounds must be a positive integer");
  }
  if (!Number.isInteger(params.auditEveryRounds) || params.auditEveryRounds <= 0) {
    throw new Error("auditEveryRounds must be a positive integer");
  }

  const scopes: CompactLayeredExtensionScope[] = [];
  if (params.completedCoreRounds % params.auditEveryRounds === 0) scopes.push("audit");
  if (params.completedCoreRounds % params.environmentEveryRounds === 0) scopes.push("environment");
  return scopes;
}

export function compactLayeredCorePollOverdue(params: {
  nowMs: number;
  lastCorePollDispatchedAtMs: number | null;
  deadlineMs: number;
}): boolean {
  if (!Number.isFinite(params.nowMs) || params.nowMs < 0) {
    throw new Error("nowMs must be a non-negative finite number");
  }
  if (params.lastCorePollDispatchedAtMs !== null &&
      (!Number.isFinite(params.lastCorePollDispatchedAtMs) || params.lastCorePollDispatchedAtMs < 0)) {
    throw new Error("lastCorePollDispatchedAtMs must be null or a non-negative finite number");
  }
  if (!Number.isFinite(params.deadlineMs) || params.deadlineMs <= 0) {
    throw new Error("deadlineMs must be a positive finite number");
  }
  return params.lastCorePollDispatchedAtMs === null ||
    params.nowMs - params.lastCorePollDispatchedAtMs >= params.deadlineMs;
}

export function layeredBroadcastAcceptsScope(scope: string | null): boolean {
  return scope === "core";
}

export function layeredExtensionMayPreemptCore(params: {
  scope: CompactLayeredExtensionScope | null;
  rtcmActive: boolean;
}): boolean {
  return params.rtcmActive && params.scope === "audit";
}

export function matchesActiveScopedPoll(params: {
  expectedDeviceId: string;
  telemetryDeviceId: string;
  expectedCommandId: string;
  telemetryCommandId: string | null;
  expectedCommandTag: number | undefined;
  telemetryCommandTag: number | null;
  telemetryUploadTrigger: string | null;
  expectedScope: CompactTelemetryV6Scope | undefined;
  telemetryScope: string | null;
}): boolean {
  const commandMatches = params.expectedCommandTag !== undefined
    ? params.telemetryCommandTag === params.expectedCommandTag
    : params.telemetryCommandId === params.expectedCommandId;

  return params.expectedDeviceId === params.telemetryDeviceId &&
    commandMatches &&
    params.telemetryUploadTrigger === "scheduler_poll" &&
    (params.expectedScope === undefined || params.telemetryScope === params.expectedScope);
}

export function isCompactLayeredPortBusy(params: {
  pendingCommand: boolean;
  activeScopedPoll: boolean;
  commandWriteQueued: boolean;
  rtcmWriteInFlight: boolean;
  activeBroadcastPoll: boolean;
  broadcastAdmissionInFlight: boolean;
}): boolean {
  return params.pendingCommand ||
    params.activeScopedPoll ||
    params.commandWriteQueued ||
    params.rtcmWriteInFlight ||
    params.activeBroadcastPoll ||
    params.broadcastAdmissionInFlight;
}
