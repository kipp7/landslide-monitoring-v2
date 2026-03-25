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
  const targets = devices
    .filter((device) => device.type === "gnss" && baselineIds.has(device.id))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 3);

  if (targets.length < 3) {
    throw new Error("gps profile evaluation requires 3 baseline-backed gnss devices");
  }

  const evaluations = [];
  for (const device of targets) {
    const [series30, analysis30, analysis7] = await Promise.all([
      client.gps.getSeries({ deviceId: device.id, days: 30 }),
      client.gps.getDerivedAnalysis({ deviceId: device.id, rangeLabel: "30d", limit: 500 }),
      client.gps.getDerivedAnalysis({ deviceId: device.id, rangeLabel: "7d", limit: 500 })
    ]);
    if (!analysis30.trendDiagnostics || !analysis7.trendDiagnostics) {
      throw new Error(`gps profile evaluation missing trend diagnostics for ${device.name}`);
    }

    const values = series30.points.map((point) => point.dispMm);
    const rangeMm = Math.max(...values) - Math.min(...values);
    let profile = "cyclic_oscillation";
    if (analysis30.trendDiagnostics.slopeMmPerHour > 0.022 && analysis30.trendDiagnostics.regressionFitR2 > 0.7 && rangeMm > 20) {
      profile = "event_acceleration";
    } else if (analysis30.trendDiagnostics.slopeMmPerHour > 0.015 && analysis30.trendDiagnostics.regressionFitR2 > 0.45) {
      profile = "creep_rise";
    }

    evaluations.push({
      deviceId: device.id,
      deviceName: device.name,
      profile,
      pointCount30d: series30.points.length,
      slope30d: analysis30.trendDiagnostics.slopeMmPerHour,
      fit30d: analysis30.trendDiagnostics.regressionFitR2,
      slope7d: analysis7.trendDiagnostics.slopeMmPerHour,
      fit7d: analysis7.trendDiagnostics.regressionFitR2,
      rangeMm: Number(rangeMm.toFixed(3))
    });
  }

  const creep = evaluations.find((item) => item.profile === "creep_rise");
  const event = evaluations.find((item) => item.profile === "event_acceleration");
  const cyclic = evaluations.find((item) => item.profile === "cyclic_oscillation");

  if (!creep || !event || !cyclic) {
    throw new Error("gps profile evaluation requires creep/event/cyclic profiles");
  }

  if (creep.fit30d <= 0.45 || creep.slope30d <= 0.015) {
    throw new Error("gps creep_rise profile metrics out of range");
  }
  if (event.fit30d <= 0.7 || event.slope30d <= 0.022 || event.rangeMm <= 20) {
    throw new Error("gps event_acceleration profile metrics out of range");
  }
  if (Math.abs(cyclic.slope30d) >= 0.01 || cyclic.fit30d >= 0.1 || cyclic.rangeMm >= 5) {
    throw new Error("gps cyclic_oscillation profile metrics out of range");
  }
  if (!(event.slope30d > creep.slope30d && creep.slope30d > cyclic.slope30d)) {
    throw new Error("gps profile evaluation slope ordering mismatch");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    gpsProfileEvaluation: {
      profileCount: evaluations.length,
      creepRiseStable: true,
      eventAccelerationStable: true,
      cyclicOscillationStable: true,
      slopeOrderingStable: true,
      entries: evaluations
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
