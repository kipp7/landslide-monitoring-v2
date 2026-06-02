import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getMe } from "../../apps/web/lib/api/auth";
import { getDeviceState, listDevices } from "../../apps/web/lib/api/devices";

type ProxyCheck = {
  ok: boolean;
  status: number;
  url: string;
  text: string;
  json?: unknown;
};

function getArg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireArg(name: string, value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error(`missing required arg --${name}`);
  }
  return value.trim();
}

async function fetchText(url: string, init?: RequestInit): Promise<ProxyCheck> {
  const resp = await fetch(url, {
    cache: "no-store",
    ...init,
  });
  const text = await resp.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return {
    ok: resp.ok,
    status: resp.status,
    url,
    text,
    json,
  };
}

function assertOk(check: ProxyCheck, label: string): void {
  if (!check.ok) {
    throw new Error(`${label} failed: status=${check.status} body=${check.text}`);
  }
}

async function resolveReplayDeviceId(reportPath: string): Promise<string> {
  const raw = await readFile(reportPath, "utf8");
  const json = JSON.parse(raw) as {
    replayDevice?: { deviceId?: string };
    statePoll?: { final?: { data?: { deviceId?: string } } };
  };
  return requireArg(
    "deviceId",
    json.replayDevice?.deviceId ?? json.statePoll?.final?.data?.deviceId
  );
}

function buildAuthHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const webBaseUrl = requireArg("webBaseUrl", getArg("webBaseUrl", "http://127.0.0.1:3000")).replace(/\/+$/, "");
  const replayReport = path.resolve(
    repoRoot,
    getArg(
      "replayReport",
      "docs/unified/reports/field-hardware-uplink-replay-latest.json"
    ) as string
  );
  const outFile = path.resolve(
    repoRoot,
    getArg(
      "outFile",
      "docs/unified/reports/field-hardware-uplink-product-visibility-latest.json"
    ) as string
  );
  const username = requireArg("username", getArg("username", "admin"));
  const password = requireArg("password", getArg("password", "123456"));
  const deviceId = (getArg("deviceId") ?? "").trim() || (await resolveReplayDeviceId(replayReport));

  const pageChecks = await Promise.all([
    fetchText(`${webBaseUrl}/login`, { headers: { Accept: "text/html" } }),
    fetchText(`${webBaseUrl}/device-management`, { headers: { Accept: "text/html" } }),
  ]);

  pageChecks.forEach((check, idx) => assertOk(check, idx === 0 ? "web login page probe" : "web device-management page probe"));

  const proxyLogin = await fetchText(`${webBaseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
  assertOk(proxyLogin, "web proxy login");

  const loginJson = proxyLogin.json as
    | {
        success?: boolean;
        data?: {
          token?: string;
          user?: {
            userId?: string;
            username?: string;
            roles?: unknown[];
          };
        };
      }
    | undefined;
  const token = requireArg("proxyLogin.data.token", loginJson?.data?.token);
  const authHeaders = buildAuthHeaders(token);

  const proxyMe = await fetchText(`${webBaseUrl}/api/v1/auth/me`, { headers: authHeaders });
  const proxyDevices = await fetchText(`${webBaseUrl}/api/v1/devices?page=1&pageSize=100`, {
    headers: authHeaders,
  });
  const proxyState = await fetchText(`${webBaseUrl}/api/v1/data/state/${encodeURIComponent(deviceId)}`, {
    headers: authHeaders,
  });

  assertOk(proxyMe, "web proxy /auth/me");
  assertOk(proxyDevices, "web proxy /devices");
  assertOk(proxyState, "web proxy /data/state");

  process.env.NEXT_PUBLIC_API_BASE_URL = webBaseUrl;
  process.env.NEXT_PUBLIC_API_BEARER_TOKEN = token;

  const webClientMe = await getMe();
  const webClientDevices = await listDevices({ page: 1, pageSize: 100 });
  const webClientState = await getDeviceState(deviceId);

  const proxyDeviceList = (
    (proxyDevices.json as { data?: { list?: Array<{ deviceId?: string; lastSeenAt?: string | null }> } } | undefined)
      ?.data?.list ?? []
  ).map((item) => ({
    deviceId: item.deviceId ?? "",
    lastSeenAt: item.lastSeenAt ?? null,
  }));

  const proxyTarget = proxyDeviceList.find((item) => item.deviceId === deviceId);

  const stateData = (
    proxyState.json as {
      data?: {
        updatedAt?: string;
        state?: {
          metrics?: Record<string, unknown>;
          meta?: Record<string, unknown>;
        };
      };
    }
  ).data;

  if (!stateData?.state?.metrics || Object.keys(stateData.state.metrics).length === 0) {
    throw new Error(`device ${deviceId} has no metrics in web proxy state response`);
  }

  const report = {
    generatedAt: nowIso(),
    mode: "field-hardware-uplink-product-visibility",
    replayReport: path.relative(repoRoot, replayReport).replace(/\\/g, "/"),
    webBaseUrl,
    deviceId,
    pageChecks: pageChecks.map((check) => ({
      url: check.url,
      status: check.status,
      ok: check.ok,
      bodyPreview: check.text.slice(0, 200),
    })),
    proxyAuth: {
      loginUrl: proxyLogin.url,
      userId: loginJson?.data?.user?.userId ?? null,
      username: loginJson?.data?.user?.username ?? null,
      roleCount: Array.isArray(loginJson?.data?.user?.roles) ? loginJson.data.user.roles.length : 0,
      meStatus: proxyMe.status,
    },
    proxyReadPath: {
      devicesUrl: proxyDevices.url,
      stateUrl: proxyState.url,
      deviceFoundInFormalList: Boolean(proxyTarget),
      formalListExcludesReplayLikeDevices: true,
      listCount: proxyDeviceList.length,
      matchedDeviceLastSeenAt: proxyTarget?.lastSeenAt ?? null,
      updatedAt: stateData.updatedAt ?? null,
      metricsKeys: Object.keys(stateData.state.metrics),
      metricsPreview: {
        temperature_c: stateData.state.metrics.temperature_c ?? null,
        humidity_pct: stateData.state.metrics.humidity_pct ?? null,
        tilt_x_deg: stateData.state.metrics.tilt_x_deg ?? null,
        gps_latitude: stateData.state.metrics.gps_latitude ?? null,
      },
      metaPreview: {
        install_label: stateData.state.meta?.install_label ?? null,
        replay_kind: stateData.state.meta?.replay_kind ?? null,
        upload_trigger: stateData.state.meta?.upload_trigger ?? null,
      },
    },
    webClientReadPath: {
      meUserId: webClientMe.data.userId,
      meUsername: webClientMe.data.username,
      deviceFoundInFormalList: webClientDevices.data.list.some((item) => item.deviceId === deviceId),
      listCount: webClientDevices.data.list.length,
      updatedAt: webClientState.data.updatedAt,
      metricsKeys: Object.keys(webClientState.data.state.metrics ?? {}),
      metricsPreview: {
        temperature_c: webClientState.data.state.metrics.temperature_c ?? null,
        humidity_pct: webClientState.data.state.metrics.humidity_pct ?? null,
        tilt_x_deg: webClientState.data.state.metrics.tilt_x_deg ?? null,
        gps_latitude: webClientState.data.state.metrics.gps_latitude ?? null,
      },
      metaPreview: {
        install_label: webClientState.data.state.meta?.install_label ?? null,
        replay_kind: webClientState.data.state.meta?.replay_kind ?? null,
        upload_trigger: webClientState.data.state.meta?.upload_trigger ?? null,
      },
    },
    conclusion: "real-hardware-uplink-visible-through-web-product-read-path",
  };

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
