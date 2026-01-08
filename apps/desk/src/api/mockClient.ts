import type {
  ApiClient,
  Baseline,
  Device,
  Station,
} from "./client";
import { clamp, sleep } from "./mockUtils";
import { createMockWorld } from "./mockWorld";

type MockOptions = {
  delayMs?: number;
  failureRate?: number;
};

export function createMockClient(options: MockOptions = {}): ApiClient {
  const delayMs = options.delayMs ?? 200;
  const failureRate = clamp(options.failureRate ?? 0, 0, 1);

  const afterDelay = async (endpoint: string) => {
    await sleep(delayMs);
    if (failureRate <= 0) return;
    if (Math.random() < failureRate) {
      throw new Error(`Mock 故障注入：${endpoint}`);
    }
  };

  return {
    auth: {
      async login(input) {
        await afterDelay("auth.login");
        const name = "username" in input ? input.username : input.mobile;
        return {
          token: `mock-token-${String(Date.now())}`,
          user: { id: "u_admin", name, role: "admin" }
        };
      },
      async logout() {
        await afterDelay("auth.logout");
      }
    },
    dashboard: {
      async getSummary() {
        await afterDelay("dashboard.getSummary");
        const world = createMockWorld();
        return world.summary;
      },
      async getWeeklyTrend() {
        await afterDelay("dashboard.getWeeklyTrend");
        const world = createMockWorld();
        return world.weeklyTrend;
      }
    },
    stations: {
      async list() {
        await afterDelay("stations.list");
        const world = createMockWorld();
        return world.stations;
      }
    },
    devices: {
      async list(input) {
        await afterDelay("devices.list");
        const world = createMockWorld();
        const list = world.devices;
        if (!input?.stationId) return list;
        return list.filter((d) => d.stationId === input.stationId);
      }
    },
    gps: {
      async getSeries(input) {
        await afterDelay("gps.getSeries");
        const world = createMockWorld();
        return world.getGpsSeries(input.deviceId, input.days ?? 7);
      }
    },
    baselines: {
      async list() {
        await afterDelay("baselines.list");
        const world = createMockWorld();
        return world.baselines;
      },
      async upsert(input) {
        await afterDelay("baselines.upsert");
        const world = createMockWorld();
        return world.upsertBaseline(input);
      },
      async remove(input) {
        await afterDelay("baselines.remove");
        const world = createMockWorld();
        world.removeBaseline(input.deviceId);
      },
      async autoEstablish(input) {
        await afterDelay("baselines.autoEstablish");
        const world = createMockWorld();
        const st = world.stations.find((s) => world.devices.find((d) => d.id === input.deviceId)?.stationId === s.id);
        const lat = Number(((st?.lat ?? 22.6263) + (Math.random() - 0.5) * 0.0006).toFixed(6));
        const lng = Number(((st?.lng ?? 110.1805) + (Math.random() - 0.5) * 0.0006).toFixed(6));
        return world.upsertBaseline({
          deviceId: input.deviceId,
          baselineLat: lat,
          baselineLng: lng,
          baselineAlt: 90,
          establishedBy: "auto(mock)",
          status: "active",
          notes: "展厅演示：自动建立"
        });
      }
    },
    system: {
      async getStatus() {
        await afterDelay("system.getStatus");
        const world = createMockWorld();
        return world.systemStatus;
      }
    }
  };
}
