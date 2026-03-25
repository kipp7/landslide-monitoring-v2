import { createHttpClient } from "../../apps/desk/src/api/httpClient";

type SessionState = {
  token: string | null;
  refreshToken: string | null;
};

async function expectFailure(label: string, action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`${label} should have failed`);
}

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

  const summaryBeforeLogout = await client.dashboard.getSummary();
  await client.auth.logout();
  state.token = null;
  state.refreshToken = null;
  const afterLogoutError = await expectFailure("dashboard after logout", () => client.dashboard.getSummary());

  const relogin = await client.auth.login({ username: "admin", password: "123456" });
  state.token = relogin.token;
  state.refreshToken = relogin.refreshToken ?? null;
  const summaryAfterRelogin = await client.dashboard.getSummary();

  const report = {
    auth: {
      firstUser: login.user.name,
      firstRole: login.user.role,
      hadRefreshToken: Boolean(login.refreshToken),
      logoutRejectedProtectedAccess: afterLogoutError,
      reloginUser: relogin.user.name
    },
    summary: {
      beforeLogout: summaryBeforeLogout,
      afterRelogin: summaryAfterRelogin
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
