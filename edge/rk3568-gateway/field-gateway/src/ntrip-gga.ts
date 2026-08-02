export type NtripGgaMetrics = Record<string, number | string | boolean | null>;

function coordinate(value: number, latitude: boolean): { body: string; hemisphere: string } {
  const limit = latitude ? 90 : 180;
  if (!Number.isFinite(value) || value < -limit || value > limit) {
    throw new Error("NTRIP GGA coordinate is out of range");
  }
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  const degreeDigits = latitude ? 2 : 3;
  return {
    body: `${String(degrees).padStart(degreeDigits, "0")}${minutes.toFixed(7).padStart(10, "0")}`,
    hemisphere: latitude ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W"
  };
}

function finiteMetric(metrics: NtripGgaMetrics, key: string): number | null {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function checksum(sentenceBody: string): string {
  let value = 0;
  for (const byte of Buffer.from(sentenceBody, "ascii")) value ^= byte;
  return value.toString(16).toUpperCase().padStart(2, "0");
}

export function buildNtripGga(metrics: NtripGgaMetrics, now: Date): string | null {
  const latitude = finiteMetric(metrics, "rtk_latitude_deg") ?? finiteMetric(metrics, "gps_latitude");
  const longitude = finiteMetric(metrics, "rtk_longitude_deg") ?? finiteMetric(metrics, "gps_longitude");
  if (latitude === null || longitude === null || Number.isNaN(now.getTime())) return null;

  const lat = coordinate(latitude, true);
  const lon = coordinate(longitude, false);
  const qualityRaw = finiteMetric(metrics, "rtk_gga_quality") ?? 1;
  const quality = Number.isInteger(qualityRaw) && qualityRaw >= 0 && qualityRaw <= 9 ? qualityRaw : 1;
  const satellitesRaw = finiteMetric(metrics, "rtk_satellites_used") ?? 0;
  const satellites = Math.max(0, Math.min(99, Math.round(satellitesRaw)));
  const hdop = finiteMetric(metrics, "rtk_hdop") ?? 1;
  const altitude = finiteMetric(metrics, "rtk_altitude_msl_m") ?? 0;
  const geoid = finiteMetric(metrics, "rtk_geoid_separation_m") ?? 0;
  const utc = `${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}.00`;
  const body = [
    "GNGGA",
    utc,
    lat.body,
    lat.hemisphere,
    lon.body,
    lon.hemisphere,
    String(quality),
    String(satellites).padStart(2, "0"),
    hdop.toFixed(2),
    altitude.toFixed(3),
    "M",
    geoid.toFixed(3),
    "M",
    "",
    ""
  ].join(",");
  return `$${body}*${checksum(body)}\r\n`;
}
