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

  const [stations, devicesAll] = await Promise.all([client.stations.list(), client.devices.list()]);
  if (stations.length === 0) {
    throw new Error("devices page stations empty");
  }
  if (devicesAll.length === 0) {
    throw new Error("devices page devices empty");
  }

  const selectedStation = stations[0]!;
  const filtered = await client.devices.list({ stationId: selectedStation.id });
  const refreshed = await client.devices.list();

  if (filtered.length !== selectedStation.deviceCount) {
    throw new Error("devices page filtered count mismatch");
  }
  if (refreshed.length !== devicesAll.length) {
    throw new Error("devices page refresh changed device count unexpectedly");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    devicesPage: {
      totalDevices: devicesAll.length,
      refreshedDevices: refreshed.length,
      selectedStationId: selectedStation.id,
      selectedStationName: selectedStation.name,
      stationDeviceCount: selectedStation.deviceCount,
      filteredDevices: filtered.length
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
