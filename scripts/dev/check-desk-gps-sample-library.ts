import { createHttpClient } from "../../apps/desk/src/api/httpClient";
import { selectGpsProfileTargets } from "./gps-proof-profile-targets";

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

  const baselines = await client.baselines.list();
  const targets = selectGpsProfileTargets(
    baselines.map((baseline) => ({
      id: baseline.deviceId,
      name: baseline.deviceName,
      deviceId: baseline.deviceId,
      deviceName: baseline.deviceName
    })),
    "gps sample library"
  );

  const entries = [];
  for (const device of targets) {
    const [series30, analysis30, analysis7] = await Promise.all([
      client.gps.getSeries({ deviceId: device.id, days: 30 }),
      client.gps.getDerivedAnalysis({ deviceId: device.id, rangeLabel: "30d", limit: 500 }),
      client.gps.getDerivedAnalysis({ deviceId: device.id, rangeLabel: "7d", limit: 500 })
    ]);
    if (!analysis30.trendDiagnostics || !analysis7.trendDiagnostics) {
      throw new Error(`gps sample library missing trend diagnostics for ${device.name}`);
    }
    const values = series30.points.map((point) => point.dispMm);
    const rangeMm = Math.max(...values) - Math.min(...values);
    let profile = "cyclic_oscillation";
    if (analysis30.trendDiagnostics.slopeMmPerHour > 0.022 && analysis30.trendDiagnostics.regressionFitR2 > 0.7 && rangeMm > 20) {
      profile = "event_acceleration";
    } else if (analysis30.trendDiagnostics.slopeMmPerHour > 0.015 && analysis30.trendDiagnostics.regressionFitR2 > 0.45) {
      profile = "creep_rise";
    }
    entries.push({
      deviceId: device.id,
      deviceName: device.name,
      pointCount: series30.points.length,
      profile,
      trendDirection30d: analysis30.trendDiagnostics.direction,
      trendDirection7d: analysis7.trendDiagnostics.direction,
      slopeMmPerHour30d: analysis30.trendDiagnostics.slopeMmPerHour,
      slopeMmPerHour7d: analysis7.trendDiagnostics.slopeMmPerHour,
      fitR2: analysis30.trendDiagnostics.regressionFitR2,
      rangeMm: Number(rangeMm.toFixed(3)),
      lastDispMm: values.at(-1) ?? 0
    });
  }

  const [first, second, third] = entries;
  if (!first || !second || !third) {
    throw new Error("gps sample library entries incomplete");
  }

  if (first.pointCount < 30 || second.pointCount < 30 || third.pointCount < 30) {
    throw new Error("gps sample library requires 30d series coverage");
  }

  const distinctRanges = new Set(entries.map((entry) => entry.rangeMm.toFixed(2)));
  if (distinctRanges.size < 3) {
    throw new Error("gps sample library ranges are not sufficiently distinct");
  }

  const profiles = entries.map((entry) => entry.profile);
  if (new Set(profiles).size !== 3) {
    throw new Error("gps sample library profiles are not distinct");
  }
  if (first.profile !== "creep_rise") {
    throw new Error("gps sample library device_1 should classify as creep_rise");
  }
  if (second.profile !== "event_acceleration") {
    throw new Error("gps sample library device_2 should classify as event_acceleration");
  }
  if (third.profile !== "cyclic_oscillation") {
    throw new Error("gps sample library device_3 should classify as cyclic_oscillation");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    gpsSampleLibrary: {
      deviceCount: entries.length,
      profileKinds: profiles,
      profileKindsDistinct: true,
      distinctRangeBuckets: distinctRanges.size,
      entries
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
