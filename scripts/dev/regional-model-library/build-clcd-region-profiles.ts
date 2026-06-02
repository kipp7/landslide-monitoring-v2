import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { fromFile } from "geotiff";
import proj4 from "proj4";
import {
  buildRegionProfile,
  evaluateRegionProfileQuality,
  readJsonFile,
  writeJsonFile,
  type CanonicalBusinessIdentity,
  type QualityFlag,
  type RegionProfile
} from "../../../libs/regional-model-library/src";
import { resolveRepoRoot } from "./intake-utils";

const CLCD_ALBERS_WKT =
  "+proj=aea +lat_1=25 +lat_2=47 +lat_0=0 +lon_0=105 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs";

type ParsedArgs = {
  regionSeedCsv?: string;
  provinceIndex?: string;
  classificationMap?: string;
  outRoot?: string;
  datasetKey: string;
  sourceYear: string;
  strict: boolean;
  summaryOnly: boolean;
};

type RegionSeedRow = {
  region_code: string;
  lon_min: string;
  lat_min: string;
  lon_max: string;
  lat_max: string;
  scope_type?: string;
  scope_key?: string;
  station_code?: string;
  slope_code?: string;
  province?: string;
};

type ClassificationMapEntry = {
  id: number;
  className: string;
  colorRgb?: number[];
};

type ProvinceIndexRow = {
  requestedProvince: string;
  resolvedProvince: string;
  entryName: string;
  relativeOutFile: string;
  bytesWritten: number;
  md5: string;
};

type RasterCatalogEntry = ProvinceIndexRow & {
  absolutePath: string;
  bbox: [number, number, number, number];
  width: number;
  height: number;
  originX: number;
  originY: number;
  resolutionX: number;
  resolutionY: number;
  image: Awaited<ReturnType<Awaited<ReturnType<typeof fromFile>>["getImage"]>>;
};

type ProjectedBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type PixelWindow = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type ClassDistributionRow = {
  classId: number;
  className: string;
  pixelCount: number;
  coverageRatio: number;
  colorRgb?: number[];
};

type RegionBuildResult = {
  regionCode: string;
  scopeKey: string;
  status:
    | "extracted"
    | "skipped_invalid_seed"
    | "blocked_missing_raster"
    | "blocked_empty_window"
    | "failed_backend_execution";
  resolvedProvince: string | null;
  sourceRaster: string | null;
  pixelWindow: PixelWindow | null;
  validPixelCount: number;
  nodataPixelCount: number;
  dominantClassId: number | null;
  dominantClassName: string | null;
  profilePath: string | null;
  issues: string[];
  quality: {
    ok: boolean;
    errorCount: number;
    warningCount: number;
  };
};

