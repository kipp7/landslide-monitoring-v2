'use client';

import useSensorData from './useSensorData';

interface AccelerationData {
  data: Record<string, { time: string; value: number }[]>;
  loading: boolean;
  error: Error | null;
}

export default function useAcceleration(): AccelerationData {
  const { data, loading, error } = useSensorData();

  const grouped: Record<string, { time: string; value: number }[]> = {};

  data.forEach((record) => {
    const id = record.device_id || 'unknown';
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push({
      time: record.event_time,
      value: typeof record.acceleration_total === 'number' ? record.acceleration_total : parseFloat(record.acceleration_total as string) || 0,
    });
  });

  // 确保每个设备的数据按时间升序排列
  Object.keys(grouped).forEach((key) => {
    grouped[key].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  });

  return { data: grouped, loading, error };
}
