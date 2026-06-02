import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import type {
  RawDatasetIntakeFamilySpec,
  RawDatasetIntakeManifest,
} from "../../../libs/regional-model-library/src";
import { FIRST_WAVE_INTAKE_MANIFESTS } from "./intake-manifest-templates";
import {
  collectLandingEntries,
  isBlockingFamilyStage,
  matchesAnyPattern,
  matchesExpectedFormat,
  resolveRepoRoot,
} from "./intake-utils";

type ValidationStage = "source-landing" | "family-split";
type ValidationStatus = "pass" | "warn" | "fail";

type ParsedArgs = {
  datasetKey?: string;
  manifest?: string;
  rawRoot?: string;
  outRoot?: string;
  reportOut?: string;
  stage: ValidationStage;
  strict: boolean;
  failOnWarn: boolean;
  checkDerived: boolean;
};

type ValidationIssue = {
  code: string;
  status: ValidationStatus;
  message: string;
  details?: Record<string, unknown>;
};

type FamilyValidation = {
  familyKey: string;
  displayName: string;
  stage: string;
  status: ValidationStatus;
  matchedEntries: string[];
  matchedSheetNames: string[];
  matchedHeaders: string[];
  matchedTimeHeaders: string[];
  matchedIdentityHeaders: string[];
  matchedValueHeaders: string[];
  matchedPassthroughHeaders: string[];
  preferredFileNamesFound: string[];
  missingRequiredMappings: string[];
  semanticWarnings: string[];
  identityWarnings: string[];
  issues: ValidationIssue[];
};

type DatasetValidation = {
  generatedAt: string;
  datasetKey: string;
  displayName: string;
  manifestPath: string;
  rawRoot: string;
  stage: ValidationStage;
  sourceKind: string;
  landingState: "missing" | "partial" | "ready";
  status: ValidationStatus;
  counts: {
    errors: number;
    warnings: number;
    filesScanned: number;
    directoriesScanned: number;
    familiesExpected: number;
    familiesMatched: number;
  };
  landingLayout: {
    hasSourceDir: boolean;
    hasUnpackedDir: boolean;
    hasOriginalDir: boolean;
    hasNormalizedDir: boolean;
    hasExtractsDir: boolean;
  };
  blockingMissingFamilies: string[];
  layoutChecks: ValidationIssue[];
  sourceArtifactChecks: ValidationIssue[];
  familyChecks: FamilyValidation[];
  derivedArtifactChecks: ValidationIssue[];
  nextActions: string[];
};

const headerProbeCache = new Map<
  string,
  { sheetNames: string[]; headersBySheet: Record<string, string[]> }
>();

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    stage: "source-landing",
    strict: false,
    failOnWarn: false,
    checkDerived: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--dataset-key":
        parsed.datasetKey = argv[index + 1];
        index += 1;
        break;
      case "--manifest":
        parsed.manifest = argv[index + 1];
        index += 1;
        break;
      case "--raw-root":
        parsed.rawRoot = argv[index + 1];
        index += 1;
        break;
      case "--out-root":
        parsed.outRoot = argv[index + 1];
        index += 1;
        break;
      case "--report-out":
        parsed.reportOut = argv[index + 1];
        index += 1;
        break;
      case "--stage": {
        const value = argv[index + 1];
        if (value === "source-landing" || value === "family-split") {
          parsed.stage = value;
        }
        index += 1;
        break;
      }
      case "--strict":
        parsed.strict = true;
        break;
      case "--fail-on-warn":
        parsed.failOnWarn = true;
        break;
      case "--check-derived":
        parsed.checkDerived = true;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function buildIssue(
  code: string,
  status: ValidationStatus,
  message: string,
  details?: Record<string, unknown>
): ValidationIssue {
  return {
    code,
    status,
    message,
    ...(details ? { details } : {}),
  };
}

function summarizeIssues(issues: readonly ValidationIssue[]): {
  status: ValidationStatus;
  errors: number;
  warnings: number;
} {
  const errors = issues.filter((issue) => issue.status === "fail").length;
  const warnings = issues.filter((issue) => issue.status === "warn").length;
  return {
    status: errors > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
    errors,
    warnings,
  };
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-\s/\\():.,;|[\]{}]/gu, "")
    .replace(/[（）、，。：；【】]/gu, "")
    .trim();
}

function splitCandidateTokens(rawField: string): string[] {
  return rawField
    .split(/\bor\b|\/|,|;|\||、|，|；/giu)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function headerMatchesCandidate(header: string, candidate: string): boolean {
  const normalizedHeader = normalizeToken(header);
  const normalizedCandidate = normalizeToken(candidate);
  if (!normalizedHeader || !normalizedCandidate) {
    return false;
  }

  return (
    normalizedHeader === normalizedCandidate ||
    normalizedHeader.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedHeader)
  );
}

