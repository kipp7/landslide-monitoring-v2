'use client'

import { getDeviceState } from './devices'
import { listLegacyDeviceMappings, type LegacyDeviceMappingRow } from './legacyDeviceMappings'
import { toNumber } from '../v2Api'

export type DeviceSnapshotView = {
  device_id: string
  display_name: string
  location: string
  coordinates: { lat: number | null; lng: number | null }
  status: 'online' | 'offline'
  health_score: number
  temperature: number | null
  humidity: number | null
  battery_level: number
  signal_strength: number
  data_count_today: number
  last_data_time: string
  baseline_established?: boolean
}

type MappingCacheState = {
  rows: LegacyDeviceMappingRow[]
  fetchedAt: number
  inFlight: Promise<LegacyDeviceMappingRow[]> | null
}

const MAPPING_CACHE_TTL_MS = 5 * 60_000
const OFFLINE_THRESHOLD_MS = 10 * 60_000

const mappingCache: MappingCacheState = {
  rows: [],
  fetchedAt: 0,
  inFlight: null,
}

function readMetricNumber(metrics: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(metrics[key])
    if (value !== undefined) return value
  }
  return null
}

function readMetricBoolean(metrics: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = metrics[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'true' || normalized === '1') return true
      if (normalized === 'false' || normalized === '0') return false
    }
  }
  return undefined
}

async function getMappingRows(force = false): Promise<LegacyDeviceMappingRow[]> {
  const now = Date.now()
  if (!force && mappingCache.rows.length > 0 && now - mappingCache.fetchedAt < MAPPING_CACHE_TTL_MS) {
    return mappingCache.rows
  }

  if (mappingCache.inFlight) return mappingCache.inFlight

  mappingCache.inFlight = (async () => {
    const json = await listLegacyDeviceMappings()
    if (!json || typeof json !== "object" || !('success' in json) || json.success !== true) {
      const message = json && typeof json === 'object' && 'message' in json && typeof json.message === 'string'
        ? json.message
        : 'Failed to load legacy device mappings'
      throw new Error(message)
    }

    const rows = Array.isArray(json.data) ? json.data : []
    mappingCache.rows = rows
    mappingCache.fetchedAt = Date.now()
    return rows
  })()

  try {
    return await mappingCache.inFlight
  } finally {
    mappingCache.inFlight = null
  }
}

export async function resolveDeviceIdentity(deviceId: string): Promise<{
  requestedDeviceId: string
  actualDeviceId: string
  mapping?: LegacyDeviceMappingRow
}> {
  const rows = await getMappingRows()
  const normalized = deviceId.trim()
  const mapping = rows.find((row) => row.simple_id === normalized || row.actual_device_id === normalized)
  return {
    requestedDeviceId: normalized,
    actualDeviceId: mapping?.actual_device_id || normalized,
    mapping,
  }
}

function deriveDeviceHealth(input: {
  updatedAt: string
  batteryLevel: number
  warningFlag?: boolean
  hasCoordinates: boolean
}): { status: 'online' | 'offline'; healthScore: number } {
  const updatedAtMs = Date.parse(input.updatedAt)
  const staleMs = Number.isFinite(updatedAtMs) ? Math.max(0, Date.now() - updatedAtMs) : Number.POSITIVE_INFINITY
  const isOnline = staleMs <= OFFLINE_THRESHOLD_MS

  let healthScore = 100
  if (!isOnline) healthScore -= 45
  if (input.warningFlag) healthScore -= 30
  if (input.batteryLevel <= 15) healthScore -= 35
  else if (input.batteryLevel <= 30) healthScore -= 20
  else if (input.batteryLevel <= 50) healthScore -= 10
  if (!input.hasCoordinates) healthScore -= 5

  return {
    status: isOnline ? 'online' : 'offline',
    healthScore: Math.max(0, Math.min(100, Math.round(healthScore))),
  }
}

export function normalizeDeviceStateView(input: {
  actualDeviceId: string
  requestedDeviceId: string
  updatedAt: string
  metrics: Record<string, unknown>
  meta?: Record<string, unknown>
  mapping?: LegacyDeviceMappingRow
}): DeviceSnapshotView {
  const metrics = input.metrics ?? {}
  const meta = input.meta ?? {}
  const temperature = readMetricNumber(metrics, ['temperature_c', 'temperature', 'temp', 'temp_c'])
  const humidity = readMetricNumber(metrics, ['humidity_pct', 'humidity', 'hum'])
  const batteryLevel = readMetricNumber(metrics, ['battery_pct', 'battery_level']) ?? 0
  const latitude = readMetricNumber(metrics, ['gps_latitude', 'latitude', 'lat']) ?? input.mapping?.latitude ?? null
  const longitude = readMetricNumber(metrics, ['gps_longitude', 'longitude', 'lon', 'lng']) ?? input.mapping?.longitude ?? null
  const signalStrength = readMetricNumber(metrics, ['signal_strength', 'rssi']) ?? 0
  const warningFlag = readMetricBoolean(metrics, ['warning_flag']) ?? false
  const baselineEstablished = readMetricBoolean(meta, ['baseline_established'])
  const { status, healthScore } = deriveDeviceHealth({
    updatedAt: input.updatedAt,
    batteryLevel,
    warningFlag,
    hasCoordinates: latitude != null && longitude != null,
  })

  return {
    device_id: input.actualDeviceId,
    display_name:
      input.mapping?.device_name ||
      (typeof meta.install_label === 'string' && meta.install_label.trim()) ||
      input.requestedDeviceId,
    location: input.mapping?.location_name || '',
    coordinates: { lat: latitude, lng: longitude },
    status,
    health_score: healthScore,
    temperature,
    humidity,
    battery_level: Math.max(0, Math.round(batteryLevel)),
    signal_strength: Math.round(signalStrength),
    data_count_today: 0,
    last_data_time: input.updatedAt,
    ...(baselineEstablished === undefined ? {} : { baseline_established: baselineEstablished }),
  }
}

export async function loadDeviceSnapshotView(deviceId: string): Promise<DeviceSnapshotView> {
  const resolved = await resolveDeviceIdentity(deviceId)
  const json = await getDeviceState(resolved.actualDeviceId)
  if (!json?.success) throw new Error('Unexpected device state response')

  return normalizeDeviceStateView({
    actualDeviceId: json.data.deviceId,
    requestedDeviceId: resolved.requestedDeviceId,
    updatedAt: json.data.updatedAt,
    metrics: json.data.state.metrics ?? {},
    meta: json.data.state.meta ?? {},
    mapping: resolved.mapping,
  })
}

export async function loadDeviceSnapshotPoint(deviceId: string): Promise<Record<string, unknown>> {
  const view = await loadDeviceSnapshotView(deviceId)
  return {
    device_id: view.device_id,
    event_time: view.last_data_time,
    latitude: view.coordinates.lat,
    longitude: view.coordinates.lng,
    temperature: view.temperature,
    humidity: view.humidity,
    battery_level: view.battery_level,
  }
}
