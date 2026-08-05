export type RtcmPollBurstGateStats = {
  accountingUnit: "field-link-frame";
  maxFragmentsBetweenPolls: number;
  fragmentsSinceLastPoll: number;
  minCorrectionWindowMs: number;
  correctionWindowRemainingMs: number;
};

export const DEFAULT_RTCM_MAX_FRAGMENTS_BETWEEN_POLLS = 4;
export const RTCM_POST_BURST_POLL_GUARD_MS = 600;

export type RtcmPollPriorityInput = {
  controlWriteDue: boolean;
  allTargetsArmed: boolean;
  pendingFragments: number;
  pendingTypes: number;
  canDispatchFragment: boolean;
  correctionWindowActive: boolean;
};

export function shouldYieldSouthboundPollToRtcm(input: RtcmPollPriorityInput): boolean {
  if (input.controlWriteDue) return true;
  return input.canDispatchFragment &&
    input.allTargetsArmed &&
    (input.pendingFragments > 0 || input.pendingTypes > 0 || input.correctionWindowActive);
}

export function selectRtcmTargetedPollScope(input: {
  rtcmActive: boolean;
  allTargetsArmed: boolean;
  hasCoreSnapshot: boolean;
}): "core" | "audit" {
  return input.rtcmActive && !input.allTargetsArmed && input.hasCoreSnapshot
    ? "audit"
    : "core";
}

export class RtcmPollBurstGate {
  private fragmentsSinceLastPoll = 0;
  private correctionWindowUntilMs = 0;

  constructor(
    private readonly maxFragmentsBetweenPolls: number,
    private readonly minCorrectionWindowMs = 0
  ) {
    if (!Number.isSafeInteger(maxFragmentsBetweenPolls) || maxFragmentsBetweenPolls < 1) {
      throw new Error("RTCM poll burst limit must be a positive safe integer");
    }
    if (!Number.isSafeInteger(minCorrectionWindowMs) || minCorrectionWindowMs < 0) {
      throw new Error("RTCM minimum correction window must be a non-negative safe integer");
    }
  }

  canDispatchFragment(): boolean {
    return this.fragmentsSinceLastPoll < this.maxFragmentsBetweenPolls;
  }

  noteFieldFrameDispatched(): void {
    if (!this.canDispatchFragment()) {
      throw new Error("RTCM field-frame burst limit exceeded");
    }
    this.fragmentsSinceLastPoll += 1;
  }

  notePollDispatched(nowMs = 0): void {
    if (!Number.isFinite(nowMs) || nowMs < 0) {
      throw new Error("RTCM poll dispatch clock must be non-negative");
    }
    this.fragmentsSinceLastPoll = 0;
    this.correctionWindowUntilMs = nowMs + this.minCorrectionWindowMs;
  }

  correctionWindowActive(nowMs: number): boolean {
    return nowMs < this.correctionWindowUntilMs;
  }

  stats(nowMs = 0): RtcmPollBurstGateStats {
    return {
      accountingUnit: "field-link-frame",
      maxFragmentsBetweenPolls: this.maxFragmentsBetweenPolls,
      fragmentsSinceLastPoll: this.fragmentsSinceLastPoll,
      minCorrectionWindowMs: this.minCorrectionWindowMs,
      correctionWindowRemainingMs: Math.max(0, this.correctionWindowUntilMs - nowMs)
    };
  }
}
