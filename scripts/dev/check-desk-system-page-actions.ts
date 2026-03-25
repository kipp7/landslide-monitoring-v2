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
      if (refreshToken !== undefined) state.refreshToken = refreshToken;
    },
    onAuthFailure: () => {
      state.token = null;
      state.refreshToken = null;
    }
  });

  const login = await client.auth.login({ username: "admin", password: "123456" });
  state.token = login.token;
  state.refreshToken = login.refreshToken ?? null;

  const system = await client.system.getStatus();
  if (!system.items.length) {
    throw new Error("system page items empty");
  }
  const commandSuccessPolicy = await client.system.getCommandSuccessNotificationPolicy();
  if (!commandSuccessPolicy.systemDefault) {
    throw new Error("command success notification system default missing");
  }
  if (!Object.keys(commandSuccessPolicy.commandTypeDefaults).length) {
    throw new Error("command success notification commandTypeDefaults empty");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    systemPage: {
      source: system.source,
      cpuPercent: system.cpuPercent ?? null,
      memPercent: system.memPercent ?? null,
      diskPercent: system.diskPercent ?? null,
      items: system.items.length,
      degradedItems: system.items.filter((item) => item.status === "degraded").length,
      commandSuccessNotificationSystemDefault: commandSuccessPolicy.systemDefault,
      commandSuccessNotificationCommandTypes: Object.keys(commandSuccessPolicy.commandTypeDefaults).length
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
