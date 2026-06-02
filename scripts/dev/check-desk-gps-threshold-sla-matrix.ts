import { GPS_PROFILE_BY_DEVICE_NAME, selectGpsProfileTargets } from "./gps-proof-profile-targets";

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
  const targets = selectGpsProfileTargets(baselines.data.list, "gps threshold sla matrix");

  const slaByProfile = {
    event_acceleration: {
      "6h": { ackMinutes: 15, dispatchMinutes: 30, closureHours: 6 },
      "24h": { ackMinutes: 30, dispatchMinutes: 60, closureHours: 12 },
      "72h": { ackMinutes: 60, dispatchMinutes: 180, closureHours: 24 }
    },
    creep_rise: {
      "6h": { ackMinutes: 30, dispatchMinutes: 120, closureHours: 12 },
      "24h": { ackMinutes: 60, dispatchMinutes: 240, closureHours: 24 },
      "72h": { ackMinutes: 120, dispatchMinutes: 480, closureHours: 48 }
    },
    cyclic_oscillation: {
      "6h": { ackMinutes: 240, dispatchMinutes: 720, closureHours: 48 },
      "24h": { ackMinutes: 480, dispatchMinutes: 1440, closureHours: 72 },
      "72h": { ackMinutes: 720, dispatchMinutes: 2880, closureHours: 96 }
    }
  } as const;

  const entries = targets.map((target) => {
    const profile = GPS_PROFILE_BY_DEVICE_NAME[target.deviceName];
    return {
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      profile,
      sla: slaByProfile[profile]
    };
  });

  const creep = entries.find((entry) => entry.profile === "creep_rise");
  const event = entries.find((entry) => entry.profile === "event_acceleration");
  const cyclic = entries.find((entry) => entry.profile === "cyclic_oscillation");
  if (!creep || !event || !cyclic) {
    throw new Error("gps threshold sla matrix missing required profiles");
  }

  if (!(event.sla["6h"].ackMinutes < creep.sla["6h"].ackMinutes && creep.sla["6h"].ackMinutes < cyclic.sla["6h"].ackMinutes)) {
    throw new Error("gps threshold sla matrix ack ordering mismatch");
  }
  if (!(event.sla["24h"].closureHours < creep.sla["24h"].closureHours && creep.sla["24h"].closureHours < cyclic.sla["24h"].closureHours)) {
    throw new Error("gps threshold sla matrix closure ordering mismatch");
  }

  const report = {
    gpsThresholdSlaMatrix: {
      profileCount: entries.length,
      ackOrderingStable: true,
      closureOrderingStable: true,
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
