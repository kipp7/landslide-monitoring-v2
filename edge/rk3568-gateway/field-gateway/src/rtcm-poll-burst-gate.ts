export type RtcmPollBurstGateStats = {
  maxFragmentsBetweenPolls: number;
  fragmentsSinceLastPoll: number;
};

export const DEFAULT_RTCM_MAX_FRAGMENTS_BETWEEN_POLLS = 4;
export const RTCM_POST_BURST_POLL_GUARD_MS = 600;

export class RtcmPollBurstGate {
  private fragmentsSinceLastPoll = 0;

  constructor(private readonly maxFragmentsBetweenPolls: number) {
    if (!Number.isSafeInteger(maxFragmentsBetweenPolls) || maxFragmentsBetweenPolls < 1) {
      throw new Error("RTCM poll burst limit must be a positive safe integer");
    }
  }

  canDispatchFragment(): boolean {
    return this.fragmentsSinceLastPoll < this.maxFragmentsBetweenPolls;
  }

  noteFragmentDispatched(): void {
    if (!this.canDispatchFragment()) {
      throw new Error("RTCM poll burst limit exceeded");
    }
    this.fragmentsSinceLastPoll += 1;
  }

  notePollDispatched(): void {
    this.fragmentsSinceLastPoll = 0;
  }

  stats(): RtcmPollBurstGateStats {
    return {
      maxFragmentsBetweenPolls: this.maxFragmentsBetweenPolls,
      fragmentsSinceLastPoll: this.fragmentsSinceLastPoll
    };
  }
}
