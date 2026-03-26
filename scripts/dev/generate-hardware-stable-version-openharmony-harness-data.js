const fs = require("node:fs");
const path = require("node:path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  const mismatch = report.mismatchSample;

  if (!setSampling || !setConfig || !mismatch) {
    throw new Error("Missing required gateway-aligned samples");
  }

  const setSamplingText = fs.readFileSync(path.join(sampleDir, setSampling.fileName), "utf8").trimEnd();
  const setConfigText = fs.readFileSync(path.join(sampleDir, setConfig.fileName), "utf8").trimEnd();
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
