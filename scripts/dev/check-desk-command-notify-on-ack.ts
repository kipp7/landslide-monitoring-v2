import { createHttpClient } from "../../apps/desk/src/api/httpClient";

type SessionState = {
  token: string | null;
  refreshToken: string | null;
};

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
  const state: SessionState = { token: null, refreshToken: null };
  const baseUrl = await resolveBaseUrl();
  const makeClient = (baseUrl: string) =>
    createHttpClient({
      baseUrl,
      getToken: () => state.token,
      getRefreshToken: () => state.refreshToken,
      onAuthTokens: ({ token, refreshToken }) => {
        state.token = token;
        if (refreshToken !== undefined) state.refreshToken = refreshToken;
      },
      onAuthFailure: () => {
        state.token = null;
        state.refreshToken = null;
      }
    });

  const client = makeClient(baseUrl);
  const login = await client.auth.login({ username: "admin", password: "123456" });
  state.token = login.token;
  state.refreshToken = login.refreshToken ?? null;

  const devices = await client.devices.list();
  const target = devices.find((device) => device.status !== "offline") ?? devices[0];
  if (!target) {
    throw new Error("no device available for notifyOnAck proof");
  }

  const defaultIssued = await client.devices.issueCommand({
    deviceId: target.id,
    commandType: "notify_on_ack_default_proof",
    payload: { source: "desk-notify-on-ack-proof", notifyOnAck: false },
    notifyOnAck: false
  });

  const optInIssued = await client.devices.issueCommand({
    deviceId: target.id,
    commandType: "notify_on_ack_enabled_proof",
    payload: { source: "desk-notify-on-ack-proof", notifyOnAck: true },
    notifyOnAck: true
  });

  if (defaultIssued.notifyOnAck !== false) {
    throw new Error("default command did not return notifyOnAck=false");
  }
  if (optInIssued.notifyOnAck !== true) {
    throw new Error("opt-in command did not return notifyOnAck=true");
  }
  if (defaultIssued.successNotificationPolicy !== "silent" || defaultIssued.effectiveSuccessNotificationPolicy !== "silent") {
    throw new Error("default command did not return silent success-notification policy");
  }
  if (optInIssued.successNotificationPolicy !== "always_notify" || optInIssued.effectiveSuccessNotificationPolicy !== "always_notify") {
    throw new Error("opt-in command did not return always_notify success-notification policy");
  }

  const commands = await client.devices.listCommands({ deviceId: target.id });
  const defaultFound = commands.find((item) => item.commandId === defaultIssued.commandId);
  const optInFound = commands.find((item) => item.commandId === optInIssued.commandId);

  if (!defaultFound) {
    throw new Error("default notifyOnAck command not found in command list");
  }
  if (!optInFound) {
    throw new Error("opt-in notifyOnAck command not found in command list");
  }
  if (defaultFound.notifyOnAck !== false) {
    throw new Error("default command list entry did not keep notifyOnAck=false");
  }
  if (optInFound.notifyOnAck !== true) {
    throw new Error("opt-in command list entry did not keep notifyOnAck=true");
  }
  if (defaultFound.successNotificationPolicy !== "silent" || defaultFound.effectiveSuccessNotificationPolicy !== "silent") {
    throw new Error("default command list entry did not keep silent success-notification policy");
  }
  if (optInFound.successNotificationPolicy !== "always_notify" || optInFound.effectiveSuccessNotificationPolicy !== "always_notify") {
    throw new Error("opt-in command list entry did not keep always_notify success-notification policy");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role,
      baseUrl
    },
    commandNotifyOnAck: {
      deviceId: target.id,
      defaultCommandId: defaultIssued.commandId,
      defaultNotifyOnAck: defaultFound.notifyOnAck,
      defaultSuccessNotificationPolicy: defaultFound.successNotificationPolicy,
      defaultEffectiveSuccessNotificationPolicy: defaultFound.effectiveSuccessNotificationPolicy,
      optInCommandId: optInIssued.commandId,
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
