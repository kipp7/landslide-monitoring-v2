import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  eventCsv?: string;
  collisionEventCsv?: string;
  outDir?: string;
  offsetDays: number[];
  exclusionBufferDays: number;
  windowDays: number[];
};

type CsvRow = Record<string, string>;

type NegativeWindowPlanRow = {
  event_id: string;
  negative_source_event_id: string;
  negative_offset_days: number;
  negative_rule: string;
  negative_exclusion_buffer_days: number;
  positive_event_ts: string;
  event_ts: string;
  region_code: string;
  hazard_type: string;
  longitude: string;
  latitude: string;
  status:
    | "planned"
    | "blocked_missing_coordinates"
    | "blocked_invalid_event_ts"
    | "blocked_collision";
  blocking_event_id: string | null;
};

type PlanReport = {
  generatedAt: string;
  sourceEventCsv: string;
  collisionEventCsv: string;
  outDir: string;
  offsets: number[];
  exclusionBufferDays: number;
  maxWindowDays: number;
  plannedCount: number;
  blockedCount: number;
  outputCsv: string;
  outputJson: string;
  candidates: NegativeWindowPlanRow[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_RULE = "seasonal-offset-with-buffer.v1";

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    offsetDays: [-60, -30, 30, 60],
    exclusionBufferDays: 14,
    windowDays: [1, 3, 7]
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--event-csv":
        parsed.eventCsv = argv[index + 1];
        index += 1;
        break;
      case "--collision-event-csv":
        parsed.collisionEventCsv = argv[index + 1];
        index += 1;
        break;
      case "--out-dir":
        parsed.outDir = argv[index + 1];
        index += 1;
        break;
      case "--offset-days":
        parsed.offsetDays = (argv[index + 1] ?? "-60,-30,30,60")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value) && value !== 0);
        index += 1;
        break;
      case "--exclusion-buffer-days": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value >= 0) {
          parsed.exclusionBufferDays = value;
        }
        index += 1;
        break;
      }
      case "--window-days":
        parsed.windowDays = (argv[index + 1] ?? "1,3,7")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value) && value > 0);
        index += 1;
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

async function readCsvRows(filePath: string): Promise<CsvRow[]> {
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
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function escapeCsvValue(value: string): string {
  if (/[",\r\n]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

function toCsv(rows: readonly CsvRow[]): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]!);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","))
  ].join("\n");
}

