# 🏠 监测站名字管理API设计

## 📋 业务需求

### 当前问题
1. **硬编码站点名称** - 图例和监测站名称分散在各个组件中
2. **坐标不统一** - location-naming.ts使用错误的坐标基准
3. **数据源混杂** - 部分使用device_mapping表，部分使用硬编码
4. **图例不一致** - 不同图表的图例命名规则不统一

### 目标架构
- **统一配置管理** - 所有监测站信息集中管理
- **动态图例生成** - 基于配置自动生成图例名称
- **数据库同步** - 配置信息与数据库保持一致
- **灵活扩展** - 支持动态添加和修改监测站

---

## 🎯 API接口设计

### 1. 获取所有监测站信息
```typescript
GET /api/monitoring-stations

Response:
{
  success: boolean;
  data: MonitoringStation[];
  message: string;
}

interface MonitoringStation {
  deviceId: string;
  stationName: string;
  location: string;
  coordinates: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  sensorTypes: string[];
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  installDate: string;
  status: 'active' | 'inactive' | 'maintenance';
}
```

### 2. 获取图表配置信息
```typescript
GET /api/monitoring-stations/chart-config?type=temperature

Response:
{
  success: boolean;
  data: {
    chartType: string;
    title: string;
    unit: string;
    yAxisName: string;
    deviceLegends: {
      [deviceId: string]: string;
    };
  };
}
```

### 3. 更新监测站信息
```typescript
PUT /api/monitoring-stations/:deviceId

Request:
{
  stationName?: string;
  location?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  status?: 'active' | 'inactive' | 'maintenance';
}

Response:
{
  success: boolean;
  data: MonitoringStation;
  message: string;
}
```

### 4. 批量更新图例配置
```typescript
PUT /api/monitoring-stations/chart-legends

Request:
{
  chartType: string;
  deviceLegends: {
    [deviceId: string]: string;
  };
}

Response:
{
  success: boolean;
  message: string;
}
```

---

## 📊 数据库结构优化

### 扩展devices_new表
```sql
-- 添加新字段到devices_new表
ALTER TABLE devices_new 
ADD COLUMN station_name VARCHAR(100),
ADD COLUMN risk_level VARCHAR(20) DEFAULT 'medium',
ADD COLUMN sensor_types TEXT[], -- 支持的传感器类型数组
ADD COLUMN chart_legend_name VARCHAR(50); -- 图例显示名称

-- 更新挂壁山监测站数据
UPDATE devices_new SET 
  station_name = '挂壁山中心监测站',
  risk_level = 'medium',
  sensor_types = ARRAY['temperature', 'humidity', 'acceleration', 'illumination', 'gps'],
  chart_legend_name = '中心监测站'
WHERE device_id = 'device_1';

UPDATE devices_new SET 
  station_name = '挂壁山坡顶监测站', 
  risk_level = 'high',
  sensor_types = ARRAY['temperature', 'humidity', 'gyroscope', 'vibration', 'gps'],
  chart_legend_name = '坡顶监测站'
WHERE device_id = 'device_2';

UPDATE devices_new SET 
  station_name = '挂壁山坡脚监测站',
  risk_level = 'low', 
  sensor_types = ARRAY['temperature', 'acceleration', 'illumination', 'gps', 'vibration'],
  chart_legend_name = '坡脚监测站'
WHERE device_id = 'device_3';
```

### 新增图表配置表
```sql
-- 创建图表配置表
CREATE TABLE chart_configurations (
  id SERIAL PRIMARY KEY,
  chart_type VARCHAR(50) NOT NULL,
  title VARCHAR(100) NOT NULL,
  unit VARCHAR(20),
  y_axis_name VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(chart_type)
);

-- 插入基础图表配置
INSERT INTO chart_configurations (chart_type, title, unit, y_axis_name) VALUES
('temperature', '温度趋势图', '°C', '温度'),
('humidity', '湿度趋势图', '%', '湿度'),
('acceleration', '加速度趋势图', 'mg', '加速度'),
('gyroscope', '陀螺仪趋势图', '°/s', '角速度'),
('rainfall', '雨量趋势图', 'mm', '降雨量'),
('gps_deformation', '地质形变趋势图', 'mm', '位移');
```

