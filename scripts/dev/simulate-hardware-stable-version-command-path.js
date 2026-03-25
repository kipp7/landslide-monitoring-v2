const path = require("node:path");

let loadAndCompileSchema = null;
try {
  ({ loadAndCompileSchema } = require("@lsmv2/validation"));
} catch {}

function nowIso() {
  return new Date().toISOString();
}

const COMMAND_CASES = [
  { command_type: "ping", payload: {}, origin: "web-device-management" },
  {
    command_type: "set_config",
    payload: { sampling_s: 5, report_interval_s: 5 },
    origin: "web-device-management"
  },
  { command_type: "reboot", payload: {}, origin: "web-device-management" },
  { command_type: "restart_device", payload: { source: "desk-device-management" }, origin: "desk-device-management" },
  { command_type: "deactivate_device", payload: { source: "desk-device-management" }, origin: "desk-device-management" },
  {
    command_type: "set_sampling_interval",
    payload: { source: "desk-device-management", intervalSeconds: 10 },
    origin: "desk-device-management"
  },
  { command_type: "manual_collect", payload: { source: "desk-device-management" }, origin: "desk-device-management" },
  { command_type: "motor_start", payload: { source: "desk-device-management" }, origin: "desk-device-management" },
  { command_type: "motor_stop", payload: { source: "desk-device-management" }, origin: "desk-device-management" },
  { command_type: "buzzer_on", payload: { source: "desk-device-management" }, origin: "desk-device-management" },
  { command_type: "buzzer_off", payload: { source: "desk-device-management" }, origin: "desk-device-management" }
];

async function loadValidator(repoRoot, relativePath) {
  if (!loadAndCompileSchema) return null;
  return loadAndCompileSchema(path.join(repoRoot, relativePath));
}

function buildCommand(command, index) {
  return {
    schema_version: 1,
    command_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    device_id: "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
    command_type: command.command_type,
    payload: command.payload,
    issued_ts: `2026-03-26T10:${String(index).padStart(2, "0")}:00Z`
  };
}

function emulateFirmwareCommandHandling(command) {
  const baseAck = {
    schema_version: 1,
    command_id: command.command_id,
    device_id: command.device_id,
    ack_ts: "1970-01-01T00:00:00Z"
  };

  if (command.command_type === "ping") {
    return { ...baseAck, status: "acked", result: { pong: true } };
  }

  if (command.command_type === "set_config") {
    return {
      ...baseAck,
      status: "acked",
      result: {
        applied: true,
        applied_keys: Object.keys(command.payload ?? {}),
        runtime_config: { ...(command.payload ?? {}) }
      }
    };
  }

  if (command.command_type === "reboot") {
    return {
      ...baseAck,
      status: "acked",
      result: { rebooting: true }
    };
  }

  if (command.command_type === "restart_device") {
    return {
      ...baseAck,
      status: "acked",
      result: { restart_requested: true, rebooting: true }
    };
  }

  if (command.command_type === "deactivate_device") {
    return {
      ...baseAck,
      status: "acked",
      result: { deactivated: true, uplink_suppressed: true }
    };
  }

  if (command.command_type === "set_sampling_interval") {
    const requestedSeconds = Number(command.payload?.intervalSeconds);
    return {
      ...baseAck,
      status: Number.isFinite(requestedSeconds) && requestedSeconds > 0 ? "acked" : "failed",
      result:
        Number.isFinite(requestedSeconds) && requestedSeconds > 0
          ? { applied: true, sampling_s: requestedSeconds }
          : { error: "invalid_interval_seconds" }
    };
  }

  if (command.command_type === "manual_collect") {
    return {
      ...baseAck,
      status: "acked",
      result: { collect_requested: true, reason: "manual_trigger" }
    };
  }

  if (command.command_type === "motor_start") {
    return {
      ...baseAck,
      status: "acked",
      result: { motor_state: "running" }
    };
  }

  if (command.command_type === "motor_stop") {
    return {
      ...baseAck,
      status: "acked",
      result: { motor_state: "stopped" }
    };
  }

  if (command.command_type === "buzzer_on") {
    return {
      ...baseAck,
      status: "acked",
      result: { buzzer_on: true }
    };
  }

  if (command.command_type === "buzzer_off") {
    return {
      ...baseAck,
      status: "acked",
      result: { buzzer_on: false }
    };
  }

  return {
    ...baseAck,
    status: "failed",
    result: { error: "unknown_command_type" }
  };
}

async function main() {
  const repoRoot = process.cwd();
  const cmdValidator = await loadValidator(repoRoot, path.join("docs", "integrations", "mqtt", "schemas", "device-command.v1.schema.json"));
  const ackValidator = await loadValidator(repoRoot, path.join("docs", "integrations", "mqtt", "schemas", "device-command-ack.v1.schema.json"));
  const commandCases = COMMAND_CASES.map((item, index) => {
    const command = buildCommand(item, index);
    const ack = emulateFirmwareCommandHandling(command);
    const commandValid = cmdValidator ? Boolean(cmdValidator.validate(command)) : null;
    const commandErrors = cmdValidator?.errors ? [...cmdValidator.errors] : [];
    const ackValid = ackValidator ? Boolean(ackValidator.validate(ack)) : null;
    const ackErrors = ackValidator?.errors ? [...ackValidator.errors] : [];
    return {
      commandType: item.command_type,
      origin: item.origin,
      command,
      ack,
      validation: {
        commandValid,
        ackValid,
        commandErrors,
        ackErrors
      }
    };
  });
  const representativeCase = commandCases.find((item) => item.commandType === "set_config") ?? commandCases[0];

  const report = {
    generatedAt: nowIso(),
    conclusion: "hardware-stable-version-command-path-can-be-aligned-to-platform-command-contract-in-source",
    inputCommand: representativeCase.command,
    simulatedAck: representativeCase.ack,
    validation: {
      commandSchemaAvailable: Boolean(cmdValidator),
      commandValid: representativeCase.validation.commandValid,
      ackSchemaAvailable: Boolean(ackValidator),
      ackValid: representativeCase.validation.ackValid,
      commandErrors: representativeCase.validation.commandErrors,
      ackErrors: representativeCase.validation.ackErrors
    },
    supportedCommandTypes: commandCases.map((item) => item.commandType),
    sourceReferences: [
      "apps/desk/src/views/DeviceManagementPage.tsx",
      "apps/web/app/device-management/DeviceManagementV2Page.tsx",
      "apps/desk/src/views/SystemPage.tsx",
      "apps/web/app/ops/configs/page.tsx",
      "services/api/src/routes/devices.ts",
      "services/api/src/routes/system.ts"
    ],
    commandCases,
    pendingSourceWork: [
      "sync hardware command parser and ack builder with the expanded desk/web command set",
      "decide whether set_sampling_interval should normalize into set_config or keep a dedicated device-side branch",
      "bind deactivate_device, manual_collect, motor_*, buzzer_* to real device-side state transitions",
      "replace placeholder ack_ts with a better device-side time source when available"
    ]
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
