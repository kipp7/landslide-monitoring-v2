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
      if (refreshToken !== undefined) {
        state.refreshToken = refreshToken;
      }
    },
    onAuthFailure: () => {
      state.token = null;
      state.refreshToken = null;
    }
  });

  const login = await client.auth.login({ username: "viewer", password: "123456" });
  state.token = login.token;
  state.refreshToken = login.refreshToken ?? null;

  const summary = await client.dashboard.getSummary();
  const trend = await client.dashboard.getWeeklyTrend();
  const stations = await client.stations.list();
  const devices = await client.devices.list();
  const baselines = await client.baselines.list();

  if (stations.length === 0) {
    throw new Error("viewer stations list empty");
  }
  if (devices.length === 0) {
    throw new Error("viewer devices list empty");
  }
  if (baselines.length === 0) {
    throw new Error("viewer baselines list empty");
  }

  const baselineTarget = baselines[0]!;
  const gpsError = await expectFailure("viewer gps.getSeries", () =>
    client.gps.getSeries({ deviceId: baselineTarget.deviceId, days: 7 })
  );
  const systemError = await expectFailure("viewer system.getStatus", () => client.system.getStatus());
  const upsertError = await expectFailure("viewer baselines.upsert", () =>
    client.baselines.upsert({
      deviceId: baselineTarget.deviceId,
      baselineLat: baselineTarget.baselineLat,
      baselineLng: baselineTarget.baselineLng,
      ...(baselineTarget.baselineAlt === undefined ? {} : { baselineAlt: baselineTarget.baselineAlt }),
      establishedBy: "viewer-proof",
      status: baselineTarget.status,
      ...(baselineTarget.notes === undefined ? {} : { notes: baselineTarget.notes }),
      persist: false
    })
  );
  const issueCommandError = await expectFailure("viewer devices.issueCommand", () =>
    client.devices.issueCommand({
      deviceId: devices[0]!.id,
      commandType: "restart_device",
      payload: { source: "viewer-boundary-proof" }
    })
  );
  const listCommandsError = await expectFailure("viewer devices.listCommands", () =>
    client.devices.listCommands({ deviceId: devices[0]!.id })
  );

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role,
      hasRefreshToken: Boolean(login.refreshToken)
    },
    reads: {
      stationCount: summary.stationCount,
      deviceOnlineCount: summary.deviceOnlineCount,
      alertCountToday: summary.alertCountToday,
      weeklyTrend: {
        labels: trend.labels.length,
        rainfallSum: trend.rainfallMm.reduce((sum, value) => sum + value, 0),
        alertSum: trend.alertCount.reduce((sum, value) => sum + value, 0)
      },
      stations: stations.length,
      devices: devices.length,
      baselines: baselines.length
    },
    denied: {
      gps: gpsError,
      system: systemError,
      baselineUpsert: upsertError,
      deviceCommandIssue: issueCommandError,
      deviceCommandList: listCommandsError
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
