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

function toMetrics(counts: { tp: number; fp: number; fn: number; tn: number }) {
  return {
    sensitivity: counts.tp + counts.fn > 0 ? Number((counts.tp / (counts.tp + counts.fn)).toFixed(4)) : null,
    specificity: counts.tn + counts.fp > 0 ? Number((counts.tn / (counts.tn + counts.fp)).toFixed(4)) : null,
    precision: counts.tp + counts.fp > 0 ? Number((counts.tp / (counts.tp + counts.fp)).toFixed(4)) : null,
    falseAlarmRate: counts.fp + counts.tn > 0 ? Number((counts.fp / (counts.fp + counts.tn)).toFixed(4)) : null,
    missRate: counts.fn + counts.tp > 0 ? Number((counts.fn / (counts.fn + counts.tp)).toFixed(4)) : null
  };
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
    throw new Error("gps profile alert sensitivity requires 3 baseline-backed devices");
  }

  const entries = [];
  for (const target of targets) {
    const profile =
      target.deviceName === "device_1"
        ? "creep_rise"
        : target.deviceName === "device_2"
          ? "event_acceleration"
          : "cyclic_oscillation";

    const series = await requestJson<SeriesEnvelope>(
      `${baseUrl}/api/v1/gps/deformations/${encodeURIComponent(target.deviceId)}/series?startTime=${encodeURIComponent(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )}&endTime=${encodeURIComponent(new Date().toISOString())}&interval=1h&limit=1000`,
      { headers }
    );
    const points = series.data.points.map((point) => ({ ts: point.ts, dispMm: point.distanceMeters * 1000 }));
    if (points.length < 72) {
      throw new Error(`gps profile alert sensitivity insufficient hourly points for ${target.deviceName}`);
    }

    const anchors: number[] = [];
    for (let idx = points.length - 72; idx <= points.length - 30; idx += 12) {
      anchors.push(idx);
    }

    const blue = { tp: 0, fp: 0, fn: 0, tn: 0 };
    const red = { tp: 0, fp: 0, fn: 0, tn: 0 };
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

      const future = points.slice(endIndex + 1, endIndex + 25);
      const blueThreshold = analysis.data.prediction?.thresholdForecast?.thresholdsMm?.blue ?? 2;
      const redThreshold = analysis.data.prediction?.thresholdForecast?.thresholdsMm?.red ?? 8;
      const actualBlue = future.some((point) => point.dispMm >= blueThreshold);
      const actualRed = future.some((point) => point.dispMm >= redThreshold);
      const predictedBlue = Boolean(analysis.data.prediction?.thresholdForecast?.shortTerm?.blue?.breached);
      const predictedRed = Boolean(analysis.data.prediction?.thresholdForecast?.shortTerm?.red?.breached);

      if (predictedBlue && actualBlue) blue.tp += 1;
      else if (predictedBlue && !actualBlue) blue.fp += 1;
      else if (!predictedBlue && actualBlue) blue.fn += 1;
      else blue.tn += 1;

      if (predictedRed && actualRed) red.tp += 1;
      else if (predictedRed && !actualRed) red.fp += 1;
      else if (!predictedRed && actualRed) red.fn += 1;
      else red.tn += 1;
    }

    entries.push({
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      profile,
      windows: anchors.length,
      blue: {
        ...blue,
        ...toMetrics(blue)
      },
      red: {
        ...red,
        ...toMetrics(red)
      }
    });
  }

  const creep = entries.find((entry) => entry.profile === "creep_rise");
  const event = entries.find((entry) => entry.profile === "event_acceleration");
  const cyclic = entries.find((entry) => entry.profile === "cyclic_oscillation");
  if (!creep || !event || !cyclic) {
    throw new Error("gps profile alert sensitivity missing required profiles");
  }

  if (!(creep.blue.sensitivity === 1 && event.blue.sensitivity === 1 && cyclic.blue.sensitivity === 1)) {
    throw new Error("gps profile alert sensitivity blue sensitivity mismatch");
  }
  if (!(creep.red.sensitivity === 1 && event.red.sensitivity === 1)) {
    throw new Error("gps profile alert sensitivity red sensitivity mismatch");
  }
  if (!(cyclic.red.specificity === 1 && cyclic.red.falseAlarmRate === 0)) {
    throw new Error("gps profile alert sensitivity cyclic red specificity mismatch");
  }

  const report = {
    gpsProfileAlertSensitivity: {
      profileCount: entries.length,
      blueSensitivityStable: true,
      redSensitivityStable: true,
      cyclicRedSpecificityStable: true,
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
