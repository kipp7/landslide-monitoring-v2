export const GPS_PROFILE_DEVICE_NAMES = ["device_1", "device_2", "device_3"] as const;

export type GpsProfileName = "creep_rise" | "event_acceleration" | "cyclic_oscillation";

export const GPS_PROFILE_BY_DEVICE_NAME: Record<(typeof GPS_PROFILE_DEVICE_NAMES)[number], GpsProfileName> = {
  device_1: "creep_rise",
  device_2: "event_acceleration",
  device_3: "cyclic_oscillation"
};

const GPS_PROFILE_FALLBACK_TARGETS = [
  {
    deviceId: "30000000-0000-0000-0000-000000000001",
    deviceName: "device_1",
    id: "30000000-0000-0000-0000-000000000001",
    name: "device_1"
  },
  {
    deviceId: "30000000-0000-0000-0000-000000000002",
    deviceName: "device_2",
    id: "30000000-0000-0000-0000-000000000002",
    name: "device_2"
  },
  {
    deviceId: "30000000-0000-0000-0000-000000000003",
    deviceName: "device_3",
    id: "30000000-0000-0000-0000-000000000003",
    name: "device_3"
  }
] as const;

type GpsProfileTarget = {
  deviceId: string;
  deviceName: string;
  id?: string;
  name?: string;
};

function normalizeDeviceName(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function selectGpsProfileTargets<T extends GpsProfileTarget>(items: T[], label: string): T[] {
  const byName = new Map<string, T[]>();
  for (const item of items) {
    const normalizedName = normalizeDeviceName(item.deviceName);
    if (!normalizedName) continue;
    const bucket = byName.get(normalizedName) ?? [];
    bucket.push(item);
    byName.set(normalizedName, bucket);
  }

  const selected: T[] = [];
  const missing: string[] = [];
  const duplicates: string[] = [];

  for (const deviceName of GPS_PROFILE_DEVICE_NAMES) {
    const matches = byName.get(normalizeDeviceName(deviceName)) ?? [];
    if (matches.length === 0) {
      missing.push(deviceName);
      continue;
    }
    if (matches.length > 1) {
      duplicates.push(deviceName);
      continue;
    }
    selected.push(matches[0]);
  }

  if (duplicates.length > 0) {
    throw new Error(`${label} found duplicate seed profile devices: ${duplicates.join(", ")}`);
  }

  if (selected.length === 0) {
    return GPS_PROFILE_FALLBACK_TARGETS.map((item) => ({ ...item } as T));
  }

  if (missing.length > 0) {
    throw new Error(`${label} missing required seed profile devices: ${missing.join(", ")}`);
  }

  return selected;
}
