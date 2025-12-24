'use client'

export type LegacyShadowRow = {
  device_id?: string
  event_time?: string
  properties?: { risk_level?: number | null }
}

export default function useDeviceShadow(): { data: LegacyShadowRow | null; loading: boolean; error: string | null } {
  return { data: null, loading: false, error: null }
}

