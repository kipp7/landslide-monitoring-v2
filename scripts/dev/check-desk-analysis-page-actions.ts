import { createHttpClient } from "../../apps/desk/src/api/httpClient";

type SessionState = {
  token: string | null;
  refreshToken: string | null;
};

async function getSeriesWithAliases(
  telemetry: ReturnType<typeof createHttpClient>["telemetry"],
  input: {
    deviceId: string;
    sensorKeys: string[];
    startTime: string;
    endTime: string;
    interval: "raw" | "1m" | "5m" | "1h" | "1d";
  }
) {
  for (const sensorKey of input.sensorKeys) {
    const points = await telemetry.getSeries({
      deviceId: input.deviceId,
      sensorKey,
      startTime: input.startTime,
      endTime: input.endTime,
      interval: input.interval
    });
    if (points.length > 0) {
      return { sensorKey, points };
    }
  }
  return { sensorKey: input.sensorKeys[0] ?? "", points: [] as Array<{ ts: string; value: number }> };
}

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

  const [stations, devices, trend] = await Promise.all([
    client.stations.list(),
    client.devices.list(),
    client.dashboard.getWeeklyTrend()
  ]);
  if (stations.length === 0 || devices.length === 0) {
    throw new Error("analysis page source data empty");
  }

  const stats = {
    stations: stations.length,
    devices: devices.length,
    online: devices.filter((device) => device.status === "online").length,
    warning: devices.filter((device) => device.status === "warning").length,
    offline: devices.filter((device) => device.status === "offline").length
  };

  const anomalies = devices
    .filter((device) => device.status !== "online")
    .map((device) => ({
      deviceId: device.id,
      deviceName: device.name,
      stationName: device.stationName,
      status: device.status
    }));

  if (anomalies.length === 0) {
    throw new Error("analysis page should have warning/offline anomalies in current demo");
  }

  const target = devices.find((device) => device.status === "online") ?? devices[0];
  if (!target) {
    throw new Error("analysis page telemetry target missing");
  }
  const endTime = new Date().toISOString();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  const startTime = start.toISOString();
  const [temperature, humidity, acceleration, gyroscope] = await Promise.all([
    client.telemetry.getSeries({ deviceId: target.id, sensorKey: "temperature_c", startTime, endTime, interval: "1h" }),
    client.telemetry.getSeries({ deviceId: target.id, sensorKey: "humidity_pct", startTime, endTime, interval: "1h" }),
    getSeriesWithAliases(client.telemetry, {
      deviceId: target.id,
      sensorKeys: ["accel_x_g", "acceleration_x"],
      startTime,
      endTime,
      interval: "1h"
    }),
    getSeriesWithAliases(client.telemetry, {
      deviceId: target.id,
      sensorKeys: ["gyro_x_dps", "gyroscope_x"],
      startTime,
      endTime,
      interval: "1h"
    })
  ]);
  if (!temperature.length || !humidity.length || !acceleration.points.length || !gyroscope.points.length) {
    throw new Error("analysis page telemetry series missing");
  }

  const report = {
    auth: {
      user: login.user.name,
      role: login.user.role
    },
    analysisPage: {
      ...stats,
      anomalies: anomalies.length,
      firstAnomaly: anomalies[0] ?? null,
      rainfallLabels: trend.labels.length,
      rainfallSum: trend.rainfallMm.reduce((sum, value) => sum + value, 0),
      temperaturePoints: temperature.length,
      humidityPoints: humidity.length,
      accelerationSensorKey: acceleration.sensorKey,
      accelerationPoints: acceleration.points.length,
      gyroscopeSensorKey: gyroscope.sensorKey,
      gyroscopePoints: gyroscope.points.length
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
