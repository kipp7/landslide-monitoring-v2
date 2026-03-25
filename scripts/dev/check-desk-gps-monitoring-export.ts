import { createHttpClient } from "../../apps/desk/src/api/httpClient";
import { buildGpsAnalysisExport, buildGpsChartExport, buildGpsCsvExport, buildGpsReportExport, type GpsMonitoringExportRow } from "../../apps/desk/src/views/gpsMonitoringExport";

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
  const selectedDevice = devices.find((device) => device.type === "gnss" && baselineIds.has(device.id));
  if (!selectedDevice) {
    throw new Error("gps monitoring export target missing");
  }
  const baseline = baselines.find((item) => item.deviceId === selectedDevice.id) ?? null;
  const gpsSeries = await client.gps.getSeries({ deviceId: selectedDevice.id, days: 7 });
  const derivedAnalysis = await client.gps.getDerivedAnalysis({ deviceId: selectedDevice.id, rangeLabel: "7d", limit: 200 });

  const rows: GpsMonitoringExportRow[] = gpsSeries.points.map((point, index) => ({
    time: point.ts,
    displacement: point.dispMm,
    horizontal: Number((point.dispMm * 0.72).toFixed(2)),
    vertical: Number((point.dispMm * 0.28).toFixed(2)),
    velocityMmH: Number((index === 0 ? 0 : point.dispMm - gpsSeries.points[index - 1]!.dispMm).toFixed(3)),
    temperature: 0,
    humidity: 0,
    confidence: 0.9,
    riskLevel: point.dispMm > 8 ? 3 : point.dispMm > 5 ? 2 : point.dispMm > 2 ? 1 : 0,
    lat: 0,
    lng: 0
  }));

  const csv = buildGpsCsvExport(rows);
  const analysis = buildGpsAnalysisExport({
    device: selectedDevice,
    baseline,
    timeRange: "7d",
    rowCount: rows.length,
    rows,
    derivedAnalysis
  });
  const report = buildGpsReportExport({
    device: selectedDevice,
    baseline,
    timeRange: "7d",
    rows,
    derivedAnalysis
  });
  const chart = buildGpsChartExport({
    device: selectedDevice,
    timeRange: "7d",
    rows
  });
  const analysisPayload = JSON.parse(analysis.content) as {
    derivedAnalysis?: {
      prediction?: {
        confidenceIntervals?: {
          shortTermLower?: number[];
          shortTermUpper?: number[];
          longTermLower?: number[];
          longTermUpper?: number[];
        };
      };
    };
  };
  const exportedIntervals = analysisPayload.derivedAnalysis?.prediction?.confidenceIntervals;
  const exportedTrend = analysisPayload.derivedAnalysis?.trendDiagnostics;
  const exportedThresholdForecast = analysisPayload.derivedAnalysis?.prediction?.thresholdForecast;
  if (!exportedIntervals) {
    throw new Error("gps monitoring export missing prediction confidence intervals");
  }
  if (!exportedTrend) {
    throw new Error("gps monitoring export missing trend diagnostics");
  }
  if (!exportedThresholdForecast) {
    throw new Error("gps monitoring export missing threshold forecast");
  }
  if ((exportedIntervals.shortTermLower?.length ?? 0) !== (derivedAnalysis.prediction?.shortTerm.length ?? 0)) {
    throw new Error("gps monitoring export shortTermLower length mismatch");
  }
  if ((exportedIntervals.shortTermUpper?.length ?? 0) !== (derivedAnalysis.prediction?.shortTerm.length ?? 0)) {
    throw new Error("gps monitoring export shortTermUpper length mismatch");
  }
  if ((exportedIntervals.longTermLower?.length ?? 0) !== (derivedAnalysis.prediction?.longTerm.length ?? 0)) {
    throw new Error("gps monitoring export longTermLower length mismatch");
  }
  if ((exportedIntervals.longTermUpper?.length ?? 0) !== (derivedAnalysis.prediction?.longTerm.length ?? 0)) {
    throw new Error("gps monitoring export longTermUpper length mismatch");
  }

  const result = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    export: {
      csvFilename: csv.filename,
      csvLines: csv.content.split(/\r?\n/).length,
      analysisFilename: analysis.filename,
      analysisLength: analysis.content.length,
      analysisContainsDerived: analysis.content.includes("\"derivedAnalysis\""),
      analysisIncludesConfidenceIntervals: analysis.content.includes("\"confidenceIntervals\""),
      analysisIncludesTrendDiagnostics: analysis.content.includes("\"trendDiagnostics\""),
      analysisIncludesThresholdForecast: analysis.content.includes("\"thresholdForecast\""),
      trendDirection: String(exportedTrend.direction ?? ""),
      trendFitR2: exportedTrend.regressionFitR2 ?? 0,
      thresholdBlueMm: exportedThresholdForecast.thresholdsMm?.blue ?? 0,
      longRedBreached: exportedThresholdForecast.longTerm?.red?.breached ?? false,
      longRedEtaHours: exportedThresholdForecast.longTerm?.red?.etaHours ?? null,
      shortPredictionLowerPoints: exportedIntervals.shortTermLower?.length ?? 0,
      shortPredictionUpperPoints: exportedIntervals.shortTermUpper?.length ?? 0,
      longPredictionLowerPoints: exportedIntervals.longTermLower?.length ?? 0,
      longPredictionUpperPoints: exportedIntervals.longTermUpper?.length ?? 0,
      reportFilename: report.filename,
      reportLength: report.content.length,
      reportIncludesCeemdQuality: report.content.includes("CEEMD质量分"),
      reportIncludesPredictionConfidence: report.content.includes("预测置信度"),
      reportIncludesTrendDirection: report.content.includes("趋势方向"),
      reportIncludesThresholdForecast: report.content.includes("红色阈值长期越界"),
      chartFilename: chart.filename,
      chartMimeType: chart.mimeType,
      chartHasSvgRoot: chart.content.includes("<svg"),
      chartPolylineCount: (chart.content.match(/<path /g) ?? []).length
    }
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
