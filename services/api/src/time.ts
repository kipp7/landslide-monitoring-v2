const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export function beijingStartOfDayUtc(d: Date): Date {
  const local = new Date(d.getTime() + BEIJING_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - BEIJING_OFFSET_MS);
}
