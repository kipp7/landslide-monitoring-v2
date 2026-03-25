import { createHttpClient } from "../../apps/desk/src/api/httpClient";

type SessionState = {
  token: string | null;
  refreshToken: string | null;
};

const DATA_LIMIT_KEY = "gps.data_limit";

async function main(): Promise<void> {
  const state: SessionState = { token: null, refreshToken: null };

  const client = createHttpClient({
    baseUrl: "http://127.0.0.1:8081",
    getToken: () => state.token,
    getRefreshToken: () => state.refreshToken,
    onAuthTokens: ({ token, refreshToken }) => {
      state.token = token;
      if (refreshToken !== undefined) state.refreshToken = refreshToken;
    },
    onAuthFailure: () => {
      state.token = null;
      state.refreshToken = null;
    }
  });

  const login = await client.auth.login({ username: "admin", password: "123456" });
  state.token = login.token;
  state.refreshToken = login.refreshToken ?? null;

  const before = await client.system.getConfigs();
  const original = before.find((item) => item.key === DATA_LIMIT_KEY)?.value ?? "200";
  const proofValue = "320";

  try {
    await client.system.updateConfigs({
      configs: [{ key: DATA_LIMIT_KEY, value: proofValue }]
    });
    const after = await client.system.getConfigs();
    const current = after.find((item) => item.key === DATA_LIMIT_KEY)?.value ?? "";
    if (current !== proofValue) {
      throw new Error("gps data limit not persisted");
    }

    const report = {
      auth: {
        user: login.user.name,
        role: login.user.role
      },
      gpsDataLimitConfig: {
        limit: current,
        restoredOriginal: true
      }
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.system.updateConfigs({
      configs: [{ key: DATA_LIMIT_KEY, value: original }]
    });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
