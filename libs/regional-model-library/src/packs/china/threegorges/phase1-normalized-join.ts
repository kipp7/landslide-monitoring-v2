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
  familyKey: ThreeGorgesFamilyKey;
  filePath: string;
  rows: FamilyRowEntry[];
};

export type ThreeGorgesPhase1FamilyBreakdown = {
  familyKey: string;
  role: RawFamilyRole;
  inputRowCount: number;
  matchedRowCount: number;
  unmatchedRowCount: number;
  sourcePaths: string[];
  joinModes: string[];
};

export type ThreeGorgesPhase1JoinSummary = {
  mode: "passthrough" | "threegorges-normalized-family-join";
  foundFamilies: string[];
  baseFamily: string | null;
  inputRowCount: number;
  outputRowCount: number;
  matchedOverlays: number;
  unmatchedOverlayRows: number;
  metadataFamilies: string[];
  deferredFamilies: string[];
  passthroughFamilies: string[];
  familyBreakdown: ThreeGorgesPhase1FamilyBreakdown[];
};

export type ThreeGorgesPhase1JoinResult = {
  rows: JsonObject[];
  summary: ThreeGorgesPhase1JoinSummary;
};

type ThreeGorgesFamilyKey =
  | "deformation"
  | "rainfall"
  | "reservoir"
  | "groundwater"
  | "temperature"
  | "crack"
  | "inclinometer"
  | "metadata"
  | "annual-report"
  | "basic-feature"
  | "unknown";

type JoinCandidate = {
  key: string;
  matchedBy: string;
};

type FamilyJoinBehavior = {
  reuseMode: "exclusive" | "shared";
  backwardMaxLagDays: number;
};

type TimestampJoinCandidate = {
  timestampKey: string;
  lagDays: number;
};

const TIMESTAMP_FIELD_CANDIDATES = ["obs_time", "event_ts", "timestamp", "time"];
const POINT_FIELD_CANDIDATES = ["point_id", "pointId", "monitor_point_id", "monitorPointId"];
const STATION_FIELD_CANDIDATES = ["station_code", "stationCode", "station_id", "stationId"];
const SLOPE_FIELD_CANDIDATES = ["slope_code", "slopeCode", "landslide_id", "landslideId"];
const GAUGE_FIELD_CANDIDATES = ["gauge_id", "gaugeId", "rain_gauge_id", "rainGaugeId"];
const WELL_FIELD_CANDIDATES = ["well_id", "wellId", "groundwater_well_id", "groundwaterWellId"];
const WEATHER_FIELD_CANDIDATES = [
  "weather_station_id",
  "weatherStationId",
  "meteo_id",
  "meteoId",
  "source_weather_id",
  "sourceWeatherId"
];
const CRACK_FIELD_CANDIDATES = ["crack_id", "crackId"];
const BOREHOLE_FIELD_CANDIDATES = ["borehole_id", "boreholeId", "inclinometer_id", "inclinometerId"];
const TIMESTAMP_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(.*)$/u;

const BASE_FAMILY_PRIORITY: Exclude<ThreeGorgesFamilyKey, "unknown">[] = ["deformation", "crack"];

const DEFAULT_FAMILY_JOIN_BEHAVIOR: FamilyJoinBehavior = {
  reuseMode: "exclusive",
  backwardMaxLagDays: 0
};

// Daily context families should be reusable across multiple monitored points on the same day.
const FAMILY_JOIN_BEHAVIORS: Partial<Record<ThreeGorgesFamilyKey, FamilyJoinBehavior>> = {
  rainfall: {
    reuseMode: "shared",
    backwardMaxLagDays: 1
  },
  reservoir: {
    reuseMode: "shared",
    backwardMaxLagDays: 7
  }
};

const FAMILY_PATTERNS: Record<Exclude<ThreeGorgesFamilyKey, "unknown">, RegExp[]> = {
  deformation: [/deformation/i, /surface/i, /gps/i, /gnss/i],
  rainfall: [/rain/i, /precip/i],
  reservoir: [/reservoir/i, /water[-_ ]?level/i, /yangtze/i],
  groundwater: [/groundwater/i, /well/i],
  temperature: [/temperature/i, /weather/i, /meteo/i],
  crack: [/crack/i],
  inclinometer: [/inclin/i, /borehole/i],
  metadata: [/metadata/i, /profile/i, /station[-_ ]?info/i],
  "annual-report": [/annual/i, /report/i],
  "basic-feature": [/basic/i, /feature/i]
};

