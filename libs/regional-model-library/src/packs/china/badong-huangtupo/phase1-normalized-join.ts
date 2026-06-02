import {
  INTERNAL_RAW_FAMILY_REFS_KEY,
  type JsonObject,
  type RawFamilyReference,
  type RawFamilyRole
} from "../../../contracts";

type NormalizedRawFamilyFile = {
  filePath: string;
  rows: JsonObject[];
  familyKey?: string;
};

type FamilyRowEntry = {
  row: JsonObject;
  ref: RawFamilyReference;
};

type DetectedFamilyFile = {
  familyKey: BadongFamilyKey;
  filePath: string;
  rows: FamilyRowEntry[];
};

export type BadongPhase1FamilyBreakdown = {
  familyKey: string;
  role: RawFamilyRole;
  inputRowCount: number;
  matchedRowCount: number;
  unmatchedRowCount: number;
  sourcePaths: string[];
  joinModes: string[];
};

export type BadongPhase1JoinSummary = {
  mode: "passthrough" | "badong-normalized-family-join";
  foundFamilies: string[];
  baseFamily: string | null;
  inputRowCount: number;
  outputRowCount: number;
  matchedOverlays: number;
  unmatchedOverlayRows: number;
  metadataFamilies: string[];
  deferredFamilies: string[];
  passthroughFamilies: string[];
  familyBreakdown: BadongPhase1FamilyBreakdown[];
};

export type BadongPhase1JoinResult = {
  rows: JsonObject[];
  summary: BadongPhase1JoinSummary;
};

type BadongFamilyKey =
  | "beidou"
  | "slip-belt"
  | "surface"
  | "rainfall"
  | "groundwater"
  | "flow"
  | "settlement"
  | "bank"
  | "stress"
  | "soil"
  | "unknown";

const TIMESTAMP_FIELD_CANDIDATES = ["obs_time", "event_ts", "timestamp", "time"];
const POINT_FIELD_CANDIDATES = ["point_id", "pointId", "sensor_id", "sensorId"];
const STATION_FIELD_CANDIDATES = ["station_code", "stationCode", "station_id", "stationId"];
const SLOPE_FIELD_CANDIDATES = ["slope_code", "slopeCode", "landslide_id", "landslideId"];
const GAUGE_FIELD_CANDIDATES = ["gauge_id", "gaugeId", "rain_gauge_id", "rainGaugeId"];
const WELL_FIELD_CANDIDATES = ["well_id", "wellId"];
const TUNNEL_FIELD_CANDIDATES = ["tunnel_id", "tunnelId"];

const BASE_FAMILY_PRIORITY: Exclude<BadongFamilyKey, "unknown">[] = ["beidou"];

const FAMILY_PATTERNS: Record<Exclude<BadongFamilyKey, "unknown">, RegExp[]> = {
  beidou: [/beidou/i, /3d/i, /\bdx\b/i, /\bdy\b/i, /\bdz\b/i],
  "slip-belt": [/slip/i, /belt/i, /cave/i],
  surface: [/surface/i, /2018-2019/i],
  rainfall: [/rain/i, /precip/i],
  groundwater: [/groundwater/i, /well/i, /water[-_ ]?temperature/i],
  flow: [/flow/i, /tunnel/i, /channel/i],
  settlement: [/settlement/i],
  bank: [/bank/i],
  stress: [/stress/i, /pressure/i],
  soil: [/soil/i, /temperature/i, /water[-_ ]?content/i]
};

const FAMILY_ROLE_MAP: Record<Exclude<BadongFamilyKey, "unknown">, RawFamilyRole> = {
  beidou: "overlay",
  rainfall: "overlay",
  groundwater: "overlay",
  flow: "overlay",
  "slip-belt": "deferred",
  surface: "deferred",
  settlement: "deferred",
  bank: "deferred",
  stress: "deferred",
  soil: "deferred"
};

type JoinCandidate = {
  key: string;
  matchedBy: string;
};

