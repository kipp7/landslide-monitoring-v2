import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  mode: "by-event" | "by-region" | "both";
  eventCsv?: string;
  regionSeedCsv?: string;
  outRoot?: string;
  windowDays: number[];
  periodType: string;
  periodKey: string;
  aggregation: string;
};

type EventExtractJob = {
  event_id: string;
  region_code: string;
  event_ts: string;
  longitude: string;
  latitude: string;
  window_days: number;
  window_start: string;
  window_end: string;
  status: "ready" | "missing_coordinates" | "invalid_event_ts";
};

type RegionExtractJob = {
  region_code: string;
  period_type: string;
  period_key: string;
  aggregation: string;
  lon_min: string;
  lat_min: string;
  lon_max: string;
  lat_max: string;
  status: "ready" | "missing_bbox" | "invalid_bbox";
};

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

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    mode: "both",
    windowDays: [1, 3, 7],
    periodType: "month",
    periodKey: "latest",
    aggregation: "sum",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--mode": {
        const value = argv[index + 1];
        if (value === "by-event" || value === "by-region" || value === "both") {
          parsed.mode = value;
        }
        index += 1;
        break;
      }
      case "--event-csv":
        parsed.eventCsv = argv[index + 1];
        index += 1;
        break;
      case "--region-seed-csv":
        parsed.regionSeedCsv = argv[index + 1];
        index += 1;
        break;
      case "--out-root":
        parsed.outRoot = argv[index + 1];
        index += 1;
        break;
      case "--window-days":
        parsed.windowDays = (argv[index + 1] ?? "1,3,7")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value) && value > 0);
        index += 1;
        break;
      case "--period-type":
        parsed.periodType = argv[index + 1] ?? parsed.periodType;
        index += 1;
        break;
      case "--period-key":
        parsed.periodKey = argv[index + 1] ?? parsed.periodKey;
        index += 1;
        break;
      case "--aggregation":
        parsed.aggregation = argv[index + 1] ?? parsed.aggregation;
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function shiftIsoDate(eventTs: string, deltaDays: number): string {
  const parsed = Date.parse(eventTs);
  if (!Number.isFinite(parsed)) {
    return eventTs;
  }

  return new Date(parsed + deltaDays * 24 * 60 * 60 * 1000).toISOString();
}

function toJsonPath(outRoot: string, baseName: string): string {
  return path.join(outRoot, `${baseName}.json`);
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const outRoot = path.resolve(
    repoRoot,
    parsed.outRoot ?? ".tmp/regional-model-library/raw/CHM_PRE-V2/plans"
  );

  const eventCsv = path.resolve(
    repoRoot,
    parsed.eventCsv ??
      ".tmp/regional-model-library/raw/China-2008-2024-catalogue/normalized/phase1-event-inventory.csv"
  );
  const regionSeedCsv = path.resolve(
    repoRoot,
    parsed.regionSeedCsv ?? ".tmp/regional-model-library/raw/CHM_PRE-V2/extracts/region-seed.csv"
  );

  const report = {
    generatedAt: new Date().toISOString(),
    mode: parsed.mode,
    outRoot,
    inputs: {
      eventCsv,
      regionSeedCsv,
    },
    byEvent: {
      jobCount: 0,
      missingCoordinateEvents: 0,
      invalidEventTsEvents: 0,
      outputFile: "",
    },
    byRegion: {
      jobCount: 0,
      missingBboxRegions: 0,
      invalidBboxRegions: 0,
      outputFile: "",
    },
  };

  await mkdir(outRoot, { recursive: true });

  if (parsed.mode === "by-event" || parsed.mode === "both") {
    const eventRows = await readCsvRows(eventCsv);
    const jobs: EventExtractJob[] = eventRows.flatMap((row) => {
      const eventId = row.event_id ?? "";
      const eventTs = row.event_ts ?? "";
      const longitude = row.longitude ?? "";
      const latitude = row.latitude ?? "";
      const regionCode = row.region_code ?? "unknown-region";
      const longitudeValue = Number(longitude);
      const latitudeValue = Number(latitude);
      const hasCoordinates =
        longitude.length > 0 &&
        latitude.length > 0 &&
        Number.isFinite(longitudeValue) &&
        Number.isFinite(latitudeValue);
      const hasValidEventTs = Number.isFinite(Date.parse(eventTs));
      const status = !hasCoordinates
        ? "missing_coordinates"
        : !hasValidEventTs
          ? "invalid_event_ts"
          : "ready";

      return parsed.windowDays.map((windowDays) => ({
        event_id: eventId,
        region_code: regionCode,
        event_ts: eventTs,
        longitude,
        latitude,
        window_days: windowDays,
        window_start: shiftIsoDate(eventTs, -windowDays),
        window_end: eventTs,
        status,
      }));
    });

    const outputFile = toJsonPath(outRoot, "by-event.jobs");
    await writeFile(outputFile, JSON.stringify(jobs, null, 2), "utf-8");
    report.byEvent = {
      jobCount: jobs.length,
      missingCoordinateEvents: jobs.filter((job) => job.status === "missing_coordinates").length,
      invalidEventTsEvents: jobs.filter((job) => job.status === "invalid_event_ts").length,
      outputFile,
    };
  }

  if (parsed.mode === "by-region" || parsed.mode === "both") {
    const regionRows = await readCsvRows(regionSeedCsv);
    const jobs: RegionExtractJob[] = regionRows.map((row) => {
      const lonMin = row.lon_min ?? "";
      const latMin = row.lat_min ?? "";
      const lonMax = row.lon_max ?? "";
      const latMax = row.lat_max ?? "";
      const bboxPresent =
        lonMin.length > 0 && latMin.length > 0 && lonMax.length > 0 && latMax.length > 0;
      const bboxNumeric = [lonMin, latMin, lonMax, latMax].every((value) =>
        Number.isFinite(Number(value))
      );

      return {
        region_code: row.region_code ?? "unknown-region",
        period_type: parsed.periodType,
        period_key: parsed.periodKey,
        aggregation: parsed.aggregation,
        lon_min: lonMin,
        lat_min: latMin,
        lon_max: lonMax,
        lat_max: latMax,
        status: !bboxPresent ? "missing_bbox" : !bboxNumeric ? "invalid_bbox" : "ready",
      };
    });

    const outputFile = toJsonPath(outRoot, "by-region.jobs");
    await writeFile(outputFile, JSON.stringify(jobs, null, 2), "utf-8");
    report.byRegion = {
      jobCount: jobs.length,
      missingBboxRegions: jobs.filter((job) => job.status === "missing_bbox").length,
      invalidBboxRegions: jobs.filter((job) => job.status === "invalid_bbox").length,
      outputFile,
    };
  }

  await writeFile(
    path.join(outRoot, "extract-plan.report.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
