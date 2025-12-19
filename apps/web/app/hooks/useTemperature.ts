// hooks/useTemperature.ts
import useSensorData from './useSensorData';

interface TemperatureData {
  data: Record<string, { time: string; value: number }[]>;
  loading: boolean;
  error: Error | null;
}

export default function useTemperature(): TemperatureData {
  const { data, loading, error } = useSensorData();

  const grouped: Record<string, { time: string; value: number }[]> = {};

  data.forEach((record) => {
    const id = record.device_id || 'unknown';
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push({
      time: record.event_time,
      value: record.temperature,
    });
  });

  // 确保每个设备的数据按时间升序排列
  Object.keys(grouped).forEach((key) => {
    grouped[key].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  });

  return { data: grouped, loading, error };
}
