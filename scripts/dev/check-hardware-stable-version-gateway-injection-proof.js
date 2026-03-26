const fs = require("node:fs");
const path = require("node:path");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function toMapBy(array, key) {
  const map = new Map();
  for (const item of array) {
    map.set(item[key], item);
  }
  return map;
}

function main() {
  const repoRoot = process.cwd();
  const sampleReport = readJson(
    path.join(repoRoot, "docs", "unified", "reports", "hardware-stable-version-gateway-command-samples-latest.json")
  );
  const harnessReport = readJson(
    path.join(repoRoot, "docs", "unified", "reports", "hardware-stable-version-openharmony-command-harness-latest.json")
  );

  const harnessByName = toMapBy(harnessReport.scenarios ?? [], "name");
  const setSampling = harnessByName.get("aligned_set_sampling_interval_pretty_json");
  const setConfig = harnessByName.get("ack_plus_aligned_set_config_pretty_json");
  const manualCollect = harnessByName.get("aligned_manual_collect_pretty_json");
  const deactivateDevice = harnessByName.get("aligned_deactivate_device_pretty_json");
  const mismatch = harnessByName.get("mismatched_manual_collect_pretty_json");

  const alignedCommandTopicStable = sampleReport.commandTopic === `cmd/${sampleReport.hardwareDeviceId}`;
  const harnessLocalDeviceMatchesHardware = harnessReport.localDeviceId === sampleReport.hardwareDeviceId;
  const setSamplingExecuted =
    Boolean(setSampling) &&
    setSampling.deviceMatch === true &&
    typeof setSampling.ack === "string" &&
    setSampling.ack.includes('"status":"acked"') &&
    setSampling.runtimeAfter?.sampling_s === 10;
  const setConfigExecuted =
    Boolean(setConfig) &&
    setConfig.linkAckReceived === true &&
    setConfig.deviceMatch === true &&
    typeof setConfig.ack === "string" &&
    setConfig.ack.includes('"status":"acked"') &&
    setConfig.runtimeAfter?.sampling_s === 5 &&
    setConfig.runtimeAfter?.report_interval_s === 5;
  const mismatchRejected =
    Boolean(mismatch) &&
    mismatch.deviceMatch === false &&
    mismatch.ack === null &&
    mismatch.runtimeAfter?.manual_collect_requested === false;
  const manualCollectExecuted =
    Boolean(manualCollect) &&
    manualCollect.deviceMatch === true &&
    typeof manualCollect.ack === "string" &&
    manualCollect.ack.includes('"status":"acked"') &&
    manualCollect.runtimeAfter?.manual_collect_requested === true;
  const deactivateExecuted =
    Boolean(deactivateDevice) &&
    deactivateDevice.deviceMatch === true &&
    typeof deactivateDevice.ack === "string" &&
    deactivateDevice.ack.includes('"status":"acked"') &&
    deactivateDevice.runtimeAfter?.uplink_enabled === false;

  const report = {
    generatedAt: new Date().toISOString(),
    conclusion: "hardware-stable-version-gateway-samples-drive-openharmony-command-injection-proof-in-source",
    hardwareDeviceId: sampleReport.hardwareDeviceId,
    commandTopic: sampleReport.commandTopic,
    harnessLocalDeviceId: harnessReport.localDeviceId,
    checks: {
      alignedCommandTopicStable,
      harnessLocalDeviceMatchesHardware,
      setSamplingExecuted,
      setConfigExecuted,
      manualCollectExecuted,
      deactivateExecuted,
      mismatchRejected
    },
    scenarioLinks: {
      sampleSetSampling: sampleReport.alignedSamples?.find((item) => item.commandType === "set_sampling_interval") ?? null,
      sampleSetConfig: sampleReport.alignedSamples?.find((item) => item.commandType === "set_config") ?? null,
      sampleManualCollect: sampleReport.alignedSamples?.find((item) => item.commandType === "manual_collect") ?? null,
      sampleDeactivateDevice: sampleReport.alignedSamples?.find((item) => item.commandType === "deactivate_device") ?? null,
      sampleMismatch: sampleReport.mismatchSample ?? null,
      harnessSetSampling: setSampling ?? null,
      harnessSetConfig: setConfig ?? null,
      harnessManualCollect: manualCollect ?? null,
      harnessDeactivateDevice: deactivateDevice ?? null,
      harnessMismatch: mismatch ?? null
    },
    remainingGaps: [
      "publish the same aligned samples through a real gateway path instead of only the source-level harness",
      "capture a real board proof that the generated mismatch sample is ignored end-to-end",
      "decide whether the platform demo command example should be switched to the hardware-aligned device_id"
    ]
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