function uniq(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function buildLandingLayout(relativePaths: readonly string[]) {
  const normalized = relativePaths.map((value) => value.replace(/\\/gu, "/"));
  return {
    hasSourceDir: normalized.some((value) => value === "source"),
    hasUnpackedDir: normalized.some((value) => value === "unpacked"),
    hasOriginalDir: normalized.some((value) => value === "original"),
    hasNormalizedDir: normalized.some((value) => value === "normalized"),
    hasExtractsDir: normalized.some((value) => value === "extracts"),
  };
}

function isWorkbookPath(filePath: string): boolean {
  return /\.(xlsx|xls|csv)$/iu.test(filePath);
}

function isJsonPath(filePath: string): boolean {
  return /\.json$/iu.test(filePath);
}

async function readEntryHeaders(
  filePath: string,
  preferredSheetNames: readonly string[] | undefined
): Promise<{
  matchedSheetNames: string[];
  matchedHeaders: string[];
  headerReadable: boolean;
  preferredSheetFallback: boolean;
}> {
  if (isWorkbookPath(filePath)) {
    const cached = headerProbeCache.get(filePath);
    if (cached) {
      const isCsv = /\.csv$/iu.test(filePath);
      const preferredSheetMatches =
        !isCsv && preferredSheetNames?.length
          ? cached.sheetNames.filter((sheetName) => preferredSheetNames.includes(sheetName))
          : cached.sheetNames;
      const preferredSheetFallback =
        !isCsv && !!preferredSheetNames?.length && preferredSheetMatches.length === 0;
      const matchedSheetNames = preferredSheetFallback ? cached.sheetNames : preferredSheetMatches;
      const headers = uniq(
        matchedSheetNames.flatMap((sheetName) => cached.headersBySheet[sheetName] ?? [])
      );
      return {
        matchedSheetNames,
        matchedHeaders: headers,
        headerReadable: true,
        preferredSheetFallback,
      };
    }

    const workbook = XLSX.readFile(filePath, {
      cellDates: false,
      dense: false,
    });
    const headersBySheet: Record<string, string[]> = {};

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
        header: 1,
        raw: false,
        blankrows: false,
        defval: null,
      });
      const headerIndex = rows.findIndex(
        (row) =>
          Array.isArray(row) &&
          row.some((cell) =>
            ["观测时间", "obs_time", "日期", "时间"].some((candidate) =>
              headerMatchesCandidate(String(cell ?? "").trim(), candidate)
            )
          )
      );
      const headerRow =
        headerIndex >= 0
          ? rows[headerIndex]
          : rows.find(
              (row) =>
                Array.isArray(row) && row.some((cell) => String(cell ?? "").trim().length > 0)
            );
      const nextRow =
        headerIndex >= 0 && headerIndex + 1 < rows.length ? rows[headerIndex + 1] ?? [] : [];
      const combineIdentityRow =
        Array.isArray(nextRow) &&
        nextRow.some((cell) => String(cell ?? "").trim().length > 0) &&
        (headerRow ?? []).some((cell) =>
          ["监测点编号", "point_id", "crack_id", "编号"].some((candidate) =>
            headerMatchesCandidate(String(cell ?? "").trim(), candidate)
          )
        );
      headersBySheet[sheetName] = uniq(
        (headerRow ?? []).map((cell, columnIndex) => {
          const headerValue = String(cell ?? "").trim();
          if (columnIndex === 0) {
            return headerValue;
          }

          if (!combineIdentityRow) {
            return headerValue;
          }

          const nextValue = String(nextRow[columnIndex] ?? "").trim();
          if (
            nextValue.length > 0 &&
            (headerValue.length === 0 ||
              ["监测点编号", "point_id", "crack_id", "编号"].some((candidate) =>
                headerMatchesCandidate(headerValue, candidate)
              ))
          ) {
            return nextValue;
          }

          return headerValue;
        })
          .filter((value) => value.length > 0)
      );
    }

    headerProbeCache.set(filePath, {
      sheetNames: workbook.SheetNames,
      headersBySheet,
    });

    const isCsv = /\.csv$/iu.test(filePath);
    const preferredSheetMatches =
      !isCsv && preferredSheetNames?.length
        ? workbook.SheetNames.filter((sheetName) => preferredSheetNames.includes(sheetName))
        : workbook.SheetNames;
    const preferredSheetFallback =
      !isCsv && !!preferredSheetNames?.length && preferredSheetMatches.length === 0;
    const matchedSheetNames = preferredSheetFallback ? workbook.SheetNames : preferredSheetMatches;
    const matchedHeaders = uniq(
      matchedSheetNames.flatMap((sheetName) => headersBySheet[sheetName] ?? [])
    );

    return {
      matchedSheetNames,
      matchedHeaders,
      headerReadable: true,
      preferredSheetFallback,
    };
  }

  if (isJsonPath(filePath)) {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    const record =
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      typeof parsed[0] === "object" &&
      parsed[0] !== null
        ? (parsed[0] as Record<string, unknown>)
        : typeof parsed === "object" && parsed !== null
          ? (parsed as Record<string, unknown>)
          : null;

    return {
      matchedSheetNames: [],
      matchedHeaders: record ? Object.keys(record) : [],
      headerReadable: record !== null,
      preferredSheetFallback: false,
    };
  }

  return {
    matchedSheetNames: [],
    matchedHeaders: [],
    headerReadable: false,
    preferredSheetFallback: false,
  };
}

