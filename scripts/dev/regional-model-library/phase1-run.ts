import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  BADONG_HUANGTUPO_PACK,
  THREEGORGES_PACK,
  buildCanonicalEventInventory,
  buildCanonicalStationMultivariateSeries,
  buildPackCandidateMappedStationSeries,
  buildRegionProfile,
  createCanonicalTrainingSamples,
  evaluateRegionProfileQuality,
  evaluateSeriesQuality,
  evaluateTrainingSamples,
  joinBadongNormalizedFamilyRows,
  joinThreeGorgesNormalizedFamilyRows,
  writeJsonFile,
  writeJsonLines,
  type CanonicalBusinessIdentity,
  type JsonObject,
  type QualityFlag,
  type QualityGateResult,
  type RawFamilyRole,
  type RegionalDatasetPack,
  type ResolvedStationMultivariateMapping,
  type SampleLabelPolicy
} from "../../../libs/regional-model-library/src";

export type Phase1TaskKey =
  | "threegorges"
  | "badong"
  | "event-inventory"
  | "region-profile";

type StationPhase1TaskKey = "threegorges" | "badong";

type Phase1TaskDefinition = {
  title: string;
  description: string;
  defaultDatasetKey: string;
  defaultRawRelative: string;
  defaultScopeType: "station" | "slope" | "region";
  plannedOutputs: {
    canonicalRelative: string;
    sampleRelative?: string;
    reportRelative: string;
  };
  nextHandoff: string[];
};

type ParsedArgs = {
  task?: string;
  rawRoot?: string;
  outRoot?: string;
  datasetKey?: string;
  windowSpec?: string;
  horizonSpec?: string;
  regionCode?: string;
  slopeCode?: string;
  stationCode?: string;
  scopeType?: string;
  summaryOnly: boolean;
  dryRun: boolean;
  help: boolean;
  extraPositionals: string[];
};

type RawLoadMode = "not-run" | "missing" | "loaded";

type RawLoadSummary = {
  mode: RawLoadMode;
  inputFiles: string[];
  fileFormats: string[];
  rowCount: number;
};

type MappingSummary = {
  timestampField: string | null;
  matchedFieldMap: Record<string, string>;
  unmatchedCanonicalFields: string[];
  availableFields: string[];
};

type JoinFamilyBreakdown = {
  familyKey: string;
  role: RawFamilyRole;
  inputRowCount: number;
  matchedRowCount: number;
  unmatchedRowCount: number;
  sourcePaths: string[];
  joinModes: string[];
};

type JoinSummary = {
  mode:
    | "not-run"
    | "passthrough"
    | "threegorges-normalized-family-join"
    | "badong-normalized-family-join";
  foundFamilies: string[];
  baseFamily: string | null;
  inputRowCount: number;
  outputRowCount: number;
  matchedOverlays: number;
  unmatchedOverlayRows: number;
  metadataFamilies: string[];
  deferredFamilies: string[];
  passthroughFamilies: string[];
  familyBreakdown: JoinFamilyBreakdown[];
};

type QualityCounts = {
  errors: number;
  warnings: number;
};

type Phase1Summary = {
  generatedAt: string;
  status: "ready-for-integration";
  phase: "regional-model-library-phase-1";
  caller: string;
  sourceArgv: string[];
  task: {
    key: Phase1TaskKey;
    title: string;
    description: string;
    datasetKey: string;
  };
  repo: {
    root: string;
    scriptsRoot: string;
  };
  inputs: {
    rawRoot: string;
    outRoot: string;
    windowSpec: string[];
    horizonSpec: string[];
    identityHint: {
      scopeType: string;
      regionCode: string | null;
      slopeCode: string | null;
      stationCode: string | null;
    };
  };
  routes: {
    canonicalOutput: string;
    sampleOutput: string | null;
    reportOutput: string;
  };
  execution: {
    skeletonOnly: boolean;
    dryRun: boolean;
    summaryOnly: boolean;
    rawLoad: RawLoadSummary;
    plannedSteps: string[];
    boundaries: string[];
  };
  results: {
    wroteOutputs: boolean;
    canonicalCount: number;
    sampleCount: number;
    seriesPointCount: number;
    mapping: MappingSummary;
    join: JoinSummary;
    quality: {
      series: QualityCounts;
      samples: QualityCounts;
      profile: QualityCounts;
    };
  };
  nextHandoff: string[];
};

type RawLoadFileEntry = {
  filePath: string;
  fileFormat: string;
  rows: JsonObject[];
  familyKey?: string;
};

type NormalizedRawFamilyFile = {
  filePath: string;
  rows: JsonObject[];
  familyKey?: string;
};

type RawLoadResult = RawLoadSummary & {
  rows: JsonObject[];
  files: RawLoadFileEntry[];
};

export const ENV_ARGV_KEY = "LSMV2_REGIONAL_MODEL_LIBRARY_ARGS_JSON";
export const ENV_CALLER_KEY = "LSMV2_REGIONAL_MODEL_LIBRARY_CALLER";

