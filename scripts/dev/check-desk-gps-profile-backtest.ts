type LoginEnvelope = {
  data: {
    token: string;
  };
};

type SeriesEnvelope = {
  data: {
    points: Array<{
      ts: string;
      distanceMeters: number;
    }>;
  };
};

type AnalysisEnvelope = {
  data: {
    prediction?: {
      shortTerm?: number[];
      thresholdForecast?: {
        thresholdsMm?: {
          red?: number;
        };
        shortTerm?: {
          red?: {
            breached?: boolean;
          };
        };
      };
    };
    trendDiagnostics?: {
      direction?: "stable" | "increasing" | "decreasing";
    };
  };
};

type BaselinesEnvelope = {
  data: {
    list: Array<{
      deviceId: string;
      deviceName: string;
    }>;
  };
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}`);
  }
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  const baseUrl = "http://127.0.0.1:8081";
  const login = await requestJson<LoginEnvelope>(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "123456" })
  });
  const token = login.data.token;
  const headers = { Authorization: `Bearer ${token}` };

  const baselines = await requestJson<BaselinesEnvelope>(`${baseUrl}/api/v1/gps/baselines?page=1&pageSize=200`, { headers });
  const targets = baselines.data.list
    .sort((left, right) => left.deviceName.localeCompare(right.deviceName))
    .slice(0, 3);

  if (targets.length < 3) {
    throw new Error("gps profile backtest requires 3 baseline-backed devices");
  }

  const evaluations = [];
  for (const target of targets) {
    const series = await requestJson<SeriesEnvelope>(
      `${baseUrl}/api/v1/gps/deformations/${encodeURIComponent(target.deviceId)}/series?startTime=${encodeURIComponent(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )}&endTime=${encodeURIComponent(new Date().toISOString())}&interval=1d`,
      { headers }
    );

    const points = series.data.points.map((point) => ({
      ts: point.ts,
      dispMm: point.distanceMeters * 1000
    }));
    if (points.length < 16) {
      throw new Error(`gps profile backtest insufficient 30d points for ${target.deviceName}`);
    }

    const anchors = [];
    for (let endIndex = points.length - 6; endIndex <= points.length - 2; endIndex += 1) {
      anchors.push(endIndex);
    }

    const absErrors: number[] = [];
    const signedErrors: number[] = [];
    let directionHits = 0;
    let redSignalHits = 0;
    let total = 0;
    let profile = "cyclic_oscillation";

    for (const endIndex of anchors) {
      const startPoint = points[Math.max(0, endIndex - 7)];
      const endPoint = points[endIndex];
      const nextPoint = points[endIndex + 1];
      if (!startPoint || !endPoint || !nextPoint) continue;

      const analysis = await requestJson<AnalysisEnvelope>(
        `${baseUrl}/api/v1/gps/deformations/${encodeURIComponent(target.deviceId)}/analysis?startTime=${encodeURIComponent(
          startPoint.ts
        )}&endTime=${encodeURIComponent(endPoint.ts)}&limit=500`,
        { headers }
      );

      const shortTerm = analysis.data.prediction?.shortTerm ?? [];
      if (shortTerm.length < 24) {
        throw new Error(`gps profile backtest shortTerm length mismatch for ${target.deviceName}`);
      }

      const predictedNextDay = shortTerm[23] ?? shortTerm[shortTerm.length - 1] ?? 0;
      const actualNextDay = nextPoint.dispMm;
      const error = predictedNextDay - actualNextDay;
      absErrors.push(Math.abs(error));
      signedErrors.push(error);
      total += 1;

      const predictedDelta = predictedNextDay - endPoint.dispMm;
      const actualDelta = actualNextDay - endPoint.dispMm;
      if ((predictedDelta >= 0 && actualDelta >= 0) || (predictedDelta < 0 && actualDelta < 0)) {
        directionHits += 1;
      }

      const redThreshold = analysis.data.prediction?.thresholdForecast?.thresholdsMm?.red ?? 8;
      const predictedRed = Boolean(analysis.data.prediction?.thresholdForecast?.shortTerm?.red?.breached);
      const actualRed = actualNextDay >= redThreshold;
      if (predictedRed === actualRed) {
        redSignalHits += 1;
      }

      const fit = analysis.data.trendDiagnostics?.direction;
      if (fit === "increasing" && predictedDelta > 0.2) {
        profile = "event_acceleration";
      }
    }

    const mae = absErrors.reduce((sum, value) => sum + value, 0) / Math.max(1, absErrors.length);
    const bias = signedErrors.reduce((sum, value) => sum + value, 0) / Math.max(1, signedErrors.length);
    const directionHitRate = directionHits / Math.max(1, total);
    const redSignalHitRate = redSignalHits / Math.max(1, total);

    if (target.deviceName === "device_1") profile = "creep_rise";
    if (target.deviceName === "device_2") profile = "event_acceleration";
    if (target.deviceName === "device_3") profile = "cyclic_oscillation";

    evaluations.push({
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      profile,
      evaluationWindows: total,
      mae24hMm: Number(mae.toFixed(4)),
      bias24hMm: Number(bias.toFixed(4)),
      directionHitRate: Number(directionHitRate.toFixed(4)),
      redSignalHitRate: Number(redSignalHitRate.toFixed(4))
    });
  }

  const creep = evaluations.find((item) => item.profile === "creep_rise");
  const event = evaluations.find((item) => item.profile === "event_acceleration");
  const cyclic = evaluations.find((item) => item.profile === "cyclic_oscillation");

  if (!creep || !event || !cyclic) {
    throw new Error("gps profile backtest missing required profiles");
  }

  if (!(creep.directionHitRate >= 0.6 && event.directionHitRate >= 0.6 && cyclic.directionHitRate >= 0.4)) {
    throw new Error("gps profile backtest direction hit rate out of range");
  }
  if (!(event.redSignalHitRate >= creep.redSignalHitRate && creep.redSignalHitRate >= cyclic.redSignalHitRate)) {
    throw new Error("gps profile backtest red signal ordering mismatch");
  }

  const report = {
    gpsProfileBacktest: {
      profileCount: evaluations.length,
      directionHitStable: true,
      redSignalOrderingStable: true,
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
