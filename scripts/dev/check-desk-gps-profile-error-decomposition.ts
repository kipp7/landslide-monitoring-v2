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
          blue?: number;
          red?: number;
        };
        shortTerm?: {
          blue?: { breached?: boolean };
          red?: { breached?: boolean };
        };
      };
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

function avg(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

async function main(): Promise<void> {
  const baseUrl = "http://127.0.0.1:8081";
  const login = await requestJson<LoginEnvelope>(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "123456" })
  });
  const headers = { Authorization: `Bearer ${login.data.token}` };

  const baselines = await requestJson<BaselinesEnvelope>(`${baseUrl}/api/v1/gps/baselines?page=1&pageSize=200`, { headers });
  const targets = baselines.data.list.sort((left, right) => left.deviceName.localeCompare(right.deviceName)).slice(0, 3);
  if (targets.length < 3) {
    throw new Error("gps profile error decomposition requires 3 baseline-backed devices");
  }

  const evaluations = [];
  for (const target of targets) {
    const series = await requestJson<SeriesEnvelope>(
      `${baseUrl}/api/v1/gps/deformations/${encodeURIComponent(target.deviceId)}/series?startTime=${encodeURIComponent(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )}&endTime=${encodeURIComponent(new Date().toISOString())}&interval=1h&limit=1000`,
      { headers }
    );
    const points = series.data.points.map((point) => ({
      ts: point.ts,
      dispMm: point.distanceMeters * 1000
    }));
    if (points.length < 24 * 10) {
      throw new Error(`gps profile error decomposition insufficient hourly points for ${target.deviceName}`);
    }

    const profile =
      target.deviceName === "device_1"
        ? "creep_rise"
        : target.deviceName === "device_2"
          ? "event_acceleration"
          : "cyclic_oscillation";

    const anchors: number[] = [];
    for (let idx = points.length - 72; idx <= points.length - 30; idx += 12) {
      anchors.push(idx);
    }

    const abs6: number[] = [];
    const abs24: number[] = [];
    const signed6: number[] = [];
    const signed24: number[] = [];
    let blueHits = 0;
    let redHits = 0;
    let blueFalse = 0;
    let redFalse = 0;
    let total = 0;

    for (const endIndex of anchors) {
      const startIndex = Math.max(0, endIndex - 24 * 7);
      const startPoint = points[startIndex];
      const endPoint = points[endIndex];
      const actual6 = points[endIndex + 6];
      const actual24 = points[endIndex + 24];
      if (!startPoint || !endPoint || !actual6 || !actual24) continue;

      const analysis = await requestJson<AnalysisEnvelope>(
        `${baseUrl}/api/v1/gps/deformations/${encodeURIComponent(target.deviceId)}/analysis?startTime=${encodeURIComponent(
          startPoint.ts
        )}&endTime=${encodeURIComponent(endPoint.ts)}&limit=500`,
        { headers }
      );

      const shortTerm = analysis.data.prediction?.shortTerm ?? [];
      if (shortTerm.length < 24) {
        throw new Error(`gps profile error decomposition shortTerm length mismatch for ${target.deviceName}`);
      }

      const pred6 = shortTerm[5] ?? shortTerm[shortTerm.length - 1] ?? 0;
      const pred24 = shortTerm[23] ?? shortTerm[shortTerm.length - 1] ?? 0;
      const err6 = pred6 - actual6.dispMm;
      const err24 = pred24 - actual24.dispMm;
      abs6.push(Math.abs(err6));
      abs24.push(Math.abs(err24));
      signed6.push(err6);
      signed24.push(err24);

      const blueThreshold = analysis.data.prediction?.thresholdForecast?.thresholdsMm?.blue ?? 2;
      const redThreshold = analysis.data.prediction?.thresholdForecast?.thresholdsMm?.red ?? 8;
      const futureWindow = points.slice(endIndex + 1, endIndex + 25);
      const actualBlue = futureWindow.some((point) => point.dispMm >= blueThreshold);
      const actualRed = futureWindow.some((point) => point.dispMm >= redThreshold);
      const predictedBlue = Boolean(analysis.data.prediction?.thresholdForecast?.shortTerm?.blue?.breached);
      const predictedRed = Boolean(analysis.data.prediction?.thresholdForecast?.shortTerm?.red?.breached);

      if (predictedBlue === actualBlue) blueHits += 1;
      if (predictedRed === actualRed) redHits += 1;
      if (predictedBlue && !actualBlue) blueFalse += 1;
      if (predictedRed && !actualRed) redFalse += 1;
      total += 1;
    }

    const evaluation = {
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      profile,
      evaluationWindows: total,
      mae6hMm: Number(avg(abs6).toFixed(4)),
      mae24hMm: Number(avg(abs24).toFixed(4)),
      bias6hMm: Number(avg(signed6).toFixed(4)),
      bias24hMm: Number(avg(signed24).toFixed(4)),
      blueHitRate: Number((blueHits / Math.max(1, total)).toFixed(4)),
      redHitRate: Number((redHits / Math.max(1, total)).toFixed(4)),
      blueFalseAlarmRate: Number((blueFalse / Math.max(1, total)).toFixed(4)),
      redFalseAlarmRate: Number((redFalse / Math.max(1, total)).toFixed(4))
    };
    evaluations.push(evaluation);
  }

  const creep = evaluations.find((item) => item.profile === "creep_rise");
  const event = evaluations.find((item) => item.profile === "event_acceleration");
  const cyclic = evaluations.find((item) => item.profile === "cyclic_oscillation");
  if (!creep || !event || !cyclic) {
    throw new Error("gps profile error decomposition missing required profiles");
  }

  if (!(creep.mae24hMm < cyclic.mae24hMm && cyclic.mae24hMm < event.mae24hMm)) {
    throw new Error("gps profile error decomposition mae ordering mismatch");
  }
  if (!(creep.blueHitRate >= 0.9 && event.blueHitRate >= 0.9 && cyclic.blueHitRate >= 0.9)) {
    throw new Error("gps profile error decomposition blue hit rate out of range");
  }
  if (!(event.bias24hMm > cyclic.bias24hMm && cyclic.bias24hMm > creep.bias24hMm)) {
    throw new Error("gps profile error decomposition bias ordering mismatch");
  }
  if (!(creep.redFalseAlarmRate === 0 && event.redFalseAlarmRate === 0 && cyclic.redFalseAlarmRate === 0)) {
    throw new Error("gps profile error decomposition red false alarm should stay zero");
  }

  const report = {
    gpsProfileErrorDecomposition: {
      profileCount: evaluations.length,
      maeOrderingStable: true,
      biasOrderingStable: true,
      redFalseAlarmOrderingStable: true,
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
