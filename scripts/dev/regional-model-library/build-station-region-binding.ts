import path from "node:path";
import { readFile } from "node:fs/promises";
import { writeJsonFile } from "../../../libs/regional-model-library/src";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  datasetMeta?: string;
  profiles?: string;
  outFile?: string;
  reportFile?: string;
  stationId?: string;
  stationCode?: string;
  slopeCode?: string;
  regionCode?: string;
};

type DatasetMeta = {
  id?: string;
  title_cn?: string;
  title_en?: string;
  ds_acq_lon_east?: number;
  ds_acq_lon_west?: number;
  ds_acq_lat_north?: number;
  ds_acq_lat_south?: number;
  ds_acq_place?: string;
};

type RegionProfile = {
  profileKey?: string;
  identity?: {
    regionCode?: string;
  };
  properties?: {
    staticFactors?: {
      landCover?: {
        bboxWgs84?: {
          lonMin?: number;
          lonMax?: number;
          latMin?: number;
          latMax?: number;
        };
      };
    };
  };
};

type BindingEntry = {
  stationId?: string;
  stationCode?: string;
  slopeCode?: string;
  regionCode?: string;
  sourceRegionCode: string;
  bindingSource: "dataset-meta-bbox";
  datasetId: string | null;
  datasetTitle: string | null;
  matchMode: "contains-center" | "intersects-bbox" | "nearest-center";
};

