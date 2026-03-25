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
        shortTerm?: {
          blue?: { breached?: boolean };
          yellow?: { breached?: boolean };
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

function metric(tp: number, fp: number, fn: number, tn: number) {
  return {
    falseAlarmRate: fp + tn > 0 ? Number((fp / (fp + tn)).toFixed(4)) : null,
    missRate: fn + tp > 0 ? Number((fn / (fn + tp)).toFixed(4)) : null,
    recall: fn + tp > 0 ? Number((tp / (fn + tp)).toFixed(4)) : null,
    tp,
    fp,
    fn,
    tn
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
    throw new Error("gps threshold error rates requires 3 baseline-backed devices");
  }

  const profileByName: Record<string, "creep_rise" | "event_acceleration" | "cyclic_oscillation"> = {
    device_1: "creep_rise",
    device_2: "event_acceleration",
    device_3: "cyclic_oscillation"
  };

  const entries = [];
  for (const target of targets) {
    const profile = profileByName[target.deviceName];
    const series = await requestJson<SeriesEnvelope>(
      `${baseUrl}/api/v1/gps/deformations/${encodeURIComponent(target.deviceId)}/series?startTime=${encodeURIComponent(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )}&endTime=${encodeURIComponent(new Date().toISOString())}&interval=1h&limit=1000`,
      { headers }
    );
    const points = series.data.points.map((point) => ({ ts: point.ts, dispMm: point.distanceMeters * 1000 }));
    const anchors: number[] = [];
    for (let idx = points.length - 72; idx <= points.length - 30; idx += 12) {
      anchors.push(idx);
    }

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

      const future = points.slice(endIndex + 1, endIndex + 25);
      for (const key of ["blue", "yellow", "red"] as const) {
        const threshold =
          analysis.data.prediction?.thresholdForecast?.thresholdsMm?.[key] ?? (key === "blue" ? 2 : key === "yellow" ? 5 : 8);
        const predicted = Boolean(analysis.data.prediction?.thresholdForecast?.shortTerm?.[key]?.breached);
        const actual = future.some((point) => point.dispMm >= threshold);
        if (predicted && actual) counts[key].tp += 1;
        else if (predicted && !actual) counts[key].fp += 1;
        else if (!predicted && actual) counts[key].fn += 1;
        else counts[key].tn += 1;
      }
    }

    entries.push({
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      profile,
      blue: metric(counts.blue.tp, counts.blue.fp, counts.blue.fn, counts.blue.tn),
      yellow: metric(counts.yellow.tp, counts.yellow.fp, counts.yellow.fn, counts.yellow.tn),
      red: metric(counts.red.tp, counts.red.fp, counts.red.fn, counts.red.tn)
    });
  }

  const creep = entries.find((entry) => entry.profile === "creep_rise");
  const event = entries.find((entry) => entry.profile === "event_acceleration");
  const cyclic = entries.find((entry) => entry.profile === "cyclic_oscillation");
  if (!creep || !event || !cyclic) {
    throw new Error("gps threshold error rates missing required profiles");
  }

  if (!(creep.blue.missRate === 0 && event.blue.missRate === 0 && cyclic.blue.missRate === 0)) {
    throw new Error("gps threshold error rates blue miss mismatch");
  }
  if (!(creep.red.missRate === 0 && event.red.missRate === 0)) {
    throw new Error("gps threshold error rates red miss mismatch");
  }
  if (!(cyclic.yellow.falseAlarmRate === 0 && cyclic.red.falseAlarmRate === 0)) {
    throw new Error("gps threshold error rates cyclic false alarm mismatch");
  }

  const report = {
    gpsThresholdErrorRates: {
      profileCount: entries.length,
      blueMissStable: true,
      redMissStable: true,
      cyclicFalseAlarmStable: true,
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
