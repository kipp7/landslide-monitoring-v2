import { apiLogin } from "../../apps/web/lib/v2Api";
import { createDeviceCommand, listDeviceCommands, listDevices } from "../../apps/web/lib/api/devices";

async function resolveBaseUrl(): Promise<string> {
  const candidates = ["http://127.0.0.1:8081"];
  for (const baseUrl of candidates) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return baseUrl;
    } catch {
      // try next
    }
  }
  throw new Error("no reachable local api-service found on 8081");
}

async function main(): Promise<void> {
  const baseUrl = await resolveBaseUrl();
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;

  const login = await apiLogin("admin", "123456");
  process.env.NEXT_PUBLIC_API_BEARER_TOKEN = login.data.token;

  const devicesJson = await listDevices({ page: 1, pageSize: 20 });
  const devices = devicesJson.data.list;
  const target = devices.find((device) => device.status !== "revoked") ?? devices[0];
  if (!target) {
    throw new Error("no device available for web notifyOnAck proof");
  }

  const defaultIssued = await createDeviceCommand(target.deviceId, {
    commandType: "web_notify_on_ack_default_proof",
    payload: { source: "web-notify-on-ack-proof", notifyOnAck: false },
    notifyOnAck: false
  });

  const optInIssued = await createDeviceCommand(target.deviceId, {
    commandType: "web_notify_on_ack_enabled_proof",
    payload: { source: "web-notify-on-ack-proof", notifyOnAck: true },
    notifyOnAck: true
  });

  if (defaultIssued.data.notifyOnAck !== false) {
    throw new Error("web default command did not return notifyOnAck=false");
  }
  if (optInIssued.data.notifyOnAck !== true) {
    throw new Error("web opt-in command did not return notifyOnAck=true");
  }
  if (
    defaultIssued.data.successNotificationPolicy !== "silent" ||
    defaultIssued.data.effectiveSuccessNotificationPolicy !== "silent"
  ) {
    throw new Error("web default command did not return silent success-notification policy");
  }
  if (
    optInIssued.data.successNotificationPolicy !== "always_notify" ||
    optInIssued.data.effectiveSuccessNotificationPolicy !== "always_notify"
  ) {
    throw new Error("web opt-in command did not return always_notify success-notification policy");
  }

  const commandsJson = await listDeviceCommands(target.deviceId, { page: 1, pageSize: 50 });
  const commands = commandsJson.data.list;
  const defaultFound = commands.find((item) => item.commandId === defaultIssued.data.commandId);
  const optInFound = commands.find((item) => item.commandId === optInIssued.data.commandId);

  if (!defaultFound) {
    throw new Error("web default notifyOnAck command not found in command list");
  }
  if (!optInFound) {
    throw new Error("web opt-in notifyOnAck command not found in command list");
  }
  if (defaultFound.notifyOnAck !== false) {
    throw new Error("web default command list entry did not keep notifyOnAck=false");
  }
  if (optInFound.notifyOnAck !== true) {
    throw new Error("web opt-in command list entry did not keep notifyOnAck=true");
  }
  if (defaultFound.successNotificationPolicy !== "silent" || defaultFound.effectiveSuccessNotificationPolicy !== "silent") {
    throw new Error("web default command list entry did not keep silent success-notification policy");
  }
  if (optInFound.successNotificationPolicy !== "always_notify" || optInFound.effectiveSuccessNotificationPolicy !== "always_notify") {
    throw new Error("web opt-in command list entry did not keep always_notify success-notification policy");
  }

  const report = {
    auth: {
      username: login.data.user.username,
      roleCount: login.data.user.roles.length,
      baseUrl
    },
    webCommandNotifyOnAck: {
      deviceId: target.deviceId,
      defaultCommandId: defaultIssued.data.commandId,
      defaultNotifyOnAck: defaultFound.notifyOnAck,
      defaultSuccessNotificationPolicy: defaultFound.successNotificationPolicy,
      defaultEffectiveSuccessNotificationPolicy: defaultFound.effectiveSuccessNotificationPolicy,
      optInCommandId: optInIssued.data.commandId,
      optInNotifyOnAck: optInFound.notifyOnAck,
      optInSuccessNotificationPolicy: optInFound.successNotificationPolicy,
      optInEffectiveSuccessNotificationPolicy: optInFound.effectiveSuccessNotificationPolicy,
      commandsLoaded: commands.length
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
