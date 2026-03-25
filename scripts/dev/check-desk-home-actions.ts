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

  const [summary, devices, stations] = await Promise.all([
    client.dashboard.getSummary(),
    client.devices.list(),
    client.stations.list()
  ]);

  const [summaryAfterRefresh, devicesAfterRefresh, stationsAfterRefresh] = await Promise.all([
    client.dashboard.getSummary(),
    client.devices.list(),
    client.stations.list()
  ]);

  if (summary.stationCount !== stations.length) {
    throw new Error("home summary stationCount mismatch");
  }
  if (summary.deviceOnlineCount > devices.length) {
    throw new Error("home online device count exceeds total devices");
  }
  if (summaryAfterRefresh.stationCount !== summary.stationCount) {
    throw new Error("home refresh changed stationCount unexpectedly");
  }
  if (devicesAfterRefresh.length !== devices.length) {
    throw new Error("home refresh changed device count unexpectedly");
  }
  if (stationsAfterRefresh.length !== stations.length) {
    throw new Error("home refresh changed station count unexpectedly");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    homePage: {
      stationCount: summary.stationCount,
      deviceOnlineCount: summary.deviceOnlineCount,
      alertCountToday: summary.alertCountToday,
      systemHealthPercent: summary.systemHealthPercent,
      devices: devices.length,
      stations: stations.length,
      refreshStable: true
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
