import type { ApiClient } from "./client";

type HttpClientOptions = {
  baseUrl: string;
  getToken?: () => string | null;
};

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${String(res.status)} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  const text = await res.text().catch(() => "");
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function createHttpClient(options: HttpClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const getToken = options.getToken ?? (() => null);

  const withAuth = (init: RequestInit = {}): RequestInit => {
    const token = getToken();
    if (!token) return init;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return { ...init, headers };
  };

  const withJson = (init: RequestInit = {}): RequestInit => {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    return { ...init, headers };
  };

  return {
    auth: {
      login(input) {
        const name = "username" in input ? input.username : input.mobile;
        return Promise.resolve({
          token: `http-dev-token-${String(Date.now())}`,
          user: { id: "u_http", name, role: "admin" }
        });
      },
      logout() {
        return Promise.resolve();
      }
    },
    dashboard: {
      async getSummary() {
        return fetchJson(`${baseUrl}/api/dashboard/summary`, withAuth());
      },
      async getWeeklyTrend() {
        return fetchJson(`${baseUrl}/api/dashboard/weekly-trend`, withAuth());
      }
    },
    stations: {
      async list() {
        return fetchJson(`${baseUrl}/api/monitoring-stations`, withAuth());
      }
    },
    devices: {
      async list(input) {
        const qs = input?.stationId ? `?station_id=${encodeURIComponent(input.stationId)}` : "";
        return fetchJson(`${baseUrl}/api/devices${qs}`, withAuth());
      }
    },
    gps: {
      async getSeries(input) {
        const days = input.days ?? 7;
        return fetchJson(
          `${baseUrl}/api/gps-deformation/${encodeURIComponent(input.deviceId)}?days=${encodeURIComponent(String(days))}`,
          withAuth()
        );
      }
    },
    baselines: {
      async list() {
        return fetchJson(`${baseUrl}/api/baselines`, withAuth());
      },
      async upsert(input) {
        return fetchJson(
          `${baseUrl}/api/baselines/${encodeURIComponent(input.deviceId)}`,
          withAuth(withJson({ method: "PUT", body: JSON.stringify(input) }))
        );
      },
      async remove(input) {
        await fetchJson(
          `${baseUrl}/api/baselines/${encodeURIComponent(input.deviceId)}`,
          withAuth({ method: "DELETE" })
        );
      },
      async autoEstablish(input) {
        return fetchJson(
          `${baseUrl}/api/baselines/${encodeURIComponent(input.deviceId)}/auto-establish`,
          withAuth(withJson({ method: "POST", body: JSON.stringify({}) }))
        );
      }
    },
    system: {
      async getStatus() {
        return fetchJson(`${baseUrl}/api/system/status`, withAuth());
      }
    }
  };
}
