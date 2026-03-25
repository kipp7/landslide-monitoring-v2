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
  const gnssCandidates = devices.filter((device) => device.type === "gnss" && baselineIds.has(device.id));
  if (gnssCandidates.length === 0) {
    throw new Error("gps monitoring page has no baseline-backed gnss candidates");
  }

  const selectedDevice = gnssCandidates[0]!;
  const baseline = baselines.find((item) => item.deviceId === selectedDevice.id);
  if (!baseline) {
    throw new Error("gps monitoring baseline missing for selected device");
  }

  const series7 = await client.gps.getSeries({ deviceId: selectedDevice.id, days: 7 });
  const series15 = await client.gps.getSeries({ deviceId: selectedDevice.id, days: 15 });
  const series30 = await client.gps.getSeries({ deviceId: selectedDevice.id, days: 30 });
  const analysis = await client.gps.getDerivedAnalysis({ deviceId: selectedDevice.id, rangeLabel: "7d", limit: 200 });

  if (series7.points.length === 0 || series15.points.length === 0 || series30.points.length === 0) {
    throw new Error("gps monitoring series missing for one of the time ranges");
  }
  if (!analysis.ceemd || !analysis.prediction) {
    throw new Error("gps monitoring derived analysis missing");
  }
  if (!analysis.prediction.confidenceIntervals) {
    throw new Error("gps monitoring derived analysis missing confidence intervals");
  }
  if (!analysis.trendDiagnostics) {
    throw new Error("gps monitoring derived analysis missing trend diagnostics");
  }
  if (!analysis.prediction.thresholdForecast) {
    throw new Error("gps monitoring derived analysis missing threshold forecast");
  }
  if (analysis.trendDiagnostics.durationHours <= 0) {
    throw new Error("gps monitoring derived analysis invalid trend duration");
  }
  if (analysis.prediction.confidenceIntervals.shortTermLower.length !== analysis.prediction.shortTerm.length) {
    throw new Error("gps monitoring shortTermLower length mismatch");
  }
  if (analysis.prediction.confidenceIntervals.shortTermUpper.length !== analysis.prediction.shortTerm.length) {
    throw new Error("gps monitoring shortTermUpper length mismatch");
  }
  if (analysis.prediction.confidenceIntervals.longTermLower.length !== analysis.prediction.longTerm.length) {
    throw new Error("gps monitoring longTermLower length mismatch");
  }
  if (analysis.prediction.confidenceIntervals.longTermUpper.length !== analysis.prediction.longTerm.length) {
    throw new Error("gps monitoring longTermUpper length mismatch");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    gpsMonitoringPage: {
      candidateCount: gnssCandidates.length,
      selectedDeviceId: selectedDevice.id,
      selectedDeviceName: selectedDevice.name,
      baselineEstablished: true,
      points7d: series7.points.length,
      points15d: series15.points.length,
      points30d: series30.points.length,
      ceemdImfCount: analysis.ceemd.imfs.length,
      ceemdQualityScore: analysis.ceemd.qualityScore,
      trendDirection: analysis.trendDiagnostics.direction,
      trendSlopeMmPerHour: analysis.trendDiagnostics.slopeMmPerHour,
      trendFitR2: analysis.trendDiagnostics.regressionFitR2,
      shortPredictionPoints: analysis.prediction.shortTerm.length,
      longPredictionPoints: analysis.prediction.longTerm.length,
      thresholdBlueMm: analysis.prediction.thresholdForecast.thresholdsMm.blue,
      shortBlueBreached: analysis.prediction.thresholdForecast.shortTerm.blue.breached,
      shortBlueEtaHours: analysis.prediction.thresholdForecast.shortTerm.blue.etaHours,
      longRedBreached: analysis.prediction.thresholdForecast.longTerm.red.breached,
      longRedEtaHours: analysis.prediction.thresholdForecast.longTerm.red.etaHours,
      shortPredictionLowerPoints: analysis.prediction.confidenceIntervals.shortTermLower.length,
      shortPredictionUpperPoints: analysis.prediction.confidenceIntervals.shortTermUpper.length,
      longPredictionLowerPoints: analysis.prediction.confidenceIntervals.longTermLower.length,
      longPredictionUpperPoints: analysis.prediction.confidenceIntervals.longTermUpper.length
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