function matchesArchiveSubpaths(
  relativePath: string,
  archiveSubpaths: readonly string[] | undefined
): boolean {
  if (!archiveSubpaths || archiveSubpaths.length === 0) {
    return true;
  }

  return archiveSubpaths.some((subpath) => matchesRelativePathTarget(relativePath, subpath));
}

function normalizeRelativePath(value: string): string {
  return value
    .replace(/\\/gu, "/")
    .replace(/^\.?\//u, "")
    .replace(/\/+/gu, "/")
    .replace(/\/$/u, "")
    .toLowerCase();
}

function matchesRelativePathTarget(relativePath: string, targetPath: string): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);
  const normalizedTarget = normalizeRelativePath(targetPath);

  if (!normalizedTarget) {
    return false;
  }

  return (
    normalizedPath === normalizedTarget ||
    normalizedPath.startsWith(`${normalizedTarget}/`) ||
    normalizedPath.startsWith(`${normalizedTarget}.`) ||
    normalizedPath.endsWith(`/${normalizedTarget}`) ||
    normalizedPath.includes(`/${normalizedTarget}/`) ||
    normalizedPath.includes(`/${normalizedTarget}.`)
  );
}

function matchesFamilySplitArtifact(
  relativePath: string,
  family: RawDatasetIntakeFamilySpec
): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);
  const normalizedTarget = normalizeRelativePath(family.rawLandingRelative);
  const basename = path.basename(normalizedPath, path.extname(normalizedPath));
  const targetLeaf = path.posix.basename(normalizedTarget);
  const basenameCandidates = uniq([
    targetLeaf,
    family.familyKey.toLowerCase(),
    `phase1-${targetLeaf}`,
    `phase1-${family.familyKey.toLowerCase()}`,
  ]);

  return (
    matchesRelativePathTarget(relativePath, family.rawLandingRelative) ||
    basenameCandidates.includes(basename) ||
    basenameCandidates.some((candidate) => {
      return (
        matchesRelativePathTarget(relativePath, `normalized/${candidate}`) ||
        matchesRelativePathTarget(relativePath, `normalized/phase1-families/${candidate}`) ||
        matchesRelativePathTarget(relativePath, `phase1-families/${candidate}`)
      );
    })
  );
}

function matchesRawLandingRelative(relativePath: string, rawLandingRelative: string): boolean {
  return matchesRelativePathTarget(relativePath, rawLandingRelative);
}

function matchHeaders(
  headers: readonly string[],
  candidates: readonly string[] | undefined
): string[] {
  if (!candidates || candidates.length === 0) {
    return [];
  }

  return uniq(
    headers.filter((header) =>
      candidates.some((candidate) => headerMatchesCandidate(header, candidate))
    )
  );
}

function resolveRequiredMapping(
  family: RawDatasetIntakeFamilySpec,
  matchedHeaders: readonly string[]
): string[] {
  return family.requiredFieldMappings
    .filter((mapping) => {
      const directCandidates = splitCandidateTokens(mapping.rawField);
      const schemaCandidates = [
        ...(family.schemaHints?.timeFieldCandidates ?? []),
        ...(family.schemaHints?.identityFieldCandidates ?? []),
        ...(family.schemaHints?.valueFieldCandidates ?? []),
        ...(family.schemaHints?.passthroughFieldCandidates ?? []),
      ];
      const candidates = uniq([...directCandidates, ...schemaCandidates]);

      return !matchedHeaders.some((header) =>
        candidates.some((candidate) => headerMatchesCandidate(header, candidate))
      );
    })
    .map((mapping) => mapping.rawField);
}

