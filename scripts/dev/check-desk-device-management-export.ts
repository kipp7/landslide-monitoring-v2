import { createHttpClient } from "../../apps/desk/src/api/httpClient";
import { buildBaselinesExport, buildDeviceDetailText, buildDevicesExport, buildSensorExport, type DeviceManagementSensorRow } from "../../apps/desk/src/views/deviceManagementExport";

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

  const [devices, baselines, stations] = await Promise.all([client.devices.list(), client.baselines.list(), client.stations.list()]);
  const selectedDevice = devices.find((device) => device.status === "online") ?? devices[0];
  if (!selectedDevice) {
    throw new Error("no device available for export proof");
  }
  const selectedStation = stations.find((station) => station.id === selectedDevice.stationId) ?? null;

  const endTime = new Date().toISOString();
  const start = new Date();
  start.setHours(start.getHours() - 24);
  const startTime = start.toISOString();
  const [temperature, humidity] = await Promise.all([
    client.telemetry.getSeries({ deviceId: selectedDevice.id, sensorKey: "temperature_c", startTime, endTime, interval: "1h" }),
    client.telemetry.getSeries({ deviceId: selectedDevice.id, sensorKey: "humidity_pct", startTime, endTime, interval: "1h" })
  ]);

  const sensorRows: DeviceManagementSensorRow[] = temperature.map((point, index) => ({
    id: point.ts,
    time: point.ts,
    temperature: Number(point.value.toFixed(1)),
    humidity: Number((humidity[index]?.value ?? 0).toFixed(0)),
    dispMm: 0,
    rainMm: 0
  }));

  const devicesExport = buildDevicesExport(devices);
  const baselinesExport = buildBaselinesExport(baselines);
  const sensorExport = buildSensorExport(sensorRows);
  const detailText = buildDeviceDetailText({
    device: selectedDevice,
    station: selectedStation,
    metrics: {
      health: 0,
      battery: 0,
      signal: 0,
      todayCount: sensorRows.length,
      baselineEstablished: baselines.some((baseline) => baseline.deviceId === selectedDevice.id)
    }
  });

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    export: {
      devicesFilename: devicesExport.filename,
      devicesLines: devicesExport.content.split(/\r?\n/).length,
      baselinesFilename: baselinesExport.filename,
      baselinesLines: baselinesExport.content.split(/\r?\n/).length,
      sensorFilename: sensorExport.filename,
      sensorLines: sensorExport.content.split(/\r?\n/).length,
      detailLines: detailText.split(/\r?\n/).length,
      detailContainsDeviceName: detailText.includes(`设备名称: ${selectedDevice.name}`),
      detailContainsStationArea: detailText.includes(`站点区域: ${selectedStation?.area ?? "-"}`),
      detailContainsBaselineState: detailText.includes("基线状态:")
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
