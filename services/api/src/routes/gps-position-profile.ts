export const PROFESSIONAL_RTK_POSITION_KEYS = {
  latitude: "rtk_latitude_deg",
  longitude: "rtk_longitude_deg",
  altitude: "rtk_altitude_msl_m",
  trusted: "rtk_trusted"
} as const;

export function isProfessionalRtkPosition(input: {
  latKey: string;
  lonKey: string;
}): boolean {
  return input.latKey === PROFESSIONAL_RTK_POSITION_KEYS.latitude &&
    input.lonKey === PROFESSIONAL_RTK_POSITION_KEYS.longitude;
}
