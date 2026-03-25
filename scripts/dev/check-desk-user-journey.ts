import { createHttpClient } from "../../apps/desk/src/api/httpClient";

type SessionState = {
  token: string | null;
  refreshToken: string | null;
};

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

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

  const [homeSummary, homeDevices, homeStations] = await Promise.all([
    client.dashboard.getSummary(),
    client.devices.list(),
    client.stations.list()
  ]);

  if (homeStations.length === 0) {
    throw new Error("home stations empty");
  }
  if (homeDevices.length === 0) {
    throw new Error("home devices empty");
  }

  const selectedStation = homeStations[0]!;
  const stationDevices = await client.devices.list({ stationId: selectedStation.id });
  if (stationDevices.length !== selectedStation.deviceCount) {
    throw new Error("stations page device count mismatch");
  }

  const devicesPageDevices = await client.devices.list();
  const devicesFiltered = await client.devices.list({ stationId: selectedStation.id });
  if (devicesFiltered.length !== stationDevices.length) {
    throw new Error("devices page filtered count mismatch");
  }

  const baselineDevices = await client.devices.list();
  const baselines = await client.baselines.list();
  if (baselines.length === 0) {
    throw new Error("baselines page empty");
  }

  const selectedBaseline = baselines[0]!;
  const baselineBeforeJson = stableJson(selectedBaseline);
  const baselineUpsert = await client.baselines.upsert({
    deviceId: selectedBaseline.deviceId,
    baselineLat: selectedBaseline.baselineLat + 0.00001,
    baselineLng: selectedBaseline.baselineLng + 0.00001,
    ...(selectedBaseline.baselineAlt === undefined ? {} : { baselineAlt: selectedBaseline.baselineAlt }),
    establishedBy: "desk-user-journey",
    status: selectedBaseline.status,
    ...(selectedBaseline.notes === undefined ? {} : { notes: selectedBaseline.notes }),
    persist: false
  });
  const baselineAuto = await client.baselines.autoEstablish({ deviceId: selectedBaseline.deviceId, persist: false });
  const baselinesAfter = await client.baselines.list();
  const baselineAfter = baselinesAfter.find((item) => item.deviceId === selectedBaseline.deviceId) ?? baselinesAfter[0]!;
  const baselineStable = baselineBeforeJson === stableJson(baselineAfter);

  const gpsDevices = await client.devices.list();
  const baselineDeviceIds = new Set(baselinesAfter.map((item) => item.deviceId));
  const gpsCandidates = gpsDevices.filter((device) => device.type === "gnss" && baselineDeviceIds.has(device.id));
  if (gpsCandidates.length === 0) {
    throw new Error("gps page has no baseline-backed gnss devices");
  }
  const gpsSeries = await client.gps.getSeries({ deviceId: gpsCandidates[0]!.id, days: 7 });
  if (gpsSeries.points.length === 0) {
    throw new Error("gps page series empty");
  }

  const system = await client.system.getStatus();

  await client.auth.logout();

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role,
      hasRefreshToken: Boolean(login.refreshToken)
    },
    home: {
      stationCount: homeSummary.stationCount,
      deviceOnlineCount: homeSummary.deviceOnlineCount,
      alertCountToday: homeSummary.alertCountToday,
      systemHealthPercent: homeSummary.systemHealthPercent,
      stations: homeStations.length,
      devices: homeDevices.length
    },
    stationsPage: {
      selectedStationId: selectedStation.id,
      selectedStationName: selectedStation.name,
      deviceCount: selectedStation.deviceCount,
      loadedDevices: stationDevices.length
    },
    devicesPage: {
      totalDevices: devicesPageDevices.length,
      filteredDevices: devicesFiltered.length
    },
    baselinesPage: {
      devices: baselineDevices.length,
      baselines: baselines.length,
      upsertDeviceId: baselineUpsert.deviceId,
      autoDeviceId: baselineAuto.deviceId,
      proofStable: baselineStable
    },
    gpsPage: {
      deviceId: gpsSeries.deviceId,
      points: gpsSeries.points.length
    },
    systemPage: {
      source: system.source,
      items: system.items.length
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
