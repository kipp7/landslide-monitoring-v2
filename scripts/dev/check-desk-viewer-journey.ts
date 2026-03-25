import { createHttpClient } from "../../apps/desk/src/api/httpClient";

type SessionState = {
  token: string | null;
  refreshToken: string | null;
};

async function expectFailure(label: string, action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`${label} should have failed`);
}

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

  const login = await client.auth.login({ username: "viewer", password: "123456" });
  state.token = login.token;
  state.refreshToken = login.refreshToken ?? null;

  const [summary, stations, devices, baselines] = await Promise.all([
    client.dashboard.getSummary(),
    client.stations.list(),
    client.devices.list(),
    client.baselines.list()
  ]);

  const selectedStation = stations[0];
  if (!selectedStation) {
    throw new Error("viewer journey stations empty");
  }
  const stationDevices = await client.devices.list({ stationId: selectedStation.id });

  const gpsError = await expectFailure("viewer gps journey", () =>
    client.gps.getSeries({ deviceId: baselines[0]!.deviceId, days: 7 })
  );
  const systemError = await expectFailure("viewer system journey", () => client.system.getStatus());

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    viewerJourney: {
      stationCount: summary.stationCount,
      deviceOnlineCount: summary.deviceOnlineCount,
      stations: stations.length,
      devices: devices.length,
      baselines: baselines.length,
      selectedStationId: selectedStation.id,
      selectedStationDevices: stationDevices.length,
      deniedGps: gpsError,
      deniedSystem: systemError
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
