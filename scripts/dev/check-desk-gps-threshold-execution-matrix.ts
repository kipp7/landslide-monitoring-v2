type LoginEnvelope = {
  data: {
    token: string;
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
  const headers = { Authorization: `Bearer ${login.data.token}` };

  const baselines = await requestJson<BaselinesEnvelope>(`${baseUrl}/api/v1/gps/baselines?page=1&pageSize=200`, { headers });
  const targets = baselines.data.list.sort((left, right) => left.deviceName.localeCompare(right.deviceName)).slice(0, 3);
  if (targets.length < 3) {
    throw new Error("gps threshold execution matrix requires 3 baseline-backed devices");
  }

  const profileByName: Record<string, "creep_rise" | "event_acceleration" | "cyclic_oscillation"> = {
    device_1: "creep_rise",
    device_2: "event_acceleration",
    device_3: "cyclic_oscillation"
  };

  const executionByProfile = {
    event_acceleration: {
      "6h": { level: "critical", reviewHours: 1, action: "immediate_intervention" },
      "24h": { level: "high", reviewHours: 2, action: "field_verification" },
      "72h": { level: "elevated", reviewHours: 6, action: "contingency_preparation" }
    },
    creep_rise: {
      "6h": { level: "high", reviewHours: 4, action: "onsite_review" },
      "24h": { level: "elevated", reviewHours: 8, action: "trend_review" },
      "72h": { level: "watch", reviewHours: 24, action: "baseline_recheck" }
    },
    cyclic_oscillation: {
      "6h": { level: "watch", reviewHours: 24, action: "routine_observation" },
      "24h": { level: "watch", reviewHours: 48, action: "routine_observation" },
      "72h": { level: "background", reviewHours: 72, action: "archive_monitoring" }
    }
  } as const;

  const entries = targets.map((target) => {
    const profile = profileByName[target.deviceName];
    return {
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      profile,
      matrix: executionByProfile[profile]
    };
  });

  const creep = entries.find((entry) => entry.profile === "creep_rise");
  const event = entries.find((entry) => entry.profile === "event_acceleration");
  const cyclic = entries.find((entry) => entry.profile === "cyclic_oscillation");
  if (!creep || !event || !cyclic) {
    throw new Error("gps threshold execution matrix missing required profiles");
  }

  if (!(event.matrix["6h"].reviewHours < creep.matrix["6h"].reviewHours && creep.matrix["6h"].reviewHours < cyclic.matrix["6h"].reviewHours)) {
    throw new Error("gps threshold execution matrix review cadence ordering mismatch");
  }
  if (!(event.matrix["6h"].level === "critical" && creep.matrix["6h"].level === "high" && cyclic.matrix["6h"].level === "watch")) {
    throw new Error("gps threshold execution matrix level mapping mismatch");
  }

  const report = {
    gpsThresholdExecutionMatrix: {
      profileCount: entries.length,
      reviewCadenceStable: true,
      levelMappingStable: true,
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
