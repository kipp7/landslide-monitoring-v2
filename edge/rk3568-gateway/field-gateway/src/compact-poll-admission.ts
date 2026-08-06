export type CompactPollCloseOutcome =
  | "complete"
  | "partial-timeout"
  | "empty-timeout"
  | "failed"
  | "shutdown";

export type CompactPollAdmissionSnapshot = {
  inFlight: boolean;
  consecutiveEmptyTimeouts: number;
  nextEligibleAtMs: number;
  nextEligibleInMs: number;
};

type CompactPollAdmissionConfig = {
  steadyIntervalMs: number;
  emptyBackoffInitialMs: number;
  emptyBackoffMaxMs: number;
};

type CompactPollPortState = {
  inFlight: boolean;
  consecutiveEmptyTimeouts: number;
  nextEligibleAtMs: number;
};

export class CompactPollAdmissionController {
  private readonly ports = new Map<string, CompactPollPortState>();

  constructor(private readonly config: CompactPollAdmissionConfig) {
    if (config.steadyIntervalMs <= 0) throw new Error("steadyIntervalMs must be positive");
    if (config.emptyBackoffInitialMs <= 0) throw new Error("emptyBackoffInitialMs must be positive");
    if (config.emptyBackoffMaxMs < config.emptyBackoffInitialMs) {
      throw new Error("emptyBackoffMaxMs must be greater than or equal to emptyBackoffInitialMs");
    }
  }

  tryBegin(portPath: string, nowMs = Date.now()): boolean {
    const state = this.ensurePort(portPath);
    if (state.inFlight || nowMs < state.nextEligibleAtMs) {
      return false;
    }

    state.inFlight = true;
    return true;
  }

  close(portPath: string, outcome: CompactPollCloseOutcome, nowMs = Date.now()): CompactPollAdmissionSnapshot {
    const state = this.ensurePort(portPath);
    state.inFlight = false;

    let delayMs = this.config.steadyIntervalMs;
    if (outcome === "empty-timeout") {
      state.consecutiveEmptyTimeouts += 1;
      if (state.consecutiveEmptyTimeouts > 1) {
        const exponent = Math.min(30, state.consecutiveEmptyTimeouts - 2);
        delayMs = Math.min(this.config.emptyBackoffMaxMs, this.config.emptyBackoffInitialMs * 2 ** exponent);
      }
    } else if (outcome === "complete" || outcome === "partial-timeout") {
      state.consecutiveEmptyTimeouts = 0;
    } else if (outcome === "shutdown") {
      delayMs = 0;
    }

    state.nextEligibleAtMs = nowMs + delayMs;
    return this.snapshot(portPath, nowMs);
  }

  isInFlight(portPath: string): boolean {
    return this.ensurePort(portPath).inFlight;
  }

  nextEligibleInMs(portPath: string, nowMs = Date.now()): number {
    return Math.max(0, this.ensurePort(portPath).nextEligibleAtMs - nowMs);
  }

  snapshot(portPath: string, nowMs = Date.now()): CompactPollAdmissionSnapshot {
    const state = this.ensurePort(portPath);
    return {
      inFlight: state.inFlight,
      consecutiveEmptyTimeouts: state.consecutiveEmptyTimeouts,
      nextEligibleAtMs: state.nextEligibleAtMs,
      nextEligibleInMs: Math.max(0, state.nextEligibleAtMs - nowMs)
    };
  }

  private ensurePort(portPath: string): CompactPollPortState {
    const existing = this.ports.get(portPath);
    if (existing) return existing;

    const created: CompactPollPortState = {
      inFlight: false,
      consecutiveEmptyTimeouts: 0,
      nextEligibleAtMs: 0
    };
    this.ports.set(portPath, created);
    return created;
  }
}
