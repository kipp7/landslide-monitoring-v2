import { randomBytes } from "node:crypto";
import {
  GNSS_V3_TARGET_ALL_NODES,
  classifyRtcmMessageType,
  encodeGnssRtcmModeCommandV1,
  encodeRtcmFragmentV3,
  fragmentRtcmFrameV3,
  type RtcmMessageClassV3
} from "./gnss-transport-v3";
import { Rtcm3StreamDecoder, Um220RtcmShaper } from "./rtcm-downlink-shaper";
import {
  RTCM_FRAGMENT_BATCH_MAX_PAYLOAD_BYTES,
  encodeRtcmFragmentBatchV1
} from "./rtcm-fragment-batch";
import {
  BoundedLatencyWindow,
  type BoundedLatencySummary
} from "./bounded-latency-window";

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

export type RtcmPreparedFragment = {
  payload: Buffer;
  messageType: number;
  messageClass: RtcmMessageClassV3;
  sequence: number;
  fragmentIndex: number;
  fragmentCount: number;
  casterReceivedUnixMs: number;
  preparedUnixMs: number;
  shaperQueueAgeMs: number;
};

export type RtcmPreparedFieldPayload = {
  payload: Buffer;
  fragments: RtcmPreparedFragment[];
  batched: boolean;
  preparedUnixMs: number;
};

export type RtcmLatencyStats = {
  shaperQueueMs: {
    all: BoundedLatencySummary;
    observations: BoundedLatencySummary;
    references: BoundedLatencySummary;
    byMessageType: Record<string, BoundedLatencySummary>;
  };
  dispatchBlockMs: {
    all: BoundedLatencySummary;
    byReason: Record<string, BoundedLatencySummary>;
    activeReason: RtcmDispatchBlockReason | null;
    activeSinceTs: string | null;
    activeForMs: number | null;
  };
  preparedToWriteStartMs: BoundedLatencySummary;
  serialWriteMs: BoundedLatencySummary;
  casterToFieldWriteMs: {
    all: BoundedLatencySummary;
    observations: BoundedLatencySummary;
    references: BoundedLatencySummary;
    byMessageType: Record<string, BoundedLatencySummary>;
  };
  lastFieldWrite: {
    completedTs: string;
    fragmentCount: number;
    completedRtcmFrames: number;
    messageTypes: number[];
    oldestCasterAgeMs: number;
    newestCasterAgeMs: number;
    preparedToWriteStartMs: number;
    serialWriteMs: number;
  } | null;
};