function sanitizeEventIdSegment(value: string): string {
  return value
    .replace(/[^\w.-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function shiftIsoDate(eventTs: string, offsetDays: number): string | null {
  const parsed = Date.parse(eventTs);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed + offsetDays * DAY_MS).toISOString();
}

function hasFiniteCoordinate(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Number(value));
}

function buildNegativeEventId(
  sourceEventId: string,
  offsetDays: number,
  usedEventIds: Set<string>
): string {
  const baseId = `${sanitizeEventIdSegment(sourceEventId)}__neg_${offsetDays > 0 ? "p" : "m"}${String(
    Math.abs(offsetDays)
  )}d`;
  if (!usedEventIds.has(baseId)) {
    usedEventIds.add(baseId);
    return baseId;
  }

  let ordinal = 2;
  while (usedEventIds.has(`${baseId}_${String(ordinal)}`)) {
    ordinal += 1;
  }
  const candidate = `${baseId}_${String(ordinal)}`;
  usedEventIds.add(candidate);
  return candidate;
}

function findBlockingEventId(
  candidateEventTs: string,
  regionCode: string,
  collisions: readonly CsvRow[],
  bufferDays: number
): string | null {
  const candidateMs = Date.parse(candidateEventTs);
  if (!Number.isFinite(candidateMs)) {
    return null;
  }

  const bufferMs = bufferDays * DAY_MS;
  for (const row of collisions) {
    if ((row.region_code ?? "") !== regionCode) {
      continue;
    }

    const otherMs = Date.parse(row.event_ts ?? "");
    if (!Number.isFinite(otherMs)) {
      continue;
    }

    if (Math.abs(otherMs - candidateMs) <= bufferMs) {
      return row.event_id ?? null;
    }
  }

  return null;
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const eventCsv = path.resolve(
    repoRoot,
    parsed.eventCsv ??
      ".tmp/regional-model-library/raw/China-2008-2024-catalogue/normalized/phase1-event-inventory.csv"
  );
  const collisionEventCsv = path.resolve(repoRoot, parsed.collisionEventCsv ?? eventCsv);
  const outDir = path.resolve(
    repoRoot,
    parsed.outDir ?? ".tmp/regional-model-library/out/replay-packs/negative-window-plan"
  );
  const maxWindowDays = Math.max(...parsed.windowDays, 1);
  const effectiveBufferDays = parsed.exclusionBufferDays + maxWindowDays;

  const events = await readCsvRows(eventCsv);
  const collisions =
    collisionEventCsv === eventCsv ? events : await readCsvRows(collisionEventCsv);

  const usedEventIds = new Set<string>(events.map((row) => row.event_id).filter(Boolean));
  const candidates: NegativeWindowPlanRow[] = [];
  const outputRows: CsvRow[] = [];

  for (const row of events) {
    const sourceEventId = row.event_id ?? "";
    const eventTs = row.event_ts ?? "";
    const regionCode = row.region_code ?? "unknown-region";
    const hazardType = row.hazard_type || "landslide";
    const longitude = row.longitude ?? "";
    const latitude = row.latitude ?? "";
    const hasCoordinates = hasFiniteCoordinate(longitude) && hasFiniteCoordinate(latitude);
    const hasValidEventTs = Number.isFinite(Date.parse(eventTs));

    for (const offsetDays of parsed.offsetDays) {
      const shiftedEventTs = hasValidEventTs ? shiftIsoDate(eventTs, offsetDays) : null;
      const blockingEventId =
        shiftedEventTs && hasCoordinates
          ? findBlockingEventId(shiftedEventTs, regionCode, collisions, effectiveBufferDays)
          : null;
      const status = !hasCoordinates
        ? "blocked_missing_coordinates"
        : !hasValidEventTs || !shiftedEventTs
          ? "blocked_invalid_event_ts"
          : blockingEventId
            ? "blocked_collision"
            : "planned";

      const eventId =
        status === "planned"
          ? buildNegativeEventId(sourceEventId, offsetDays, usedEventIds)
          : `${sanitizeEventIdSegment(sourceEventId)}__blocked_${String(offsetDays)}`;

      const candidate: NegativeWindowPlanRow = {
        event_id: eventId,
        negative_source_event_id: sourceEventId,
        negative_offset_days: offsetDays,
        negative_rule: NEGATIVE_RULE,
        negative_exclusion_buffer_days: parsed.exclusionBufferDays,
        positive_event_ts: eventTs,
        event_ts: shiftedEventTs ?? "",
        region_code: regionCode,
        hazard_type: hazardType,
        longitude,
        latitude,
        status,
        blocking_event_id: blockingEventId
      };
      candidates.push(candidate);

      if (status === "planned") {
        outputRows.push({
          event_id: candidate.event_id,
          event_ts: candidate.event_ts,
          region_code: candidate.region_code,
          hazard_type: candidate.hazard_type,
          longitude: candidate.longitude,
          latitude: candidate.latitude,
          negative_source_event_id: candidate.negative_source_event_id,
          negative_offset_days: String(candidate.negative_offset_days),
          negative_rule: candidate.negative_rule,
          negative_exclusion_buffer_days: String(candidate.negative_exclusion_buffer_days),
          positive_event_ts: candidate.positive_event_ts
        });
      }
    }
  }

  await mkdir(outDir, { recursive: true });
  const outputCsv = path.join(outDir, "negative-events.csv");
  const outputJson = path.join(outDir, "negative-window-plan.json");

  await writeFile(outputCsv, toCsv(outputRows), "utf-8");

  const report: PlanReport = {
    generatedAt: new Date().toISOString(),
    sourceEventCsv: eventCsv,
    collisionEventCsv,
    outDir,
    offsets: parsed.offsetDays,
    exclusionBufferDays: parsed.exclusionBufferDays,
    maxWindowDays,
    plannedCount: candidates.filter((candidate) => candidate.status === "planned").length,
    blockedCount: candidates.filter((candidate) => candidate.status !== "planned").length,
    outputCsv,
    outputJson,
    candidates
  };

  await writeFile(outputJson, JSON.stringify(report, null, 2), "utf-8");
  process.stdout.write(
    `${JSON.stringify({
      outputCsv,
      outputJson,
      plannedCount: report.plannedCount,
      blockedCount: report.blockedCount
    }, null, 2)}\n`
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
