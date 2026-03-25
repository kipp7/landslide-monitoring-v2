import { createHttpClient } from "../../apps/desk/src/api/httpClient";

type SessionState = {
  token: string | null;
  refreshToken: string | null;
};

const BLUE_KEY = "gps.displacement_threshold_blue_mm";
const YELLOW_KEY = "gps.displacement_threshold_yellow_mm";
const RED_KEY = "gps.displacement_threshold_red_mm";

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
  const readValue = (key: string, fallback: string) => before.find((item) => item.key === key)?.value ?? fallback;
  const original = {
    blue: readValue(BLUE_KEY, "2"),
    yellow: readValue(YELLOW_KEY, "5"),
    red: readValue(RED_KEY, "8")
  };

  const proof = { blue: "2.5", yellow: "5.5", red: "8.5" };

  try {
    await client.system.updateConfigs({
      configs: [
        { key: BLUE_KEY, value: proof.blue },
        { key: YELLOW_KEY, value: proof.yellow },
        { key: RED_KEY, value: proof.red }
      ]
    });

    const after = await client.system.getConfigs();
    const readAfter = (key: string) => after.find((item) => item.key === key)?.value ?? "";
    if (readAfter(BLUE_KEY) !== proof.blue) throw new Error("gps threshold blue not persisted");
    if (readAfter(YELLOW_KEY) !== proof.yellow) throw new Error("gps threshold yellow not persisted");
    if (readAfter(RED_KEY) !== proof.red) throw new Error("gps threshold red not persisted");

    const report = {
      auth: {
        user: login.user.name,
        role: login.user.role
      },
      gpsThresholdConfig: {
        blue: readAfter(BLUE_KEY),
        yellow: readAfter(YELLOW_KEY),
        red: readAfter(RED_KEY),
        restoredOriginal: true
      }
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.system.updateConfigs({
      configs: [
        { key: BLUE_KEY, value: original.blue },
        { key: YELLOW_KEY, value: original.yellow },
        { key: RED_KEY, value: original.red }
      ]
    });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
