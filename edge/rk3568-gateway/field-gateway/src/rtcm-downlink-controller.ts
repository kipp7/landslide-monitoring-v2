import { randomBytes } from "node:crypto";
import {
  GNSS_V3_TARGET_ALL_NODES,
  encodeGnssRtcmModeCommandV1,
  encodeRtcmFragmentV3,
  fragmentRtcmFrameV3
} from "./gnss-transport-v3";
import { Rtcm3StreamDecoder, Um220RtcmShaper } from "./rtcm-downlink-shaper";
import {
  RTCM_FRAGMENT_BATCH_MAX_PAYLOAD_BYTES,
  encodeRtcmFragmentBatchV1
} from "./rtcm-fragment-batch";

export type RtcmRuntimeMode = "probe" | "live";

export type RtcmDownlinkControllerConfig = {
  mode: RtcmRuntimeMode;
  targetMask: number;
  leaseSeconds: number;
  maxFragmentDataBytes: number;
  observationIntervalMs: number;
  maxFragmentsPerFieldFrame?: number;
  sessionEpoch?: number;
};

export type RtcmPreparedFieldPayload = {
  payload: Buffer;
  fragments: Buffer[];
  batched: boolean;
};

export type RtcmNodeEvidence = {
  nodeLabel: "A" | "B" | "C";
  mode: number;
  sessionEpoch: number;
  leaseRemainingMs: number;
  observedUnixMs: number;
};

export type RtcmDownlinkControllerStats = {
  sessionEpoch: number;
  requestedMode: number;
  targetMask: number;
  armedNodeCount: number;
  requiredNodeCount: number;
  maxFragmentsPerFieldFrame: number;
  allTargetsArmed: boolean;
  ntripChunks: number;
  ntripBytes: number;
  modeCommandsBuilt: number;
  framesPrepared: number;
  fragmentsPrepared: number;
  pendingFragments: number;
  lastPreparedMessageType: number | null;
  lastPreparedTs: string | null;
  decoder: ReturnType<Rtcm3StreamDecoder["stats"]>;
  shaper: ReturnType<Um220RtcmShaper["stats"]>;
};

const MAXIMUM_NODE_EVIDENCE_AGE_MS = 45_000;

function randomSessionEpoch(): number {
  let value = 0;
  while (value === 0) value = randomBytes(4).readUInt32BE(0);
  return value;
}

function targetLabels(mask: number): Array<"A" | "B" | "C"> {
  const labels: Array<"A" | "B" | "C"> = [];
  if ((mask & 0x01) !== 0) labels.push("A");
  if ((mask & 0x02) !== 0) labels.push("B");
  if ((mask & 0x04) !== 0) labels.push("C");
  return labels;
}

export class RtcmDownlinkController {
  readonly sessionEpoch: number;
  readonly requestedMode: 1 | 2;
  private readonly decoder = new Rtcm3StreamDecoder();
  private readonly shaper: Um220RtcmShaper;
  private readonly nodeEvidence = new Map<string, RtcmNodeEvidence>();
  private pendingFragments: Buffer[] = [];
  private sequence = 0;
  private modeCommandsBuilt = 0;
  private framesPrepared = 0;
  private fragmentsPrepared = 0;
  private ntripChunks = 0;
  private ntripBytes = 0;
  private lastPreparedMessageType: number | null = null;
  private lastPreparedTs: string | null = null;
  private readonly maxFragmentsPerFieldFrame: number;

  constructor(private readonly config: RtcmDownlinkControllerConfig) {
    if (!Number.isInteger(config.targetMask) || config.targetMask < 1 ||
        config.targetMask > GNSS_V3_TARGET_ALL_NODES) {
      throw new Error("RTCM target mask is invalid");
    }
    if (!Number.isInteger(config.leaseSeconds) || config.leaseSeconds < 15 || config.leaseSeconds > 300) {
      throw new Error("RTCM lease must be in 15..300 seconds");
    }
    if (!Number.isInteger(config.maxFragmentDataBytes) || config.maxFragmentDataBytes < 64 ||
        config.maxFragmentDataBytes > 512) {
      throw new Error("RTCM fragment data size is outside the tested range");
    }
    this.sessionEpoch = config.sessionEpoch ?? randomSessionEpoch();
    if (!Number.isInteger(this.sessionEpoch) || this.sessionEpoch < 1 || this.sessionEpoch > 0xffff_ffff) {
      throw new Error("RTCM session epoch must be a non-zero uint32");
    }
    this.requestedMode = config.mode === "live" ? 2 : 1;
    this.maxFragmentsPerFieldFrame = config.maxFragmentsPerFieldFrame ?? 1;
    if (!Number.isInteger(this.maxFragmentsPerFieldFrame) ||
        this.maxFragmentsPerFieldFrame < 1 || this.maxFragmentsPerFieldFrame > 4) {
      throw new Error("RTCM field frame aggregation must be in 1..4");
    }
    this.shaper = new Um220RtcmShaper({ observationIntervalMs: config.observationIntervalMs });
  }

