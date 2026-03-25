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

  const before = await client.stations.listManagement();
  if (before.length === 0) {
    throw new Error("station management list empty");
  }

  const target = before[0]!;
  const original = {
    stationName: target.stationName,
    locationName: target.locationName,
    description: target.description,
    chartLegendName: target.chartLegendName,
    riskLevel: target.riskLevel,
    status: target.status,
    sensorTypes: target.sensorTypes
  };

  const patched = {
    stationId: target.stationId,
    stationName: `${target.stationName}-proof`,
    locationName: `${target.locationName}-proof`,
    description: `proof:${target.stationId}`,
    chartLegendName: `${target.chartLegendName}-proof`,
    riskLevel: target.riskLevel,
    status: target.status,
    sensorTypes: target.sensorTypes
  } as const;

  try {
    await client.stations.updateManagement(patched);
    await client.stations.updateLegendNames({ legends: { [target.stationId]: `${original.chartLegendName}-legend-proof` } });

    const after = await client.stations.listManagement();
    const updated = after.find((station) => station.stationId === target.stationId);
    if (!updated) {
      throw new Error("station management updated row missing");
    }

    if (updated.stationName !== patched.stationName) throw new Error("station management stationName not persisted");
    if (updated.locationName !== patched.locationName) throw new Error("station management locationName not persisted");
    if (updated.description !== patched.description) throw new Error("station management description not persisted");
    if (updated.chartLegendName !== `${original.chartLegendName}-legend-proof`) {
      throw new Error("station management chartLegendName not persisted");
    }

    const report = {
      auth: {
        user: login.user.name,
        role: login.user.role
      },
      stationManagementPanel: {
        totalStations: after.length,
        targetStationId: target.stationId,
        targetStationName: updated.stationName,
        locationName: updated.locationName,
        description: updated.description,
        chartLegendName: updated.chartLegendName,
        deviceCount: updated.deviceCount,
        sensorTypes: updated.sensorTypes,
        updatedAt: updated.updatedAt ?? null
      }
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.stations.updateManagement({
      stationId: target.stationId,
      stationName: original.stationName,
      locationName: original.locationName,
      description: original.description,
      chartLegendName: original.chartLegendName,
      riskLevel: original.riskLevel,
      status: original.status,
      sensorTypes: original.sensorTypes
    });
    await client.stations.updateLegendNames({ legends: { [target.stationId]: original.chartLegendName } });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