function buildFamilySemanticWarnings(
  family: RawDatasetIntakeFamilySpec,
  matchedHeaders: readonly string[]
): string[] {
  if (matchedHeaders.length === 0) {
    return [];
  }

  return family.requiredFieldMappings
    .filter((mapping) => !!family.valueSemantics && /\bor\b/iu.test(mapping.rawField))
    .map(
      (mapping) =>
        `Required mapping "${mapping.rawField}" is semantically ambiguous; verify unit/variant before normalization.`
    );
}

function buildFamilyIdentityWarnings(
  family: RawDatasetIntakeFamilySpec,
  matchedIdentityHeaders: readonly string[],
  headerReadable: boolean
): string[] {
  if (!headerReadable || !family.identityHints) {
    return [];
  }

  if (matchedIdentityHeaders.length > 0) {
    return [];
  }

  return [
    `No identity header matched join key candidates for join role "${family.identityHints.joinRole ?? "unknown"}".`,
  ];
}

function buildLayoutChecks(
  layout: DatasetValidation["landingLayout"],
  stage: ValidationStage
): ValidationIssue[] {
  const checks: ValidationIssue[] = [];

  checks.push(
    layout.hasSourceDir
      ? buildIssue("layout_source_dir_present", "pass", "Found source directory.")
      : buildIssue(
          "layout_source_dir_missing",
          "warn",
          "Expected a source directory for preserved raw downloads."
        )
  );
  checks.push(
    layout.hasOriginalDir
      ? buildIssue("layout_original_dir_present", "pass", "Found original directory.")
      : buildIssue(
          "layout_original_dir_missing",
          "warn",
          "Expected an original directory for unchanged raw artifacts."
        )
  );
  checks.push(
    layout.hasUnpackedDir
      ? buildIssue("layout_unpacked_dir_present", "pass", "Found unpacked directory.")
      : buildIssue(
          "layout_unpacked_dir_missing",
          "warn",
          "Expected an unpacked directory for raw archive expansion."
        )
  );

  if (stage === "family-split") {
    checks.push(
      layout.hasNormalizedDir
        ? buildIssue("layout_normalized_dir_present", "pass", "Found normalized directory.")
        : buildIssue(
            "layout_normalized_dir_missing",
            "warn",
            "Expected normalized directory for family-split outputs."
          )
    );
  } else {
    checks.push(
      layout.hasNormalizedDir
        ? buildIssue("layout_normalized_dir_present", "pass", "Found normalized directory.")
        : buildIssue(
            "layout_normalized_dir_missing",
            "pass",
            "Normalized directory is not required at source landing."
          )
    );
  }

  checks.push(
    layout.hasExtractsDir
      ? buildIssue("layout_extracts_dir_present", "pass", "Found extracts directory.")
      : buildIssue(
          "layout_extracts_dir_missing",
          stage === "family-split" ? "warn" : "pass",
          stage === "family-split"
            ? "Expected extracts directory for secondary derivations."
            : "Extracts directory is optional at source landing."
        )
  );

  return checks;
}

function buildSourceArtifactChecks(
  manifest: RawDatasetIntakeManifest,
  directories: readonly string[],
  files: readonly string[],
  familyChecks: readonly FamilyValidation[]
): ValidationIssue[] {
  const checks: ValidationIssue[] = [];
  const normalizedDirectories = directories.map((value) => value.replace(/\\/gu, "/"));
  const normalizedFiles = files.map((value) => value.replace(/\\/gu, "/"));

  for (const target of manifest.accessPlan.downloadTargets ?? []) {
    const normalizedOutFile = target.relativeOutFile.replace(/\\/gu, "/");
    const exists = normalizedFiles.some((filePath) => filePath === normalizedOutFile);
    checks.push(
      exists
        ? buildIssue(
            "download_target_present",
            "pass",
            `Found download target output "${normalizedOutFile}".`,
            { targetKey: target.targetKey, relativeOutFile: normalizedOutFile }
          )
        : buildIssue(
            "download_target_missing",
            target.required === false ? "warn" : "fail",
            `Missing download target output "${normalizedOutFile}".`,
            { targetKey: target.targetKey, relativeOutFile: normalizedOutFile }
          )
    );
  }

  for (const family of manifest.families) {
    const archiveSubpaths = family.selectionHints?.archiveSubpaths ?? [];
    for (const subpath of archiveSubpaths) {
      const normalizedSubpath = subpath.replace(/\\/gu, "/");
      const exists = normalizedDirectories.some((directory) => directory === normalizedSubpath);
      checks.push(
        exists
          ? buildIssue(
              "archive_subpath_present",
              "pass",
              `Found archive subpath "${normalizedSubpath}" for ${family.familyKey}.`,
              { familyKey: family.familyKey, archiveSubpath: normalizedSubpath }
            )
          : buildIssue(
              "archive_subpath_missing",
              isBlockingFamilyStage(family.stage) ? "fail" : "warn",
              `Missing archive subpath "${normalizedSubpath}" for ${family.familyKey}.`,
              { familyKey: family.familyKey, archiveSubpath: normalizedSubpath }
            )
      );
    }

    const familyCheck = familyChecks.find((candidate) => candidate.familyKey === family.familyKey);
    if (!familyCheck) {
      continue;
    }

    if (family.selectionHints?.preferredFileNames?.length) {
      const missingPreferredFiles = family.selectionHints.preferredFileNames.filter(
        (fileName) => !familyCheck.preferredFileNamesFound.includes(fileName)
      );

      if (missingPreferredFiles.length === 0) {
        checks.push(
          buildIssue(
            "preferred_files_present",
            "pass",
            `Found preferred file names for ${family.familyKey}.`,
            { familyKey: family.familyKey }
          )
        );
      } else {
        checks.push(
          buildIssue(
            "preferred_files_partial",
            "warn",
            `Preferred file names are incomplete for ${family.familyKey}.`,
            { familyKey: family.familyKey, missingPreferredFiles }
          )
        );
      }
    }
  }

  return checks;
}

