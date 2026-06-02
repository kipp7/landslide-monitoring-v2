/*
  Chapter 5 performance benchmark helper.

  Runs authenticated HTTP/API benchmark scenarios and writes JSON/CSV evidence
  for the competition technical document.

  Example:
    node scripts/dev/chapter5-performance-benchmark.js
*/

const { performance } = require("node:perf_hooks");
const { mkdirSync, writeFileSync, copyFileSync } = require("node:fs");
const { join } = require("node:path");

function getArg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

async function timedFetch(baseUrl, path, headers, timeoutMs) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, { method: "GET", headers, signal: controller.signal });
    const text = await res.text();
    const elapsedMs = performance.now() - started;
    return {
      ok: res.ok,
      status: res.status,
      elapsedMs,
      bytes: Buffer.byteLength(text)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: performance.now() - started,
      bytes: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function login(baseUrl, username, password) {
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`login failed: HTTP ${res.status} ${text}`);
  }
  const payload = JSON.parse(text);
  const token = payload?.data?.token;
  if (!token) throw new Error("login response did not include token");
  return token;
}

function summarizeResults(name, startedAt, endedAt, results) {
  const latencies = results.map((r) => r.elapsedMs);
  const success = results.filter((r) => r.ok).length;
  const failures = results.length - success;
  const elapsedS = Math.max(0.001, (endedAt - startedAt) / 1000);
  const statusCounts = {};
  let totalBytes = 0;
  for (const r of results) {
    statusCounts[String(r.status)] = (statusCounts[String(r.status)] ?? 0) + 1;
    totalBytes += r.bytes;
  }
  return {
    name,
    requests: results.length,
    success,
    failures,
    successRatePct: round((success / Math.max(1, results.length)) * 100, 3),
    throughputRps: round(results.length / elapsedS, 2),
    elapsedS: round(elapsedS, 3),
    minMs: round(Math.min(...latencies)),
    meanMs: round(latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length)),
    medianMs: round(percentile(latencies, 50)),
    p95Ms: round(percentile(latencies, 95)),
    p99Ms: round(percentile(latencies, 99)),
    maxMs: round(Math.max(...latencies)),
    totalBytes,
    statusCounts
  };
}

async function runScenario(baseUrl, scenario, headers, timeoutMs) {
  const tasks = [];
  const results = [];
  let next = 0;
  const startedAt = performance.now();

  async function worker() {
    while (next < scenario.requests) {
      const i = next++;
      const path = scenario.paths[i % scenario.paths.length];
      const result = await timedFetch(baseUrl, path, headers, timeoutMs);
      results.push({ ...result, path });
    }
  }

  for (let i = 0; i < scenario.concurrency; i += 1) {
    tasks.push(worker());
  }
  await Promise.all(tasks);

  const endedAt = performance.now();
  const summary = summarizeResults(scenario.name, startedAt, endedAt, results);
  const byPath = [];
  for (const path of scenario.paths) {
    const pathResults = results.filter((r) => r.path === path);
    byPath.push({
      path,
      ...summarizeResults(path, startedAt, endedAt, pathResults)
    });
  }

  return {
    ...scenario,
    summary,
    byPath,
    sampledFailures: results.filter((r) => !r.ok).slice(0, 10)
  };
}

function writeOutputs(outDir, report) {
  mkdirSync(outDir, { recursive: true });
  const stamp = report.generatedAt.replaceAll(":", "").replaceAll("-", "").slice(0, 15);
  const jsonPath = join(outDir, `chapter5-3-performance-benchmark-${stamp}.json`);
  const latestJsonPath = join(outDir, "chapter5-3-performance-benchmark-latest.json");
  const csvPath = join(outDir, `chapter5-3-performance-benchmark-${stamp}.csv`);
  const latestCsvPath = join(outDir, "chapter5-3-performance-benchmark-latest.csv");

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  copyFileSync(jsonPath, latestJsonPath);

  const rows = [
    [
      "scenario",
      "requests",
      "concurrency",
      "successRatePct",
      "throughputRps",
      "meanMs",
      "medianMs",
      "p95Ms",
      "p99Ms",
      "maxMs",
      "failures"
    ]
  ];
  for (const scenario of report.scenarios) {
    rows.push([
      scenario.name,
      scenario.summary.requests,
      scenario.concurrency,
      scenario.summary.successRatePct,
      scenario.summary.throughputRps,
      scenario.summary.meanMs,
      scenario.summary.medianMs,
      scenario.summary.p95Ms,
      scenario.summary.p99Ms,
      scenario.summary.maxMs,
      scenario.summary.failures
    ]);
  }
  writeFileSync(csvPath, rows.map((row) => row.map(csvEscape).join(",")).join("\n"), "utf8");
  copyFileSync(csvPath, latestCsvPath);
  return { jsonPath, latestJsonPath, csvPath, latestCsvPath };
}

