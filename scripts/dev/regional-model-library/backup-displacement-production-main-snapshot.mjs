import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const OUT_MANIFEST = path.join(ROOT, "displacement-production-main-current-backup-manifest.json");
const OUT_READINESS = path.join(ROOT, "displacement-production-main-readiness.report.json");
const OUT_READINESS_MD = path.join(ROOT, "displacement-production-main-readiness.report.md");

const EXPECTED_PRODUCTION = [
  {
    scopeLabel: "Baijiabao station",
    modelKey: "baijiabao.displacement.pointwise-fixed-expert-ensemble-v31-dev-gated-state-protected-v33",
    modelVersion: "0.33.0",
    artifactFile: "baijiabao-displacement-v33.prediction-regression-v1.json",
    validationReport: "check-baijiabao-displacement-runtime-forecast.report.json",
    promotionReport: "promote-baijiabao-displacement-v33-production.report.json",
    previousBackupManifest: "baijiabao-displacement-v33-production-backup-manifest.json"
  },
  {
    scopeLabel: "Badong-Huangtupo region",
    modelKey: "badong-huangtupo.displacement.hgb-point-gated-v5-selector-v7",
    modelVersion: "0.7.0",
    artifactFile: "badong-huangtupo-displacement-v7.gated-selector.prediction-regression-v1.json",
    validationReport: "check-badong-huangtupo-v7-runtime-validation.report.json",
    promotionReport: "promote-badong-huangtupo-gated-selector-v7-production.report.json",
    previousBackupManifest: "badong-huangtupo-displacement-v7-production-backup-manifest.json"
  }
];

const SUPPORT_FILES = [
  "registry.json",
  "check-displacement-production-main-routing.report.json",
  "check-displacement-production-main-routing.report.md",
  "check-badong-huangtupo-displacement-runtime-forecast.report.json",
  "check-baijiabao-displacement-runtime-forecast.report.json"
];

const REGISTERED_CHALLENGERS = [
  {
    scopeLabel: "Badong-Huangtupo context-enriched challenger",
    modelKey: "badong-huangtupo.displacement.hgb-context-enriched-support-guarded-v5",
    modelVersion: "0.5.0",
    artifactFile: "badong-huangtupo-displacement-v5.context-enriched.prediction-regression-v1.json",
    validationReport: "check-badong-huangtupo-v5-runtime-validation.report.json",
    registrationReport: "register-badong-huangtupo-context-v5-challenger.report.json",
    trainingReport: "badong-huangtupo-context-enriched-v5.report.json"
  }
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function writeText(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, payload, "utf-8");
}

async function fileSha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function fileRecord(filePath, label) {
  const stats = await stat(filePath);
  return {
    label,
    path: filePath,
    sizeBytes: stats.size,
    sha256: await fileSha256(filePath)
  };
}

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/gu, "-");
}

function asRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}

function findRegistryEntry(registry, modelKey) {
  return Array.isArray(registry.artifacts)
    ? registry.artifacts.find((entry) => entry?.modelKey === modelKey) ?? null
    : null;
}

function metricSummaryFromValidation(report, modelKey) {
  if (modelKey.startsWith("baijiabao.")) {
    return asRecord(report.metrics);
  }
  return asRecord(report.metrics);
}

function hasNumber(record, key) {
  return typeof record[key] === "number" && Number.isFinite(record[key]);
}

function checkMetrics(modelKey, metrics) {
  const required = ["mae", "rmse", "r2", "directionAccuracy", "within1mm", "p90AbsError"];
  const missing = required.filter((key) => !hasNumber(metrics, key));
  if (missing.length > 0) {
    return {
      pass: false,
      reason: `missing metrics: ${missing.join(", ")}`
    };
  }
  if (modelKey.startsWith("badong-huangtupo.")) {
    return {
      pass:
        metrics.mae < 0.5226695162230425 &&
        metrics.rmse < 1.3957864094468682 &&
        metrics.r2 > -0.00001415637218604715 &&
        metrics.directionAccuracy > 0.2665630464348164 &&
        metrics.within1mm > 0.8587526714591024 &&
        metrics.p90AbsError < 1.8,
      reason: "Badong v4 must beat its zero-delta regional baseline on all production gates."
    };
  }
  return {
    pass: metrics.mae < 0.7 && metrics.rmse < 1.0 && metrics.within1mm >= 0.8 && metrics.p90AbsError < 1.5,
    reason: "Baijiabao v33 must stay inside the accepted production accuracy band."
  };
}

