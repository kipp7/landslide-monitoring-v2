const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function getArg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function runNode(repoRoot, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8"
  });
  return result;
}

function main() {
  const repoRoot = process.cwd();
  const scope = getArg("scope", "node-gateway");
  const stamp = getArg("stamp", nowStamp());
  const samplesArg = getArg(
    "samples",
    "hf-normal,hf-duplicate,hf-out-of-order,hf-oversized,hf-replay,lf-meta"
  );
  const samples = samplesArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith(".json") ? s : `${s}.json`));

  const sampleDir = path.join(repoRoot, "docs", "tools", "field-rehearsal", "payload-samples");
  const summaryTemplatePath = path.join(
    repoRoot,
    "docs",
    "tools",
    "field-rehearsal",
    "evidence",
    "summary.template.json"
  );
  const evidenceRoot = path.join(repoRoot, "backups", "evidence", `field-rehearsal-${stamp}`);
  const nodeDir = path.join(evidenceRoot, "node");
  const gatewayDir = path.join(evidenceRoot, "gateway");
  const platformDir = path.join(evidenceRoot, "platform");
  const payloadOutDir = path.join(nodeDir, "payload-samples");

  ensureDir(payloadOutDir);
  ensureDir(gatewayDir);
  ensureDir(platformDir);

  const checkResult = runNode(repoRoot, ["scripts/dev/check-field-rehearsal-samples.js"]);
  const checkOutput = (checkResult.stdout || "").trim();
  const checkJson = checkOutput ? JSON.parse(checkOutput) : null;
  if (checkResult.status !== 0) {
    throw new Error(`check-field-rehearsal-samples failed:\n${checkResult.stdout}\n${checkResult.stderr}`);
  }

  for (const sample of samples) {
    const source = path.join(sampleDir, sample);
    if (!fs.existsSync(source)) {
      throw new Error(`Sample not found: ${source}`);
    }
    const target = path.join(payloadOutDir, sample);
    fs.copyFileSync(source, target);
  }

  const profileSummaryPath = path.join(nodeDir, "profile-summary.json");
  writeJson(profileSummaryPath, checkJson);

  const summary = loadJson(summaryTemplatePath);
  summary.runId = `field-rehearsal-${stamp}`;
  summary.scope = scope;
  summary.samples = samples;
  summary.results.accepted = 0;
  summary.results.rejected = 0;
  summary.results.replayed = 0;
  summary.notes = [
    "Prepared by prepare-field-rehearsal.js",
    "Payload samples copied into node/payload-samples",
    "profile-summary.json generated from current sample validation"
  ];
  summary.conclusion = "prepared";

  const summaryOutPath = path.join(evidenceRoot, "summary.json");
  writeJson(summaryOutPath, summary);

  console.log(
    JSON.stringify(
      {
        runId: summary.runId,
        scope,
        evidenceRoot: path.relative(repoRoot, evidenceRoot).replace(/\\/g, "/"),
        samples,
        profileSummary: path.relative(repoRoot, profileSummaryPath).replace(/\\/g, "/"),
        summary: path.relative(repoRoot, summaryOutPath).replace(/\\/g, "/")
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
