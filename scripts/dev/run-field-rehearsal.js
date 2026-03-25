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

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function runNode(repoRoot, args) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8"
  });
}

function parseJsonOrNull(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function main() {
  const repoRoot = process.cwd();
  const mode = getArg("mode", "prepare");
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

  const mqttUrl = getArg("mqtt", "mqtt://127.0.0.1:1883");
  const httpUrl = getArg("http", "http://127.0.0.1:8091/iot/huawei/telemetry");
  const username = getArg("username", "");
  const password = getArg("password", "");
  const token = getArg("token", "");

  const evidenceRoot = path.join(repoRoot, "backups", "evidence", `field-rehearsal-${stamp}`);
  const summaryPath = path.join(evidenceRoot, "summary.json");

  const prepare = runNode(repoRoot, [
    "scripts/dev/prepare-field-rehearsal.js",
    "--scope",
    scope,
    "--stamp",
    stamp,
    "--samples",
    samples.join(",")
  ]);
  if (prepare.status !== 0) {
    throw new Error(`prepare-field-rehearsal failed:\n${prepare.stdout}\n${prepare.stderr}`);
  }

  const prepareJson = parseJsonOrNull(prepare.stdout) || {};
  const summary = fs.existsSync(summaryPath) ? loadJson(summaryPath) : {};
  summary.runId = summary.runId || `field-rehearsal-${stamp}`;
  summary.scope = scope;
  summary.tooling = {
    ...(summary.tooling || {}),
    nodeSimulator: "payload-samples | generate-field-rehearsal-sample",
    gatewayHarness: "Node-RED | custom adapter harness",
    platformProbe: "MQTTX | API probes | Desk/Web checks"
  };
  summary.notes = Array.isArray(summary.notes) ? summary.notes : [];
  summary.notes.push(`Prepared by run-field-rehearsal.js in mode=${mode}`);

  const publishResults = [];

  if (mode === "mqtt" || mode === "http") {
    for (const sample of samples) {
      const args = [
        "scripts/dev/publish-field-rehearsal-sample.js",
        "--sample",
        sample,
        "--mode",
        mode
      ];

      if (mode === "mqtt") {
        args.push("--mqtt", mqttUrl);
        if (username) args.push("--username", username);
        if (password) args.push("--password", password);
      } else {
        args.push("--http", httpUrl);
        if (token) args.push("--token", token);
      }

      const result = runNode(repoRoot, args);
      const parsed = parseJsonOrNull(result.stdout);
      publishResults.push({
        sample,
        mode,
        ok: result.status === 0,
        output: parsed,
        stderr: (result.stderr || "").trim()
      });
    }

    summary.results = {
      ...(summary.results || {}),
      accepted: publishResults.filter((r) => r.ok).length,
      rejected: publishResults.filter((r) => !r.ok).length,
      replayed: (summary.results && summary.results.replayed) || 0
    };
    summary.publish = publishResults;
    summary.conclusion = publishResults.every((r) => r.ok) ? "publish-ok" : "publish-partial-or-failed";
  } else {
    summary.results = {
      ...(summary.results || {}),
      accepted: 0,
      rejected: 0,
      replayed: 0
    };
    summary.conclusion = "prepared";
  }

  writeJson(summaryPath, summary);

  console.log(
    JSON.stringify(
      {
        runId: summary.runId,
        mode,
        evidenceRoot: prepareJson.evidenceRoot || path.relative(repoRoot, evidenceRoot).replace(/\\/g, "/"),
        summary: path.relative(repoRoot, summaryPath).replace(/\\/g, "/"),
        accepted: summary.results.accepted,
        rejected: summary.results.rejected,
        conclusion: summary.conclusion
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
