import { create } from 'zustand'
import { loadDeviceSnapshotView } from './api/deviceStateView'
import { listLegacyDeviceMappings, type LegacyDeviceMappingRow, type LegacyOkResponse, type LegacyErrorResponse } from './api/legacyDeviceMappings'

interface IotData {
  id: number
  event_time: string
  temperature: number
  humidity: number
  illumination: number
  acceleration_x?: number
  acceleration_y?: number
  acceleration_z?: number
  gyroscope_x?: number
  gyroscope_y?: number
  gyroscope_z?: number
  device_id?: string

  latitude?: number
  longitude?: number

  deformation_distance_3d?: number
  deformation_horizontal?: number
  deformation_vertical?: number
  deformation_velocity?: number
  deformation_risk_level?: number
  deformation_type?: number
  deformation_confidence?: number
  baseline_established?: boolean

  [key: string]: string | number | boolean | undefined
}

interface IotDataStore {
  data: IotData[]
  loading: boolean
  error: string | null
  fetchData: () => Promise<void>
  subscribeToRealtime: () => () => void
}

async function resolveDefaultLegacyDeviceId(): Promise<string | null> {
  const resp = (await listLegacyDeviceMappings()) as
    | LegacyOkResponse<LegacyDeviceMappingRow[]>
    | LegacyErrorResponse
  if (!resp || typeof resp !== 'object' || !('success' in resp) || resp.success !== true) return null
  const first = resp.data?.find((r) => r && typeof r.simple_id === 'string' && r.simple_id.trim())
  return first?.simple_id?.trim() ?? null
}

export const useIotDataStore = create<IotDataStore>((set, get) => ({
  data: [],
  loading: false,
  error: null,

  fetchData: async () => {
    set({ loading: true, error: null })
    try {
      const deviceId = (await resolveDefaultLegacyDeviceId()) ?? 'device_1'
      const snapshot = await loadDeviceSnapshotView(deviceId)
      const row: IotData = {
        id: 1,
        event_time: snapshot.last_data_time,
        temperature: snapshot.temperature ?? 0,
        humidity: snapshot.humidity ?? 0,
        illumination: 0,
        device_id: snapshot.device_id,
        latitude: snapshot.coordinates.lat ?? undefined,
        longitude: snapshot.coordinates.lng ?? undefined,
        baseline_established: snapshot.baseline_established,
      }
      set({ data: [row], loading: false })
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : '获取传感器数据失败'
      set({ error: msg, loading: false })
    }
  },

  subscribeToRealtime: () => {
    if (typeof window === 'undefined') return () => undefined

    let closed = false
    let es: EventSource | null = null

    try {
      es = new EventSource('/api/realtime-stream')
      es.onmessage = () => {
        if (closed) return
        void get().fetchData()
      }
      es.onerror = () => undefined
    } catch {
      // ignore
    }

    return () => {
      closed = true
      try {
        es?.close()
      } catch {
        // ignore
      }
      es = null
    }
  },
}))
