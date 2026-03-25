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

  const [stations, devices, baselines] = await Promise.all([
    client.stations.list(),
    client.devices.list(),
    client.baselines.list()
  ]);

  if (stations.length === 0 || devices.length === 0) {
    throw new Error("device management page load returned empty data");
  }

  const selectedRegion = "all";
  const filteredDevices = devices;
  if (filteredDevices.length === 0) {
    throw new Error("device management region filter returned empty devices");
  }

  const selectedDevice = filteredDevices.find((device) => device.status === "online") ?? filteredDevices.find((device) => device.status === "warning") ?? filteredDevices[0]!;
  const selectedBaseline = baselines.find((baseline) => baseline.deviceId === selectedDevice.id) ?? null;

  const endTime = new Date().toISOString();
  const start = new Date();
  start.setHours(start.getHours() - 24);
  const startTime = start.toISOString();
  const [temperature, humidity] = await Promise.all([
    client.telemetry.getSeries({ deviceId: selectedDevice.id, sensorKey: "temperature_c", startTime, endTime, interval: "1h" }),
    client.telemetry.getSeries({ deviceId: selectedDevice.id, sensorKey: "humidity_pct", startTime, endTime, interval: "1h" })
  ]);
  const expert = await client.devices.getHealthExpert({ deviceId: selectedDevice.id, metric: "all" });

  const issued = await client.devices.issueCommand({
    deviceId: selectedDevice.id,
    commandType: "device_management_page_proof",
    payload: { source: "desk-device-management-page" }
  });
  const commands = await client.devices.listCommands({ deviceId: selectedDevice.id });
  const found = commands.some((item) => item.commandId === issued.commandId);
  if (!found) {
    throw new Error("device management page issued command not found");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    deviceManagementPage: {
      stations: stations.length,
      devices: devices.length,
      baselines: baselines.length,
      selectedRegion,
      filteredDevices: filteredDevices.length,
      selectedDeviceId: selectedDevice.id,
      baselineEstablished: Boolean(selectedBaseline),
      expert: {
        healthScore: expert.result.health?.score ?? null,
        batterySoc: expert.result.battery?.soc ?? null,
        signalStrength: expert.result.signal?.strength ?? null
      },
      telemetryPoints: {
        temperature: temperature.length,
        humidity: humidity.length
      },
      issuedCommandId: issued.commandId,
      commandsLoaded: commands.length,
      foundIssuedCommand: found
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