type BuildReport = {
  generatedAt: string;
  inputs: {
    datasetKey: string;
    sourceYear: string;
    regionSeedCsv: string;
    provinceIndex: string;
    classificationMap: string;
    outRoot: string;
  };
  outputs: {
    profilesFile: string;
    reportFile: string;
  };
  resultCount: number;
  extractedCount: number;
  blockedCount: number;
  failedCount: number;
  skippedCount: number;
  nextActions: string[];
  results: RegionBuildResult[];
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    datasetKey: "CLCD-1985-2025",
    sourceYear: "2025",
    strict: false,
    summaryOnly: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--region-seed-csv":
        parsed.regionSeedCsv = argv[index + 1];
        index += 1;
        break;
      case "--province-index":
        parsed.provinceIndex = argv[index + 1];
        index += 1;
        break;
      case "--classification-map":
        parsed.classificationMap = argv[index + 1];
        index += 1;
        break;
      case "--out-root":
        parsed.outRoot = argv[index + 1];
        index += 1;
        break;
      case "--dataset-key":
        parsed.datasetKey = argv[index + 1] ?? parsed.datasetKey;
        index += 1;
        break;
      case "--source-year":
        parsed.sourceYear = argv[index + 1] ?? parsed.sourceYear;
        index += 1;
        break;
      case "--strict":
        parsed.strict = true;
        break;
      case "--summary-only":
        parsed.summaryOnly = true;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      const nextCharacter = line[index + 1];
      if (inQuotes && nextCharacter === '"') {
        current += '"';
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

async function readCsvRows(filePath: string): Promise<Record<string, string>[]> {
  const content = await readFile(filePath, "utf-8");
  const lines = content
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function normalizeProvinceToken(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function sanitizeFileSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\s]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function toFiniteNumber(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function projectBounds(seed: RegionSeedRow): ProjectedBounds | null {
  const lonMin = toFiniteNumber(seed.lon_min);
  const latMin = toFiniteNumber(seed.lat_min);
  const lonMax = toFiniteNumber(seed.lon_max);
  const latMax = toFiniteNumber(seed.lat_max);

  if (
    lonMin === null ||
    latMin === null ||
    lonMax === null ||
    latMax === null ||
    lonMin >= lonMax ||
    latMin >= latMax
  ) {
    return null;
  }

  const corners = [
    [lonMin, latMin],
    [lonMin, latMax],
    [lonMax, latMin],
    [lonMax, latMax]
  ].map((corner) => proj4("EPSG:4326", CLCD_ALBERS_WKT, corner));

  const xs = corners.map((corner) => corner[0]);
  const ys = corners.map((corner) => corner[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function intersectArea(left: ProjectedBounds, right: ProjectedBounds): number {
  const width = Math.max(0, Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX));
  const height = Math.max(0, Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY));
  return width * height;
}

function resolvePixelWindow(
  projectedBounds: ProjectedBounds,
  raster: RasterCatalogEntry
): PixelWindow | null {
  const left = Math.max(
    0,
    Math.floor((projectedBounds.minX - raster.originX) / raster.resolutionX)
  );
  const right = Math.min(
    raster.width,
    Math.ceil((projectedBounds.maxX - raster.originX) / raster.resolutionX)
  );
  const top = Math.max(
    0,
    Math.floor((raster.originY - projectedBounds.maxY) / Math.abs(raster.resolutionY))
  );
  const bottom = Math.min(
    raster.height,
    Math.ceil((raster.originY - projectedBounds.minY) / Math.abs(raster.resolutionY))
  );

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

async function buildRasterCatalog(
  repoRoot: string,
  provinceIndex: ProvinceIndexRow[]
): Promise<RasterCatalogEntry[]> {
  const catalog: RasterCatalogEntry[] = [];

  for (const entry of provinceIndex) {
    const absolutePath = path.resolve(
      repoRoot,
      ".tmp/regional-model-library/raw/CLCD-1985-2025/original/land-cover-grid",
      entry.relativeOutFile
    );
    const tiff = await fromFile(absolutePath);
    const image = await tiff.getImage();
    const boundingBox = image.getBoundingBox();
    const origin = image.getOrigin();
    const resolution = image.getResolution();

    catalog.push({
      ...entry,
      absolutePath,
      bbox: [
        Number(boundingBox[0]),
        Number(boundingBox[1]),
        Number(boundingBox[2]),
        Number(boundingBox[3])
      ],
      width: image.getWidth(),
      height: image.getHeight(),
      originX: Number(origin[0]),
      originY: Number(origin[1]),
      resolutionX: Number(resolution[0]),
      resolutionY: Number(resolution[1]),
      image
    });
  }

  return catalog;
}

function resolveRasterForSeed(
  seed: RegionSeedRow,
  projectedBounds: ProjectedBounds,
  catalog: readonly RasterCatalogEntry[]
): RasterCatalogEntry | null {
  const provinceToken = normalizeProvinceToken(seed.province);
  const candidates =
    provinceToken.length > 0
      ? catalog.filter((entry) => normalizeProvinceToken(entry.resolvedProvince) === provinceToken)
      : [...catalog];

  const ranked = candidates
    .map((entry) => ({
      entry,
      overlap: intersectArea(projectedBounds, {
        minX: entry.bbox[0],
        minY: entry.bbox[1],
        maxX: entry.bbox[2],
        maxY: entry.bbox[3]
      })
    }))
    .filter((candidate) => candidate.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap);

  return ranked[0]?.entry ?? null;
}

function buildIdentity(seed: RegionSeedRow): CanonicalBusinessIdentity {
  const scopeType =
    seed.scope_type === "station" ||
    seed.scope_type === "slope" ||
    seed.scope_type === "region" ||
    seed.scope_type === "global"
      ? seed.scope_type
      : "region";
  const scopeKey = seed.scope_key?.trim() || seed.region_code.trim();

  const identity: CanonicalBusinessIdentity = {
    scopeType,
    scopeKey,
    regionCode: seed.region_code.trim()
  };

  if (seed.station_code?.trim()) {
    identity.stationCode = seed.station_code.trim();
  }
  if (seed.slope_code?.trim()) {
    identity.slopeCode = seed.slope_code.trim();
  }

  return identity;
}

function buildClassDistribution(
  counts: Map<number, number>,
  classificationLookup: Map<number, ClassificationMapEntry>
): {
  distribution: ClassDistributionRow[];
  validPixelCount: number;
  nodataPixelCount: number;
  totalPixelCount: number;
  dominantClass: ClassDistributionRow | null;
} {
  const totalPixelCount = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  const nodataPixelCount = counts.get(0) ?? 0;
  const validPixelCount = totalPixelCount - nodataPixelCount;

  const distribution = Array.from(counts.entries())
    .filter(([classId]) => classId !== 0)
    .map(([classId, pixelCount]) => {
      const definition = classificationLookup.get(classId);
      return {
        classId,
        className: definition?.className ?? `class-${classId}`,
        pixelCount,
        coverageRatio: validPixelCount > 0 ? pixelCount / validPixelCount : 0,
        ...(definition?.colorRgb ? { colorRgb: definition.colorRgb } : {})
      };
    })
    .sort((left, right) => right.pixelCount - left.pixelCount);

  return {
    distribution,
    validPixelCount,
    nodataPixelCount,
    totalPixelCount,
    dominantClass: distribution[0] ?? null
  };
}

function createProfileFlags(
  summary: ReturnType<typeof buildClassDistribution>,
  seed: RegionSeedRow,
  raster: RasterCatalogEntry
): QualityFlag[] {
  const flags: QualityFlag[] = [
    {
      code: "static_prior_only",
      severity: "info",
      message:
        "This CLCD profile contributes land-cover priors only and does not declare runtime telemetry sensors."
    }
  ];

  if (summary.validPixelCount === 0) {
    flags.push({
      code: "empty_land_cover_window",
      severity: "error",
      message: "The requested CLCD region window produced no valid land-cover pixels."
    });
  }

  if (summary.totalPixelCount > 0 && summary.nodataPixelCount / summary.totalPixelCount > 0.25) {
    flags.push({
      code: "high_nodata_ratio",
      severity: "warning",
      message: "The CLCD extraction window contains a high nodata ratio."
    });
  }

  if (seed.province?.trim()) {
    const normalizedSeedProvince = normalizeProvinceToken(seed.province);
    const normalizedResolvedProvince = normalizeProvinceToken(raster.resolvedProvince);
    if (
      normalizedSeedProvince.length > 0 &&
      normalizedSeedProvince !== normalizedResolvedProvince
    ) {
      flags.push({
        code: "province_hint_mismatch",
        severity: "warning",
        message: `Seed province '${seed.province}' resolved to raster '${raster.resolvedProvince}'.`
      });
    }
  }

  return flags;
}

async function extractCounts(
  raster: RasterCatalogEntry,
  window: PixelWindow
): Promise<Map<number, number>> {
  const values = await raster.image.readRasters({
    window: [window.left, window.top, window.right, window.bottom],
    interleave: true
  });

  const counts = new Map<number, number>();
  for (const value of values as ArrayLike<number>) {
    const classId = Number(value);
    counts.set(classId, (counts.get(classId) ?? 0) + 1);
  }
  return counts;
}

function buildProfileProperties(input: {
  seed: RegionSeedRow;
  raster: RasterCatalogEntry;
  pixelWindow: PixelWindow;
  projectedBounds: ProjectedBounds;
  sourceYear: string;
  summary: ReturnType<typeof buildClassDistribution>;
}): Record<string, unknown> {
  return {
    staticFactors: {
      landCover: {
        sourceYear: input.sourceYear,
        projection: "China Albers Equal Area (WGS84; lat_1=25, lat_2=47, lon_0=105)",
        dominantClass: input.summary.dominantClass,
        classDistribution: input.summary.distribution,
        validPixelCount: input.summary.validPixelCount,
        nodataPixelCount: input.summary.nodataPixelCount,
        totalPixelCount: input.summary.totalPixelCount,
        bboxWgs84: {
          lonMin: Number(input.seed.lon_min),
          latMin: Number(input.seed.lat_min),
          lonMax: Number(input.seed.lon_max),
          latMax: Number(input.seed.lat_max)
        },
        bboxProjectedMeters: input.projectedBounds,
        pixelWindow: input.pixelWindow,
        sourceRaster: {
          requestedProvince: input.raster.requestedProvince,
          resolvedProvince: input.raster.resolvedProvince,
          relativeOutFile: input.raster.relativeOutFile,
          entryName: input.raster.entryName,
          md5: input.raster.md5,
          bytesWritten: input.raster.bytesWritten
        }
      }
    }
  };
}

function buildNextActions(report: BuildReport): string[] {
  const actions = new Set<string>();

  if (report.results.some((result) => result.status === "blocked_missing_raster")) {
    actions.add("Expand the CLCD province pack or tighten region bbox seeds so each region overlaps a landed raster.");
  }

  if (report.results.some((result) => result.status === "blocked_empty_window")) {
    actions.add("Shrink invalid bbox windows or correct the region seed coordinates before rebuilding CLCD region profiles.");
  }

  if (report.results.some((result) => result.status === "failed_backend_execution")) {
    actions.add("Inspect the failing TIFF and retry the CLCD extraction after confirming the raster is readable.");
  }

  if (report.results.some((result) => result.quality.warningCount > 0)) {
    actions.add("Review CLCD profile warnings before promoting the derived land-cover priors into matching rules.");
  }

  if (report.extractedCount > 0) {
    actions.add("Feed the extracted CLCD class distributions into RegionProfile-aware matching and static prior experiments.");
  }

  return Array.from(actions);
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));

  const regionSeedCsv = path.resolve(
    repoRoot,
    parsed.regionSeedCsv ?? ".tmp/regional-model-library/raw/CLCD-1985-2025/extracts/region-seed.csv"
  );
  const provinceIndex = path.resolve(
    repoRoot,
    parsed.provinceIndex ?? ".tmp/regional-model-library/raw/CLCD-1985-2025/normalized/clcd-2025-province-index.json"
  );
  const classificationMap = path.resolve(
    repoRoot,
    parsed.classificationMap ??
      ".tmp/regional-model-library/raw/CLCD-1985-2025/normalized/clcd-classification-map.json"
  );
  const outRoot = path.resolve(
    repoRoot,
    parsed.outRoot ?? ".tmp/regional-model-library/raw/CLCD-1985-2025/extracts/region-profiles"
  );
  const profilesFile = path.join(outRoot, "clcd-region-profiles.json");
  const reportFile = path.join(outRoot, "clcd-region-profile.report.json");

  if (parsed.summaryOnly) {
    console.log(
      JSON.stringify(
        {
          regionSeedCsv,
          provinceIndex,
          classificationMap,
          outRoot,
          datasetKey: parsed.datasetKey,
          sourceYear: parsed.sourceYear
        },
        null,
        2
      )
    );
    return;
  }

  const seedRows = (await readCsvRows(regionSeedCsv)) as RegionSeedRow[];
  const classDefinitions = await readJsonFile<ClassificationMapEntry[]>(classificationMap);
  const provinceIndexRows = await readJsonFile<ProvinceIndexRow[]>(provinceIndex);
  const classificationLookup = new Map(classDefinitions.map((entry) => [entry.id, entry]));
  const catalog = await buildRasterCatalog(repoRoot, provinceIndexRows);

  await mkdir(outRoot, { recursive: true });

  const profiles: RegionProfile[] = [];
  const results: RegionBuildResult[] = [];

  for (const seed of seedRows) {
    const identity = buildIdentity(seed);
    const profilePath = path.join(
      outRoot,
      `${sanitizeFileSegment(identity.scopeKey)}.region-profile.json`
    );
    const result: RegionBuildResult = {
      regionCode: seed.region_code,
      scopeKey: identity.scopeKey,
      status: "skipped_invalid_seed",
      resolvedProvince: null,
      sourceRaster: null,
      pixelWindow: null,
      validPixelCount: 0,
      nodataPixelCount: 0,
      dominantClassId: null,
      dominantClassName: null,
      profilePath: null,
      issues: [],
      quality: {
        ok: true,
        errorCount: 0,
        warningCount: 0
      }
    };

    const projectedBounds = projectBounds(seed);
    if (!projectedBounds) {
      result.status = "skipped_invalid_seed";
      result.issues.push("Seed row is missing a valid lon/lat bbox.");
      results.push(result);
      continue;
    }

    const raster = resolveRasterForSeed(seed, projectedBounds, catalog);
    if (!raster) {
      result.status = "blocked_missing_raster";
      result.issues.push("No landed CLCD raster overlaps the requested bbox.");
      results.push(result);
      continue;
    }

    result.resolvedProvince = raster.resolvedProvince;
    result.sourceRaster = raster.relativeOutFile;

    const pixelWindow = resolvePixelWindow(projectedBounds, raster);
    if (!pixelWindow) {
      result.status = "blocked_empty_window";
      result.issues.push("The projected bbox resolved outside the raster extent.");
      results.push(result);
      continue;
    }

    result.pixelWindow = pixelWindow;

    try {
      const counts = await extractCounts(raster, pixelWindow);
      const distributionSummary = buildClassDistribution(counts, classificationLookup);
      const profile = buildRegionProfile({
        identity,
        hazardType: "landslide",
        profileVersion: `clcd-${parsed.sourceYear}-region-profile-v1`,
        requiredSensors: [],
        sourceDatasets: [parsed.datasetKey],
        sourceRegionKeys: [identity.scopeKey, raster.resolvedProvince],
        qualityFlags: createProfileFlags(distributionSummary, seed, raster),
        properties: buildProfileProperties({
          seed,
          raster,
          pixelWindow,
          projectedBounds,
          sourceYear: parsed.sourceYear,
          summary: distributionSummary
        })
      });

      const quality = evaluateRegionProfileQuality(profile);
      await writeJsonFile(profilePath, profile);
      profiles.push(profile);

      result.status = "extracted";
      result.validPixelCount = distributionSummary.validPixelCount;
      result.nodataPixelCount = distributionSummary.nodataPixelCount;
      result.dominantClassId = distributionSummary.dominantClass?.classId ?? null;
      result.dominantClassName = distributionSummary.dominantClass?.className ?? null;
      result.profilePath = profilePath;
      result.quality = {
        ok: quality.ok,
        errorCount: quality.errors.length,
        warningCount: quality.warnings.length
      };

      results.push(result);
    } catch (error) {
      result.status = "failed_backend_execution";
      result.issues.push(error instanceof Error ? error.message : String(error));
      results.push(result);
    }
  }

  await writeJsonFile(profilesFile, profiles);

  const report: BuildReport = {
    generatedAt: new Date().toISOString(),
    inputs: {
      datasetKey: parsed.datasetKey,
      sourceYear: parsed.sourceYear,
      regionSeedCsv,
      provinceIndex,
      classificationMap,
      outRoot
    },
    outputs: {
      profilesFile,
      reportFile
    },
    resultCount: results.length,
    extractedCount: results.filter((result) => result.status === "extracted").length,
    blockedCount: results.filter(
      (result) =>
        result.status === "blocked_missing_raster" || result.status === "blocked_empty_window"
    ).length,
    failedCount: results.filter((result) => result.status === "failed_backend_execution").length,
    skippedCount: results.filter((result) => result.status === "skipped_invalid_seed").length,
    nextActions: [],
    results
  };
  report.nextActions = buildNextActions(report);

  await writeJsonFile(reportFile, report);
  console.log(JSON.stringify(report, null, 2));

  if (parsed.strict) {
    const hasBlockingStatus = report.results.some(
      (result) => result.status !== "extracted" || !result.quality.ok
    );
    if (hasBlockingStatus) {
      process.exitCode = 1;
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