export type RtcmDispatchBlockReason = "targets-unarmed" | "port-busy" | "poll-guard";

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
  latency: RtcmLatencyStats;
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
  private pendingFragments: RtcmPreparedFragment[] = [];
  private sequence = 0;
  private modeCommandsBuilt = 0;
  private framesPrepared = 0;
  private fragmentsPrepared = 0;
  private ntripChunks = 0;
  private ntripBytes = 0;
  private lastPreparedMessageType: number | null = null;
  private lastPreparedTs: string | null = null;
  private readonly maxFragmentsPerFieldFrame: number;
  private readonly shaperQueueAll = new BoundedLatencyWindow();
  private readonly shaperQueueObservations = new BoundedLatencyWindow();
  private readonly shaperQueueReferences = new BoundedLatencyWindow();
  private readonly shaperQueueByMessageType = new Map<number, BoundedLatencyWindow>();
  private readonly dispatchBlockAll = new BoundedLatencyWindow();
  private readonly dispatchBlockByReason = new Map<RtcmDispatchBlockReason, BoundedLatencyWindow>();
  private activeDispatchBlock: { reason: RtcmDispatchBlockReason; sinceUnixMs: number } | null = null;
  private readonly preparedToWriteStart = new BoundedLatencyWindow();
  private readonly serialWrite = new BoundedLatencyWindow();
  private readonly casterToFieldWriteAll = new BoundedLatencyWindow();
  private readonly casterToFieldWriteObservations = new BoundedLatencyWindow();
  private readonly casterToFieldWriteReferences = new BoundedLatencyWindow();
  private readonly casterToFieldWriteByMessageType = new Map<number, BoundedLatencyWindow>();
  private lastFieldWrite: RtcmLatencyStats["lastFieldWrite"] = null;

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

  takeNextFragment(nowUnixMs: number): RtcmPreparedFragment | null {
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
      this.pendingFragments = fragments.map((fragment) => ({
        payload: encodeRtcmFragmentV3(fragment),
        messageType: fragment.messageType,
        messageClass: fragment.messageClass,
        sequence: fragment.sequence,
        fragmentIndex: fragment.fragmentIndex,
        fragmentCount: fragment.fragmentCount,
        casterReceivedUnixMs: shaped.receivedUnixMs,
        preparedUnixMs: nowUnixMs,
        shaperQueueAgeMs: shaped.queueAgeMs
      }));
      this.framesPrepared += 1;
      this.fragmentsPrepared += fragments.length;
      this.lastPreparedMessageType = shaped.info.messageType;
      this.lastPreparedTs = new Date(nowUnixMs).toISOString();
      this.recordByClassAndType(
        shaped.info.messageType,
        shaped.queueAgeMs,
        this.shaperQueueAll,
        this.shaperQueueObservations,
        this.shaperQueueReferences,
        this.shaperQueueByMessageType
      );
    }
    return this.pendingFragments.shift() ?? null;
  }

  returnFragment(fragment: RtcmPreparedFragment): void {
    if (fragment.payload.length === 0) return;
    this.pendingFragments.unshift(this.clonePreparedFragment(fragment));
  }

  takeNextFieldPayload(nowUnixMs: number): RtcmPreparedFieldPayload | null {
    const first = this.takeNextFragment(nowUnixMs);
    if (!first) return null;
    const fragments = [first];

    while (fragments.length < this.maxFragmentsPerFieldFrame) {
      const candidate = this.takeNextFragment(nowUnixMs);
      if (!candidate) break;
      const batchBytes = 8 + fragments.reduce((total, fragment) => total + 2 + fragment.payload.length, 0) +
        2 + candidate.payload.length;
      if (batchBytes > RTCM_FRAGMENT_BATCH_MAX_PAYLOAD_BYTES) {
        this.returnFragment(candidate);
        break;
      }
      fragments.push(candidate);
    }

    return {
      payload: fragments.length === 1
        ? Buffer.from(first.payload)
        : encodeRtcmFragmentBatchV1(fragments.map((fragment) => fragment.payload)),
      fragments: fragments.map((fragment) => this.clonePreparedFragment(fragment)),
      batched: fragments.length > 1,
      preparedUnixMs: Math.min(...fragments.map((fragment) => fragment.preparedUnixMs))
    };
  }

  returnFieldPayload(prepared: RtcmPreparedFieldPayload): void {
    for (let index = prepared.fragments.length - 1; index >= 0; index -= 1) {
      const fragment = prepared.fragments[index];
      if (fragment) this.returnFragment(fragment);
    }
  }

  hasPendingCorrections(): boolean {
    return this.pendingFragments.length > 0 || this.shaper.stats().pendingTypes > 0;
  }

  noteDispatchBlocked(reason: RtcmDispatchBlockReason, nowUnixMs: number): void {
    if (!Number.isSafeInteger(nowUnixMs) || nowUnixMs < 0) return;
    if (this.activeDispatchBlock?.reason === reason) return;
    this.finishDispatchBlock(nowUnixMs);
    this.activeDispatchBlock = { reason, sinceUnixMs: nowUnixMs };
  }

  noteDispatchReady(nowUnixMs: number): void {
    if (!Number.isSafeInteger(nowUnixMs) || nowUnixMs < 0) return;
    this.finishDispatchBlock(nowUnixMs);
  }

  noteFieldPayloadWritten(
    prepared: RtcmPreparedFieldPayload,
    writeStartedUnixMs: number,
    writeCompletedUnixMs: number
  ): void {
    if (!Number.isSafeInteger(writeStartedUnixMs) || !Number.isSafeInteger(writeCompletedUnixMs) ||
        writeStartedUnixMs < prepared.preparedUnixMs || writeCompletedUnixMs < writeStartedUnixMs) return;

    const preparedToWriteStartMs = writeStartedUnixMs - prepared.preparedUnixMs;
    const serialWriteMs = writeCompletedUnixMs - writeStartedUnixMs;
    this.preparedToWriteStart.record(preparedToWriteStartMs);
    this.serialWrite.record(serialWriteMs);

    const completedFrames = prepared.fragments.filter(
      (fragment) => fragment.fragmentIndex === fragment.fragmentCount - 1
    );
    for (const fragment of completedFrames) {
      this.recordByClassAndType(
        fragment.messageType,
        writeCompletedUnixMs - fragment.casterReceivedUnixMs,
        this.casterToFieldWriteAll,
        this.casterToFieldWriteObservations,
        this.casterToFieldWriteReferences,
        this.casterToFieldWriteByMessageType
      );
    }

    const casterAgesMs = prepared.fragments.map(
      (fragment) => Math.max(0, writeCompletedUnixMs - fragment.casterReceivedUnixMs)
    );
    this.lastFieldWrite = {
      completedTs: new Date(writeCompletedUnixMs).toISOString(),
      fragmentCount: prepared.fragments.length,
      completedRtcmFrames: completedFrames.length,
      messageTypes: Array.from(new Set(prepared.fragments.map((fragment) => fragment.messageType))).sort(
        (left, right) => left - right
      ),
      oldestCasterAgeMs: Math.max(...casterAgesMs),
      newestCasterAgeMs: Math.min(...casterAgesMs),
      preparedToWriteStartMs,
      serialWriteMs
    };
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
      latency: this.latencyStats(nowUnixMs),
      decoder: this.decoder.stats(),
      shaper: this.shaper.stats()
    };
  }

  private latencyStats(nowUnixMs: number): RtcmLatencyStats {
    return {
      shaperQueueMs: {
        all: this.shaperQueueAll.stats(),
        observations: this.shaperQueueObservations.stats(),
        references: this.shaperQueueReferences.stats(),
        byMessageType: this.mapLatencyStats(this.shaperQueueByMessageType)
      },
      dispatchBlockMs: {
        all: this.dispatchBlockAll.stats(),
        byReason: this.mapLatencyStats(this.dispatchBlockByReason),
        activeReason: this.activeDispatchBlock?.reason ?? null,
        activeSinceTs: this.activeDispatchBlock
          ? new Date(this.activeDispatchBlock.sinceUnixMs).toISOString()
          : null,
        activeForMs: this.activeDispatchBlock
          ? Math.max(0, nowUnixMs - this.activeDispatchBlock.sinceUnixMs)
          : null
      },
      preparedToWriteStartMs: this.preparedToWriteStart.stats(),
      serialWriteMs: this.serialWrite.stats(),
      casterToFieldWriteMs: {
        all: this.casterToFieldWriteAll.stats(),
        observations: this.casterToFieldWriteObservations.stats(),
        references: this.casterToFieldWriteReferences.stats(),
        byMessageType: this.mapLatencyStats(this.casterToFieldWriteByMessageType)
      },
      lastFieldWrite: this.lastFieldWrite ? { ...this.lastFieldWrite } : null
    };
  }

  private finishDispatchBlock(nowUnixMs: number): void {
    const active = this.activeDispatchBlock;
    if (!active) return;
    const durationMs = Math.max(0, nowUnixMs - active.sinceUnixMs);
    this.dispatchBlockAll.record(durationMs);
    this.latencyWindowFor(this.dispatchBlockByReason, active.reason).record(durationMs);
    this.activeDispatchBlock = null;
  }

  private recordByClassAndType(
    messageType: number,
    valueMs: number,
    all: BoundedLatencyWindow,
    observations: BoundedLatencyWindow,
    references: BoundedLatencyWindow,
    byMessageType: Map<number, BoundedLatencyWindow>
  ): void {
    all.record(valueMs);
    const messageClass = classifyRtcmMessageType(messageType);
    if (messageClass === 1) observations.record(valueMs);
    else references.record(valueMs);
    this.latencyWindowFor(byMessageType, messageType).record(valueMs);
  }

  private latencyWindowFor<K>(map: Map<K, BoundedLatencyWindow>, key: K): BoundedLatencyWindow {
    const existing = map.get(key);
    if (existing) return existing;
    const created = new BoundedLatencyWindow();
    map.set(key, created);
    return created;
  }

  private mapLatencyStats<K extends number | string>(
    source: Map<K, BoundedLatencyWindow>
  ): Record<string, BoundedLatencySummary> {
    return Object.fromEntries(
      Array.from(source.entries())
        .sort(([left], [right]) => String(left).localeCompare(String(right), "en", { numeric: true }))
        .map(([key, window]) => [String(key), window.stats()])
    );
  }

  private clonePreparedFragment(fragment: RtcmPreparedFragment): RtcmPreparedFragment {
    return { ...fragment, payload: Buffer.from(fragment.payload) };
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