const DEFAULT_WINDOW_SPEC = "6h,24h,72h";
const DEFAULT_HORIZON_SPEC = "1h,6h,24h";
const DEFAULT_WARNING_LABEL_FIELD_CANDIDATES = [
  "warningHitLabel",
  "warning_hit_label",
  "warningLabel",
  "warning_label",
  "label",
  "riskLevelLabel",
  "risk_level_label"
];
const DEFAULT_RISK_LEVEL_LABEL_FIELD_CANDIDATES = [
  "riskLevelLabel",
  "risk_level_label",
  "riskLevel",
  "risk_level",
  "alertLevel",
  "alert_level"
];
const DEFAULT_DISPLACEMENT_LABEL_FIELD_CANDIDATES = [
  "displacementLabel",
  "displacement_label",
  "target_displacement_mm",
  "future_displacement_mm",
  "forecast_target_displacement_mm",
  "displacement_target_mm",
  "next_displacement_mm",
  "next_increment_displacement_mm",
  "target_dx",
  "target_dy",
  "target_dz"
];
const JSON_CONTAINER_KEYS = ["rows", "items", "data", "records"] as const;
const SUPPORTED_RAW_EXTENSIONS = new Set([
  ".json",
  ".jsonl",
  ".ndjson",
  ".csv",
  ".xlsx",
  ".xls"
]);
const TASK_RAW_DIR_HINTS: Record<Phase1TaskKey, string[]> = {
  threegorges: ["ThreeGorges", "threegorges"],
  badong: ["Badong-Huangtupo", "badong-huangtupo", "badong"],
  "event-inventory": ["event-inventory", "event_inventory"],
  "region-profile": ["region-profile", "region_profile"]
};

const TASK_DEFINITIONS: Record<Phase1TaskKey, Phase1TaskDefinition> = {
  threegorges: {
    title: "ThreeGorges station multivariate ingestion",
    description:
      "Phase-1 route for ts_station_multivariate_adapter on normalized ThreeGorges JSON/JSONL/CSV/XLSX inputs.",
    defaultDatasetKey: "ThreeGorges",
    defaultRawRelative: ".tmp/regional-model-library/raw/ThreeGorges",
    defaultScopeType: "station",
    plannedOutputs: {
      canonicalRelative: "canonical/threegorges/threegorges-station-multivariate.series.json",
      sampleRelative: "samples/threegorges/threegorges-canonical-training-samples.jsonl",
      reportRelative: "reports/threegorges/threegorges-phase1-summary.json"
    },
    nextHandoff: [
      "Add multi-file join assembly for rainfall and reservoir families beyond pre-normalized row input.",
      "Bind displacement and warning label policies instead of defaulting unlabeled rows to zero.",
      "Harden direct XLSX multi-sheet family routing and real export backfill for ThreeGorges."
    ]
  },
  badong: {
    title: "Badong-Huangtupo station multivariate ingestion",
    description:
      "Phase-1 route for ts_station_multivariate_adapter on normalized Badong-Huangtupo JSON/JSONL/CSV/XLSX inputs.",
    defaultDatasetKey: "Badong-Huangtupo",
    defaultRawRelative: ".tmp/regional-model-library/raw/Badong-Huangtupo",
    defaultScopeType: "slope",
    plannedOutputs: {
      canonicalRelative: "canonical/badong/badong-station-multivariate.series.json",
      sampleRelative: "samples/badong/badong-canonical-training-samples.jsonl",
      reportRelative: "reports/badong/badong-phase1-summary.json"
    },
    nextHandoff: [
      "Add station-slope-groundwater join assembly for Badong family inputs.",
      "Bind displacement and warning label policies instead of defaulting unlabeled rows to zero.",
      "Harden direct XLSX multi-sheet family routing and real export backfill for Badong-Huangtupo."
    ]
  },
  "event-inventory": {
    title: "Event inventory adapter ingestion",
    description:
      "Phase-1 route for canonical event inventory normalization on normalized JSON/JSONL/CSV/XLSX inputs.",
    defaultDatasetKey: "China-Event-Inventory",
    defaultRawRelative: ".tmp/regional-model-library/raw/event-inventory",
    defaultScopeType: "region",
    plannedOutputs: {
      canonicalRelative: "canonical/event-inventory/event-inventory.canonical.json",
      reportRelative: "reports/event-inventory/event-inventory-phase1-summary.json"
    },
    nextHandoff: [
      "Implement event dedup and time-precision flags in event_inventory_adapter.",
      "Bind regionCode normalization tables for the first China event sources.",
      "Join event inventory to rainfall and monitoring windows before training use."
    ]
  },
  "region-profile": {
    title: "Region profile builder skeleton",
    description:
      "Phase-1 route for region_profile_builder and business-identity aligned profile assembly.",
    defaultDatasetKey: "RegionProfileBuilder",
    defaultRawRelative: ".tmp/regional-model-library/raw/region-profile",
    defaultScopeType: "slope",
    plannedOutputs: {
      canonicalRelative: "canonical/region-profile/region-profile.canonical.json",
      reportRelative: "reports/region-profile/region-profile-phase1-summary.json"
    },
    nextHandoff: [
      "Implement region_profile_builder with controlled vocabulary mapping.",
      "Bind profile pack inputs for regionCode, slopeCode, stationCode and requiredSensors.",
      "Replace placeholder profile assembly with raw metadata ingestion."
    ]
  }
};

