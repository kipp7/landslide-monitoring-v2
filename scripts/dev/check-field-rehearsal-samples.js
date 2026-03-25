const fs = require("node:fs");
const path = require("node:path");
const { loadAndCompileSchema } = require("@lsmv2/validation");

const repoRoot = process.cwd();
const samplesDir = path.join(repoRoot, "docs", "tools", "field-rehearsal", "payload-samples");
const schemaPath = path.join(
  repoRoot,
  "docs",
  "integrations",
  "mqtt",
  "schemas",
  "telemetry-envelope.v1.schema.json"
);

const HIGH_FREQUENCY_BUDGET = 192;
const HF_PREFIXES = ["hf-"];

function toSummaryEntry(name, payload, valid, errors) {
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  const isHighFrequency = HF_PREFIXES.some((prefix) => name.startsWith(prefix));
  const isIntentionalOversized = name.includes("oversized");
  const containsInstallLabel = Object.prototype.hasOwnProperty.call(payload, "install_label");
  const hasMetaInstallLabel =
    payload &&
    payload.meta &&
    typeof payload.meta === "object" &&
    Object.prototype.hasOwnProperty.call(payload.meta, "install_label");

  const warnings = [];
  if (isHighFrequency && bytes > HIGH_FREQUENCY_BUDGET) {
    warnings.push(`high-frequency budget exceeded: ${bytes} > ${HIGH_FREQUENCY_BUDGET}`);
  }
  if (isHighFrequency && (containsInstallLabel || hasMetaInstallLabel)) {
    warnings.push("install_label should not appear in high-frequency payload");
  }

  return {
    sample: name,
    valid,
    bytes,
    isHighFrequency,
    isIntentionalOversized,
    warnings,
    errors: errors ?? []
  };
}

async function main() {
  const validator = await loadAndCompileSchema(schemaPath);
  const files = fs
    .readdirSync(samplesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const summary = [];
  let failed = false;

  for (const file of files) {
    const fullPath = path.join(samplesDir, file);
    const payload = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const valid = validator.validate(payload);
    const entry = toSummaryEntry(file, payload, valid, validator.errors);
    summary.push(entry);

    if (!valid) {
      failed = true;
      continue;
    }

    if (entry.warnings.length > 0 && entry.isHighFrequency && !entry.isIntentionalOversized) {
      failed = true;
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    schemaPath: path.relative(repoRoot, schemaPath).replace(/\\/g, "/"),
    samplesDir: path.relative(repoRoot, samplesDir).replace(/\\/g, "/"),
    highFrequencyBudget: HIGH_FREQUENCY_BUDGET,
    samples: summary
  };

  console.log(JSON.stringify(out, null, 2));
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
