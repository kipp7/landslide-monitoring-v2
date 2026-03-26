const fs = require("node:fs");
const path = require("node:path");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function chunkString(input, size) {
  const chunks = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
}

function toCString(input) {
  if (input === null) return "NULL";
  return `"${input
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"')}"`;
}

function buildScenarios(repoRoot) {
  const reportPath = path.join(
    repoRoot,
    "docs",
    "unified",
    "reports",
    "hardware-stable-version-gateway-command-samples-latest.json"
  );
  const report = readJson(reportPath);
  const sampleDir = path.join(
    repoRoot,
    "docs",
    "tools",
    "field-rehearsal",
    "payload-samples",
    "hardware-stable-version"
  );

  const setSampling = report.alignedSamples.find((item) => item.commandType === "set_sampling_interval");
  const setConfig = report.alignedSamples.find((item) => item.commandType === "set_config");
  const manualCollect = report.alignedSamples.find((item) => item.commandType === "manual_collect");
  const deactivateDevice = report.alignedSamples.find((item) => item.commandType === "deactivate_device");
  const reboot = report.alignedSamples.find((item) => item.commandType === "reboot");
  const restartDevice = report.alignedSamples.find((item) => item.commandType === "restart_device");
  const motorStart = report.alignedSamples.find((item) => item.commandType === "motor_start");
  const motorStop = report.alignedSamples.find((item) => item.commandType === "motor_stop");
  const buzzerOn = report.alignedSamples.find((item) => item.commandType === "buzzer_on");
  const buzzerOff = report.alignedSamples.find((item) => item.commandType === "buzzer_off");
  const mismatch = report.mismatchSample;

  if (!setSampling || !setConfig || !manualCollect || !deactivateDevice || !reboot || !restartDevice || !motorStart || !motorStop || !buzzerOn || !buzzerOff || !mismatch) {
    throw new Error("Missing required gateway-aligned samples");
  }

  const setSamplingText = fs.readFileSync(path.join(sampleDir, setSampling.fileName), "utf8").trimEnd();
  const setConfigText = fs.readFileSync(path.join(sampleDir, setConfig.fileName), "utf8").trimEnd();
  const manualCollectText = fs.readFileSync(path.join(sampleDir, manualCollect.fileName), "utf8").trimEnd();
  const deactivateDeviceText = fs.readFileSync(path.join(sampleDir, deactivateDevice.fileName), "utf8").trimEnd();
  const rebootText = fs.readFileSync(path.join(sampleDir, reboot.fileName), "utf8").trimEnd();
  const restartDeviceText = fs.readFileSync(path.join(sampleDir, restartDevice.fileName), "utf8").trimEnd();
  const motorStartText = fs.readFileSync(path.join(sampleDir, motorStart.fileName), "utf8").trimEnd();
  const motorStopText = fs.readFileSync(path.join(sampleDir, motorStop.fileName), "utf8").trimEnd();
  const buzzerOnText = fs.readFileSync(path.join(sampleDir, buzzerOn.fileName), "utf8").trimEnd();
  const buzzerOffText = fs.readFileSync(path.join(sampleDir, buzzerOff.fileName), "utf8").trimEnd();
  const mismatchText = fs.readFileSync(path.join(sampleDir, mismatch.fileName), "utf8").trimEnd();

  return [
    {
      name: "aligned_set_sampling_interval_pretty_json",
      chunks: chunkString(setSamplingText, 80)
    },
    {
      name: "ack_plus_aligned_set_config_pretty_json",
      chunks: (() => {
        const chunks = chunkString(setConfigText, 80);
        chunks[0] = `ACK\r\n${chunks[0]}`;
        return chunks;
      })()
    },
    {
      name: "aligned_manual_collect_pretty_json",
      chunks: chunkString(manualCollectText, 80)
    },
    {
      name: "aligned_deactivate_device_pretty_json",
      chunks: chunkString(deactivateDeviceText, 80)
    },
    {
      name: "aligned_reboot_pretty_json",
      chunks: chunkString(rebootText, 80)
    },
    {
      name: "aligned_restart_device_pretty_json",
      chunks: chunkString(restartDeviceText, 80)
    },
    {
      name: "aligned_motor_start_pretty_json",
      chunks: chunkString(motorStartText, 80)
    },
    {
      name: "aligned_motor_stop_pretty_json",
      chunks: chunkString(motorStopText, 80)
    },
    {
      name: "aligned_buzzer_on_pretty_json",
      chunks: chunkString(buzzerOnText, 80)
    },
    {
      name: "aligned_buzzer_off_pretty_json",
      chunks: chunkString(buzzerOffText, 80)
    },
    {
      name: "mismatched_manual_collect_pretty_json",
      chunks: chunkString(mismatchText, 80)
    }
  ];
}

function renderSource(scenarios) {
  const blocks = scenarios
    .map((scenario) => {
      const chunkLiterals = [...scenario.chunks].map((chunk) => toCString(chunk));
      while (chunkLiterals.length < 8) {
        chunkLiterals.push("NULL");
      }
      return [
        "  {",
        `    ${toCString(scenario.name)},`,
        `    { ${chunkLiterals.join(", ")} },`,
        `    ${scenario.chunks.length}`,
        "  }"
      ].join("\n");
    })
    .join(",\n");

  return [
    "#include <stddef.h>",
    '#include "scenario_data.h"',
    "",
    "const HarnessScenario generated_scenarios[] = {",
    blocks,
    "};",
    "",
    `const int generated_scenario_count = ${scenarios.length};`,
    ""
  ].join("\n");
}

function main() {
  const repoRoot = process.cwd();
  const outFile = process.argv[2];
  if (!outFile) {
    throw new Error("Expected output file path");
  }

  const scenarios = buildScenarios(repoRoot);
  const rendered = renderSource(scenarios);
  fs.writeFileSync(outFile, rendered, "utf8");
  console.log(
    JSON.stringify(
      {
        generatedScenarioCount: scenarios.length,
        output: path.relative(repoRoot, outFile).replace(/\\/g, "/")
      },
      null,
      2
    )
  );
}

main();