---

## 🔧 前端集成方案

### 1. 创建监测站管理Hook
```typescript
// hooks/useMonitoringStations.ts
import { useState, useEffect } from 'react';
import { MonitoringStation } from '../config/monitoring-stations';

export function useMonitoringStations() {
  const [stations, setStations] = useState<MonitoringStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStations = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/monitoring-stations');
      const result = await response.json();
      
      if (result.success) {
        setStations(result.data);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('获取监测站信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, []);

  return {
    stations,
    loading,
    error,
    refresh: fetchStations
  };
}
```

### 2. 更新图表组件
```typescript
// 在图表组件中使用动态配置
import { useMonitoringStations } from '../hooks/useMonitoringStations';

const TemperatureChart = () => {
  const { stations } = useMonitoringStations();
  
  // 动态生成图例
  const series = deviceKeys.map((deviceId, index) => {
    const station = stations.find(s => s.deviceId === deviceId);
    const legendName = station?.chartLegendName || station?.stationName || deviceId;
    
    return {
      name: legendName, // 使用动态图例名称
      // ... 其他配置
    };
  });
  
  // ...
};
```

### 3. 管理界面组件
```typescript
// components/StationManagement.tsx
import { useMonitoringStations } from '../hooks/useMonitoringStations';

const StationManagement = () => {
  const { stations, loading, refresh } = useMonitoringStations();
  
  const updateStation = async (deviceId: string, updates: Partial<MonitoringStation>) => {
    try {
      const response = await fetch(`/api/monitoring-stations/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      if (response.ok) {
        refresh(); // 刷新数据
      }
    } catch (error) {
      console.error('更新监测站信息失败:', error);
    }
  };
  
  return (
    <div>
      {stations.map(station => (
        <div key={station.deviceId}>
          <input 
            value={station.stationName}
            onChange={(e) => updateStation(station.deviceId, { 
              stationName: e.target.value 
            })}
          />
          {/* 其他编辑字段 */}
        </div>
      ))}
    </div>
  );
};
```

---

## 🚀 实施步骤

### 阶段一：基础配置文件（已完成）
- ✅ 创建`monitoring-stations.ts`统一配置文件
- ✅ 更新`location-naming.ts`使用正确坐标
- ✅ 创建示例组件展示新配置用法

### 阶段二：API接口开发
1. 实现监测站信息CRUD API
2. 实现图表配置管理API
3. 创建数据库迁移脚本

### 阶段三：前端集成
1. 创建监测站管理Hook
2. 更新现有图表组件使用动态配置
3. 实现监测站管理界面

### 阶段四：数据库同步
1. 执行数据库迁移脚本
2. 导入初始监测站数据
3. 验证数据一致性

### 阶段五：测试和优化
1. 功能测试
2. 性能优化
3. 用户体验优化

---

## 📈 业务价值

### 运维便利性
- **集中管理** - 统一界面管理所有监测站信息
- **快速修改** - 无需修改代码即可调整站点名称
- **实时生效** - 修改后立即在所有图表中生效

### 数据一致性
- **单一数据源** - 避免数据不一致问题
- **自动同步** - 配置变更自动同步到所有组件
- **版本控制** - 支持配置历史和回滚

### 扩展性
- **动态添加** - 支持动态添加新监测站
- **传感器配置** - 灵活配置每个站点的传感器类型
- **图例自定义** - 支持为不同图表设置不同图例

---

## 🔍 监控和维护

### 配置变更日志
- 记录所有配置变更历史
- 支持配置回滚
- 变更通知机制

### 数据验证
- 坐标有效性验证
- 传感器类型一致性检查
- 图例长度和格式验证

### 性能监控
- 配置加载性能监控
- API响应时间统计
- 前端渲染性能追踪
