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

  const devices = await client.devices.list();
  const target =
    devices.find((device) => new Date(device.lastSeenAt).getTime() >= Date.now() - 24 * 60 * 60 * 1000) ?? devices[0];
  if (!target) {
    throw new Error("no device available for diagnostics proof");
  }

  const diagnostics = await client.devices.getHealthExpert({ deviceId: target.id, metric: "all" });
  if (!diagnostics.result.health || !diagnostics.result.battery || !diagnostics.result.signal) {
    throw new Error("diagnostics result missing expected sections");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    diagnostics: {
      deviceId: target.id,
      runId: diagnostics.runId,
      analysisType: diagnostics.result.analysisType,
      healthScore: diagnostics.result.health.score,
      healthLevel: diagnostics.result.health.level,
      batterySoc: diagnostics.result.battery.soc,
      signalStrength: diagnostics.result.signal.strength
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
