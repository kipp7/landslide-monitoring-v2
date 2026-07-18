export type SequencePayload = {
  seq?: number | null;
  meta?: Record<string, unknown>;
};

export type SequenceShadowState = {
  metrics: Record<string, number | string | boolean | null>;
  meta: Record<string, unknown>;
};

export type SequenceResetDecision = {
  accept: boolean;
  reason: "uptime_rollback" | "synthetic_shadow_replaced" | null;
  previousUptimeS: number | null;
  nextUptimeS: number | null;
};

const FIELD_PROFILE_IDENTITY_META_KEYS = [
  "install_label",
  "legacy_node",
  "upload_trigger",
  "last_command_id",
  "last_command_type",
];

function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeMarker(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
    : "";
}

function isFieldProfilePayload(payload: SequencePayload): boolean {
  const meta = payload.meta;
  if (!meta) return false;
  return FIELD_PROFILE_IDENTITY_META_KEYS.some((key) => key in meta);
}

function isSyntheticSmokeShadow(state: SequenceShadowState | null | undefined): boolean {
  if (!state) return false;
  return (
    normalizeMarker(state.metrics.note) === "smoke_test" ||
    normalizeMarker(state.meta.note) === "smoke_test"
  );
}

export function shouldDiscardSyntheticShadow(
  payload: SequencePayload,
  previousShadowState: SequenceShadowState | null | undefined
): boolean {
  return (
    toFiniteNumberOrNull(payload.meta?.uptime_s) != null &&
    isFieldProfilePayload(payload) &&
    isSyntheticSmokeShadow(previousShadowState)
  );
}

export function evaluateSequenceReset(
  payload: SequencePayload,
  latestSeq: number,
  previousShadowState: SequenceShadowState | null | undefined
): SequenceResetDecision {
  const previousUptimeS = toFiniteNumberOrNull(previousShadowState?.meta.uptime_s);
  const nextUptimeS = toFiniteNumberOrNull(payload.meta?.uptime_s);
  const sequenceRolledBack = payload.seq != null && payload.seq <= latestSeq;

  if (
    sequenceRolledBack &&
    previousUptimeS != null &&
    nextUptimeS != null &&
    nextUptimeS < previousUptimeS
  ) {
    return {
      accept: true,
      reason: "uptime_rollback",
      previousUptimeS,
      nextUptimeS,
    };
  }

  if (sequenceRolledBack && shouldDiscardSyntheticShadow(payload, previousShadowState)) {
    return {
      accept: true,
      reason: "synthetic_shadow_replaced",
      previousUptimeS,
      nextUptimeS,
    };
  }

  return {
    accept: false,
    reason: null,
    previousUptimeS,
    nextUptimeS,
  };
}