function buildDerivedArtifactChecks(
  manifest: RawDatasetIntakeManifest,
  rawRoot: string,
  enabled: boolean
): ValidationIssue[] {
  if (!enabled) {
    return [];
  }

  const checks: ValidationIssue[] = [];
  const derivedHints: Record<string, string[]> = {
    "China-2008-2024-catalogue": ["normalized/phase1-event-inventory.csv"],
    "Baijiabao-2017-2024": [
      "normalized/phase1-families/deformation.csv",
      "normalized/phase1-families/crack.csv",
      "normalized/phase1-families/rainfall.csv",
      "normalized/phase1-families/reservoir.csv",
    ],
  };

  for (const relativePath of derivedHints[manifest.datasetKey] ?? []) {
    const absolutePath = path.join(rawRoot, relativePath);
    checks.push(
      buildIssue(
        "derived_artifact_hint",
        "warn",
        `Derived artifact check is advisory only: ${relativePath}.`,
        { absolutePath }
      )
    );
  }

  return checks;
}

function deriveNextActions(report: DatasetValidation): string[] {
  const actions = new Set<string>();

  if (report.landingState === "missing") {
    actions.add(`Land raw files under ${report.rawRoot} before phase-1 build.`);
  }

  if (report.blockingMissingFamilies.length > 0) {
    actions.add(`Complete blocking families: ${report.blockingMissingFamilies.join(", ")}.`);
  }

  const missingMappings = report.familyChecks.flatMap((family) =>
    family.missingRequiredMappings.map((mapping) => `${family.familyKey}:${mapping}`)
  );
  if (missingMappings.length > 0) {
    actions.add(
      "Inspect raw headers and reconcile missing required mappings before normalization."
    );
  }

  if (report.layoutChecks.some((issue) => issue.status === "warn")) {
    actions.add(
      "Normalize raw landing layout into source/original/unpacked folders to keep acquisition reproducible."
    );
  }

  if (report.sourceArtifactChecks.some((issue) => issue.status === "fail")) {
    actions.add(
      "Restore missing archive subpaths or source files expected by the intake manifest."
    );
  }

  if (report.familyChecks.some((family) => family.semanticWarnings.length > 0)) {
    actions.add(
      "Resolve semantic ambiguities such as cumulative-vs-rate and unit conflicts before adapter binding."
    );
  }

  return Array.from(actions);
}

async function resolveManifest(
  repoRoot: string,
  parsed: ParsedArgs
): Promise<{ manifest: RawDatasetIntakeManifest; manifestPath: string }> {
  if (parsed.manifest) {
    const manifestPath = path.resolve(repoRoot, parsed.manifest);
    const content = await readFile(manifestPath, "utf-8");
    return {
      manifest: JSON.parse(content) as RawDatasetIntakeManifest,
      manifestPath,
    };
  }

  if (!parsed.datasetKey) {
    throw new Error("Either --dataset-key or --manifest must be provided for single-dataset mode.");
  }

  const manifest = FIRST_WAVE_INTAKE_MANIFESTS.find(
    (candidate) => candidate.datasetKey === parsed.datasetKey
  );
  if (!manifest) {
    throw new Error(`Unknown intake datasetKey: ${parsed.datasetKey}`);
  }

  const generatedManifestPath = path.resolve(
    repoRoot,
    ".tmp/regional-model-library/intake-manifests",
    `${manifest.datasetKey}.intake-manifest.json`
  );

  return {
    manifest,
    manifestPath: generatedManifestPath,
  };
}

