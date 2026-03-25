import { createHttpClient } from "../../apps/desk/src/api/httpClient";

type SessionState = {
  token: string | null;
  refreshToken: string | null;
};

function serializeBaseline(input: unknown): string {
  return JSON.stringify(input);
}

async function expectFailure(label: string, action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`${label} should have failed`);
}

async function main(): Promise<void> {
  const state: SessionState = {
    token: null,
    refreshToken: null
  };

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

  const mobileLoginError = await expectFailure("mobile login", () =>
    client.auth.login({ mobile: "13800000000", code: "123456" })
  );

  const stations = await client.stations.list();
  const devices = await client.devices.list();
  const baselines = await client.baselines.list();

  if (devices.length === 0) {
    throw new Error("devices list is empty");
  }
  if (baselines.length === 0) {
    throw new Error("baselines list is empty");
  }

  const baselineDeviceId = baselines[0]?.deviceId ?? devices[0]!.id;
  const gps = await client.gps.getSeries({ deviceId: baselineDeviceId, days: 7 });
  const summary = await client.dashboard.getSummary();
  const trend = await client.dashboard.getWeeklyTrend();
  const system = await client.system.getStatus();

  const baselineBefore = baselines.find((item) => item.deviceId === baselineDeviceId) ?? baselines[0]!;
  const baselineBeforeJson = serializeBaseline(baselineBefore);
  const proofUpsert = await client.baselines.upsert({
    deviceId: baselineBefore.deviceId,
    baselineLat: baselineBefore.baselineLat + 0.00001,
    baselineLng: baselineBefore.baselineLng + 0.00001,
    ...(baselineBefore.baselineAlt === undefined ? {} : { baselineAlt: baselineBefore.baselineAlt }),
    establishedBy: "desk-http-client-proof",
    status: baselineBefore.status,
    ...(baselineBefore.notes === undefined ? {} : { notes: baselineBefore.notes }),
    persist: false
  });
  const proofAuto = await client.baselines.autoEstablish({ deviceId: baselineBefore.deviceId, persist: false });
  const baselinesAfterProof = await client.baselines.list();
  const baselineAfter = baselinesAfterProof.find((item) => item.deviceId === baselineDeviceId) ?? baselinesAfterProof[0]!;
  const baselineAfterJson = serializeBaseline(baselineAfter);

  const tokenBeforeRefresh = state.token;
  const invalidToken = `${state.token ?? ""}-invalid`;
  state.token = invalidToken;
  const refreshedBaselines = await client.baselines.list();
  const tokenAfterRefresh = state.token;

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role,
      hasRefreshToken: Boolean(login.refreshToken),
      mobileLoginRejected: mobileLoginError,
      refreshRecovered:
        tokenAfterRefresh !== invalidToken &&
        Boolean(tokenAfterRefresh) &&
        refreshedBaselines.length > 0
    },
    summary,
    refreshedBaselines: refreshedBaselines.length,
    weeklyTrend: {
      labels: trend.labels.length,
      rainfallSum: trend.rainfallMm.reduce((sum, value) => sum + value, 0),
      alertSum: trend.alertCount.reduce((sum, value) => sum + value, 0),
      source: trend.source
    },
    stations: {
      count: stations.length,
      first: stations[0] ?? null
    },
    devices: {
      count: devices.length,
      first: devices[0] ?? null
    },
    baselines: {
      count: baselines.length,
      first: baselines[0] ?? null
    },
    baselineProof: {
      upsertDeviceId: proofUpsert.deviceId,
      autoDeviceId: proofAuto.deviceId,
      stable: baselineBeforeJson === baselineAfterJson
    },
    gps: {
      deviceId: gps.deviceId,
      points: gps.points.length
    },
    system: {
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