async function main() {
  const baseUrl = getArg("baseUrl", process.env.LSMV2_API_BASE_URL || "http://127.0.0.1:8080");
  const username = getArg("username", process.env.LSMV2_USERNAME || "admin");
  const password = getArg("password", process.env.LSMV2_PASSWORD || "123456");
  const outDir = getArg(
    "outDir",
    process.env.LSMV2_BENCHMARK_OUT ||
      "E:\\学校\\02 项目\\04 各种比赛\\03 计算机大赛\\02_山体滑坡\\测试与证明材料\\05_性能测试证明"
  );
  const profile = getArg("profile", process.env.LSMV2_BENCHMARK_PROFILE || "normal");
  const timeoutMs = Number(getArg("timeoutMs", process.env.LSMV2_BENCHMARK_TIMEOUT_MS || "15000"));

  const token = await login(baseUrl, username, password);
  const headers = { authorization: `Bearer ${token}` };
  const generatedAt = new Date().toISOString();

  const commonPaths = [
    "/health",
    "/api/v1/system/status",
    "/api/v1/dashboard",
    "/api/v1/stations?page=1&pageSize=20",
    "/api/v1/devices?page=1&pageSize=20",
    "/api/v1/alerts?page=1&pageSize=20",
    "/api/v1/ai/predictions?page=1&pageSize=20",
    "/api/v1/telemetry/dlq/stats"
  ];

  const profiles = {
    normal: [
      { name: "demo", displayName: "演示工况", requests: 500, concurrency: 20, paths: commonPaths },
      { name: "multi_site", displayName: "多站点工况", requests: 1200, concurrency: 60, paths: commonPaths },
      { name: "burst", displayName: "突发工况", requests: 2000, concurrency: 120, paths: commonPaths }
    ],
    stress: [
      { name: "stress_200", displayName: "高压-200并发", requests: 5000, concurrency: 200, paths: commonPaths },
      { name: "stress_400", displayName: "高压-400并发", requests: 10000, concurrency: 400, paths: commonPaths },
      { name: "stress_800", displayName: "高压-800并发", requests: 20000, concurrency: 800, paths: commonPaths }
    ],
    max: [
      { name: "max_400", displayName: "极限-400并发", requests: 10000, concurrency: 400, paths: commonPaths },
      { name: "max_800", displayName: "极限-800并发", requests: 20000, concurrency: 800, paths: commonPaths },
      { name: "max_1200", displayName: "极限-1200并发", requests: 30000, concurrency: 1200, paths: commonPaths }
    ],
    ultra: [
      { name: "ultra_1600", displayName: "超限-1600并发", requests: 40000, concurrency: 1600, paths: commonPaths },
      { name: "ultra_2400", displayName: "超限-2400并发", requests: 60000, concurrency: 2400, paths: commonPaths }
    ],
    limit: [
      { name: "limit_3600", displayName: "极限-3600并发", requests: 90000, concurrency: 3600, paths: commonPaths },
      { name: "limit_5000", displayName: "极限-5000并发", requests: 100000, concurrency: 5000, paths: commonPaths }
    ],
    absolute: [
      { name: "absolute_8000", displayName: "最大-8000并发", requests: 120000, concurrency: 8000, paths: commonPaths }
    ]
  };
  const scenarios = profiles[profile];
  if (!scenarios) {
    throw new Error(`unknown profile: ${profile}; available=${Object.keys(profiles).join(",")}`);
  }

  console.log(`benchmark baseUrl=${baseUrl} profile=${profile} timeoutMs=${timeoutMs}`);
  console.log(`output=${outDir}`);

  const warmed = await runScenario(baseUrl, { name: "warmup", requests: 80, concurrency: 8, paths: commonPaths }, headers, timeoutMs);
  console.log(
    `warmup success=${warmed.summary.successRatePct}% rps=${warmed.summary.throughputRps} p95=${warmed.summary.p95Ms}ms`
  );

  const scenarioReports = [];
  for (const scenario of scenarios) {
    const report = await runScenario(baseUrl, scenario, headers, timeoutMs);
    scenarioReports.push(report);
    console.log(
      `${scenario.name} requests=${report.summary.requests} concurrency=${scenario.concurrency} success=${report.summary.successRatePct}% rps=${report.summary.throughputRps} p95=${report.summary.p95Ms}ms p99=${report.summary.p99Ms}ms failures=${report.summary.failures}`
    );
  }

  const report = {
    generatedAt,
    baseUrl,
    username,
    profile,
    timeoutMs,
    node: process.version,
    warmup: warmed,
    scenarios: scenarioReports
  };

  const outputs = writeOutputs(outDir, report);
  console.log(JSON.stringify(outputs, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