function isTaskKey(value: string): value is Phase1TaskKey {
  return Object.prototype.hasOwnProperty.call(TASK_DEFINITIONS, value);
}

function resolveRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Cannot resolve repo root from scripts/dev/regional-model-library.");
    }
    current = parent;
  }
}

function resolveEffectiveArgv(argv: string[]): string[] {
  if (argv.length > 0) {
    return argv;
  }

  const envValue = process.env[ENV_ARGV_KEY];
  if (!envValue) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(envValue);
  } catch (error) {
    throw new Error(
      `Invalid ${ENV_ARGV_KEY}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${ENV_ARGV_KEY} must be a JSON string array.`);
  }

  return parsed;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    summaryOnly: false,
    dryRun: false,
    help: false,
    extraPositionals: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      if (!parsed.task) {
        parsed.task = token;
      } else {
        parsed.extraPositionals.push(token);
      }
      continue;
    }

    const nextValue = (): string => {
      index += 1;
      const value = argv[index];
      if (!value) {
        throw new Error(`Missing value for ${token}`);
      }
      return value;
    };

    switch (token) {
      case "--task":
        parsed.task = nextValue();
        break;
      case "--raw-root":
        parsed.rawRoot = nextValue();
        break;
      case "--out-root":
        parsed.outRoot = nextValue();
        break;
      case "--dataset-key":
        parsed.datasetKey = nextValue();
        break;
      case "--window-spec":
        parsed.windowSpec = nextValue();
        break;
      case "--horizon-spec":
        parsed.horizonSpec = nextValue();
        break;
      case "--region-code":
        parsed.regionCode = nextValue();
        break;
      case "--slope-code":
        parsed.slopeCode = nextValue();
        break;
      case "--station-code":
        parsed.stationCode = nextValue();
        break;
      case "--scope-type":
        parsed.scopeType = nextValue();
        break;
      case "--summary-only":
        parsed.summaryOnly = true;
        break;
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--help":
        parsed.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return parsed;
}

function resolveTaskKey(
  requestedTask: string | undefined,
  defaultTask: Phase1TaskKey | undefined
): Phase1TaskKey {
  const task = requestedTask ?? defaultTask;
  if (!task) {
    throw new Error("Missing task. Use --task <threegorges|badong|event-inventory|region-profile>.");
  }

  if (!isTaskKey(task)) {
    throw new Error(`Unsupported task: ${task}`);
  }

  if (defaultTask && requestedTask && requestedTask !== defaultTask) {
    throw new Error(
      `Entrypoint is pinned to task '${defaultTask}', but received '${requestedTask}'.`
    );
  }

  return task;
}

function resolvePathValue(
  repoRoot: string,
  candidate: string | undefined,
  fallbackRelative: string
): string {
  const value = candidate && candidate.trim().length > 0 ? candidate.trim() : fallbackRelative;
  return path.isAbsolute(value) ? path.normalize(value) : path.join(repoRoot, value);
}

