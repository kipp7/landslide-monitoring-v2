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
  const targetDevice = devices.find((device) => device.type === "gnss" && baselineIds.has(device.id));
  if (!targetDevice) {
    throw new Error("gps v1 analysis target missing");
  }

  const analysis = await client.gps.getDerivedAnalysis({ deviceId: targetDevice.id, rangeLabel: "7d", limit: 200 });
  if (!analysis.ceemd || !analysis.prediction) {
    throw new Error("gps v1 analysis contract returned incomplete payload");
  }
  if (!analysis.prediction.confidenceIntervals) {
    throw new Error("gps v1 analysis contract missing prediction confidence intervals");
  }
  if (!analysis.trendDiagnostics) {
    throw new Error("gps v1 analysis contract missing trend diagnostics");
  }
  if (!analysis.prediction.thresholdForecast) {
    throw new Error("gps v1 analysis contract missing threshold forecast");
  }
  if (analysis.trendDiagnostics.durationHours <= 0) {
    throw new Error("gps v1 analysis contract invalid trend duration");
  }
  if (analysis.trendDiagnostics.regressionFitR2 < 0 || analysis.trendDiagnostics.regressionFitR2 > 1) {
    throw new Error("gps v1 analysis contract invalid trend fit r2");
  }
  if (analysis.prediction.confidenceIntervals.shortTermLower.length !== analysis.prediction.shortTerm.length) {
    throw new Error("gps v1 analysis contract shortTermLower length mismatch");
  }
  if (analysis.prediction.confidenceIntervals.shortTermUpper.length !== analysis.prediction.shortTerm.length) {
    throw new Error("gps v1 analysis contract shortTermUpper length mismatch");
  }
  if (analysis.prediction.confidenceIntervals.longTermLower.length !== analysis.prediction.longTerm.length) {
    throw new Error("gps v1 analysis contract longTermLower length mismatch");
  }
  if (analysis.prediction.confidenceIntervals.longTermUpper.length !== analysis.prediction.longTerm.length) {
    throw new Error("gps v1 analysis contract longTermUpper length mismatch");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    gpsV1AnalysisContract: {
      deviceId: targetDevice.id,
      hasBaseline: analysis.hasBaseline,
      qualityScore: analysis.qualityScore,
      ceemdImfCount: analysis.ceemd.imfs.length,
      ceemdOrthogonality: analysis.ceemd.orthogonality,
      trendDirection: analysis.trendDiagnostics.direction,
      trendSlopeMmPerHour: analysis.trendDiagnostics.slopeMmPerHour,
      trendDurationHours: analysis.trendDiagnostics.durationHours,
      trendFitR2: analysis.trendDiagnostics.regressionFitR2,
      shortPredictionPoints: analysis.prediction.shortTerm.length,
      longPredictionPoints: analysis.prediction.longTerm.length,
      predictionConfidence: analysis.prediction.confidence,
      thresholdBlueMm: analysis.prediction.thresholdForecast.thresholdsMm.blue,
      thresholdRedMm: analysis.prediction.thresholdForecast.thresholdsMm.red,
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
