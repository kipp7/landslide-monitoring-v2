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

  const [devices, baselines] = await Promise.all([client.devices.list(), client.baselines.list()]);
  const baselineIds = new Set(baselines.map((item) => item.deviceId));
  const gpsCandidates = devices.filter((device) => device.type === "gnss" && baselineIds.has(device.id));
  if (gpsCandidates.length === 0) {
    throw new Error("gps page has no baseline-backed gnss devices");
  }

  const selectedDevice = gpsCandidates[0]!;
  const series7 = await client.gps.getSeries({ deviceId: selectedDevice.id, days: 7 });
  const series30 = await client.gps.getSeries({ deviceId: selectedDevice.id, days: 30 });

  if (series7.points.length === 0 || series30.points.length === 0) {
    throw new Error("gps page series empty");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    gpsPage: {
      selectedDeviceId: selectedDevice.id,
      selectedDeviceName: selectedDevice.name,
      candidateCount: gpsCandidates.length,
      points7d: series7.points.length,
      points30d: series30.points.length
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