function splitCsv(input: string | undefined, fallbackValue: string): string[] {
  const value = input && input.trim().length > 0 ? input : fallbackValue;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function createEmptyRawLoadSummary(): RawLoadSummary {
  return {
    mode: "not-run",
    inputFiles: [],
    fileFormats: [],
    rowCount: 0
  };
}

function createEmptyMappingSummary(): MappingSummary {
  return {
    timestampField: null,
    matchedFieldMap: {},
    unmatchedCanonicalFields: [],
    availableFields: []
  };
}

function createEmptyJoinSummary(): JoinSummary {
  return {
    mode: "not-run",
    foundFamilies: [],
    baseFamily: null,
    inputRowCount: 0,
    outputRowCount: 0,
    matchedOverlays: 0,
    unmatchedOverlayRows: 0,
    metadataFamilies: [],
    deferredFamilies: [],
    passthroughFamilies: [],
    familyBreakdown: []
  };
}

function createEmptyQualityCounts(): QualityCounts {
  return {
    errors: 0,
    warnings: 0
  };
}

const REGION_IDENTITY_FIELD_CANDIDATES = [
  "region_code",
  "regionCode",
  "province_code",
  "provinceCode",
  "region_id",
  "regionId"
] as const;
const SLOPE_IDENTITY_FIELD_CANDIDATES = [
  "slope_code",
  "slopeCode",
  "landslide_id",
  "landslideId"
] as const;
const STATION_IDENTITY_FIELD_CANDIDATES = [
  "station_code",
  "stationCode",
  "station_id",
  "stationId"
] as const;

function toIdentityValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function inferSingleIdentityValue(
  rawRows: readonly JsonObject[],
  candidates: readonly string[]
): string | null {
  const values = new Set<string>();

  for (const row of rawRows) {
    for (const candidate of candidates) {
      const value = toIdentityValue(row[candidate]);
      if (value) {
        values.add(value);
      }
    }
  }

  return values.size === 1 ? [...values][0] ?? null : null;
}

function buildHelpText(defaultTask: Phase1TaskKey | undefined): string {
  const taskLine = defaultTask
    ? `This entrypoint is pinned to task '${defaultTask}'.`
    : "Use --task to select one of the phase-1 routes.";

  return [
    "regional-model-library phase-1 ingestion",
    "",
    "Usage:",
    "  tsx scripts/dev/regional-model-library/phase1-run.ts --task <task> [options]",
    "  powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\run-regional-model-library-phase1.ps1 -Task <task>",
    "",
    taskLine,
    "",
    "Supported raw input contract:",
    "  - normalized JSON arrays",
    "  - normalized JSON objects with rows/items/data/records arrays",
    "  - JSONL / NDJSON row files",
    "  - normalized CSV files with header row",
    "  - XLSX / XLS sheet tables with header row",
    "",
    "Tasks:",
    "  threegorges",
    "  badong",
    "  event-inventory",
    "  region-profile",
    "",
    "Options:",
    "  --raw-root <path>",
    "  --out-root <path>",
    "  --dataset-key <key>",
    "  --window-spec <csv>",
    "  --horizon-spec <csv>",
    "  --region-code <code>",
    "  --slope-code <code>",
    "  --station-code <code>",
    "  --scope-type <station|slope|region>",
    "  --dry-run",
    "  --summary-only",
    "  --help"
  ].join("\n");
}

function buildSummary(
  taskKey: Phase1TaskKey,
  parsed: ParsedArgs,
  caller: string,
  sourceArgv: string[],
  repoRoot: string
): Phase1Summary {
  const definition = TASK_DEFINITIONS[taskKey];
  const rawRoot = resolvePathValue(repoRoot, parsed.rawRoot, definition.defaultRawRelative);
  const outRoot = resolvePathValue(repoRoot, parsed.outRoot, ".tmp/regional-model-library/out");

  return {
    generatedAt: new Date().toISOString(),
    status: "ready-for-integration",
    phase: "regional-model-library-phase-1",
    caller,
    sourceArgv,
    task: {
      key: taskKey,
      title: definition.title,
      description: definition.description,
      datasetKey: parsed.datasetKey ?? definition.defaultDatasetKey
    },
    repo: {
      root: repoRoot,
      scriptsRoot: path.join(repoRoot, "scripts", "dev", "regional-model-library")
    },
    inputs: {
      rawRoot,
      outRoot,
      windowSpec: splitCsv(parsed.windowSpec, DEFAULT_WINDOW_SPEC),
      horizonSpec: splitCsv(parsed.horizonSpec, DEFAULT_HORIZON_SPEC),
      identityHint: {
        scopeType: parsed.scopeType ?? definition.defaultScopeType,
        regionCode: parsed.regionCode ?? null,
        slopeCode: parsed.slopeCode ?? null,
        stationCode: parsed.stationCode ?? null
      }
    },
    routes: {
      canonicalOutput: path.join(outRoot, definition.plannedOutputs.canonicalRelative),
      sampleOutput: definition.plannedOutputs.sampleRelative
        ? path.join(outRoot, definition.plannedOutputs.sampleRelative)
        : null,
      reportOutput: path.join(outRoot, definition.plannedOutputs.reportRelative)
    },
    execution: {
      skeletonOnly: true,
      dryRun: parsed.dryRun,
      summaryOnly: parsed.summaryOnly,
      rawLoad: createEmptyRawLoadSummary(),
      plannedSteps: [
        "Resolve repo root and lock the requested phase-1 task route.",
        "Load normalized raw JSON / JSONL / CSV / XLSX rows from the requested raw root when present.",
        "Build canonical outputs using libs/regional-model-library contracts and pack mappings.",
        "Write canonical outputs, training samples and a report summary without touching runtime services."
      ],
      boundaries: [
        "No download or acquisition logic is implemented in this entry layer.",
        "Current raw ingestion expects already-exported JSON / JSONL / CSV / XLSX tables, not direct HTTP or FTP acquisition connectors.",
        "No artifact training or replay evaluation runs from this entry layer."
      ]
    },
    results: {
      wroteOutputs: false,
      canonicalCount: 0,
      sampleCount: 0,
      seriesPointCount: 0,
      mapping: createEmptyMappingSummary(),
      join: createEmptyJoinSummary(),
      quality: {
        series: createEmptyQualityCounts(),
        samples: createEmptyQualityCounts(),
        profile: createEmptyQualityCounts()
      }
    },
    nextHandoff: [
      ...definition.nextHandoff,
      "Bind actual file-family joins and metadata backfill for the selected pack.",
      "Replace placeholder identities with real regionCode / slopeCode / stationCode anchors when raw metadata is available."
    ]
  };
}

function toPlaceholderScopeKey(taskKey: Phase1TaskKey): string {
  return `${taskKey.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-PLACEHOLDER`;
}

function buildIdentity(
  taskKey: Phase1TaskKey,
  pack: RegionalDatasetPack | null,
  summary: Phase1Summary,
  rawRows: readonly JsonObject[] = []
): CanonicalBusinessIdentity {
  const scopeType = summary.inputs.identityHint.scopeType as CanonicalBusinessIdentity["scopeType"];
  const regionCode =
    summary.inputs.identityHint.regionCode ??
    pack?.regionCode ??
    inferSingleIdentityValue(rawRows, REGION_IDENTITY_FIELD_CANDIDATES);
  const slopeCode =
    summary.inputs.identityHint.slopeCode ??
    inferSingleIdentityValue(rawRows, SLOPE_IDENTITY_FIELD_CANDIDATES);
  const stationCode =
    summary.inputs.identityHint.stationCode ??
    inferSingleIdentityValue(rawRows, STATION_IDENTITY_FIELD_CANDIDATES);
  const scopeKey =
    (scopeType === "station" ? stationCode : null) ??
    (scopeType === "slope" ? slopeCode : null) ??
    regionCode ??
    toPlaceholderScopeKey(taskKey);

  return {
    scopeType,
    scopeKey,
    ...(regionCode ? { regionCode } : {}),
    ...(slopeCode ? { slopeCode } : {}),
    ...(stationCode ? { stationCode } : {})
  };
}

function createSkeletonQualityFlags(taskKey: Phase1TaskKey): QualityFlag[] {
  return [
    {
      code: "skeleton_only",
      severity: "info",
      message: `Phase-1 ${taskKey} output currently uses placeholder lineage and zero raw rows.`
    }
  ];
}

function createLoadedQualityFlags(taskKey: Phase1TaskKey, rowCount: number): QualityFlag[] {
  return [
    {
      code: "phase1_raw_rows_loaded",
      severity: "info",
      message: `Phase-1 ${taskKey} loaded ${String(rowCount)} normalized raw rows.`
    }
  ];
}

function toQualityCounts(result: QualityGateResult): QualityCounts {
  return {
    errors: result.errors.length,
    warnings: result.warnings.length
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeJsonContainer(value: unknown): { rows: JsonObject[]; familyKey?: string } {
  if (Array.isArray(value)) {
    return {
      rows: value.filter(isJsonObject)
    };
  }

  if (!isJsonObject(value)) {
    return {
      rows: []
    };
  }

  const familyKey =
    typeof value.familyKey === "string"
      ? value.familyKey
      : typeof value.family === "string"
        ? value.family
        : undefined;

  for (const key of JSON_CONTAINER_KEYS) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return {
        rows: candidate.filter(isJsonObject),
        ...(familyKey ? { familyKey } : {})
      };
    }
  }

  return {
    rows: [value],
    ...(familyKey ? { familyKey } : {})
  };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      const nextCharacter = line[index + 1];
      if (inQuotes && nextCharacter === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsvContent(content: string): JsonObject[] {
  const lines = content
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]!);
  const rows: JsonObject[] = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row: JsonObject = {};

    headers.forEach((header, index) => {
      if (header.length === 0) {
        return;
      }

      row[header] = values[index] ?? "";
    });

    rows.push(row);
  }

  return rows;
}

