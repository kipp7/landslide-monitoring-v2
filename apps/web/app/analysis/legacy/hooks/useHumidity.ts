import useSensorData from './useSensorData'

export default function useHumidity() {
  const { data, loading, error } = useSensorData()

  const grouped: Record<string, { time: string; value: number }[]> = {}

  data.forEach((record) => {
    const id = record.device_id || 'unknown'
    if (!grouped[id]) grouped[id] = []
    grouped[id].push({
      time: record.event_time,
      value: record.humidity,
    })
  })

  Object.keys(grouped).forEach((key) => {
    grouped[key]!.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
  })

  return { data: grouped, loading, error }
}

