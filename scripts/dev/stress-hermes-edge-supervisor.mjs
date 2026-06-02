#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULTS = {
  baseUrl: "http://127.0.0.1:18082",
  durationSeconds: 30,
  concurrency: 8,
  recheckEvery: 25,
  timeoutMs: 5000,
  label: "hermes-edge-supervisor-stress",
  out: "docs/unified/reports/hermes-edge-supervisor-stress-latest.json"
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    const next = argv[index + 1];
    if (item === "--base-url" && next) {
      args.baseUrl = next;
      index += 1;
    } else if (item === "--duration-seconds" && next) {
      args.durationSeconds = Number(next);
      index += 1;
    } else if (item === "--concurrency" && next) {
      args.concurrency = Number(next);
      index += 1;
    } else if (item === "--recheck-every" && next) {
      args.recheckEvery = Number(next);
      index += 1;
    } else if (item === "--timeout-ms" && next) {
      args.timeoutMs = Number(next);
      index += 1;
    } else if (item === "--label" && next) {
      args.label = next;
      index += 1;
    } else if (item === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (item === "--help" || item === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${item}`);
    }
  }

  if (!Number.isFinite(args.durationSeconds) || args.durationSeconds <= 0) {
    throw new Error("--duration-seconds must be positive");
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency <= 0) {
    throw new Error("--concurrency must be a positive integer");
  }
  if (!Number.isInteger(args.recheckEvery) || args.recheckEvery < 0) {
    throw new Error("--recheck-every must be an integer >= 0");
  }
  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer");
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, "");
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/dev/stress-hermes-edge-supervisor.mjs [options]

Options:
  --base-url <url>             Default: ${DEFAULTS.baseUrl}
  --duration-seconds <number>  Default: ${DEFAULTS.durationSeconds}
  --concurrency <number>       Default: ${DEFAULTS.concurrency}
  --recheck-every <number>     Run POST /v1/actions/recheck every N requests; 0 disables. Default: ${DEFAULTS.recheckEvery}
  --timeout-ms <number>        Per-request timeout. Default: ${DEFAULTS.timeoutMs}
  --label <text>               Report label
  --out <path>                 Report JSON path. Use "-" to only print stdout.
`);
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return Number(sortedValues[index].toFixed(3));
}

function summarizeLatencies(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    count: sorted.length,
    minMs: sorted.length > 0 ? Number(sorted[0].toFixed(3)) : null,
    meanMs: sorted.length > 0 ? Number((sum / sorted.length).toFixed(3)) : null,
    p50Ms: percentile(sorted, 50),
    p90Ms: percentile(sorted, 90),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted.length > 0 ? Number(sorted[sorted.length - 1].toFixed(3)) : null
  };
}

