import type { CompactTelemetryV6Scope } from "./compact-telemetry";

export type CompactLayeredExtensionScope = Exclude<CompactTelemetryV6Scope, "core">;

export function nextCompactLayeredExtensionScope(params: {
  completedCoreRounds: number;
  environmentEveryRounds: number;
  auditEveryRounds: number;
}): CompactLayeredExtensionScope | null {
  if (!Number.isInteger(params.completedCoreRounds) || params.completedCoreRounds <= 0) {
    throw new Error("completedCoreRounds must be a positive integer");
  }
  if (!Number.isInteger(params.environmentEveryRounds) || params.environmentEveryRounds <= 0) {
    throw new Error("environmentEveryRounds must be a positive integer");
  }
  if (!Number.isInteger(params.auditEveryRounds) || params.auditEveryRounds <= 0) {
    throw new Error("auditEveryRounds must be a positive integer");
  }

  if (params.completedCoreRounds % params.auditEveryRounds === 0) return "audit";
  if (params.completedCoreRounds % params.environmentEveryRounds === 0) return "environment";
  return null;
}

export function layeredBroadcastAcceptsScope(scope: string | null): boolean {
  return scope === "core";
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
