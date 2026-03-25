import { createHttpClient } from "../../apps/desk/src/api/httpClient";

type SessionState = {
  token: string | null;
  refreshToken: string | null;
};

async function main(): Promise<void> {
  const state: SessionState = { token: null, refreshToken: null };

  const client = createHttpClient({
    baseUrl: "http://127.0.0.1:8081",
    getToken: () => state.token,
    getRefreshToken: () => state.refreshToken,
    onAuthTokens: ({ token, refreshToken }) => {
      state.token = token;
      if (refreshToken !== undefined) {
        state.refreshToken = refreshToken;
      }
    },
    onAuthFailure: () => {
      state.token = null;
      state.refreshToken = null;
    }
  });

  const login = await client.auth.login({ username: "admin", password: "123456" });
  state.token = login.token;
  state.refreshToken = login.refreshToken ?? null;

  const devices = await client.devices.list();
  const target = devices.find((device) => device.status !== "offline") ?? devices[0];
  if (!target) {
    throw new Error("no device available for device action proof");
  }

  const issued = await client.devices.issueCommand({
    deviceId: target.id,
    commandType: "restart_device",
    payload: { source: "desk-device-actions-proof" }
  });

  const commands = await client.devices.listCommands({ deviceId: target.id });
  const found = commands.find((item) => item.commandId === issued.commandId);
  if (!found) {
    throw new Error("issued command not found in device command list");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    deviceActions: {
      deviceId: target.id,
      commandId: issued.commandId,
      status: issued.status,
      commandsLoaded: commands.length,
      foundIssuedCommand: true
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