async function requestJson(url, init, timeoutMs) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    const latencyMs = performance.now() - startedAt;
    let json = null;
    let jsonError = null;
    try {
      json = text.length > 0 ? JSON.parse(text) : null;
    } catch (error) {
      jsonError = error instanceof Error ? error.message : String(error);
    }
    return {
      ok: response.ok,
      status: response.status,
      latencyMs,
      json,
      error: jsonError
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: performance.now() - startedAt,
      json: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function inspectResponse(kind, result) {
  if (!result.ok) {
    return {
      valid: false,
      error: result.error ?? `http ${result.status}`
    };
  }
  if (!result.json || typeof result.json !== "object") {
    return {
      valid: false,
      error: result.error ?? "response json is empty or invalid"
    };
  }

  if (kind === "supervision") {
    const aiDiagnosis = result.json.aiDiagnosis ?? {};
    const featureVector = aiDiagnosis.featureVector ?? {};
    return {
      valid: aiDiagnosis.modelLoaded === true && typeof aiDiagnosis.diagnosisType === "string",
      modelLoaded: aiDiagnosis.modelLoaded === true,
      diagnosisType: aiDiagnosis.diagnosisType ?? null,
      confidence: typeof aiDiagnosis.confidence === "number" ? aiDiagnosis.confidence : null,
      featureCount: featureVector && typeof featureVector === "object" ? Object.keys(featureVector).length : 0,
      aiModelCount: Array.isArray(result.json.aiModels) ? result.json.aiModels.length : 0,
      naturalLanguageReady: result.json.actionInterface?.naturalLanguageReady === true,
      error: null
    };
  }

  const action = result.json.action ?? {};
  const safety = result.json.safetyBoundary ?? {};
  const safe =
    safety.gatewayCoreTouched === false &&
    safety.serialTouched === false &&
    safety.mqttTouched === false;
  return {
    valid: result.json.accepted === true && action.status === "completed" && safe,
    action: action.action ?? null,
    actionStatus: action.status ?? null,
    safetyGatewayCoreTouched: safety.gatewayCoreTouched ?? null,
    safetySerialTouched: safety.serialTouched ?? null,
    safetyMqttTouched: safety.mqttTouched ?? null,
    error: null
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const startedWall = new Date();
  const started = performance.now();
  const endAt = started + args.durationSeconds * 1000;
  let requestSeq = 0;
  const samples = [];
  const errors = new Map();
  const endpointStats = {
    supervision: { total: 0, ok: 0, invalid: 0, latencies: [] },
    recheck: { total: 0, ok: 0, invalid: 0, latencies: [] }
  };
  const latestInspection = {
    supervision: null,
    recheck: null
  };

  async function worker(workerId) {
    while (performance.now() < endAt) {
      const seq = requestSeq;
      requestSeq += 1;
      const useRecheck = args.recheckEvery > 0 && seq > 0 && seq % args.recheckEvery === 0;
      const kind = useRecheck ? "recheck" : "supervision";
      const url = useRecheck ? `${args.baseUrl}/v1/actions/recheck` : `${args.baseUrl}/v1/supervision`;
      const init = useRecheck
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intent: "压测复检链路",
              requestedBy: `stress-worker-${workerId}`
            })
          }
        : { method: "GET" };

      const result = await requestJson(url, init, args.timeoutMs);
      const inspection = inspectResponse(kind, result);
      endpointStats[kind].total += 1;
      endpointStats[kind].latencies.push(result.latencyMs);
      if (result.ok && inspection.valid) {
        endpointStats[kind].ok += 1;
      } else {
        endpointStats[kind].invalid += 1;
        const key = inspection.error ?? result.error ?? `invalid_${kind}_${result.status}`;
        errors.set(key, (errors.get(key) ?? 0) + 1);
      }
      latestInspection[kind] = inspection;
      samples.push({
        seq,
        kind,
        status: result.status,
        ok: result.ok,
        valid: inspection.valid,
        latencyMs: Number(result.latencyMs.toFixed(3)),
        error: inspection.error ?? result.error ?? null
      });
    }
  }

  await Promise.all(Array.from({ length: args.concurrency }, (_, index) => worker(index + 1)));

  const ended = performance.now();
  const elapsedSeconds = (ended - started) / 1000;
  const allLatencies = [
    ...endpointStats.supervision.latencies,
    ...endpointStats.recheck.latencies
  ];
  const total = endpointStats.supervision.total + endpointStats.recheck.total;
  const ok = endpointStats.supervision.ok + endpointStats.recheck.ok;
  const invalid = endpointStats.supervision.invalid + endpointStats.recheck.invalid;

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "hermes-edge-supervisor-stress-test",
    label: args.label,
    target: {
      baseUrl: args.baseUrl,
      durationSeconds: args.durationSeconds,
      actualElapsedSeconds: Number(elapsedSeconds.toFixed(3)),
      concurrency: args.concurrency,
      recheckEvery: args.recheckEvery,
      timeoutMs: args.timeoutMs,
      startedAt: startedWall.toISOString()
    },
    accepted: total > 0 && invalid === 0,
    summary: {
      totalRequests: total,
      okRequests: ok,
      invalidRequests: invalid,
      errorRate: total > 0 ? Number((invalid / total).toFixed(6)) : null,
      throughputRps: Number((total / elapsedSeconds).toFixed(3)),
      latency: summarizeLatencies(allLatencies)
    },
    endpoints: {
      supervision: {
        ...endpointStats.supervision,
        latencies: undefined,
        latency: summarizeLatencies(endpointStats.supervision.latencies),
        latestInspection: latestInspection.supervision
      },
      recheck: {
        ...endpointStats.recheck,
        latencies: undefined,
        latency: summarizeLatencies(endpointStats.recheck.latencies),
        latestInspection: latestInspection.recheck
      }
    },
    errors: Object.fromEntries([...errors.entries()].sort((a, b) => b[1] - a[1])),
    sampleTail: samples.slice(-20)
  };

  const output = JSON.stringify(report, null, 2);
  if (args.out !== "-") {
    const outPath = path.resolve(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, output, "utf8");
  }
  console.log(output);

  if (!report.accepted) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
