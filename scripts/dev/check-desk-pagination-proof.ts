import { createHttpClient } from "../../apps/desk/src/api/httpClient";

type SessionState = {
  token: string | null;
  refreshToken: string | null;
};

async function main(): Promise<void> {
  const state: SessionState = { token: null, refreshToken: null };

  const client = createHttpClient({
    baseUrl: "http://127.0.0.1:8081",
    getToken: () => state.token,
    getRefreshToken: () => state.refreshToken,
    onAuthTokens: ({ token, refreshToken }) => {
      state.token = token;
      if (refreshToken !== undefined) {
        state.refreshToken = refreshToken;
      }
    },
    onAuthFailure: () => {
      state.token = null;
      state.refreshToken = null;
    }
  });

  const login = await client.auth.login({ username: "admin", password: "123456" });
  state.token = login.token;
  state.refreshToken = login.refreshToken ?? null;

  const stations = await client.stations.list();
  const demo2 = stations.find((station) => station.name === "示例监测点B");
  if (!demo2) {
    throw new Error("DEMO002 station not found in desk client");
  }

  const devices = await client.devices.list();
  const demo2Devices = await client.devices.list({ stationId: demo2.id });
  const baselines = await client.baselines.list();

  if (devices.length <= 200) {
    throw new Error(`devices pagination proof failed: expected >200, got ${devices.length}`);
  }
  if (demo2Devices.length <= 200) {
    throw new Error(`station-scoped devices pagination proof failed: expected >200, got ${demo2Devices.length}`);
  }
  if (baselines.length <= 200) {
    throw new Error(`baselines pagination proof failed: expected >200, got ${baselines.length}`);
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    stations: {
      count: stations.length,
      demo2DeviceCount: demo2.deviceCount
    },
    devices: {
      total: devices.length,
      demo2Filtered: demo2Devices.length
    },
    baselines: {
      total: baselines.length
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
