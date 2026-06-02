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
  const targets = selectGpsProfileTargets(baselines.data.list, "gps threshold operating model");

  const policyByProfile = {
    event_acceleration: {
      priority: 1,
      action: "immediate_intervention",
      boardLabel: "立即干预"
    },
    creep_rise: {
      priority: 2,
      action: "heightened_watch",
      boardLabel: "重点盯防"
    },
    cyclic_oscillation: {
      priority: 3,
      action: "routine_observation",
      boardLabel: "常规观察"
    }
  } as const;

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
    const policy = policyByProfile[profile];
    const execution = executionByProfile[profile];
    const runbook = runbookByProfile[profile];
    const sla = slaByProfile[profile];
    return {
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      profile,
      priority: policy.priority,
      boardAction: policy.action,
      boardLabel: policy.boardLabel,
      operatingModel: {
        "6h": {
          executionLevel: execution["6h"].level,
          reviewHours: execution["6h"].reviewHours,
          executionAction: execution["6h"].action,
          owner: runbook["6h"].owner,
          escalation: runbook["6h"].escalation,
          packet: runbook["6h"].packet,
          ackMinutes: sla["6h"].ackMinutes,
          dispatchMinutes: sla["6h"].dispatchMinutes,
          closureHours: sla["6h"].closureHours
        },
        "24h": {
          executionLevel: execution["24h"].level,
          reviewHours: execution["24h"].reviewHours,
          executionAction: execution["24h"].action,
          owner: runbook["24h"].owner,
          escalation: runbook["24h"].escalation,
          packet: runbook["24h"].packet,
          ackMinutes: sla["24h"].ackMinutes,
          dispatchMinutes: sla["24h"].dispatchMinutes,
          closureHours: sla["24h"].closureHours
        },
        "72h": {
          executionLevel: execution["72h"].level,
          reviewHours: execution["72h"].reviewHours,
          executionAction: execution["72h"].action,
          owner: runbook["72h"].owner,
          escalation: runbook["72h"].escalation,
          packet: runbook["72h"].packet,
          ackMinutes: sla["72h"].ackMinutes,
          dispatchMinutes: sla["72h"].dispatchMinutes,
          closureHours: sla["72h"].closureHours
        }
      }
    };
  });

  const event = entries.find((entry) => entry.profile === "event_acceleration");
  const creep = entries.find((entry) => entry.profile === "creep_rise");
  const cyclic = entries.find((entry) => entry.profile === "cyclic_oscillation");
  if (!event || !creep || !cyclic) {
    throw new Error("gps threshold operating model missing required profiles");
  }

  if (!(event.priority < creep.priority && creep.priority < cyclic.priority)) {
    throw new Error("gps threshold operating model priority ordering mismatch");
  }
  if (
    !(
      event.operatingModel["6h"].ackMinutes < creep.operatingModel["6h"].ackMinutes &&
      creep.operatingModel["6h"].ackMinutes < cyclic.operatingModel["6h"].ackMinutes
    )
  ) {
    throw new Error("gps threshold operating model response ordering mismatch");
  }
  if (
    !(
      event.operatingModel["24h"].closureHours < creep.operatingModel["24h"].closureHours &&
      creep.operatingModel["24h"].closureHours < cyclic.operatingModel["24h"].closureHours
    )
  ) {
    throw new Error("gps threshold operating model closure ordering mismatch");
  }

  const eventAligned =
    event.boardAction === "immediate_intervention" &&
    event.operatingModel["6h"].executionAction === "immediate_intervention" &&
    event.operatingModel["6h"].executionLevel === "critical";
  const creepAligned =
    creep.boardAction === "heightened_watch" &&
    creep.operatingModel["6h"].executionAction === "onsite_review" &&
    creep.operatingModel["6h"].executionLevel === "high";
  const cyclicAligned =
    cyclic.boardAction === "routine_observation" &&
    cyclic.operatingModel["72h"].executionAction === "archive_monitoring" &&
    cyclic.operatingModel["72h"].executionLevel === "background";
  if (!(eventAligned && creepAligned && cyclicAligned)) {
    throw new Error("gps threshold operating model board and execution alignment mismatch");
  }

  const escalationCoverageStable = entries.every((entry) => {
    const escalations = Object.values(entry.operatingModel).map((item) => item.escalation);
    if (entry.priority <= 2) {
      return escalations.every((value) => value !== "none");
    }
    return escalations.every((value) => value === "none");
  });
  if (!escalationCoverageStable) {
    throw new Error("gps threshold operating model escalation coverage mismatch");
  }

  const report = {
    gpsThresholdOperatingModel: {
      profileCount: entries.length,
      boardExecutionAlignmentStable: true,
      responseOrderingStable: true,
      escalationCoverageStable: true,
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
