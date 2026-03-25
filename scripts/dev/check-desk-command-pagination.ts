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

  const devices = await client.devices.list();
  const target = devices.find((device) => device.status !== "offline") ?? devices[0];
  if (!target) {
    throw new Error("no device available for command pagination proof");
  }

  for (let i = 1; i <= 55; i += 1) {
    await client.devices.issueCommand({
      deviceId: target.id,
      commandType: "desk_pagination_proof",
      payload: {
        source: "desk-command-pagination-proof",
        seq: i
      }
    });
  }

  const commands = await client.devices.listCommands({ deviceId: target.id });
  const proofCommands = commands.filter(
    (item) => item.commandType === "desk_pagination_proof" && item.payload?.source === "desk-command-pagination-proof"
  );

  if (proofCommands.length < 55) {
    throw new Error(`expected at least 55 proof commands, got ${proofCommands.length}`);
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    commandPagination: {
      deviceId: target.id,
      issued: 55,
      loaded: proofCommands.length
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