  buildModeCommand(): Buffer {
    this.modeCommandsBuilt += 1;
    return encodeGnssRtcmModeCommandV1({
      targetMask: this.config.targetMask,
      mode: this.requestedMode,
      sessionEpoch: this.sessionEpoch,
      leaseSeconds: this.config.leaseSeconds
    });
  }

  observeNode(evidence: RtcmNodeEvidence): void {
    this.nodeEvidence.set(evidence.nodeLabel, { ...evidence });
  }

  offerNtripChunk(chunk: Buffer, receivedUnixMs: number): void {
    this.ntripChunks += 1;
    this.ntripBytes += chunk.length;
    for (const frame of this.decoder.push(chunk)) this.shaper.offer(frame, receivedUnixMs);
  }

  allTargetsArmed(nowUnixMs: number): boolean {
    return this.armedNodeCount(nowUnixMs) === targetLabels(this.config.targetMask).length;
  }

  takeNextFragment(nowUnixMs: number): Buffer | null {
    if (!this.allTargetsArmed(nowUnixMs)) return null;
    if (this.pendingFragments.length === 0) {
      const shaped = this.shaper.takeNext(nowUnixMs);
      if (!shaped) return null;
      this.sequence = (this.sequence + 1) >>> 0;
      const fragments = fragmentRtcmFrameV3({
        frame: shaped.frame,
        sessionEpoch: this.sessionEpoch,
        sequence: this.sequence,
        generatedUnixMs: nowUnixMs,
        targetMask: this.config.targetMask,
        maxFragmentDataBytes: this.config.maxFragmentDataBytes
      });
      this.pendingFragments = fragments.map(encodeRtcmFragmentV3);
      this.framesPrepared += 1;
      this.fragmentsPrepared += fragments.length;
      this.lastPreparedMessageType = shaped.info.messageType;
      this.lastPreparedTs = new Date(nowUnixMs).toISOString();
    }
    return this.pendingFragments.shift() ?? null;
  }

  returnFragment(fragment: Buffer): void {
    if (fragment.length === 0) return;
    this.pendingFragments.unshift(Buffer.from(fragment));
  }

  takeNextFieldPayload(nowUnixMs: number): RtcmPreparedFieldPayload | null {
    const first = this.takeNextFragment(nowUnixMs);
    if (!first) return null;
    const fragments = [first];

    while (fragments.length < this.maxFragmentsPerFieldFrame) {
      const candidate = this.takeNextFragment(nowUnixMs);
      if (!candidate) break;
      const batchBytes = 8 + fragments.reduce((total, fragment) => total + 2 + fragment.length, 0) +
        2 + candidate.length;
      if (batchBytes > RTCM_FRAGMENT_BATCH_MAX_PAYLOAD_BYTES) {
        this.returnFragment(candidate);
        break;
      }
      fragments.push(candidate);
    }

    return {
      payload: fragments.length === 1 ? Buffer.from(first) : encodeRtcmFragmentBatchV1(fragments),
      fragments: fragments.map((fragment) => Buffer.from(fragment)),
      batched: fragments.length > 1
    };
  }

  returnFieldPayload(prepared: RtcmPreparedFieldPayload): void {
    for (let index = prepared.fragments.length - 1; index >= 0; index -= 1) {
      const fragment = prepared.fragments[index];
      if (fragment) this.returnFragment(fragment);
    }
  }

  stats(nowUnixMs = Date.now()): RtcmDownlinkControllerStats {
    const armedNodeCount = this.armedNodeCount(nowUnixMs);
    const requiredNodeCount = targetLabels(this.config.targetMask).length;
    return {
      sessionEpoch: this.sessionEpoch,
      requestedMode: this.requestedMode,
      targetMask: this.config.targetMask,
      armedNodeCount,
      requiredNodeCount,
      maxFragmentsPerFieldFrame: this.maxFragmentsPerFieldFrame,
      allTargetsArmed: armedNodeCount === requiredNodeCount,
      ntripChunks: this.ntripChunks,
      ntripBytes: this.ntripBytes,
      modeCommandsBuilt: this.modeCommandsBuilt,
      framesPrepared: this.framesPrepared,
      fragmentsPrepared: this.fragmentsPrepared,
      pendingFragments: this.pendingFragments.length,
      lastPreparedMessageType: this.lastPreparedMessageType,
      lastPreparedTs: this.lastPreparedTs,
      decoder: this.decoder.stats(),
      shaper: this.shaper.stats()
    };
  }

  private armedNodeCount(nowUnixMs: number): number {
    const maximumEvidenceAgeMs = Math.min(
      this.config.leaseSeconds * 1000,
      MAXIMUM_NODE_EVIDENCE_AGE_MS
    );
    return targetLabels(this.config.targetMask).filter((nodeLabel) => {
      const evidence = this.nodeEvidence.get(nodeLabel);
      return evidence?.mode === this.requestedMode &&
        evidence.sessionEpoch === this.sessionEpoch && evidence.leaseRemainingMs > 0 &&
        nowUnixMs >= evidence.observedUnixMs && nowUnixMs - evidence.observedUnixMs <= maximumEvidenceAgeMs;
    }).length;
  }
}
