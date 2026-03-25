import { createHttpClient } from "../../apps/desk/src/api/httpClient";

type SessionState = {
  token: string | null;
  refreshToken: string | null;
};

function stableJson(value: unknown): string {
  return JSON.stringify(value);
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

  const devices = await client.devices.list();
  const baselinesBefore = await client.baselines.list();
  const baselineByDeviceId = new Map(baselinesBefore.map((item) => [item.deviceId, item] as const));

  const gnssDevices = devices.filter((device) => device.type === "gnss");
  if (gnssDevices.length === 0) {
    throw new Error("no gnss devices available");
  }

  const missingBaselineDevice = gnssDevices.find((device) => !baselineByDeviceId.has(device.id));
  if (!missingBaselineDevice) {
    throw new Error("no missing-baseline gnss device available");
  }

  const created = await client.baselines.upsert({
    deviceId: missingBaselineDevice.id,
    baselineLat: 22.68925,
    baselineLng: 108.35795,
    baselineAlt: 12.6,
    establishedBy: "desk-baselines-actions",
    status: "active",
    notes: "desk-baselines-actions"
  });

  const baselinesAfterCreate = await client.baselines.list();
  const createdBaseline = baselinesAfterCreate.find((item) => item.deviceId === missingBaselineDevice.id) ?? null;
  if (!createdBaseline) {
    throw new Error("created baseline not found");
  }

  await client.baselines.remove({ deviceId: missingBaselineDevice.id });
  const baselinesAfterRemove = await client.baselines.list();
  if (baselinesAfterRemove.some((item) => item.deviceId === missingBaselineDevice.id)) {
    throw new Error("baseline remove did not restore missing state");
  }

  const existingBaseline = baselinesBefore[0];
  if (!existingBaseline) {
    throw new Error("no existing baseline available");
  }
  const existingBeforeJson = stableJson(existingBaseline);
  const autoEstablished = await client.baselines.autoEstablish({ deviceId: existingBaseline.deviceId, persist: false });
  const baselinesAfterAuto = await client.baselines.list();
  const existingAfter = baselinesAfterAuto.find((item) => item.deviceId === existingBaseline.deviceId);
  if (!existingAfter) {
    throw new Error("existing baseline missing after auto establish proof");
  }
  const existingAfterJson = stableJson(existingAfter);
  if (existingBeforeJson !== existingAfterJson) {
    throw new Error("non-mutating auto establish changed persisted baseline");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    baselinesPanel: {
      gnssDevices: gnssDevices.length,
      baselineCountBefore: baselinesBefore.length,
      missingBaselineDeviceId: missingBaselineDevice.id,
      create: {
        deviceId: created.deviceId,
        baselineCountAfterCreate: baselinesAfterCreate.length
      },
      remove: {
        baselineCountAfterRemove: baselinesAfterRemove.length,
        restoredMissingState: true
      },
      auto: {
        deviceId: autoEstablished.deviceId,
        proofStable: true
      }
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
