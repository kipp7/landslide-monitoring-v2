// app/hooks/useSensorData.ts
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient'

export interface SensorRecord {
  id: number;
  event_time: string;
  temperature: number;
  humidity: number;
  acceleration_x: number;
  acceleration_y: number;
  acceleration_z: number;
  gyroscope_x: number;
  gyroscope_y: number;
  gyroscope_z: number;
  rainfall?: number;
  device_id?: string;
  // ...可以加其他字段
  [key: string]: string | number | undefined;
}

export default function useSensorData(refreshInterval = 30000) {
  const [data, setData] = useState<SensorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('iot_data')
      .select('*')
      .order('event_time', { ascending: true }) //升序
      .limit(500);

    if (error) {
      console.error('获取 Supabase 数据失败', error);
      setError(error);
    } else {
      setData(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  return { data, loading, error };
}
