import { create } from "zustand";
import { supabase } from "./supabaseClient";

interface IotData {
  id: number;
  event_time: string;
  temperature: number;
  humidity: number;
  illumination: number;
  acceleration_x?: number;
  acceleration_y?: number;
  acceleration_z?: number;
  gyroscope_x?: number;
  gyroscope_y?: number;
  gyroscope_z?: number;
  device_id?: string;

  // GPS坐标
  latitude?: number;
  longitude?: number;

  // GPS形变分析字段
  deformation_distance_3d?: number;
  deformation_horizontal?: number;
  deformation_vertical?: number;
  deformation_velocity?: number;
  deformation_risk_level?: number;
  deformation_type?: number;
  deformation_confidence?: number;
  baseline_established?: boolean;

  [key: string]: string | number | boolean | undefined;
}

interface IotDataStore {
  data: IotData[];
  loading: boolean;
  error: string | null;
  fetchData: () => Promise<void>;
  subscribeToRealtime: () => () => void;
}

export const useIotDataStore = create<IotDataStore>((set, get) => ({
  data: [],
  loading: false,
  error: null,

  fetchData: async () => {
    set({ loading: true, error: null });

    try {
      // 检查环境变量
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        throw new Error('Supabase 环境变量未配置');
      }

      const { data, error } = await supabase
        .from("iot_data")
        .select("*")
        .order("event_time", { ascending: false })
        .limit(500);

      if (error) {
        set({ error: `数据库查询失败: ${error.message}`, loading: false });
      } else {
        set({ data: data || [], loading: false });
      }
    } catch (networkError) {
      const errorMessage = networkError instanceof Error
        ? `网络连接失败: ${networkError.message}`
        : '未知网络错误';
      set({ error: errorMessage, loading: false });
    }
  },

  subscribeToRealtime: () => {
    const channel = supabase
      .channel('iot_data_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'iot_data'
        },
        (payload) => {
          const currentData = get().data;

          if (payload.eventType === 'INSERT') {
            // 新数据插入到开头，保持降序
            set({
              data: [payload.new as IotData, ...currentData].slice(0, 500)
            });
          } else if (payload.eventType === 'UPDATE') {
            // 更新现有数据
            const updatedData = currentData.map(item =>
              item.id === payload.new.id ? payload.new as IotData : item
            );
            set({ data: updatedData });
          } else if (payload.eventType === 'DELETE') {
            // 删除数据
            const filteredData = currentData.filter(item =>
              item.id !== payload.old.id
            );
            set({ data: filteredData });
          }
        }
      )
      .subscribe();

    // 返回取消订阅函数
    return () => {
      supabase.removeChannel(channel);
    };
  },


}));
