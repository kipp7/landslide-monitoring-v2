const fs = require("node:fs");
const path = require("node:path");

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function findHardwareStableRoot(startDir, depth = 4) {
  if (depth < 0) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(startDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "xl01_landslide_monitor_v1.0") {
      return path.join(startDir, entry.name);
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if ([".git", "node_modules", ".tmp", "artifacts", "backups", "data"].includes(entry.name)) continue;
    const nested = findHardwareStableRoot(path.join(startDir, entry.name), depth - 1);
    if (nested) return nested;
  }

  return null;
}

function readHardwareConfig(repoRoot) {
  const workspaceRoot = path.dirname(repoRoot);
  const hardwareRoot = findHardwareStableRoot(workspaceRoot);
  if (!hardwareRoot) return null;
  const appConfigPath = path.join(hardwareRoot, "config", "app_config.h");
  const raw = fs.readFileSync(appConfigPath, "utf8");
  const match = raw.match(/#define\s+DEVICE_ID\s+"([^"]+)"/);
  return {
    hardwareRoot,
    appConfigPath,
    deviceId: match ? match[1] : null
  };
}

function buildCommand(commandId, deviceId, commandType, payload, issuedTs) {
  return {
    schema_version: 1,
    command_id: commandId,
    device_id: deviceId,
    command_type: commandType,
    payload,
    issued_ts: issuedTs
  };
}

function chunkString(input, size) {
  const chunks = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
}

function main() {
  const repoRoot = process.cwd();
  const hardware = readHardwareConfig(repoRoot);
  if (!hardware?.deviceId) {
    throw new Error("Could not resolve hardware stable version DEVICE_ID");
  }

  const sampleDir = path.join(repoRoot, "docs", "tools", "field-rehearsal", "payload-samples", "hardware-stable-version");
  ensureDir(sampleDir);

  const issuedBase = "2026-03-26T14:00:00Z";
  const alignedSamples = [
    buildCommand(
      "00000000-0000-4000-8000-000000002001",
      hardware.deviceId,
      "set_config",
      { sampling_s: 5, report_interval_s: 5 },
      issuedBase
    ),
    buildCommand(
      "00000000-0000-4000-8000-000000002002",
      hardware.deviceId,
      "set_sampling_interval",
      { source: "gateway-pretty-json", intervalSeconds: 10 },
      "2026-03-26T14:01:00Z"
    ),
    buildCommand(
      "00000000-0000-4000-8000-000000002003",
      hardware.deviceId,
      "manual_collect",
      { source: "gateway-pretty-json" },
      "2026-03-26T14:02:00Z"
    ),
    buildCommand(
      "00000000-0000-4000-8000-000000002004",
      hardware.deviceId,
      "deactivate_device",
      { source: "gateway-pretty-json" },
      "2026-03-26T14:03:00Z"
    )
  ];

  const mismatchSample = buildCommand(
    "00000000-0000-4000-8000-000000002099",
    "99999999-9999-4999-8999-999999999999",
    "manual_collect",
    { source: "gateway-pretty-json" },
    "2026-03-26T14:09:00Z"
  );

  const files = [];
  alignedSamples.forEach((sample) => {
    const pretty = JSON.stringify(sample, null, 2);
    const fileName = `${sample.command_type}.pretty.json`;
    const filePath = path.join(sampleDir, fileName);
    fs.writeFileSync(filePath, pretty + "\n", "utf8");
    files.push({
      fileName,
      commandType: sample.command_type,
      topic: `cmd/${sample.device_id}`,
      command: sample,
      suggestedChunks80: chunkString(pretty, 80)
    });
  });

  const mismatchPretty = JSON.stringify(mismatchSample, null, 2);
  const mismatchFileName = "manual_collect.mismatched-device.pretty.json";
  fs.writeFileSync(path.join(sampleDir, mismatchFileName), mismatchPretty + "\n", "utf8");

  const report = {
    generatedAt: nowIso(),
    conclusion: "hardware-stable-version-gateway-command-samples-are-ready-for-current-device-identity",
    hardwareDeviceId: hardware.deviceId,
    commandTopic: `cmd/${hardware.deviceId}`,
    hardwareConfigSource: path.relative(repoRoot, hardware.appConfigPath).replace(/\\/g, "/"),
    alignedSamples: files,
    mismatchSample: {
      fileName: mismatchFileName,
      topic: `cmd/${mismatchSample.device_id}`,
      command: mismatchSample,
      purpose: "prove device_id mismatch is ignored by the current command guards"
    },
    nextUse: [
      "publish one aligned sample to cmd/{hardwareDeviceId} through the real gateway path",
      "publish the mismatch sample to prove device guard behavior end-to-end",
      "reuse suggestedChunks80 when the gateway or UART path fragments pretty JSON"
    ]
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
