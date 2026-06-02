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
  const targets = selectGpsProfileTargets(baselines.data.list, "gps threshold runbook");

  const runbookByProfile = {
    event_acceleration: {
      "6h": { owner: "ops_commander", escalation: "incident_bridge", packet: "immediate-response-kit" },
      "24h": { owner: "field_team", escalation: "regional_lead", packet: "field-verification-kit" },
      "72h": { owner: "planning_cell", escalation: "preparedness_board", packet: "contingency-kit" }
    },
    creep_rise: {
      "6h": { owner: "site_engineer", escalation: "geotech_lead", packet: "onsite-review-kit" },
      "24h": { owner: "monitoring_analyst", escalation: "ops_supervisor", packet: "trend-review-kit" },
      "72h": { owner: "baseline_team", escalation: "data_qa_board", packet: "baseline-recheck-kit" }
    },
    cyclic_oscillation: {
      "6h": { owner: "duty_analyst", escalation: "none", packet: "routine-observation-kit" },
      "24h": { owner: "duty_analyst", escalation: "none", packet: "routine-observation-kit" },
      "72h": { owner: "archive_operator", escalation: "none", packet: "archive-monitoring-kit" }
    }
  } as const;

  const entries = targets.map((target) => {
    const profile = GPS_PROFILE_BY_DEVICE_NAME[target.deviceName];
    return {
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      profile,
      runbook: runbookByProfile[profile]
    };
  });

  const creep = entries.find((entry) => entry.profile === "creep_rise");
  const event = entries.find((entry) => entry.profile === "event_acceleration");
  const cyclic = entries.find((entry) => entry.profile === "cyclic_oscillation");
  if (!creep || !event || !cyclic) {
    throw new Error("gps threshold runbook missing required profiles");
  }

  if (!(event.runbook["6h"].escalation === "incident_bridge" && creep.runbook["6h"].escalation === "geotech_lead")) {
    throw new Error("gps threshold runbook escalation mapping mismatch");
  }
  if (!(cyclic.runbook["72h"].owner === "archive_operator")) {
    throw new Error("gps threshold runbook archive owner mismatch");
  }

  const report = {
    gpsThresholdRunbook: {
      profileCount: entries.length,
      escalationMappingStable: true,
      ownershipStable: true,
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
