import type { ApiClient } from "./client";

type HttpClientOptions = {
  baseUrl: string;
  getToken?: () => string | null;
  timeoutMs?: number;
};

type SuccessResponse<T> = {
  success: boolean;
  code?: number;
  message?: string;
  data?: T;
  timestamp?: string;
  traceId?: string;
  error?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function tryUnwrapSuccessResponse<T>(raw: unknown): { ok: true; data: T } | { ok: false } {
  if (!isRecord(raw) || typeof raw.success !== "boolean") return { ok: false };

  const wrapped = raw as SuccessResponse<T>;
  if (!wrapped.success) {
    const code = wrapped.code;
    const message = wrapped.message ?? "请求失败";
    const traceId = wrapped.traceId;
    throw new Error(`${code ? `HTTP ${String(code)} ` : ""}${message}${traceId ? ` (traceId=${traceId})` : ""}`);
  }

  return { ok: true, data: (wrapped.data ?? (undefined as T)) as T };
}

function isAbortError(err: unknown): boolean {
  return isRecord(err) && typeof err.name === "string" && err.name === "AbortError";
}

async function readJsonBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function fetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  let didTimeout = false;
  const timeout = Math.max(1, timeoutMs);

  const onExternalAbort = () => {
    if (!controller.signal.aborted) controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    didTimeout = true;
    if (!controller.signal.aborted) controller.abort();
  }, timeout);

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    const body = await readJsonBody(res);

    if (!res.ok) {
      if (typeof body === "string") {
        throw new Error(`HTTP ${String(res.status)} ${res.statusText}${body ? `: ${body}` : ""}`);
      }

      const unwrap = tryUnwrapSuccessResponse<unknown>(body);
      if (unwrap.ok) {
        throw new Error(`HTTP ${String(res.status)} ${res.statusText}`);
      }

      if (isRecord(body)) {
        const msg = typeof body.message === "string" ? body.message : "";
        const traceId = typeof body.traceId === "string" ? body.traceId : "";
        throw new Error(`HTTP ${String(res.status)} ${res.statusText}${msg ? `: ${msg}` : ""}${traceId ? ` (traceId=${traceId})` : ""}`);
      }

      throw new Error(`HTTP ${String(res.status)} ${res.statusText}`);
    }

    const unwrap = tryUnwrapSuccessResponse<T>(body);
    if (unwrap.ok) return unwrap.data;
    return (body ?? (undefined as T)) as T;
  } catch (err) {
    if (didTimeout && isAbortError(err)) {
      throw new Error(`请求超时（${String(timeout)}ms）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal && !externalSignal.aborted) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

export function createHttpClient(options: HttpClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const getToken = options.getToken ?? (() => null);
  const timeoutMs = Math.max(1, options.timeoutMs ?? 12_000);

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
        return fetchJson(`${baseUrl}/api/dashboard/summary`, withAuth(), timeoutMs);
      },
      async getWeeklyTrend() {
        return fetchJson(`${baseUrl}/api/dashboard/weekly-trend`, withAuth(), timeoutMs);
      }
    },
    stations: {
      async list() {
        return fetchJson(`${baseUrl}/api/monitoring-stations`, withAuth(), timeoutMs);
      }
    },
    devices: {
      async list(input) {
        const qs = input?.stationId ? `?station_id=${encodeURIComponent(input.stationId)}` : "";
        return fetchJson(`${baseUrl}/api/devices${qs}`, withAuth(), timeoutMs);
      }
    },
    gps: {
      async getSeries(input) {
        const days = input.days ?? 7;
        return fetchJson(
          `${baseUrl}/api/gps-deformation/${encodeURIComponent(input.deviceId)}?days=${encodeURIComponent(String(days))}`,
          withAuth(),
          timeoutMs
        );
      }
    },
    baselines: {
      async list() {
        return fetchJson(`${baseUrl}/api/baselines`, withAuth(), timeoutMs);
      },
      async upsert(input) {
        return fetchJson(
          `${baseUrl}/api/baselines/${encodeURIComponent(input.deviceId)}`,
          withAuth(withJson({ method: "PUT", body: JSON.stringify(input) })),
          timeoutMs
        );
      },
      async remove(input) {
        await fetchJson(
          `${baseUrl}/api/baselines/${encodeURIComponent(input.deviceId)}`,
          withAuth({ method: "DELETE" }),
          timeoutMs
        );
      },
      async autoEstablish(input) {
        return fetchJson(
          `${baseUrl}/api/baselines/${encodeURIComponent(input.deviceId)}/auto-establish`,
          withAuth(withJson({ method: "POST", body: JSON.stringify({}) })),
          timeoutMs
        );
      }
    },
    system: {
      async getStatus() {
        return fetchJson(`${baseUrl}/api/system/status`, withAuth(), timeoutMs);
      }
    }
  };
}