function getStringValue(row: JsonObject, candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    const value = row[candidate];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function normalizeFamilyKey(value: string | undefined): BadongFamilyKey {
  if (!value) {
    return "unknown";
  }

  for (const [familyKey, patterns] of Object.entries(FAMILY_PATTERNS) as [
    Exclude<BadongFamilyKey, "unknown">,
    RegExp[]
  ][]) {
    if (patterns.some((pattern) => pattern.test(value))) {
      return familyKey;
    }
  }

  return "unknown";
}

function detectFamilyKey(file: NormalizedRawFamilyFile): BadongFamilyKey {
  const explicitFamily = normalizeFamilyKey(file.familyKey);
  if (explicitFamily !== "unknown") {
    return explicitFamily;
  }

  return normalizeFamilyKey(file.filePath);
}

function normalizeTimestampKey(row: JsonObject): string | null {
  const value = getStringValue(row, TIMESTAMP_FIELD_CANDIDATES);
  if (!value) {
    return null;
  }

  return value.replaceAll("/", "-").replaceAll("T", " ").trim();
}

function normalizeComponent(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function getPointIdentity(row: JsonObject): string | null {
  return normalizeComponent(getStringValue(row, POINT_FIELD_CANDIDATES));
}

function getStationIdentity(row: JsonObject): string | null {
  return normalizeComponent(getStringValue(row, STATION_FIELD_CANDIDATES));
}

function getSlopeIdentity(row: JsonObject): string | null {
  return normalizeComponent(getStringValue(row, SLOPE_FIELD_CANDIDATES));
}

function getGaugeIdentity(row: JsonObject): string | null {
  return normalizeComponent(getStringValue(row, GAUGE_FIELD_CANDIDATES));
}

function getWellIdentity(row: JsonObject): string | null {
  return normalizeComponent(getStringValue(row, WELL_FIELD_CANDIDATES));
}

function getTunnelIdentity(row: JsonObject): string | null {
  return normalizeComponent(getStringValue(row, TUNNEL_FIELD_CANDIDATES));
}

function createSourceRecordKey(familyKey: BadongFamilyKey, rowIndex: number): string {
  return `${familyKey}:${String(rowIndex)}`;
}

function getFamilyRole(familyKey: BadongFamilyKey, baseFamily: string | null): RawFamilyRole {
  if (familyKey === baseFamily) {
    return "base";
  }

  if (familyKey === "unknown") {
    return "passthrough";
  }

  return FAMILY_ROLE_MAP[familyKey];
}

function attachFamilyRefs(row: JsonObject, refs: RawFamilyReference[]): JsonObject {
  const existing = Array.isArray(row[INTERNAL_RAW_FAMILY_REFS_KEY])
    ? (row[INTERNAL_RAW_FAMILY_REFS_KEY] as RawFamilyReference[])
    : [];
  const deduped = new Map<string, RawFamilyReference>();

  for (const ref of [...existing, ...refs]) {
    const identity = `${ref.familyKey}::${ref.sourcePath ?? ""}::${ref.sourceRecordKey ?? ""}`;
    deduped.set(identity, ref);
  }

  return {
    ...row,
    [INTERNAL_RAW_FAMILY_REFS_KEY]: [...deduped.values()]
  };
}

function cloneStandaloneRows(files: readonly DetectedFamilyFile[]): JsonObject[] {
  return files.flatMap((file) =>
    file.rows.map((entry) =>
      attachFamilyRefs(
        { ...entry.row },
        [
          {
            ...entry.ref,
            role: getFamilyRole(file.familyKey, null)
          }
        ]
      )
    )
  );
}

function mergeRows(baseRow: JsonObject, overlayRow: JsonObject): JsonObject {
  const merged: JsonObject = { ...baseRow };

  for (const [key, value] of Object.entries(overlayRow)) {
    if (key === INTERNAL_RAW_FAMILY_REFS_KEY) {
      continue;
    }

    if (merged[key] === undefined) {
      merged[key] = value;
    }
  }

  return merged;
}

function createCandidateBuilder() {
  const seen = new Set<string>();
  const candidates: JoinCandidate[] = [];

  return {
    add(parts: (string | null)[], matchedBy: string) {
      if (parts.some((part) => part === null)) {
        return;
      }

      const key = parts.join("::");
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      candidates.push({ key, matchedBy });
    },
    done(): JoinCandidate[] {
      return candidates;
    }
  };
}

function buildJoinCandidatesForBadongFamily(
  familyKey: BadongFamilyKey,
  row: JsonObject,
  kind: "base" | "overlay"
): JoinCandidate[] {
  const timestampKey = normalizeTimestampKey(row);
  if (!timestampKey) {
    return [];
  }

  const builder = createCandidateBuilder();
  const pointIdentity = getPointIdentity(row);
  const stationIdentity = getStationIdentity(row);
  const slopeIdentity = getSlopeIdentity(row);

  switch (familyKey) {
    case "beidou":
      builder.add(["beidou", timestampKey, pointIdentity], "point_id+eventTs");
      builder.add(["beidou", timestampKey, stationIdentity], "stationCode+eventTs");
      builder.add(["beidou", timestampKey, slopeIdentity], "slopeCode+eventTs");
      break;
    case "rainfall": {
      const gaugeIdentity = getGaugeIdentity(row);
      builder.add(["rainfall", timestampKey, stationIdentity, slopeIdentity, gaugeIdentity], "station+slope+gauge+eventTs");
      builder.add(["rainfall", timestampKey, stationIdentity, gaugeIdentity], "station+gauge+eventTs");
      builder.add(["rainfall", timestampKey, slopeIdentity, gaugeIdentity], "slope+gauge+eventTs");
      builder.add(["rainfall", timestampKey, gaugeIdentity], "gauge_id+eventTs");
      if (kind === "base") {
        builder.add(["rainfall", timestampKey, pointIdentity], "point_id+eventTs");
      }
      builder.add(["rainfall", timestampKey, stationIdentity], "stationCode+eventTs");
      builder.add(["rainfall", timestampKey, slopeIdentity], "slopeCode+eventTs");
      break;
    }
    case "groundwater": {
      const wellIdentity = getWellIdentity(row);
      builder.add(["groundwater", timestampKey, stationIdentity, slopeIdentity, wellIdentity], "station+slope+well+eventTs");
      builder.add(["groundwater", timestampKey, stationIdentity, wellIdentity], "station+well+eventTs");
      builder.add(["groundwater", timestampKey, slopeIdentity, wellIdentity], "slope+well+eventTs");
      builder.add(["groundwater", timestampKey, wellIdentity], "well_id+eventTs");
      if (kind === "base") {
        builder.add(["groundwater", timestampKey, pointIdentity], "point_id+eventTs");
      }
      builder.add(["groundwater", timestampKey, stationIdentity], "stationCode+eventTs");
      builder.add(["groundwater", timestampKey, slopeIdentity], "slopeCode+eventTs");
      break;
    }
    case "flow": {
      const tunnelIdentity = getTunnelIdentity(row);
      builder.add(["flow", timestampKey, stationIdentity, slopeIdentity, tunnelIdentity], "station+slope+tunnel+eventTs");
      builder.add(["flow", timestampKey, stationIdentity, tunnelIdentity], "station+tunnel+eventTs");
      builder.add(["flow", timestampKey, slopeIdentity, tunnelIdentity], "slope+tunnel+eventTs");
      builder.add(["flow", timestampKey, tunnelIdentity], "tunnel_id+eventTs");
      if (kind === "base") {
        builder.add(["flow", timestampKey, pointIdentity], "point_id+eventTs");
      }
      builder.add(["flow", timestampKey, stationIdentity], "stationCode+eventTs");
      builder.add(["flow", timestampKey, slopeIdentity], "slopeCode+eventTs");
      break;
    }
    default:
      break;
  }

  builder.add([familyKey, timestampKey], "eventTs");
  return builder.done();
}

function createOverlayLookup(
  familyKey: BadongFamilyKey,
  rows: readonly FamilyRowEntry[]
): Map<string, FamilyRowEntry[]> {
  const lookup = new Map<string, FamilyRowEntry[]>();

  for (const entry of rows) {
    for (const candidate of buildJoinCandidatesForBadongFamily(familyKey, entry.row, "overlay")) {
      const existing = lookup.get(candidate.key) ?? [];
      existing.push(entry);
      lookup.set(candidate.key, existing);
    }
  }

  return lookup;
}

function pickOverlayRow(
  lookup: Map<string, FamilyRowEntry[]>,
  matchedRows: Set<FamilyRowEntry>,
  familyKey: BadongFamilyKey,
  baseRow: JsonObject
): { entry: FamilyRowEntry; joinKey: string; matchedBy: string } | null {
  for (const candidate of buildJoinCandidatesForBadongFamily(familyKey, baseRow, "base")) {
    const bucket = lookup.get(candidate.key);
    if (!bucket) {
      continue;
    }

    const entry = bucket.find((item) => !matchedRows.has(item));
    if (entry) {
      return {
        entry,
        joinKey: candidate.key,
        matchedBy: candidate.matchedBy
      };
    }
  }

  return null;
}

function sortFamilyBreakdown(
  summaries: Iterable<BadongPhase1FamilyBreakdown>
): BadongPhase1FamilyBreakdown[] {
  const roleOrder: Record<RawFamilyRole, number> = {
    base: 0,
    overlay: 1,
    metadata: 2,
    deferred: 3,
    passthrough: 4
  };

  return [...summaries].sort((left, right) => {
    const roleDelta = roleOrder[left.role] - roleOrder[right.role];
    if (roleDelta !== 0) {
      return roleDelta;
    }

    return left.familyKey.localeCompare(right.familyKey);
  });
}

function buildFamilyBreakdown(
  files: readonly DetectedFamilyFile[],
  baseFamily: string | null,
  familyStats?: Map<string, BadongPhase1FamilyBreakdown>
): BadongPhase1FamilyBreakdown[] {
  const breakdown = familyStats ?? new Map<string, BadongPhase1FamilyBreakdown>();

  for (const file of files) {
    const role = getFamilyRole(file.familyKey, baseFamily);
    const entry = breakdown.get(file.familyKey) ?? {
      familyKey: file.familyKey,
      role,
      inputRowCount: 0,
      matchedRowCount: 0,
      unmatchedRowCount: 0,
      sourcePaths: [],
      joinModes: []
    };

    entry.role = role;
    entry.inputRowCount += file.rows.length;
    if (!entry.sourcePaths.includes(file.filePath)) {
      entry.sourcePaths.push(file.filePath);
    }
    breakdown.set(file.familyKey, entry);
  }

  return sortFamilyBreakdown(breakdown.values());
}

export function joinBadongNormalizedFamilyRows(
  files: readonly NormalizedRawFamilyFile[]
): BadongPhase1JoinResult {
  const detectedFamilies: DetectedFamilyFile[] = files.map((file) => {
    const familyKey = detectFamilyKey(file);
    return {
      familyKey,
      filePath: file.filePath,
      rows: file.rows.map((row, rowIndex) => ({
        row,
        ref: {
          familyKey,
          sourcePath: file.filePath,
          sourceRecordKey: createSourceRecordKey(familyKey, rowIndex)
        }
      }))
    };
  });
  const inputRowCount = detectedFamilies.reduce((total, file) => total + file.rows.length, 0);
  const foundFamilies = [
    ...new Set(detectedFamilies.map((file) => file.familyKey).filter((key) => key !== "unknown"))
  ];
  const baseFamily =
    BASE_FAMILY_PRIORITY.find((candidate) =>
      detectedFamilies.some((file) => file.familyKey === candidate)
    ) ?? null;

  if (foundFamilies.length === 0 || !baseFamily) {
    const familyBreakdown = buildFamilyBreakdown(detectedFamilies, null);
    return {
      rows: cloneStandaloneRows(detectedFamilies),
      summary: {
        mode: "passthrough",
        foundFamilies,
        baseFamily: null,
        inputRowCount,
        outputRowCount: inputRowCount,
        matchedOverlays: 0,
        unmatchedOverlayRows: 0,
        metadataFamilies: [],
        deferredFamilies: familyBreakdown
          .filter((entry) => entry.role === "deferred")
          .map((entry) => entry.familyKey),
        passthroughFamilies: familyBreakdown
          .filter((entry) => entry.role === "passthrough")
          .map((entry) => entry.familyKey),
        familyBreakdown
      }
    };
  }

  const familyStats = new Map<string, BadongPhase1FamilyBreakdown>();
  buildFamilyBreakdown(detectedFamilies, baseFamily, familyStats);

  const baseRows = detectedFamilies
    .filter((file) => file.familyKey === baseFamily)
    .flatMap((file) =>
      file.rows.map((entry) =>
        attachFamilyRefs(
          { ...entry.row },
          [
            {
              ...entry.ref,
              role: "base"
            }
          ]
        )
      )
    );
  const baseFamilyStats = familyStats.get(baseFamily);
  if (baseFamilyStats) {
    baseFamilyStats.matchedRowCount = baseRows.length;
    if (!baseFamilyStats.joinModes.includes("base-row")) {
      baseFamilyStats.joinModes.push("base-row");
    }
  }

  const overlayFiles = detectedFamilies.filter(
    (file) => getFamilyRole(file.familyKey, baseFamily) === "overlay"
  );
  let matchedOverlays = 0;
  let unmatchedOverlayRows = 0;

  for (const overlayFile of overlayFiles) {
    const lookup = createOverlayLookup(overlayFile.familyKey, overlayFile.rows);
    const matchedRows = new Set<FamilyRowEntry>();

    for (let index = 0; index < baseRows.length; index += 1) {
      const baseRow = baseRows[index];
      if (!baseRow) {
        continue;
      }

      const overlayMatch = pickOverlayRow(lookup, matchedRows, overlayFile.familyKey, baseRow);
      if (!overlayMatch) {
        continue;
      }

      matchedRows.add(overlayMatch.entry);
      baseRows[index] = attachFamilyRefs(
        mergeRows(baseRow, overlayMatch.entry.row),
        [
          {
            ...overlayMatch.entry.ref,
            role: "overlay",
            joinKey: overlayMatch.joinKey,
            matchedBy: overlayMatch.matchedBy
          }
        ]
      );
      matchedOverlays += 1;

      const familyEntry = familyStats.get(overlayFile.familyKey);
      if (familyEntry) {
        familyEntry.matchedRowCount += 1;
        if (!familyEntry.joinModes.includes(overlayMatch.matchedBy)) {
          familyEntry.joinModes.push(overlayMatch.matchedBy);
        }
      }
    }

    const unmatchedCount = overlayFile.rows.filter((row) => !matchedRows.has(row)).length;
    unmatchedOverlayRows += unmatchedCount;

    const familyEntry = familyStats.get(overlayFile.familyKey);
    if (familyEntry) {
      familyEntry.unmatchedRowCount += unmatchedCount;
    }
  }

  for (const familyEntry of familyStats.values()) {
    if (familyEntry.role === "deferred" || familyEntry.role === "passthrough") {
      familyEntry.unmatchedRowCount = familyEntry.inputRowCount;
    }
  }

  const familyBreakdown = sortFamilyBreakdown(familyStats.values());

  return {
    rows: baseRows,
    summary: {
      mode: "badong-normalized-family-join",
      foundFamilies,
      baseFamily,
      inputRowCount,
      outputRowCount: baseRows.length,
      matchedOverlays,
      unmatchedOverlayRows,
      metadataFamilies: [],
      deferredFamilies: familyBreakdown
        .filter((entry) => entry.role === "deferred")
        .map((entry) => entry.familyKey),
      passthroughFamilies: familyBreakdown
        .filter((entry) => entry.role === "passthrough")
        .map((entry) => entry.familyKey),
      familyBreakdown
    }
  };
}