function sanitizeTabularRow(row: JsonObject): JsonObject {
  const sanitized: JsonObject = {};

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.trim();
    if (normalizedKey.length === 0 || normalizedKey.startsWith("__EMPTY")) {
      continue;
    }

    sanitized[normalizedKey] = value;
  }

  return sanitized;
}

function parseWorkbookContent(filePath: string): RawLoadFileEntry[] {
  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    dense: false
  });
  const extension = path.extname(filePath).toLowerCase();
  const entries: RawLoadFileEntry[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      continue;
    }

    const rows = XLSX.utils
      .sheet_to_json<JsonObject>(worksheet, {
        defval: "",
        raw: false,
        dateNF: "yyyy-mm-dd hh:mm:ss"
      })
      .map((row) => sanitizeTabularRow(row))
      .filter((row) => Object.keys(row).length > 0);

    if (rows.length === 0) {
      continue;
    }

    entries.push({
      filePath: `${filePath}#${sheetName}`,
      fileFormat: extension,
      rows,
      ...(sheetName.trim().length > 0 ? { familyKey: sheetName.trim() } : {})
    });
  }

  return entries;
}

async function collectSupportedInputFiles(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        return collectSupportedInputFiles(entryPath);
      }

      if (entry.isFile() && SUPPORTED_RAW_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        return [entryPath];
      }

      return [];
    })
  );

  return nestedFiles
    .flat()
    .sort((left, right) => left.localeCompare(right));
}

async function loadRowsFromFile(filePath: string): Promise<RawLoadFileEntry[]> {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".json": {
      const content = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(content) as unknown;
      const normalized = normalizeJsonContainer(parsed);
      return [
        {
          filePath,
          fileFormat: extension,
          rows: normalized.rows,
          ...(normalized.familyKey ? { familyKey: normalized.familyKey } : {})
        }
      ];
    }
    case ".jsonl":
    case ".ndjson": {
      const content = await readFile(filePath, "utf-8");
      const rows: JsonObject[] = [];
      const lines = content
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      for (const line of lines) {
        const parsed = JSON.parse(line) as unknown;
        if (isJsonObject(parsed)) {
          rows.push(parsed);
        }
      }

      return [
        {
          filePath,
          fileFormat: extension,
          rows
        }
      ];
    }
    case ".csv": {
      const content = await readFile(filePath, "utf-8");
      return [
        {
          filePath,
          fileFormat: extension,
          rows: parseCsvContent(content)
        }
      ];
    }
    case ".xlsx":
    case ".xls":
      return parseWorkbookContent(filePath);
    default:
      return [
        {
          filePath,
          fileFormat: extension,
          rows: []
        }
      ];
  }
}

