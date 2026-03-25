import type { Baseline, Device, Station } from "../api/client";

export type DeviceManagementSensorRow = {
  id: string;
  time: string;
  temperature: number;
  humidity: number;
  dispMm: number;
  rainMm: number;
};

export type PreparedExport = {
  filename: string;
  mimeType: string;
  content: string;
};

export type DeviceDetailCopyInput = {
  device: Device;
  station: Station | null;
  metrics: {
    health: number;
    battery: number;
    signal: number;
    todayCount: number;
    baselineEstablished: boolean;
  };
};

function toCsv(lines: Array<Array<string | number>>): string {
  return lines
    .map((line) =>
      line
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\r\n");
}

export function buildDevicesExport(devices: Device[]): PreparedExport {
  const rows = [
    ["deviceId", "name", "stationId", "stationName", "type", "status", "lastSeenAt"],
    ...devices.map((device) => [
      device.id,
      device.name,
      device.stationId,
      device.stationName,
      device.type,
      device.status,
      device.lastSeenAt
    ])
  ];
  return {
    filename: "desk-devices.csv",
    mimeType: "text/csv;charset=utf-8",
    content: "\uFEFF" + toCsv(rows)
  };
}

export function buildBaselinesExport(baselines: Baseline[]): PreparedExport {
  const rows = [
    ["deviceId", "deviceName", "baselineLat", "baselineLng", "baselineAlt", "establishedBy", "establishedTime", "status", "notes"],
    ...baselines.map((baseline) => [
      baseline.deviceId,
      baseline.deviceName,
      baseline.baselineLat,
      baseline.baselineLng,
      baseline.baselineAlt ?? "",
      baseline.establishedBy,
      baseline.establishedTime,
      baseline.status,
      baseline.notes ?? ""
    ])
  ];
  return {
    filename: "desk-baselines.csv",
    mimeType: "text/csv;charset=utf-8",
    content: "\uFEFF" + toCsv(rows)
  };
}

export function buildSensorExport(rows: DeviceManagementSensorRow[]): PreparedExport {
  const csvRows = [
    ["time", "temperature", "humidity", "dispMm", "rainMm"],
    ...rows.map((row) => [row.time, row.temperature, row.humidity, row.dispMm, row.rainMm])
  ];
  return {
    filename: "desk-device-sensor.csv",
    mimeType: "text/csv;charset=utf-8",
    content: "\uFEFF" + toCsv(csvRows)
  };
}

export function buildDeviceDetailText(input: DeviceDetailCopyInput): string {
  const { device, station, metrics } = input;
  return [
    `设备名称: ${device.name}`,
    `设备ID: ${device.id}`,
    `设备类型: ${device.type}`,
    `设备状态: ${device.status}`,
    `所属站点: ${device.stationName}`,
    `站点区域: ${station?.area ?? "-"}`,
    `站点风险: ${station?.risk ?? "-"}`,
    `最后上报: ${new Date(device.lastSeenAt).toLocaleString("zh-CN")}`,
    `健康度: ${metrics.health}%`,
    `电池电量: ${metrics.battery}%`,
    `信号强度: ${metrics.signal}%`,
    `今日数据: ${metrics.todayCount} 条`,
    `基线状态: ${metrics.baselineEstablished ? "已建立" : "待建立"}`
  ].join("\r\n");
}

export async function copyTextContent(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) {
    throw new Error("当前运行环境不支持复制到剪贴板");
  }
}

export function triggerPreparedExport(file: PreparedExport): void {
  const blob = new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