const FAMILY_ROLE_MAP: Record<Exclude<ThreeGorgesFamilyKey, "unknown">, RawFamilyRole> = {
  deformation: "overlay",
  rainfall: "overlay",
  reservoir: "overlay",
  groundwater: "overlay",
  temperature: "overlay",
  crack: "overlay",
  inclinometer: "deferred",
  metadata: "metadata",
  "annual-report": "metadata",
  "basic-feature": "metadata"
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

function normalizeComponent(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTimestampKey(row: JsonObject): string | null {
  const value = getStringValue(row, TIMESTAMP_FIELD_CANDIDATES);
  if (!value) {
    return null;
  }

  return value.replaceAll("/", "-").replaceAll("T", " ").trim();
}

function shiftTimestampKeyByDays(timestampKey: string, deltaDays: number): string | null {
  const matched = TIMESTAMP_PREFIX_PATTERN.exec(timestampKey);
  if (!matched) {
    return null;
  }

  const [, yearText, monthText, dayText, suffix = ""] = matched;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const baseUtc = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(baseUtc)) {
    return null;
  }

  const shifted = new Date(baseUtc + deltaDays * 24 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 10)}${suffix}`;
}

function normalizeFamilyKey(value: string | undefined): ThreeGorgesFamilyKey {
  if (!value) {
    return "unknown";
  }

  for (const [familyKey, patterns] of Object.entries(FAMILY_PATTERNS) as [
    Exclude<ThreeGorgesFamilyKey, "unknown">,
    RegExp[]
  ][]) {
    if (patterns.some((pattern) => pattern.test(value))) {
      return familyKey;
    }
  }

  return "unknown";
}

function detectFamilyKey(file: NormalizedRawFamilyFile): ThreeGorgesFamilyKey {
  const explicitFamily = normalizeFamilyKey(file.familyKey);
  if (explicitFamily !== "unknown") {
    return explicitFamily;
  }

  return normalizeFamilyKey(file.filePath);
}

function getFamilyJoinBehavior(familyKey: ThreeGorgesFamilyKey): FamilyJoinBehavior {
  return FAMILY_JOIN_BEHAVIORS[familyKey] ?? DEFAULT_FAMILY_JOIN_BEHAVIOR;
}

function getFamilyRole(familyKey: ThreeGorgesFamilyKey, baseFamily: string | null): RawFamilyRole {
  if (familyKey === baseFamily) {
    return "base";
  }

  if (familyKey === "unknown") {
    return "passthrough";
  }

  return FAMILY_ROLE_MAP[familyKey];
}

function createSourceRecordKey(familyKey: ThreeGorgesFamilyKey, rowIndex: number): string {
  return `${familyKey}:${String(rowIndex)}`;
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

function getWeatherIdentity(row: JsonObject): string | null {
  return normalizeComponent(getStringValue(row, WEATHER_FIELD_CANDIDATES));
}

function getCrackIdentity(row: JsonObject): string | null {
  return normalizeComponent(getStringValue(row, CRACK_FIELD_CANDIDATES));
}

function getBoreholeIdentity(row: JsonObject): string | null {
  return normalizeComponent(getStringValue(row, BOREHOLE_FIELD_CANDIDATES));
}

function buildJoinCandidatesForThreeGorgesFamily(
  familyKey: ThreeGorgesFamilyKey,
  row: JsonObject,
  kind: "base" | "overlay"
): JoinCandidate[] {
  const timestampKey = normalizeTimestampKey(row);
  if (!timestampKey) {
    return [];
  }

  const builder = createCandidateBuilder();
  const timestampCandidates: TimestampJoinCandidate[] = (() => {
    if (kind === "overlay") {
      return [{ timestampKey, lagDays: 0 }];
    }

    const candidates: TimestampJoinCandidate[] = [{ timestampKey, lagDays: 0 }];
    const { backwardMaxLagDays } = getFamilyJoinBehavior(familyKey);
    for (let lagDays = 1; lagDays <= backwardMaxLagDays; lagDays += 1) {
      const laggedTimestampKey = shiftTimestampKeyByDays(timestampKey, -lagDays);
      if (!laggedTimestampKey) {
        break;
      }
      candidates.push({
        timestampKey: laggedTimestampKey,
        lagDays
      });
    }

    return candidates;
  })();
  const addCandidate = (matchedBy: string, ...parts: (string | null)[]) => {
    for (const candidate of timestampCandidates) {
      builder.add(
        [familyKey, candidate.timestampKey, ...parts],
        candidate.lagDays > 0
          ? `${matchedBy}+backward-${String(candidate.lagDays)}d`
          : matchedBy
      );
    }
  };
  const pointIdentity = getPointIdentity(row);
  const stationIdentity = getStationIdentity(row);
  const slopeIdentity = getSlopeIdentity(row);

  switch (familyKey) {
    case "deformation":
      addCandidate("point_id+eventTs", pointIdentity);
      addCandidate("stationCode+eventTs", stationIdentity);
      addCandidate("slopeCode+eventTs", slopeIdentity);
      break;
    case "rainfall": {
      const gaugeIdentity = getGaugeIdentity(row);
      addCandidate("station+slope+gauge+eventTs", stationIdentity, slopeIdentity, gaugeIdentity);
      addCandidate("station+gauge+eventTs", stationIdentity, gaugeIdentity);
      addCandidate("slope+gauge+eventTs", slopeIdentity, gaugeIdentity);
      addCandidate("gauge_id+eventTs", gaugeIdentity);
      if (kind === "base") {
        addCandidate("point_id+eventTs", pointIdentity);
      }
      addCandidate("station+slope+eventTs", stationIdentity, slopeIdentity);
      addCandidate("stationCode+eventTs", stationIdentity);
      addCandidate("slopeCode+eventTs", slopeIdentity);
      break;
    }
    case "reservoir": {
      const gaugeIdentity = getGaugeIdentity(row);
      addCandidate("slope+gauge+eventTs", slopeIdentity, gaugeIdentity);
      addCandidate("station+gauge+eventTs", stationIdentity, gaugeIdentity);
      addCandidate("gauge_id+eventTs", gaugeIdentity);
      addCandidate("slopeCode+eventTs", slopeIdentity);
      addCandidate("stationCode+eventTs", stationIdentity);
      break;
    }
    case "groundwater": {
      const wellIdentity = getWellIdentity(row);
      addCandidate("station+slope+well+eventTs", stationIdentity, slopeIdentity, wellIdentity);
      addCandidate("station+well+eventTs", stationIdentity, wellIdentity);
      addCandidate("slope+well+eventTs", slopeIdentity, wellIdentity);
      addCandidate("well_id+eventTs", wellIdentity);
      if (kind === "base") {
        addCandidate("point_id+eventTs", pointIdentity);
      }
      addCandidate("stationCode+eventTs", stationIdentity);
      addCandidate("slopeCode+eventTs", slopeIdentity);
      break;
    }
    case "temperature": {
      const weatherIdentity = getWeatherIdentity(row);
      addCandidate("station+weather+eventTs", stationIdentity, weatherIdentity);
      addCandidate("slope+weather+eventTs", slopeIdentity, weatherIdentity);
      addCandidate("weather_id+eventTs", weatherIdentity);
      if (kind === "base") {
        addCandidate("point_id+eventTs", pointIdentity);
      }
      addCandidate("stationCode+eventTs", stationIdentity);
      addCandidate("slopeCode+eventTs", slopeIdentity);
      break;
    }
    case "crack": {
      const crackIdentity = getCrackIdentity(row);
      addCandidate("point+crack+eventTs", pointIdentity, crackIdentity);
      addCandidate("crack_id+eventTs", crackIdentity);
      addCandidate("point_id+eventTs", pointIdentity);
      addCandidate("stationCode+eventTs", stationIdentity);
      addCandidate("slopeCode+eventTs", slopeIdentity);
      break;
    }
    case "inclinometer": {
      const boreholeIdentity = getBoreholeIdentity(row);
      addCandidate("station+borehole+eventTs", stationIdentity, boreholeIdentity);
      addCandidate("slope+borehole+eventTs", slopeIdentity, boreholeIdentity);
      addCandidate("borehole_id+eventTs", boreholeIdentity);
      addCandidate("stationCode+eventTs", stationIdentity);
      addCandidate("slopeCode+eventTs", slopeIdentity);
      break;
    }
    default:
      break;
  }

  addCandidate("eventTs");
  return builder.done();
}

function createOverlayLookup(
  familyKey: ThreeGorgesFamilyKey,
  rows: readonly FamilyRowEntry[]
): Map<string, FamilyRowEntry[]> {
  const lookup = new Map<string, FamilyRowEntry[]>();

  for (const entry of rows) {
    for (const candidate of buildJoinCandidatesForThreeGorgesFamily(familyKey, entry.row, "overlay")) {
      const existing = lookup.get(candidate.key) ?? [];
      existing.push(entry);
      lookup.set(candidate.key, existing);
    }
  }

  return lookup;
}

function pickOverlayEntry(
  lookup: Map<string, FamilyRowEntry[]>,
  usedRows: Set<FamilyRowEntry>,
  familyKey: ThreeGorgesFamilyKey,
  baseRow: JsonObject
): { entry: FamilyRowEntry; joinKey: string; matchedBy: string } | null {
  const joinBehavior = getFamilyJoinBehavior(familyKey);

  for (const candidate of buildJoinCandidatesForThreeGorgesFamily(familyKey, baseRow, "base")) {
    const bucket = lookup.get(candidate.key);
    if (!bucket) {
      continue;
    }

    const entry =
      joinBehavior.reuseMode === "shared"
        ? bucket[0]
        : bucket.find((item) => !usedRows.has(item));
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
  summaries: Iterable<ThreeGorgesPhase1FamilyBreakdown>
): ThreeGorgesPhase1FamilyBreakdown[] {
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
  familyStats?: Map<string, ThreeGorgesPhase1FamilyBreakdown>
): ThreeGorgesPhase1FamilyBreakdown[] {
  const breakdown = familyStats ?? new Map<string, ThreeGorgesPhase1FamilyBreakdown>();

  for (const file of files) {
    const familyKey = file.familyKey;
    const role = getFamilyRole(familyKey, baseFamily);
    const entry = breakdown.get(familyKey) ?? {
      familyKey,
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
    breakdown.set(familyKey, entry);
  }

  return sortFamilyBreakdown(breakdown.values());
}

export function joinThreeGorgesNormalizedFamilyRows(
  files: readonly NormalizedRawFamilyFile[]
): ThreeGorgesPhase1JoinResult {
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
        metadataFamilies: familyBreakdown
          .filter((entry) => entry.role === "metadata")
          .map((entry) => entry.familyKey),
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

  const familyStats = new Map<string, ThreeGorgesPhase1FamilyBreakdown>();
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
    const usedRows = new Set<FamilyRowEntry>();

    for (let index = 0; index < baseRows.length; index += 1) {
      const baseRow = baseRows[index];
      if (!baseRow) {
        continue;
      }

      const overlayMatch = pickOverlayEntry(lookup, usedRows, overlayFile.familyKey, baseRow);
      if (!overlayMatch) {
        continue;
      }

      usedRows.add(overlayMatch.entry);
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

    const unmatchedCount = overlayFile.rows.filter((row) => !usedRows.has(row)).length;
    unmatchedOverlayRows += unmatchedCount;

    const familyEntry = familyStats.get(overlayFile.familyKey);
    if (familyEntry) {
      familyEntry.unmatchedRowCount += unmatchedCount;
    }
  }

  for (const familyEntry of familyStats.values()) {
    if (familyEntry.role === "metadata" || familyEntry.role === "deferred" || familyEntry.role === "passthrough") {
      familyEntry.unmatchedRowCount = familyEntry.inputRowCount;
    }
  }

  const familyBreakdown = sortFamilyBreakdown(familyStats.values());

  return {
    rows: baseRows,
    summary: {
      mode: "threegorges-normalized-family-join",
      foundFamilies,
      baseFamily,
      inputRowCount,
      outputRowCount: baseRows.length,
      matchedOverlays,
      unmatchedOverlayRows,
      metadataFamilies: familyBreakdown
        .filter((entry) => entry.role === "metadata")
        .map((entry) => entry.familyKey),
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