function buildMarkdown(report) {
  const rows = report.modelReadiness
    .map(
      (entry) =>
        `| ${entry.scopeLabel} | ${entry.modelKey}@${entry.modelVersion} | ${entry.pass ? "pass" : "fail"} | ${entry.metrics.mae} | ${entry.metrics.rmse} | ${entry.metrics.r2} | ${entry.metrics.directionAccuracy} | ${entry.metrics.within1mm} | ${entry.metrics.p90AbsError} |`
    )
    .join("\n");
  const backupRows = report.backupManifest.files
    .map((entry) => `| ${entry.label} | ${entry.sizeBytes} | ${entry.sha256} |`)
    .join("\n");

  return `# Displacement Production-main Readiness

Generated at: ${report.generatedAt}

## Verdict

- pass: ${String(report.pass)}
- backup root: \`${report.backupManifest.backupRoot}\`
- route proof pass: ${String(report.routeProof.pass)}
- unknown region guarded: ${String(report.routeProof.unknownRegionGuarded)}
- field boundary: \`${report.fieldBoundary.displacementForecastField}\`

## Model Readiness

| scope | model | pass | MAE | RMSE | R2 | Direction | Within 1mm | P90 AE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Backup Files

| label | sizeBytes | sha256 |
| --- | --- | --- |
${backupRows}

## Production Boundary

- 位移预测输出只进入 \`forecastInference.predictedDisplacementMm\`。
- \`riskScore\` / \`riskLevel\` 仍由风险预警链路负责。
- 当前可生产主线是区域专家匹配，不是把单站模型强行迁移到所有区域。
`;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const backupRoot = path.join(ROOT, "backups", `current-production-main-${stamp(new Date(generatedAt))}`);
  const registry = await readJson(path.join(ROOT, "registry.json"));
  const routeProof = await readJson(path.join(ROOT, "check-displacement-production-main-routing.report.json"));

  const filesToBackup = new Map();
  for (const fileName of SUPPORT_FILES) {
    filesToBackup.set(fileName, `support:${fileName}`);
  }
  for (const model of EXPECTED_PRODUCTION) {
    filesToBackup.set(model.artifactFile, `${model.scopeLabel}:artifact`);
    filesToBackup.set(model.validationReport, `${model.scopeLabel}:validation`);
    filesToBackup.set(model.promotionReport, `${model.scopeLabel}:promotion`);
    filesToBackup.set(model.previousBackupManifest, `${model.scopeLabel}:previous-backup-manifest`);
  }
  for (const challenger of REGISTERED_CHALLENGERS) {
    filesToBackup.set(challenger.artifactFile, `${challenger.scopeLabel}:artifact`);
    filesToBackup.set(challenger.validationReport, `${challenger.scopeLabel}:validation`);
    filesToBackup.set(challenger.registrationReport, `${challenger.scopeLabel}:registration`);
    filesToBackup.set(challenger.trainingReport, `${challenger.scopeLabel}:training`);
  }

  await mkdir(backupRoot, { recursive: true });
  const backupFiles = [];
  for (const [fileName, label] of filesToBackup.entries()) {
    const source = path.join(ROOT, fileName);
    const target = path.join(backupRoot, fileName);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    backupFiles.push(await fileRecord(target, label));
  }
  backupFiles.sort((left, right) => left.label.localeCompare(right.label));

  const modelReadiness = [];
  for (const model of EXPECTED_PRODUCTION) {
    const registryEntry = findRegistryEntry(registry, model.modelKey);
    const artifact = await readJson(path.join(ROOT, model.artifactFile));
    const validationReport = await readJson(path.join(ROOT, model.validationReport));
    const metrics = metricSummaryFromValidation(validationReport, model.modelKey);
    const metricGate = checkMetrics(model.modelKey, metrics);
    const entryMetadata = asRecord(registryEntry?.metadata);
    const pass =
      registryEntry !== null &&
      registryEntry.modelVersion === model.modelVersion &&
      registryEntry.artifactUri === `./${model.artifactFile}` &&
      entryMetadata.activeProduction === true &&
      artifact.modelKey === model.modelKey &&
      artifact.modelVersion === model.modelVersion &&
      metricGate.pass;
    modelReadiness.push({
      scopeLabel: model.scopeLabel,
      modelKey: model.modelKey,
      modelVersion: model.modelVersion,
      pass,
      registryRole: entryMetadata.registryRole ?? null,
      artifactFile: model.artifactFile,
      validationReport: model.validationReport,
      metrics,
      metricGate,
      artifactSha256: await fileSha256(path.join(ROOT, model.artifactFile))
    });
  }

  const unknownCase = Array.isArray(routeProof.pipelineCases)
    ? routeProof.pipelineCases.find((entry) => entry.caseKey === "unknown-runtime-no-forecast")
    : null;
  const routeProofSummary = {
    pass: routeProof.pass === true,
    unknownRegionGuarded: unknownCase?.pass === true && unknownCase?.forecastPresent === false,
    report: path.join(ROOT, "check-displacement-production-main-routing.report.json")
  };
  const challengerReadiness = [];
  for (const challenger of REGISTERED_CHALLENGERS) {
    const registryEntry = findRegistryEntry(registry, challenger.modelKey);
    const artifact = await readJson(path.join(ROOT, challenger.artifactFile));
    const validationReport = await readJson(path.join(ROOT, challenger.validationReport));
    const entryMetadata = asRecord(registryEntry?.metadata);
    challengerReadiness.push({
      scopeLabel: challenger.scopeLabel,
      modelKey: challenger.modelKey,
      modelVersion: challenger.modelVersion,
      pass:
        registryEntry !== null &&
        registryEntry.modelVersion === challenger.modelVersion &&
        registryEntry.artifactUri === `./${challenger.artifactFile}` &&
        entryMetadata.activeProduction === false &&
        artifact.modelKey === challenger.modelKey &&
        artifact.modelVersion === challenger.modelVersion &&
        validationReport.pass === true,
      registryRole: entryMetadata.registryRole ?? null,
      promotionDecision: entryMetadata.promotionDecision ?? null,
      metrics: asRecord(validationReport.metrics),
      artifactSha256: await fileSha256(path.join(ROOT, challenger.artifactFile))
    });
  }
  const manifest = {
    generatedAt,
    backupRoot,
    sourceRoot: ROOT,
    registry: await fileRecord(path.join(ROOT, "registry.json"), "support:registry"),
    files: backupFiles
  };
  const report = {
    generatedAt,
    pass:
      modelReadiness.every((entry) => entry.pass) &&
      challengerReadiness.every((entry) => entry.pass) &&
      routeProofSummary.pass &&
      routeProofSummary.unknownRegionGuarded,
    modelReadiness,
    challengerReadiness,
    routeProof: routeProofSummary,
    backupManifest: manifest,
    fieldBoundary: {
      displacementForecastField: "payloadExt.forecastInference.predictedDisplacementMm",
      riskScoreField: "riskScore",
      riskLevelField: "riskLevel"
    }
  };

  await writeJson(OUT_MANIFEST, manifest);
  await writeJson(OUT_READINESS, report);
  await writeText(OUT_READINESS_MD, buildMarkdown(report));

  console.log(`Pass: ${report.pass}`);
  console.log(`Backup root: ${backupRoot}`);
  console.log(`Readiness report: ${OUT_READINESS}`);
  console.log(`Readiness markdown: ${OUT_READINESS_MD}`);
  console.log(`Backup manifest: ${OUT_MANIFEST}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
