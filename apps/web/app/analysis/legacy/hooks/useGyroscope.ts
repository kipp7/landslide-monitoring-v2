'use client'
import useSensorData from './useSensorData'

interface GyroscopeData {
  data: Record<string, { time: string; value: number }[]>
  loading: boolean
  error: Error | null
}

export default function useGyroscope(): GyroscopeData {
  const { data, loading, error } = useSensorData()

  const grouped: Record<string, { time: string; value: number }[]> = {}

  data.forEach((record) => {
    const id = record.device_id || 'unknown'
    if (!grouped[id]) grouped[id] = []
    grouped[id].push({
      time: record.event_time,
      value: typeof record.gyroscope_total === 'number' ? record.gyroscope_total : parseFloat(record.gyroscope_total as string) || 0,
    })
  })

  Object.values(grouped).forEach((records) => {
    records.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
  })

  return { data: grouped, loading, error }
}

