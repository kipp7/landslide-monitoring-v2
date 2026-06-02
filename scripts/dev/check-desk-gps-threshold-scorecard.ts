import { GPS_PROFILE_BY_DEVICE_NAME, selectGpsProfileTargets } from "./gps-proof-profile-targets";

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
      thresholdForecast?: {
        thresholdsMm?: {
          blue?: number;
          yellow?: number;
          red?: number;
        };
      };
      shortTerm?: number[];
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

type Metric = {
  precision: number | null;
  specificity: number | null;
  falseAlarmRate: number | null;
  missRate: number | null;
  recall: number | null;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}`);
  }
  return (await res.json()) as T;
}

function metric(tp: number, fp: number, fn: number, tn: number): Metric {
  return {
    precision: tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(4)) : null,
    specificity: tn + fp > 0 ? Number((tn / (tn + fp)).toFixed(4)) : null,
    falseAlarmRate: fp + tn > 0 ? Number((fp / (fp + tn)).toFixed(4)) : null,
    missRate: fn + tp > 0 ? Number((fn / (fn + tp)).toFixed(4)) : null,
    recall: fn + tp > 0 ? Number((tp / (fn + tp)).toFixed(4)) : null,
    tp,
    fp,
    fn,
    tn
  };
}

function scoreMetric(m: Metric): number {
  const values = [
    m.precision,
    m.specificity,
    m.falseAlarmRate == null ? null : 1 - m.falseAlarmRate,
    m.missRate == null ? null : 1 - m.missRate,
    m.recall
  ].filter((value): value is number => value !== null);
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
  const targets = selectGpsProfileTargets(baselines.data.list, "gps threshold scorecard");

  const horizons = [6, 24, 72] as const;
  const thresholds = ["blue", "yellow", "red"] as const;
  const thresholdWeights = { blue: 1, yellow: 2, red: 3 } as const;

  const entries = [];
  for (const target of targets) {
    const profile = GPS_PROFILE_BY_DEVICE_NAME[target.deviceName];
    const series = await requestJson<SeriesEnvelope>(
      `${baseUrl}/api/v1/gps/deformations/${encodeURIComponent(target.deviceId)}/series?startTime=${encodeURIComponent(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )}&endTime=${encodeURIComponent(new Date().toISOString())}&interval=1h&limit=1000`,
      { headers }
    );
    const points = series.data.points.map((point) => ({ ts: point.ts, dispMm: point.distanceMeters * 1000 }));
    const values = points.map((point) => point.dispMm);
    const anchors: number[] = [];
    for (let idx = points.length - 96; idx <= points.length - 30; idx += 12) {
      anchors.push(idx);
    }

    const matrix: Record<string, Record<string, Metric>> = {};
    let governanceScoreSum = 0;
    let governanceCells = 0;
    let burdenScore = 0;

    for (const horizon of horizons) {
      const counts = {
        blue: { tp: 0, fp: 0, fn: 0, tn: 0 },
        yellow: { tp: 0, fp: 0, fn: 0, tn: 0 },
        red: { tp: 0, fp: 0, fn: 0, tn: 0 }
      };

      for (const endIndex of anchors) {
        const startIndex = Math.max(0, endIndex - 24 * 7);
        const startPoint = points[startIndex];
        const endPoint = points[endIndex];
        if (!startPoint || !endPoint) continue;

        const analysis = await requestJson<AnalysisEnvelope>(
          `${baseUrl}/api/v1/gps/deformations/${encodeURIComponent(target.deviceId)}/analysis?startTime=${encodeURIComponent(
            startPoint.ts
          )}&endTime=${encodeURIComponent(endPoint.ts)}&limit=500`,
          { headers }
        );

        const prediction = analysis.data.prediction?.shortTerm ?? [];
        const thresholdForecast = analysis.data.prediction?.thresholdForecast;
        const future = points.slice(endIndex + 1, endIndex + 1 + horizon);

        for (const key of thresholds) {
          const threshold = thresholdForecast?.thresholdsMm?.[key] ?? (key === "blue" ? 2 : key === "yellow" ? 5 : 8);
          const predicted = prediction.slice(0, horizon).some((value) => value >= threshold);
          const actual = future.some((point) => point.dispMm >= threshold);
          if (predicted && actual) counts[key].tp += 1;
          else if (predicted && !actual) counts[key].fp += 1;
          else if (!predicted && actual) counts[key].fn += 1;
          else counts[key].tn += 1;
        }
      }

      matrix[`${String(horizon)}h`] = {
        blue: metric(counts.blue.tp, counts.blue.fp, counts.blue.fn, counts.blue.tn),
        yellow: metric(counts.yellow.tp, counts.yellow.fp, counts.yellow.fn, counts.yellow.tn),
        red: metric(counts.red.tp, counts.red.fp, counts.red.fn, counts.red.tn)
      };
    }

    for (const horizon of Object.keys(matrix)) {
      for (const threshold of thresholds) {
        const m = matrix[horizon]?.[threshold];
        if (!m) continue;
        governanceScoreSum += scoreMetric(m);
        governanceCells += 1;
        burdenScore += ((m.tp + m.fn) / Math.max(1, anchors.length)) * thresholdWeights[threshold];
      }
    }

    entries.push({
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      profile,
      governanceScore: Number((governanceScoreSum / Math.max(1, governanceCells)).toFixed(4)),
      burdenScore: Number(burdenScore.toFixed(4)),
      rangeMm: Number((Math.max(...values) - Math.min(...values)).toFixed(4)),
      matrix
    });
  }

  const creep = entries.find((entry) => entry.profile === "creep_rise");
  const event = entries.find((entry) => entry.profile === "event_acceleration");
  const cyclic = entries.find((entry) => entry.profile === "cyclic_oscillation");
  if (!creep || !event || !cyclic) {
    throw new Error("gps threshold scorecard missing required profiles");
  }

  if (!(creep.governanceScore === 1 && event.governanceScore === 1 && cyclic.governanceScore === 1)) {
    throw new Error("gps threshold scorecard governance score mismatch");
  }
  if (!(event.burdenScore >= creep.burdenScore && creep.burdenScore > cyclic.burdenScore)) {
    throw new Error("gps threshold scorecard burden ordering mismatch");
  }
  if (!(event.rangeMm > creep.rangeMm && creep.rangeMm > cyclic.rangeMm)) {
    throw new Error("gps threshold scorecard range ordering mismatch");
  }

  const report = {
    gpsThresholdScorecard: {
      profileCount: entries.length,
      governanceScoreStable: true,
      burdenOrderingStable: true,
      rangeOrderingStable: true,
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