type BindingReport = {
  generatedAt: string;
  datasetMetaPath: string;
  profilesPath: string;
  outFile: string;
  reportFile: string;
  datasetId: string | null;
  datasetTitle: string | null;
  datasetPlace: string | null;
  datasetBboxWgs84: {
    lonMin: number;
    lonMax: number;
    latMin: number;
    latMax: number;
  };
  datasetCenterWgs84: {
    lon: number;
    lat: number;
  };
  selectedBinding: BindingEntry;
  candidateMatches: Array<{
    regionCode: string;
    profileKey: string | null;
    matchMode: "contains-center" | "intersects-bbox" | "nearest-center";
    distanceScore: number;
  }>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    switch (token) {
      case "--dataset-meta":
        parsed.datasetMeta = argv[index + 1];
        index += 1;
        break;
      case "--profiles":
        parsed.profiles = argv[index + 1];
        index += 1;
        break;
      case "--out-file":
        parsed.outFile = argv[index + 1];
        index += 1;
        break;
      case "--report-file":
        parsed.reportFile = argv[index + 1];
        index += 1;
        break;
      case "--station-id":
        parsed.stationId = argv[index + 1];
        index += 1;
        break;
      case "--station-code":
        parsed.stationCode = argv[index + 1];
        index += 1;
        break;
      case "--slope-code":
        parsed.slopeCode = argv[index + 1];
        index += 1;
        break;
      case "--region-code":
        parsed.regionCode = argv[index + 1];
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function requireArg(value: string | undefined, label: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required argument: ${label}`);
  }
  return value.trim();
}

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as T;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveDatasetBounds(meta: DatasetMeta) {
  const lonEast = toNumber(meta.ds_acq_lon_east);
  const lonWest = toNumber(meta.ds_acq_lon_west);
  const latNorth = toNumber(meta.ds_acq_lat_north);
  const latSouth = toNumber(meta.ds_acq_lat_south);

  if (lonEast === null || lonWest === null || latNorth === null || latSouth === null) {
    throw new Error("Dataset metadata is missing WGS84 bounding coordinates.");
  }

  const lonMin = Math.min(lonEast, lonWest);
  const lonMax = Math.max(lonEast, lonWest);
  const latMin = Math.min(latNorth, latSouth);
  const latMax = Math.max(latNorth, latSouth);

  return {
    lonMin,
    lonMax,
    latMin,
    latMax,
    centerLon: (lonMin + lonMax) / 2,
    centerLat: (latMin + latMax) / 2
  };
}

function readProfileBounds(profile: RegionProfile) {
  const bbox = profile.properties?.staticFactors?.landCover?.bboxWgs84;
  const lonMin = toNumber(bbox?.lonMin);
  const lonMax = toNumber(bbox?.lonMax);
  const latMin = toNumber(bbox?.latMin);
  const latMax = toNumber(bbox?.latMax);
  if (lonMin === null || lonMax === null || latMin === null || latMax === null) {
    return null;
  }

  return { lonMin, lonMax, latMin, latMax };
}

function containsCenter(
  profileBounds: { lonMin: number; lonMax: number; latMin: number; latMax: number },
  centerLon: number,
  centerLat: number
): boolean {
  return (
    centerLon >= profileBounds.lonMin &&
    centerLon <= profileBounds.lonMax &&
    centerLat >= profileBounds.latMin &&
    centerLat <= profileBounds.latMax
  );
}

function intersectsBounds(
  left: { lonMin: number; lonMax: number; latMin: number; latMax: number },
  right: { lonMin: number; lonMax: number; latMin: number; latMax: number }
): boolean {
  return !(
    left.lonMax < right.lonMin ||
    left.lonMin > right.lonMax ||
    left.latMax < right.latMin ||
    left.latMin > right.latMax
  );
}

function distanceToCenter(
  bounds: { lonMin: number; lonMax: number; latMin: number; latMax: number },
  centerLon: number,
  centerLat: number
): number {
  const boundsCenterLon = (bounds.lonMin + bounds.lonMax) / 2;
  const boundsCenterLat = (bounds.latMin + bounds.latMax) / 2;
  const dx = boundsCenterLon - centerLon;
  const dy = boundsCenterLat - centerLat;
  return Math.sqrt(dx * dx + dy * dy);
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const datasetMetaPath = path.resolve(repoRoot, requireArg(parsed.datasetMeta, "--dataset-meta"));
  const profilesPath = path.resolve(
    repoRoot,
    parsed.profiles ??
      ".tmp/regional-model-library/raw/CLCD-1985-2025/extracts/region-profiles/clcd-region-profiles.json"
  );
  const outFile = path.resolve(
    repoRoot,
    parsed.outFile ??
      ".tmp/regional-model-library/out/bindings/station-region-binding.json"
  );
  const reportFile = path.resolve(
    repoRoot,
    parsed.reportFile ?? outFile.replace(/\.json$/iu, ".report.json")
  );

  const datasetMeta = await readJson<DatasetMeta>(datasetMetaPath);
  const profiles = await readJson<RegionProfile[]>(profilesPath);
  const datasetBounds = resolveDatasetBounds(datasetMeta);

  const candidates = profiles
    .map((profile) => {
      const regionCode = profile.identity?.regionCode?.trim() ?? "";
      const bounds = readProfileBounds(profile);
      if (!regionCode || !bounds) {
        return null;
      }

      const contains = containsCenter(bounds, datasetBounds.centerLon, datasetBounds.centerLat);
      const intersects = intersectsBounds(bounds, datasetBounds);
      const distanceScore = distanceToCenter(bounds, datasetBounds.centerLon, datasetBounds.centerLat);
      const matchMode = contains ? "contains-center" : intersects ? "intersects-bbox" : "nearest-center";

      return {
        regionCode,
        profileKey: profile.profileKey?.trim() ?? null,
        matchMode,
        distanceScore
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => {
      const priority = (value: string) => {
        if (value === "contains-center") return 0;
        if (value === "intersects-bbox") return 1;
        return 2;
      };
      const leftPriority = priority(left.matchMode);
      const rightPriority = priority(right.matchMode);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      if (left.distanceScore !== right.distanceScore) {
        return left.distanceScore - right.distanceScore;
      }
      return left.regionCode.localeCompare(right.regionCode);
    });

  const selected = candidates[0];
  if (!selected) {
    throw new Error("No CLCD region profiles could be evaluated.");
  }

  const binding: BindingEntry = {
    ...(parsed.stationId ? { stationId: parsed.stationId } : {}),
    ...(parsed.stationCode ? { stationCode: parsed.stationCode } : {}),
    ...(parsed.slopeCode ? { slopeCode: parsed.slopeCode } : {}),
    ...(parsed.regionCode ? { regionCode: parsed.regionCode } : {}),
    sourceRegionCode: selected.regionCode,
    bindingSource: "dataset-meta-bbox",
    datasetId: datasetMeta.id?.trim() ?? null,
    datasetTitle: datasetMeta.title_cn?.trim() ?? datasetMeta.title_en?.trim() ?? null,
    matchMode: selected.matchMode
  };

  const report: BindingReport = {
    generatedAt: new Date().toISOString(),
    datasetMetaPath,
    profilesPath,
    outFile,
    reportFile,
    datasetId: binding.datasetId,
    datasetTitle: binding.datasetTitle,
    datasetPlace: datasetMeta.ds_acq_place?.trim() ?? null,
    datasetBboxWgs84: {
      lonMin: datasetBounds.lonMin,
      lonMax: datasetBounds.lonMax,
      latMin: datasetBounds.latMin,
      latMax: datasetBounds.latMax
    },
    datasetCenterWgs84: {
      lon: datasetBounds.centerLon,
      lat: datasetBounds.centerLat
    },
    selectedBinding: binding,
    candidateMatches: candidates
  };

  await writeJsonFile(outFile, [binding]);
  await writeJsonFile(reportFile, report);
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