async function loadRawRows(rawRoot: string): Promise<RawLoadResult> {
  let rawStats: Awaited<ReturnType<typeof stat>> | null = null;

  try {
    rawStats = await stat(rawRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (!rawStats) {
    return {
      ...createEmptyRawLoadSummary(),
      mode: "missing",
      rows: [],
      files: []
    };
  }

  const inputFiles = rawStats.isDirectory()
    ? await collectSupportedInputFiles(rawRoot)
    : SUPPORTED_RAW_EXTENSIONS.has(path.extname(rawRoot).toLowerCase())
      ? [rawRoot]
      : [];

  const loadedFiles = await Promise.all(inputFiles.map((filePath) => loadRowsFromFile(filePath)));
  const files = loadedFiles.flat();
  const rows = files.flatMap((file) => file.rows);
  const fileFormats = [...new Set(files.map((file) => file.fileFormat))];

  return {
    mode: rows.length > 0 ? "loaded" : "missing",
    inputFiles,
    fileFormats,
    rowCount: rows.length,
    rows,
    files
  };
}

async function resolveTaskRawRoot(taskKey: Phase1TaskKey, rawRoot: string): Promise<string> {
  let rawStats: Awaited<ReturnType<typeof stat>> | null = null;

  try {
    rawStats = await stat(rawRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (!rawStats?.isDirectory()) {
    return rawRoot;
  }

  for (const hint of TASK_RAW_DIR_HINTS[taskKey]) {
    const hintedPath = path.join(rawRoot, hint);
    try {
      const hintedStats = await stat(hintedPath);
      if (hintedStats.isDirectory() || hintedStats.isFile()) {
        return hintedPath;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  const rootEntries = await readdir(rawRoot, { withFileTypes: true });
  const hasDirectSupportedFiles = rootEntries.some(
    (entry) => entry.isFile() && SUPPORTED_RAW_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
  );

  if (hasDirectSupportedFiles) {
    return rawRoot;
  }

  return path.join(rawRoot, TASK_RAW_DIR_HINTS[taskKey][0] ?? taskKey);
}

function resolvePrimarySourcePath(rawLoad: RawLoadResult, fallbackPath: string): string {
  if (rawLoad.inputFiles.length === 1) {
    return rawLoad.inputFiles[0]!;
  }

  return fallbackPath;
}

function mappingFromResolution(
  resolution: ResolvedStationMultivariateMapping | null
): MappingSummary {
  if (!resolution) {
    return createEmptyMappingSummary();
  }

  return {
    timestampField: resolution.timestampField,
    matchedFieldMap: resolution.matchedFieldMap,
    unmatchedCanonicalFields: resolution.unmatchedCanonicalFields,
    availableFields: resolution.availableFields
  };
}

function joinSummaryFromResult(result: {
  summary: {
    mode: JoinSummary["mode"];
    foundFamilies: string[];
    baseFamily: string | null;
    inputRowCount: number;
    outputRowCount: number;
    matchedOverlays: number;
    unmatchedOverlayRows: number;
    metadataFamilies: string[];
    deferredFamilies: string[];
    passthroughFamilies: string[];
    familyBreakdown: JoinFamilyBreakdown[];
  };
}): JoinSummary {
  return {
    mode: result.summary.mode,
    foundFamilies: result.summary.foundFamilies,
    baseFamily: result.summary.baseFamily,
    inputRowCount: result.summary.inputRowCount,
    outputRowCount: result.summary.outputRowCount,
    matchedOverlays: result.summary.matchedOverlays,
    unmatchedOverlayRows: result.summary.unmatchedOverlayRows,
    metadataFamilies: result.summary.metadataFamilies,
    deferredFamilies: result.summary.deferredFamilies,
    passthroughFamilies: result.summary.passthroughFamilies,
    familyBreakdown: result.summary.familyBreakdown
  };
}

function prepareStationRows(
  taskKey: StationPhase1TaskKey,
  rawLoad: RawLoadResult
): {
  rows: JsonObject[];
  join: JoinSummary;
} {
  if (rawLoad.files.length === 0) {
    return {
      rows: rawLoad.rows,
      join: createEmptyJoinSummary()
    };
  }

  const preparedFiles: NormalizedRawFamilyFile[] = rawLoad.files.map((file) => ({
    filePath: file.filePath,
    rows: file.rows,
    ...(file.familyKey ? { familyKey: file.familyKey } : {})
  }));

  switch (taskKey) {
    case "threegorges": {
      const joined = joinThreeGorgesNormalizedFamilyRows(preparedFiles);
      return {
        rows: joined.rows,
        join: joinSummaryFromResult(joined)
      };
    }
    case "badong": {
      const joined = joinBadongNormalizedFamilyRows(preparedFiles);
      return {
        rows: joined.rows,
        join: joinSummaryFromResult(joined)
      };
    }
  }
}

function buildExecutedSummary(
  summary: Phase1Summary,
  options: {
    rawLoad: RawLoadResult;
    skeletonOnly: boolean;
    sampleCount: number;
    seriesPointCount: number;
    mapping?: ResolvedStationMultivariateMapping | null;
    join?: JoinSummary;
    quality?: {
      series: QualityGateResult;
      samples: QualityGateResult;
      profile: QualityGateResult;
    };
  }
): Phase1Summary {
  return {
    ...summary,
    execution: {
      ...summary.execution,
      skeletonOnly: options.skeletonOnly,
      rawLoad: {
        mode: options.rawLoad.mode,
        inputFiles: options.rawLoad.inputFiles,
        fileFormats: options.rawLoad.fileFormats,
        rowCount: options.rawLoad.rowCount
      }
    },
    results: {
      wroteOutputs: true,
      canonicalCount: 1,
      sampleCount: options.sampleCount,
      seriesPointCount: options.seriesPointCount,
      mapping: mappingFromResolution(options.mapping ?? null),
      join: options.join ?? createEmptyJoinSummary(),
      quality: options.quality
        ? {
            series: toQualityCounts(options.quality.series),
            samples: toQualityCounts(options.quality.samples),
            profile: toQualityCounts(options.quality.profile)
          }
        : {
            series: createEmptyQualityCounts(),
            samples: createEmptyQualityCounts(),
            profile: createEmptyQualityCounts()
          }
    }
  };
}

function buildStationLabelPolicies(_taskKey: StationPhase1TaskKey): SampleLabelPolicy[] {
  return [
    {
      key: "warningHitLabel",
      valueType: "boolean",
      fieldCandidates: DEFAULT_WARNING_LABEL_FIELD_CANDIDATES
    },
    {
      key: "riskLevelLabel",
      valueType: "string",
      fieldCandidates: DEFAULT_RISK_LEVEL_LABEL_FIELD_CANDIDATES
    },
    {
      key: "displacementLabel",
      valueType: "number",
      fieldCandidates: DEFAULT_DISPLACEMENT_LABEL_FIELD_CANDIDATES
    }
  ];
}

async function executeStationTask(
  taskKey: StationPhase1TaskKey,
  pack: RegionalDatasetPack,
  summary: Phase1Summary
): Promise<Phase1Summary> {
  const datasetKey = summary.task.datasetKey;
  const windowSpec = summary.inputs.windowSpec[0] ?? "6h";
  const taskRawRoot = await resolveTaskRawRoot(taskKey, summary.inputs.rawRoot);
  const rawLoad = await loadRawRows(taskRawRoot);
  const preparedRows = prepareStationRows(taskKey, rawLoad);
  const identity = buildIdentity(taskKey, pack, summary, preparedRows.rows);

  let resolution: ResolvedStationMultivariateMapping | null = null;
  const series =
    preparedRows.rows.length > 0
      ? (() => {
          const result = buildPackCandidateMappedStationSeries({
            datasetKey,
            identity,
            rawRows: preparedRows.rows,
            pack,
            timezone: "Asia/Shanghai",
            rawSourcePath: resolvePrimarySourcePath(rawLoad, taskRawRoot)
          });
          resolution = result.resolution;
          return result.series;
        })()
      : buildCanonicalStationMultivariateSeries({
          datasetKey,
          identity,
          rawRows: [],
          fieldMap: {},
          timeConfig: {
            timestampField: pack.phase1Template?.timestampFieldCandidates[0] ?? "event_ts",
            timezone: "Asia/Shanghai"
          },
          rawSourcePath: taskRawRoot
        });

  if (!resolution && pack.phase1Template) {
    resolution = {
      timestampField: pack.phase1Template.timestampFieldCandidates[0] ?? "event_ts",
      fieldMap: {},
      matchedFieldMap: {},
      unmatchedCanonicalFields: Object.keys(pack.phase1Template.fieldMapCandidates),
      availableFields: []
    };
  }

  const samples = createCanonicalTrainingSamples({
    series,
    windowSpec,
    horizonSpec: summary.inputs.horizonSpec[0],
    labelPolicies: buildStationLabelPolicies(taskKey)
  });
  const profile = buildRegionProfile({
    identity,
    hazardType: "landslide",
    profileVersion: preparedRows.rows.length > 0 ? "phase1-ingestion" : "phase1-skeleton",
    requiredSensors: pack.requiredSensors,
    sourceDatasets: [datasetKey],
    sourceRegionKeys: [identity.scopeKey],
    qualityFlags:
      preparedRows.rows.length > 0
        ? createLoadedQualityFlags(taskKey, rawLoad.rowCount)
        : createSkeletonQualityFlags(taskKey),
    properties: {
      packKey: pack.packKey,
      displayName: pack.displayName,
      phase1Template: pack.phase1Template,
      rawLoad: {
        inputFiles: rawLoad.inputFiles,
        fileFormats: rawLoad.fileFormats,
        rowCount: rawLoad.rowCount
      },
      join: preparedRows.join,
      mapping: mappingFromResolution(resolution)
    }
  });

  const seriesQuality = evaluateSeriesQuality(series);
  const samplesQuality = evaluateTrainingSamples(samples);
  const profileQuality = evaluateRegionProfileQuality(profile);

  await writeJsonFile(summary.routes.canonicalOutput, { series, profile });
  if (summary.routes.sampleOutput) {
    await writeJsonLines(summary.routes.sampleOutput, samples);
  }

  return buildExecutedSummary(summary, {
    rawLoad,
    skeletonOnly: preparedRows.rows.length === 0,
    sampleCount: samples.length,
    seriesPointCount: series.points.length,
    mapping: resolution,
    join: preparedRows.join,
    quality: {
      series: seriesQuality,
      samples: samplesQuality,
      profile: profileQuality
    }
  });
}

async function executeTask(taskKey: Phase1TaskKey, summary: Phase1Summary): Promise<Phase1Summary> {
  const datasetKey = summary.task.datasetKey;

  switch (taskKey) {
    case "threegorges":
      return executeStationTask(taskKey, THREEGORGES_PACK, summary);
    case "badong":
      return executeStationTask(taskKey, BADONG_HUANGTUPO_PACK, summary);
    case "event-inventory": {
      const taskRawRoot = await resolveTaskRawRoot(taskKey, summary.inputs.rawRoot);
      const rawLoad = await loadRawRows(taskRawRoot);
      const inventory = buildCanonicalEventInventory({
        datasetKey,
        rawRows: rawLoad.rows,
        fieldMap: {},
        rawSourcePath: resolvePrimarySourcePath(rawLoad, taskRawRoot),
        regionCodeField: "region_code",
        eventTsField: "event_ts",
        eventIdField: "event_id",
        hazardTypeField: "hazard_type"
      });

      await writeJsonFile(summary.routes.canonicalOutput, inventory);
      return buildExecutedSummary(summary, {
        rawLoad,
        skeletonOnly: rawLoad.rows.length === 0,
        sampleCount: 0,
        seriesPointCount: inventory.records.length,
        join: createEmptyJoinSummary()
      });
    }
    case "region-profile": {
      const identity = buildIdentity(taskKey, null, summary);
      const taskRawRoot = await resolveTaskRawRoot(taskKey, summary.inputs.rawRoot);
      const rawLoad = await loadRawRows(taskRawRoot);
      const profile = buildRegionProfile({
        identity,
        hazardType: "landslide",
        profileVersion: rawLoad.rows.length > 0 ? "phase1-metadata-pending" : "phase1-skeleton",
        requiredSensors: [],
        sourceDatasets: [datasetKey],
        sourceRegionKeys: [identity.scopeKey],
        qualityFlags:
          rawLoad.rows.length > 0
            ? createLoadedQualityFlags(taskKey, rawLoad.rowCount)
            : createSkeletonQualityFlags(taskKey),
        properties:
          rawLoad.rows.length > 0
            ? {
                rawLoad: {
                  inputFiles: rawLoad.inputFiles,
                  fileFormats: rawLoad.fileFormats,
                  rowCount: rawLoad.rowCount
                }
              }
            : undefined
      });

      const profileQuality = evaluateRegionProfileQuality(profile);
      await writeJsonFile(summary.routes.canonicalOutput, profile);
      return buildExecutedSummary(summary, {
        rawLoad,
        skeletonOnly: rawLoad.rows.length === 0,
        sampleCount: 0,
        seriesPointCount: rawLoad.rowCount,
        join: createEmptyJoinSummary(),
        quality: {
          series: { ok: true, errors: [], warnings: [] },
          samples: { ok: true, errors: [], warnings: [] },
          profile: profileQuality
        }
      });
    }
  }
}

export function reportFatalError(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}

export async function runPhase1Cli(
  defaultTask?: Phase1TaskKey,
  caller = process.env[ENV_CALLER_KEY] ?? "phase1-run.ts"
): Promise<void> {
  const sourceArgv = resolveEffectiveArgv(process.argv.slice(2));
  const parsed = parseArgs(sourceArgv);

  if (parsed.help) {
    console.log(buildHelpText(defaultTask));
    return;
  }

  if (parsed.extraPositionals.length > 0) {
    throw new Error(`Unexpected positional arguments: ${parsed.extraPositionals.join(" ")}`);
  }

  const repoRoot = resolveRepoRoot(__dirname);
  const taskKey = resolveTaskKey(parsed.task, defaultTask);
  const summary = buildSummary(taskKey, parsed, caller, sourceArgv, repoRoot);
  if (parsed.summaryOnly || parsed.dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const executed = await executeTask(taskKey, summary);
  await writeJsonFile(executed.routes.reportOutput, executed);
  console.log(JSON.stringify(executed, null, 2));
}

if (typeof require !== "undefined" && require.main === module) {
  void runPhase1Cli().catch(reportFatalError);
}
