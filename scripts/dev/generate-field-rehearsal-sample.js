const fs = require("node:fs");
const path = require("node:path");

function getArg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function requireArg(name) {
  const value = getArg(name);
  if (!value) {
    console.error(`Missing required arg: --${name}`);
    process.exit(2);
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadBaseSample(repoRoot, sampleName) {
  const samplePath = path.join(
    repoRoot,
    "docs",
    "tools",
    "field-rehearsal",
    "payload-samples",
    sampleName.endsWith(".json") ? sampleName : `${sampleName}.json`
  );
  if (!fs.existsSync(samplePath)) {
    throw new Error(`Sample not found: ${samplePath}`);
  }
  return {
    samplePath,
    payload: JSON.parse(fs.readFileSync(samplePath, "utf8"))
  };
}

function applyOverrides(payload, overrides) {
  const out = clone(payload);
  if (overrides.deviceId) out.device_id = overrides.deviceId;
  if (Number.isFinite(overrides.seq)) out.seq = overrides.seq;
  if (overrides.eventTs !== undefined) out.event_ts = overrides.eventTs;

  if (Number.isFinite(overrides.repeatMetrics) && overrides.repeatMetrics > 0) {
    const metrics = clone(out.metrics || {});
    for (let i = 0; i < overrides.repeatMetrics; i += 1) {
      metrics[`debug_metric_${String(i).padStart(2, "0")}`] = i;
    }
    out.metrics = metrics;
  }

  if (overrides.metaPacketClass) {
    out.meta = {
      ...(out.meta || {}),
      packet_class: overrides.metaPacketClass
    };
  }

  return out;
}

function main() {
  const repoRoot = process.cwd();
  const sample = requireArg("sample");
  const outFile = getArg("out");
  const deviceId = getArg("device");
  const seqRaw = getArg("seq");
  const eventTs = getArg("eventTs");
  const repeatMetricsRaw = getArg("repeatMetrics");
  const packetClass = getArg("packetClass");

  const seq = seqRaw !== undefined ? Number(seqRaw) : undefined;
  const repeatMetrics = repeatMetricsRaw !== undefined ? Number(repeatMetricsRaw) : undefined;

  const { samplePath, payload } = loadBaseSample(repoRoot, sample);
  const generated = applyOverrides(payload, {
    deviceId,
    seq,
    eventTs,
    repeatMetrics,
    metaPacketClass: packetClass
  });

  const text = JSON.stringify(generated, null, 2) + "\n";

  if (outFile) {
    const target = path.resolve(repoRoot, outFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, "utf8");
    console.log(
      JSON.stringify(
        {
          sample: path.basename(samplePath),
          outFile: path.relative(repoRoot, target).replace(/\\/g, "/"),
          bytes: Buffer.byteLength(JSON.stringify(generated), "utf8")
        },
        null,
        2
      )
    );
    return;
  }

  process.stdout.write(text);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
