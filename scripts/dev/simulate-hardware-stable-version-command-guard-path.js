const fs = require("node:fs");
const path = require("node:path");

let loadAndCompileSchema = null;
try {
  ({ loadAndCompileSchema } = require("@lsmv2/validation"));
} catch {}

function nowIso() {
  return new Date().toISOString();
}

function skipWhitespace(input, index) {
  let cursor = index;
  while (cursor < input.length && /\s/.test(input[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function findJsonValueStart(json, key) {
  const pattern = `"${key}"`;
  const keyIndex = json.indexOf(pattern);
  if (keyIndex === -1) return -1;
  let cursor = keyIndex + pattern.length;
  cursor = skipWhitespace(json, cursor);
  if (json[cursor] !== ":") return -1;
  cursor += 1;
  cursor = skipWhitespace(json, cursor);
  return cursor;
}

function extractJsonString(json, key) {
  const start = findJsonValueStart(json, key);
  if (start === -1 || json[start] !== '"') return null;
  const end = json.indexOf('"', start + 1);
  if (end === -1) return null;
  return json.slice(start + 1, end);
}

function extractJsonInt(json, key) {
  const start = findJsonValueStart(json, key);
  if (start === -1) return null;
  const match = /^-?\d+/.exec(json.slice(start));
  return match ? Number(match[0]) : null;
}

function parseDeviceCommandLikeFirmware(json) {
  const schemaVersionStart = findJsonValueStart(json, "schema_version");
  const payloadStart = findJsonValueStart(json, "payload");
  if (schemaVersionStart === -1 || Number.parseInt(json.slice(schemaVersionStart), 10) !== 1) {
    return { ok: false, reason: "invalid_schema_version" };
  }
  if (payloadStart === -1 || json[payloadStart] !== "{") {
    return { ok: false, reason: "payload_must_be_object" };
  }

  const commandId = extractJsonString(json, "command_id");
  const deviceId = extractJsonString(json, "device_id");
  const commandType = extractJsonString(json, "command_type");
  if (!commandId || !deviceId || !commandType) {
    return { ok: false, reason: "missing_required_fields" };
  }

  const samplingS = extractJsonInt(json, "sampling_s");
  const reportIntervalS = extractJsonInt(json, "report_interval_s");
  const intervalSeconds = extractJsonInt(json, "intervalSeconds");

  return {
    ok: true,
    command: {
      command_id: commandId,
      device_id: deviceId,
      command_type: commandType,
      has_sampling_s: Number.isInteger(samplingS),
      sampling_s: samplingS ?? 0,
      has_report_interval_s: Number.isInteger(reportIntervalS),
      report_interval_s: reportIntervalS ?? 0,
      has_interval_seconds: Number.isInteger(intervalSeconds),
      interval_seconds: intervalSeconds ?? 0
    }
  };
}

function buildAck(command, status, result, localDeviceId) {
  return {
    schema_version: 1,
    command_id: command.command_id,
    device_id: localDeviceId,
    ack_ts: "1970-01-01T00:00:00Z",
    status,
    ...(result ? { result } : {})
  };
}

function executeLikeFirmware(json, localDeviceId) {
  const runtime = {
    sampling_s: 1,
    report_interval_s: 5,
    uplink_enabled: true,
    manual_collect_requested: false,
    motor_state: "stopped",
    buzzer_on: false
  };

  const parsed = parseDeviceCommandLikeFirmware(json);
  if (!parsed.ok) {
    return {
      outcome: "ignored_invalid_command",
      reason: parsed.reason,
      parsed: null,
      ack: null,
      runtime
    };
  }

  const command = parsed.command;
  if (command.device_id !== localDeviceId) {
    return {
      outcome: "ignored_device_mismatch",
      reason: "device_id_mismatch",
      parsed: command,
      ack: null,
      runtime
    };
  }

  if (command.command_type === "ping") {
    return {
      outcome: "executed",
      reason: "matched_device",
      parsed: command,
      ack: buildAck(command, "acked", { pong: true }, localDeviceId),
      runtime
    };
  }

  if (command.command_type === "set_config") {
    if (command.has_sampling_s && command.sampling_s > 0) runtime.sampling_s = command.sampling_s;
    if (command.has_report_interval_s && command.report_interval_s > 0) runtime.report_interval_s = command.report_interval_s;
    return {
      outcome: "executed",
      reason: "matched_device",
      parsed: command,
      ack: buildAck(
        command,
        "acked",
        {
          applied: true,
          applied_keys: [
            ...(command.has_sampling_s ? ["sampling_s"] : []),
            ...(command.has_report_interval_s ? ["report_interval_s"] : [])
          ],
          runtime_config: {
            sampling_s: runtime.sampling_s,
            report_interval_s: runtime.report_interval_s
          }
        },
        localDeviceId
      ),
      runtime
    };
  }

  if (command.command_type === "restart_device") {
    return {
      outcome: "executed",
      reason: "matched_device",
      parsed: command,
      ack: buildAck(command, "acked", { restart_requested: true, rebooting: true }, localDeviceId),
      runtime
    };
  }

  if (command.command_type === "deactivate_device") {
    runtime.uplink_enabled = false;
    return {
      outcome: "executed",
      reason: "matched_device",
      parsed: command,
      ack: buildAck(command, "acked", { deactivated: true, uplink_suppressed: true }, localDeviceId),
      runtime
    };
  }

  if (command.command_type === "set_sampling_interval") {
    if (!command.has_interval_seconds || command.interval_seconds <= 0) {
      return {
        outcome: "executed",
        reason: "matched_device",
        parsed: command,
        ack: buildAck(command, "failed", { error: "invalid_interval_seconds" }, localDeviceId),
        runtime
      };
    }
    runtime.sampling_s = command.interval_seconds;
    return {
      outcome: "executed",
      reason: "matched_device",
      parsed: command,
      ack: buildAck(command, "acked", { applied: true, sampling_s: runtime.sampling_s }, localDeviceId),
      runtime
    };
  }

  if (command.command_type === "manual_collect") {
    runtime.manual_collect_requested = true;
    return {
      outcome: "executed",
      reason: "matched_device",
      parsed: command,
      ack: buildAck(command, "acked", { collect_requested: true, reason: "manual_trigger" }, localDeviceId),
      runtime
    };
  }

  if (command.command_type === "motor_start") {
    runtime.motor_state = "running";
    return {
      outcome: "executed",
      reason: "matched_device",
      parsed: command,
      ack: buildAck(command, "acked", { motor_state: runtime.motor_state }, localDeviceId),
      runtime
    };
  }

  if (command.command_type === "buzzer_on") {
    runtime.buzzer_on = true;
    return {
      outcome: "executed",
      reason: "matched_device",
      parsed: command,
      ack: buildAck(command, "acked", { buzzer_on: true }, localDeviceId),
      runtime
    };
  }

  return {
    outcome: "executed",
    reason: "matched_device",
    parsed: command,
    ack: buildAck(command, "failed", { error: "unknown_command_type" }, localDeviceId),
    runtime
  };
}

async function loadValidator(repoRoot, relativePath) {
  if (!loadAndCompileSchema) return null;
  return loadAndCompileSchema(path.join(repoRoot, relativePath));
}

async function main() {
  const repoRoot = process.cwd();
  const localDeviceId = "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c";
  const exampleJson = fs.readFileSync(
    path.join(repoRoot, "docs", "integrations", "mqtt", "examples", "device-command.v1.json"),
    "utf8"
  );
  const commandValidator = await loadValidator(repoRoot, path.join("docs", "integrations", "mqtt", "schemas", "device-command.v1.schema.json"));
  const ackValidator = await loadValidator(repoRoot, path.join("docs", "integrations", "mqtt", "schemas", "device-command-ack.v1.schema.json"));

  const scenarios = [
    {
      name: "formatted_set_config_command_is_accepted",
      rawCommand: exampleJson
    },
    {
      name: "formatted_manual_collect_command_is_accepted",
      rawCommand: JSON.stringify(
        {
          schema_version: 1,
          command_id: "00000000-0000-4000-8000-000000000777",
          device_id: localDeviceId,
          command_type: "manual_collect",
          payload: {
            source: "gateway-pretty-json",
            note: "formatted command with spaces and newlines"
          },
          issued_ts: "2026-03-26T11:00:00Z"
        },
        null,
        2
      )
    },
    {
      name: "mismatched_device_id_command_is_ignored",
      rawCommand: JSON.stringify(
        {
          schema_version: 1,
          command_id: "00000000-0000-4000-8000-000000000778",
          device_id: "99999999-9999-4999-8999-999999999999",
          command_type: "deactivate_device",
          payload: {
            source: "gateway-pretty-json"
          },
          issued_ts: "2026-03-26T11:01:00Z"
        },
        null,
        2
      )
    },
    {
      name: "invalid_payload_shape_is_ignored",
      rawCommand:
        '{\n' +
        '  "schema_version": 1,\n' +
        '  "command_id": "00000000-0000-4000-8000-000000000779",\n' +
        `  "device_id": "${localDeviceId}",\n` +
        '  "command_type": "set_sampling_interval",\n' +
        '  "payload": [],\n' +
        '  "issued_ts": "2026-03-26T11:02:00Z"\n' +
        '}\n'
    }
  ];

  const evaluatedScenarios = scenarios.map((scenario) => {
    let parsedJson = null;
    try {
      parsedJson = JSON.parse(scenario.rawCommand);
    } catch {}

    const commandSchemaValid = parsedJson && commandValidator ? Boolean(commandValidator.validate(parsedJson)) : null;
    const commandSchemaErrors = commandValidator?.errors ? [...commandValidator.errors] : [];
    const execution = executeLikeFirmware(scenario.rawCommand, localDeviceId);
    const ackSchemaValid = execution.ack && ackValidator ? Boolean(ackValidator.validate(execution.ack)) : null;
    const ackSchemaErrors = ackValidator?.errors ? [...ackValidator.errors] : [];

    return {
      name: scenario.name,
      commandSchemaValid,
      commandSchemaErrors,
      execution: {
        outcome: execution.outcome,
        reason: execution.reason,
        parsed: execution.parsed,
        ack: execution.ack,
        ackSchemaValid,
        ackSchemaErrors,
        runtimeAfter: execution.runtime
      }
    };
  });

  const report = {
    generatedAt: nowIso(),
    conclusion: "hardware-stable-version-command-guards-can-be-aligned-to-platform-contract-in-source",
    localDeviceId,
    executionGuards: [
      "schema_version must be 1",
      "payload must remain a JSON object",
      "command.device_id must match local device identity before execution"
    ],
    scenarios: evaluatedScenarios,
    remainingGaps: [
      "run the same guard cases through a real gateway-delivered payload path",
      "capture a real-board proof that mismatched device_id commands are ignored without side effects",
      "replace placeholder ack_ts with a better device-side time source"
    ]
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
