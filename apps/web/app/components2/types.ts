// types.ts
// 修改目标类型定义
export interface AlertData {
    id: string;
    type: 'sensor' | 'point' | 'monitor'; // 扩展 type 的值范围
    level: 'critical' | 'warning' | 'notice';
    message: string;
    time: string;
    resolved: boolean;
    relatedId: string;
  };
// types.ts
// components2/MonitoringPoints.tsx
export interface DeviceInfo {
  name: string;
  type: string;
  status: 'online' | 'offline' | 'maintenance';
  manufacturer: string;
  serialNumber: string;
  firmwareVersion: string;
  installDate: string;
  lastCheck: string;
}