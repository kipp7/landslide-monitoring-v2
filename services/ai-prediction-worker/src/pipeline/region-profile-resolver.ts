import type { Pool } from "pg";
import type { RegionContext } from "./types";

type DeviceRegionRow = {
  device_id: string;
  station_id: string | null;
  device_metadata: unknown;
  station_code: string | null;
  station_metadata: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) return value;
  }
  return null;
}

function normalizeCanonicalCode(value: string | null): string | null {
  return value ? value.trim().toUpperCase() : null;
}

function deriveSlopeCodeFromStationCode(stationCode: string | null): string | null {
  const normalized = normalizeCanonicalCode(stationCode);
  const match = normalized?.match(/^ST-(LS-[A-Z0-9]+(?:-[A-Z0-9]+){3,}-\d{3})-\d{2}$/);
  return match?.[1] ?? null;
}

function deriveStationCodeFromNodeCode(nodeCode: string | null): string | null {
  const normalized = normalizeCanonicalCode(nodeCode);
  const match = normalized?.match(/^ND-(ST-LS-[A-Z0-9]+(?:-[A-Z0-9]+){3,}-\d{3}-\d{2})-[A-Z0-9-]+$/);
  return match?.[1] ?? null;
}

function deriveRegionCodeFromSlopeCode(slopeCode: string | null): string | null {
  const normalized = normalizeCanonicalCode(slopeCode);
  const match = normalized?.match(/^LS-([A-Z0-9]+(?:-[A-Z0-9]+){3,})-\d{3}$/);
  return match?.[1] ?? null;
}

function deriveRegionCodeFromGatewayCode(gatewayCode: string | null): string | null {
  const normalized = normalizeCanonicalCode(gatewayCode);
  const match = normalized?.match(/^GW-([A-Z0-9]+(?:-[A-Z0-9]+){3,})-\d{2}$/);
  return match?.[1] ?? null;
}

function readIdentityClass(
  deviceMetadata: Record<string, unknown>,
  stationMetadata: Record<string, unknown>
): string | null {
  return (
    readFirstString(deviceMetadata, ["identityClass", "identity_class"]) ??
    readFirstString(stationMetadata, ["identityClass", "identity_class"])
  );
}

export async function resolveRegionContext(pg: Pool, deviceId: string): Promise<RegionContext> {
  const res = await pg.query<DeviceRegionRow>(
    `
      SELECT
        d.device_id,
        d.station_id,
        d.metadata AS device_metadata,
        s.station_code,
        s.metadata AS station_metadata
      FROM devices d
      LEFT JOIN stations s ON s.station_id = d.station_id
      WHERE d.device_id = $1
    `,
    [deviceId]
  );

  const row = res.rows[0];
  const deviceMetadata = asRecord(row?.device_metadata);
  const stationMetadata = asRecord(row?.station_metadata);
  const nodeCode = normalizeCanonicalCode(
    readFirstString(deviceMetadata, ["nodeCode", "node_code"])
  );
  const stationCode =
    normalizeCanonicalCode(row?.station_code ?? null) ??
    normalizeCanonicalCode(readFirstString(deviceMetadata, ["stationCode", "station_code"])) ??
    normalizeCanonicalCode(readFirstString(stationMetadata, ["stationCode", "station_code"])) ??
    deriveStationCodeFromNodeCode(nodeCode);
  const slopeCode =
    normalizeCanonicalCode(readFirstString(deviceMetadata, ["slopeCode", "slope_code"])) ??
    normalizeCanonicalCode(readFirstString(stationMetadata, ["slopeCode", "slope_code"])) ??
    deriveSlopeCodeFromStationCode(stationCode);
  const gatewayCode =
    normalizeCanonicalCode(readFirstString(deviceMetadata, ["gatewayCode", "gateway_code"])) ??
    normalizeCanonicalCode(readFirstString(stationMetadata, ["gatewayCode", "gateway_code"]));
  const regionCode =
    normalizeCanonicalCode(readFirstString(deviceMetadata, ["regionCode", "region_code"])) ??
    normalizeCanonicalCode(readFirstString(stationMetadata, ["regionCode", "region_code"])) ??
    deriveRegionCodeFromSlopeCode(slopeCode) ??
    deriveRegionCodeFromGatewayCode(gatewayCode);
  const installLabel =
    normalizeCanonicalCode(readFirstString(deviceMetadata, ["installLabel", "install_label"])) ??
    normalizeCanonicalCode(readFirstString(stationMetadata, ["installLabel", "install_label"]));

  return {
    deviceId,
    stationId: row?.station_id ?? null,
    stationCode,
    slopeCode,
    regionCode,
    nodeCode,
    gatewayCode,
    installLabel,
    identityClass: readIdentityClass(deviceMetadata, stationMetadata),
    metadata: deviceMetadata,
    stationMetadata
  };
}