async function validateDataset(
  repoRoot: string,
  manifest: RawDatasetIntakeManifest,
  manifestPath: string,
  parsed: ParsedArgs
): Promise<DatasetValidation> {
  const rawRoot = path.resolve(repoRoot, parsed.rawRoot ?? manifest.rawLandingRoot);

  try {
    await stat(rawRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    const blockingMissingFamilies = manifest.families
      .filter((family) => isBlockingFamilyStage(family.stage))
      .map((family) => family.familyKey);

    const familyChecks: FamilyValidation[] = manifest.families.map((family) => ({
      familyKey: family.familyKey,
      displayName: family.displayName,
      stage: family.stage,
      status: isBlockingFamilyStage(family.stage) ? "fail" : "warn",
      matchedEntries: [],
      matchedSheetNames: [],
      matchedHeaders: [],
      matchedTimeHeaders: [],
      matchedIdentityHeaders: [],
      matchedValueHeaders: [],
      matchedPassthroughHeaders: [],
      preferredFileNamesFound: [],
      missingRequiredMappings: family.requiredFieldMappings.map((mapping) => mapping.rawField),
      semanticWarnings: [],
      identityWarnings: [],
      issues: [
        buildIssue(
          "family_missing",
          isBlockingFamilyStage(family.stage) ? "fail" : "warn",
          `No landed files found for ${family.familyKey}.`
        ),
      ],
    }));

    const layoutChecks = [
      buildIssue("raw_root_missing", "fail", `Raw landing root does not exist: ${rawRoot}.`),
    ];
    const sourceArtifactChecks: ValidationIssue[] = [];
    const derivedArtifactChecks = buildDerivedArtifactChecks(
      manifest,
      rawRoot,
      parsed.checkDerived
    );
    const allIssues = [
      ...layoutChecks,
      ...sourceArtifactChecks,
      ...familyChecks.flatMap((family) => family.issues),
      ...derivedArtifactChecks,
    ];
    const summary = summarizeIssues(allIssues);

    const report: DatasetValidation = {
      generatedAt: new Date().toISOString(),
      datasetKey: manifest.datasetKey,
      displayName: manifest.displayName,
      manifestPath,
      rawRoot,
      stage: parsed.stage,
      sourceKind: manifest.sourceKind,
      landingState: "missing",
      status: summary.status,
      counts: {
        errors: summary.errors,
        warnings: summary.warnings,
        filesScanned: 0,
        directoriesScanned: 0,
        familiesExpected: manifest.families.length,
        familiesMatched: 0,
      },
      landingLayout: {
        hasSourceDir: false,
        hasUnpackedDir: false,
        hasOriginalDir: false,
        hasNormalizedDir: false,
        hasExtractsDir: false,
      },
      blockingMissingFamilies,
      layoutChecks,
      sourceArtifactChecks,
      familyChecks,
      derivedArtifactChecks,
      nextActions: [],
    };
    report.nextActions = deriveNextActions(report);
    return report;
  }

  const entries = await collectLandingEntries(rawRoot);
  const files = entries.filter((entry) => entry.kind === "file");
  const directories = entries.filter((entry) => entry.kind === "directory");
  const landingLayout = buildLandingLayout(directories.map((entry) => entry.relativePath));

  const familyChecks = await Promise.all(
    manifest.families.map(async (family): Promise<FamilyValidation> => {
      const matchableEntries = entries.filter((entry) => {
        if (entry.kind === "file") {
          return true;
        }

        return family.expectedFormats.some(
          (format) => format.toLowerCase() === entry.extension.toLowerCase()
        );
      });

      const matchedEntries = matchableEntries.filter((entry) => {
        const basename = path.basename(entry.absolutePath);
        const matchesFormat = matchesExpectedFormat(entry, family.expectedFormats);
        const matchesFamilySplit =
          parsed.stage === "family-split" && matchesFamilySplitArtifact(entry.relativePath, family);
        const preferredPatterns = family.selectionHints?.preferredFilePatterns ?? [];
        const preferredFileNames = family.selectionHints?.preferredFileNames ?? [];
        const matchesPattern = matchesAnyPattern(basename, preferredPatterns);
        const hasPreferredPatterns = preferredPatterns.length > 0;
        const hasPreferredFileNames = preferredFileNames.length > 0;
        const matchesPreferredName =
          !hasPreferredFileNames || preferredFileNames.includes(basename);
        const shouldConstrainByRawLandingRelative =
          parsed.stage === "source-landing" && family.rawLandingRelative.length > 0;
        const sourceLandingMatch = hasPreferredPatterns
          ? matchesFormat && matchesPattern && matchesPreferredName
          : hasPreferredFileNames
            ? matchesFormat && matchesPreferredName
            : matchesFormat;

        return (
          (matchesFamilySplit || sourceLandingMatch) &&
          (!shouldConstrainByRawLandingRelative ||
            matchesRawLandingRelative(entry.relativePath, family.rawLandingRelative)) &&
          matchesArchiveSubpaths(entry.relativePath, family.selectionHints?.archiveSubpaths) &&
          (matchesFamilySplit || matchesPreferredName)
        );
      });

      const preferredFileNamesFound = (family.selectionHints?.preferredFileNames ?? []).filter(
        (fileName) => files.some((entry) => path.basename(entry.absolutePath) === fileName)
      );

      const headerProbes = await Promise.all(
        matchedEntries
          .filter((entry) => entry.kind === "file")
          .map((entry) =>
            readEntryHeaders(entry.absolutePath, family.selectionHints?.preferredSheetNames)
          )
      );
      const headerReadable = headerProbes.some((probe) => probe.headerReadable);
      const preferredSheetFallback = headerProbes.some((probe) => probe.preferredSheetFallback);
      const matchedSheetNames = uniq(headerProbes.flatMap((probe) => probe.matchedSheetNames));
      const matchedHeaders = uniq(headerProbes.flatMap((probe) => probe.matchedHeaders));

      const matchedTimeHeaders = matchHeaders(
        matchedHeaders,
        family.schemaHints?.timeFieldCandidates
      );
      const matchedIdentityHeaders = matchHeaders(matchedHeaders, [
        ...(family.schemaHints?.identityFieldCandidates ?? []),
        ...(family.identityHints?.joinKeyFieldCandidates ?? []),
      ]);
      const matchedValueHeaders = matchHeaders(
        matchedHeaders,
        family.schemaHints?.valueFieldCandidates
      );
      const matchedPassthroughHeaders = matchHeaders(
        matchedHeaders,
        family.schemaHints?.passthroughFieldCandidates
      );

      const missingRequiredMappings =
        headerReadable && matchedHeaders.length > 0
          ? resolveRequiredMapping(family, matchedHeaders)
          : [];
      const semanticWarnings = buildFamilySemanticWarnings(family, matchedHeaders);
      const identityWarnings = buildFamilyIdentityWarnings(
        family,
        matchedIdentityHeaders,
        headerReadable
      );

      const issues: ValidationIssue[] = [];
      if (matchedEntries.length === 0) {
        issues.push(
          buildIssue(
            "family_missing",
            isBlockingFamilyStage(family.stage) ? "fail" : "warn",
            `No landed files matched ${family.familyKey}.`,
            { familyKey: family.familyKey }
          )
        );
      } else {
        issues.push(
          buildIssue(
            "family_present",
            "pass",
            `Matched ${matchedEntries.length} landed files for ${family.familyKey}.`,
            {
              familyKey: family.familyKey,
              matchedEntries: matchedEntries.map((entry) => entry.relativePath),
            }
          )
        );
      }

      if (headerReadable && matchedHeaders.length === 0) {
        issues.push(
          buildIssue(
            "header_probe_empty",
            "warn",
            `Matched files for ${family.familyKey} were header-readable but yielded no headers.`,
            { familyKey: family.familyKey }
          )
        );
      }

      if (!headerReadable && matchedEntries.length > 0) {
        issues.push(
          buildIssue(
            "header_probe_skipped",
            "pass",
            `Skipped header probe for ${family.familyKey} because the landed files are non-tabular.`,
            { familyKey: family.familyKey }
          )
        );
      }

      if (preferredSheetFallback) {
        issues.push(
          buildIssue(
            "preferred_sheet_hint_unmatched",
            "warn",
            `Preferred sheet names were not found for ${family.familyKey}; header probe fell back to all sheets.`,
            { familyKey: family.familyKey }
          )
        );
      }

      for (const mapping of missingRequiredMappings) {
        issues.push(
          buildIssue(
            "required_mapping_missing",
            "fail",
            `Missing required mapping "${mapping}" for ${family.familyKey}.`,
            { familyKey: family.familyKey, rawField: mapping }
          )
        );
      }

      for (const warning of semanticWarnings) {
        issues.push(
          buildIssue("semantic_warning", "warn", warning, { familyKey: family.familyKey })
        );
      }

      for (const warning of identityWarnings) {
        issues.push(
          buildIssue("identity_warning", "warn", warning, { familyKey: family.familyKey })
        );
      }

      const summary = summarizeIssues(issues);

      return {
        familyKey: family.familyKey,
        displayName: family.displayName,
        stage: family.stage,
        status: summary.status,
        matchedEntries: matchedEntries.map((entry) => entry.relativePath),
        matchedSheetNames,
        matchedHeaders,
        matchedTimeHeaders,
        matchedIdentityHeaders,
        matchedValueHeaders,
        matchedPassthroughHeaders,
        preferredFileNamesFound,
        missingRequiredMappings,
        semanticWarnings,
        identityWarnings,
        issues,
      };
    })
  );

  const blockingMissingFamilies = familyChecks
    .filter(
      (family) =>
        family.status === "fail" &&
        isBlockingFamilyStage(family.stage) &&
        family.matchedEntries.length === 0
    )
    .map((family) => family.familyKey);
  const familiesMatched = familyChecks.filter((family) => family.matchedEntries.length > 0).length;
  const layoutChecks = buildLayoutChecks(landingLayout, parsed.stage);
  const sourceArtifactChecks = buildSourceArtifactChecks(
    manifest,
    directories.map((entry) => entry.relativePath),
    files.map((entry) => entry.relativePath),
    familyChecks
  );
  const derivedArtifactChecks = buildDerivedArtifactChecks(manifest, rawRoot, parsed.checkDerived);
  const allIssues = [
    ...layoutChecks,
    ...sourceArtifactChecks,
    ...familyChecks.flatMap((family) => family.issues),
    ...derivedArtifactChecks,
  ];
  const summary = summarizeIssues(allIssues);

  const report: DatasetValidation = {
    generatedAt: new Date().toISOString(),
    datasetKey: manifest.datasetKey,
    displayName: manifest.displayName,
    manifestPath,
    rawRoot,
    stage: parsed.stage,
    sourceKind: manifest.sourceKind,
    landingState: blockingMissingFamilies.length === 0 ? "ready" : "partial",
    status: summary.status,
    counts: {
      errors: summary.errors,
      warnings: summary.warnings,
      filesScanned: files.length,
      directoriesScanned: directories.length,
      familiesExpected: manifest.families.length,
      familiesMatched,
    },
    landingLayout,
    blockingMissingFamilies,
    layoutChecks,
    sourceArtifactChecks,
    familyChecks,
    derivedArtifactChecks,
    nextActions: [],
  };
  report.nextActions = deriveNextActions(report);
  return report;
}

async function writeSingleReport(reportPath: string, report: DatasetValidation): Promise<void> {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const singleDatasetMode =
    !!parsed.datasetKey || !!parsed.manifest || !!parsed.reportOut || !!parsed.rawRoot;

  if (singleDatasetMode) {
    const { manifest, manifestPath } = await resolveManifest(repoRoot, parsed);
    const report = await validateDataset(repoRoot, manifest, manifestPath, parsed);
    const reportPath = path.resolve(
      repoRoot,
      parsed.reportOut ??
        path.join(
          parsed.outRoot ?? ".tmp/regional-model-library/intake-validation",
          `${manifest.datasetKey}.validation.json`
        )
    );
    await writeSingleReport(reportPath, report);
    console.log(JSON.stringify(report, null, 2));

    if (
      (parsed.failOnWarn && report.status !== "pass") ||
      (parsed.strict && report.status === "fail")
    ) {
      process.exitCode = 1;
    }
    return;
  }

  const outRoot = path.resolve(
    repoRoot,
    parsed.outRoot ?? ".tmp/regional-model-library/intake-validation"
  );
  const results = await Promise.all(
    FIRST_WAVE_INTAKE_MANIFESTS.map(async (manifest) =>
      validateDataset(
        repoRoot,
        manifest,
        path.resolve(
          repoRoot,
          ".tmp/regional-model-library/intake-manifests",
          `${manifest.datasetKey}.intake-manifest.json`
        ),
        parsed
      )
    )
  );
  await mkdir(outRoot, { recursive: true });

  for (const result of results) {
    const outFile = path.join(outRoot, `${result.datasetKey}.validation.json`);
    await writeFile(outFile, JSON.stringify(result, null, 2), "utf-8");
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    outRoot,
    datasetCount: results.length,
    datasetKeys: results.map((result) => result.datasetKey),
    statusByDataset: results.map((result) => ({
      datasetKey: result.datasetKey,
      status: result.status,
      landingState: result.landingState,
      blockingMissingFamilies: result.blockingMissingFamilies,
    })),
  };

  await writeFile(path.join(outRoot, "summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  console.log(JSON.stringify(summary, null, 2));

  const hasWarnOrFail = results.some((result) => result.status !== "pass");
  const hasFail = results.some((result) => result.status === "fail");
  if ((parsed.failOnWarn && hasWarnOrFail) || (parsed.strict && hasFail)) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
