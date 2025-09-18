'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Card,
  Button,
  Modal,
  Form,
  Input,
  message,
  Tag,
  Space,
  Row,
  Col,
  Descriptions,
  Badge,
  Tooltip,
  Typography,
  Progress,
  Spin
} from 'antd';
import {
  EditOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  DesktopOutlined,
  WifiOutlined,
  DisconnectOutlined,
  EnvironmentOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  SettingOutlined
} from '@ant-design/icons';
import HoverSidebar from '../components/HoverSidebar';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { getApiUrl, API_CONFIG } from '../../lib/config';
import { supabase } from '../../lib/supabaseClient';

// 客户端时间组件，避免SSR水合错误
const CurrentTime = () => {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleString('zh-CN'));
    };

    // 初始设置时间
    updateTime();

    // 每秒更新时间
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  // 在客户端渲染前显示占位符
  if (!currentTime) {
    return <span>--:--:--</span>;
  }

  return <span>{currentTime}</span>;
};

// 使用大屏的地图组件
const MapContainer = dynamic(() => import('../../app/components/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-700/30 rounded-lg flex items-center justify-center">
      <div className="text-slate-400 text-sm">加载地图中...</div>
    </div>
  )
});

const { Title, Text } = Typography;

interface DeviceInfo {
  device_id: string;
  real_name: string;
  display_name: string;
  status: 'online' | 'offline' | 'maintenance';
  last_active: string;
  location: string;
  coordinates: { lat: number; lng: number };
  device_type: string;
  firmware_version: string;
  install_date: string;
  data_count_today: number;
  last_data_time: string;
  health_score: number;
  temperature: number;
  humidity: number;
  battery_level: number;
  signal_strength: number;
}

export default function DeviceManagementPage() {
  const router = useRouter();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [realTimeData, setRealTimeData] = useState<any>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');

  const [form] = Form.useForm();

  // 设备控制相关状态
  const [controlLoading, setControlLoading] = useState(false);
  const [commandModalVisible, setCommandModalVisible] = useState(false);
  const [commandForm] = Form.useForm();

  // 设备映射信息 - 用于获取真实设备名称
  const [deviceMappings, setDeviceMappings] = useState<any[]>([]);

  // 获取设备映射信息
  useEffect(() => {
    const fetchDeviceMappings = async () => {
      try {
        const { data: mappings, error } = await supabase
          .from('device_mapping')
          .select('simple_id, device_name, location_name');

        if (!error && mappings) {
          setDeviceMappings(mappings);
        }
      } catch (error) {
        console.error('获取设备映射失败:', error);
      }
    };

    fetchDeviceMappings();
  }, []);

  // 实时传感器数据 - 使用与大屏页面相同的数据源
  const [sensorData, setSensorData] = useState<any[]>([]);
  const [sensorLoading, setSensorLoading] = useState(true);

  // 获取实时传感器数据
  const fetchSensorData = useCallback(async () => {
    try {
      setSensorLoading(true);
      const { data, error } = await supabase
        .from('iot_data')
        .select('*')
        .order('event_time', { ascending: false })
        .limit(500);

      if (error) {
        console.error('获取传感器数据失败:', error);
      } else {
        setSensorData(data || []);
        setLastUpdateTime(new Date().toLocaleTimeString());
      }
    } catch (error) {
      console.error('获取传感器数据失败:', error);
    } finally {
      setSensorLoading(false);
    }
  }, []);

  // 初始加载传感器数据
  useEffect(() => {
    fetchSensorData();
    
    // 设置定时刷新
    const interval = setInterval(fetchSensorData, 30000); // 30秒刷新一次
    
    return () => clearInterval(interval);
  }, [fetchSensorData]);

  // 从实时传感器数据中提取设备位置信息 - 使用与大屏页面相同的逻辑
  const getDevicesForMap = useMemo(() => {
    if (!sensorData || sensorData.length === 0) {
      console.log('设备管理：没有实时数据，不显示任何监测点');
      return [];
    }

    // 按设备ID分组，获取每个设备的最新数据
    const deviceMap = new Map();
    sensorData.forEach(record => {
      if (record.device_id && record.latitude && record.longitude) {
        const existing = deviceMap.get(record.device_id);
        if (!existing || new Date(record.event_time) > new Date(existing.event_time)) {
          deviceMap.set(record.device_id, record);
        }
      }
    });

    // 只使用有真实坐标数据的设备
    const realDevices = Array.from(deviceMap.values())
      .filter(record => record.latitude && record.longitude)
      .map((record, index) => {
        const lat = parseFloat(record.latitude);
        const lng = parseFloat(record.longitude);

        // 从设备映射中获取真实的设备名称
        const mapping = deviceMappings.find(m => m.simple_id === record.device_id);
        const deviceName = mapping?.device_name || mapping?.location_name || `设备${record.device_id}`;

        return {
          device_id: record.device_id,
          name: deviceName,
          coord: [lng, lat] as [number, number],
          temp: parseFloat(record.temperature) || 0,
          hum: parseFloat(record.humidity) || 0,
          status: 'online' as const, // 有数据说明在线
          location: mapping?.location_name || '未知位置'
        };
      });

    console.log('设备管理：真实监测点数据:', realDevices);
    return realDevices;
  }, [sensorData, deviceMappings]);

  // 计算真实数据的地理中心点 - 使用useMemo避免重复计算
  const mapCenter = useMemo((): [number, number] => {
    if (getDevicesForMap.length === 0) return [108.3516, 21.6847]; // 默认中心点

    const totalLng = getDevicesForMap.reduce((sum, device) => sum + device.coord[0], 0);
    const totalLat = getDevicesForMap.reduce((sum, device) => sum + device.coord[1], 0);

    return [totalLng / getDevicesForMap.length, totalLat / getDevicesForMap.length];
  }, [getDevicesForMap]);

  // 真实设备数据 - 基于实际的传感器数据
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    device_id: 'device_1',
    real_name: '6815a14f9314d118511807c6_rk2206',
    display_name: '龙门滑坡监测站',
    status: 'offline', // 默认离线，等API返回真实状态
    last_active: new Date().toISOString(),
    location: '防城港华石镇龙门村',
    coordinates: { lat: 21.6847, lng: 108.3516 },
    device_type: '软通套件',
    firmware_version: 'v2.1.3',
    install_date: '2025-06-01',
    data_count_today: 0,
    last_data_time: new Date().toISOString(),
    health_score: 0,
    temperature: 0,
    humidity: 0,
    battery_level: 0,
    signal_strength: 0
  });

  // 更新设备信息 - 基于实时传感器数据
  useEffect(() => {
    if (getDevicesForMap.length > 0) {
      const latestDevice = getDevicesForMap[0]; // 获取最新的设备数据
      
      setDeviceInfo(prev => ({
        ...prev,
        status: 'online',
        last_active: new Date().toISOString(),
        coordinates: { 
          lat: latestDevice.coord[1], 
          lng: latestDevice.coord[0] 
        },
        temperature: latestDevice.temp,
        humidity: latestDevice.hum,
        data_count_today: sensorData.length,
        last_data_time: new Date().toISOString(),
        health_score: 100, // 有数据说明健康
        signal_strength: 95 // 有数据说明信号好
      }));
    }
  }, [getDevicesForMap, sensorData.length]);

  // GPS形变分析数据状态
  const [deformationData, setDeformationData] = useState({
    deformation_distance_3d: 0,
    deformation_horizontal: 0,
    deformation_vertical: 0,
    deformation_velocity: 0,
    deformation_risk_level: 0,
    deformation_type: 0,
    deformation_confidence: 0,
    baseline_established: false,
    loading: true,
    error: null as string | null
  });

  // 计算设备健康度算法
  const calculateHealthScore = (data: any) => {
    if (!data || !data.success) return 0;

    let score = 100;
    const now = new Date();
    const lastDataTime = new Date(data.data?.event_time || 0);
    const minutesSinceLastData = (now.getTime() - lastDataTime.getTime()) / (1000 * 60);

    // 根据数据新鲜度扣分
    if (minutesSinceLastData > 60) score -= 50; // 超过1小时扣50分
    else if (minutesSinceLastData > 30) score -= 30; // 超过30分钟扣30分
    else if (minutesSinceLastData > 10) score -= 15; // 超过10分钟扣15分

    // 根据数据完整性扣分
    const requiredFields = ['temperature', 'humidity', 'acceleration_x', 'acceleration_y', 'acceleration_z'];
    const missingFields = requiredFields.filter(field => !data.data?.[field]);
    score -= missingFields.length * 10;

    return Math.max(0, Math.min(100, score));
  };

  // 计算信号强度算法
  const calculateSignalStrength = (data: any) => {
    if (!data || !data.success) return 0;

    const now = new Date();
    const lastDataTime = new Date(data.data?.event_time || 0);
    const minutesSinceLastData = (now.getTime() - lastDataTime.getTime()) / (1000 * 60);

    // 基于数据传输延迟计算信号强度
    if (minutesSinceLastData <= 2) return 95; // 2分钟内：优秀
    if (minutesSinceLastData <= 5) return 80; // 5分钟内：良好
    if (minutesSinceLastData <= 10) return 60; // 10分钟内：一般
    if (minutesSinceLastData <= 30) return 30; // 30分钟内：较差
    return 10; // 超过30分钟：很差
  };

  // 计算电池电量算法（基于设备运行时间和数据频率）
  const calculateBatteryLevel = (installDate: string, dataCount: number) => {
    const now = new Date();
    const install = new Date(installDate);
    const daysSinceInstall = (now.getTime() - install.getTime()) / (1000 * 60 * 60 * 24);

    // 假设电池满电可用90天，每天理想数据量1440条（每分钟一条）
    const expectedDailyData = 1440;
    const batteryLifeDays = 90;

    // 基于运行天数计算基础电量
    let batteryLevel = Math.max(0, 100 - (daysSinceInstall / batteryLifeDays) * 100);

    // 基于数据传输频率调整（频率越高，耗电越快）
    const dataRatio = dataCount / expectedDailyData;
    if (dataRatio > 1.2) batteryLevel *= 0.9; // 数据量过高，额外耗电
    else if (dataRatio < 0.8) batteryLevel *= 1.05; // 数据量较低，省电

    return Math.max(0, Math.min(100, Math.round(batteryLevel)));
  };

  // 获取实时数据 - 使用后端的完整设备管理API
  const fetchRealTimeData = useCallback(async (showMessage = false) => {
    try {
      if (showMessage) setLoading(true);

      // 调用后端的设备管理API（结合华为云IoT + Supabase数据）
      const managementUrl = getApiUrl(`/devices/device_1/management`);

      const response = await fetch(managementUrl);
      const result = await response.json();

      if (result.success) {
        console.log('实时数据更新:', {
          status: result.data.status,
          temperature: result.data.temperature,
          humidity: result.data.humidity,
          health_score: result.data.health_score,
          battery_level: result.data.battery_level,
          timestamp: result.data.timestamp
        });

        setDeviceInfo(result.data);
        setLastUpdateTime(new Date().toLocaleTimeString());

        // GPS形变分析数据将通过专门的API获取

        if (showMessage) {
          message.success('数据刷新成功');
        }
      } else {
        throw new Error(result.error || '获取设备信息失败');
      }
    } catch (error: any) {
      console.error('获取设备信息失败:', error);
      if (showMessage) {
        message.error('数据刷新失败');
      }
      // 设置为离线状态
      setDeviceInfo(prev => ({ ...prev, status: 'offline' }));
    } finally {
      if (showMessage) setLoading(false);
    }
  }, []);

  // 获取GPS形变分析数据
  const fetchDeformationData = useCallback(async (showMessage = false) => {
    try {
      setDeformationData(prev => ({ ...prev, loading: true, error: null }));

      const response = await fetch(`/iot/api/device-management/deformation/${deviceInfo.device_id}/summary`);
      const result = await response.json();

      if (result.success) {
        setDeformationData({
          deformation_distance_3d: result.max_displacement || 0,
          deformation_horizontal: result.horizontal_displacement || 0,
          deformation_vertical: result.vertical_displacement || 0,
          deformation_velocity: result.velocity || 0,
          deformation_risk_level: result.risk_level || 0,
          deformation_type: result.deformation_type || 0,
          deformation_confidence: result.confidence || 0,
          baseline_established: result.hasBaseline || false,
          loading: false,
          error: null
        });

        if (showMessage) {
          message.success('形变数据刷新成功');
        }
      } else {
        setDeformationData(prev => ({
          ...prev,
          loading: false,
          error: result.error || '获取形变数据失败'
        }));

        if (showMessage) {
          message.error('形变数据刷新失败');
        }
      }
    } catch (error) {
      console.error('获取形变数据错误:', error);
      setDeformationData(prev => ({
        ...prev,
        loading: false,
        error: '网络连接错误'
      }));

      if (showMessage) {
        message.error('形变数据网络错误');
      }
    }
  }, [deviceInfo.device_id]);

  // 数据导出处理
  const handleExportData = useCallback(async (exportType: 'today' | 'history') => {
    try {
      setLoading(true);

      const response = await fetch('/api/device-management/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceInfo.device_id,
          export_type: exportType,
          format: 'csv'
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `device_${deviceInfo.device_id}_${exportType}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        message.success('数据导出成功');
      } else {
        throw new Error('导出失败');
      }
    } catch (error) {
      console.error('数据导出失败:', error);
      message.error('数据导出失败');
    } finally {
      setLoading(false);
    }
  }, [deviceInfo.device_id]);

  // 生成报告处理
  const handleGenerateReport = useCallback(async (reportType: 'daily' | 'weekly' | 'monthly') => {
    try {
      setLoading(true);

      const response = await fetch('/api/device-management/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceInfo.device_id,
          report_type: reportType
        }),
      });

      const result = await response.json();

      if (result.success) {
        const report = result.data;

        // 显示报告摘要
        const reportSummary = `
📊 ${reportType === 'daily' ? '日' : reportType === 'weekly' ? '周' : '月'}报告生成完成

📈 数据概览：
• 数据完整性：${report.data_summary.data_completeness}%
• 总记录数：${report.data_summary.total_records}条
• 设备状态：${report.device_status.overall === 'healthy' ? '健康' : report.device_status.overall === 'warning' ? '警告' : '异常'}

${report.ai_analysis ? `
🤖 AI分析：
${report.ai_analysis.summary}

💡 关键洞察：
${report.ai_analysis.insights.map((insight: string) => `• ${insight}`).join('\n')}

🔧 AI建议：
${report.ai_analysis.recommendations.map((rec: string) => `• ${rec}`).join('\n')}
` : ''}

📋 详细报告已生成，包含完整的数据分析和维护建议。
        `;

        Modal.info({
          title: '📊 设备运行报告',
          content: (
            <div className="bg-slate-800 text-white p-4 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm">{reportSummary}</pre>
            </div>
          ),
          width: 600,
          className: 'dark-modal',
          okText: '确定',
          okButtonProps: {
            className: 'bg-cyan-500 hover:bg-cyan-600 border-cyan-500'
          }
        });

        message.success('报告生成成功');
        console.log('完整报告数据:', report);
      } else {
        throw new Error(result.error || '生成报告失败');
      }
    } catch (error) {
      console.error('生成报告失败:', error);
      message.error('生成报告失败');
    } finally {
      setLoading(false);
    }
  }, [deviceInfo.device_id]);

  // 设备诊断处理
  const handleDeviceDiagnostics = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/device-management/diagnostics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceInfo.device_id
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log('设备诊断完成:', result.data);
        message.success(`设备诊断完成 - 总体状态: ${result.data.overall_status}`);

        // 这里可以显示诊断结果的详细信息
        // 可以在这里打开一个新的模态框显示诊断结果
      } else {
        throw new Error(result.error || '设备诊断失败');
      }
    } catch (error) {
      console.error('设备诊断失败:', error);
      message.error('设备诊断失败');
    } finally {
      setLoading(false);
    }
  }, [deviceInfo.device_id]);

  // ==================== 设备控制相关函数 ====================

  // 发送设备命令
  const sendDeviceCommand = useCallback(async (commandData: any) => {
    try {
      setControlLoading(true);

      const response = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.DEVICE_COMMANDS(deviceInfo.real_name)), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commandData),
      });

      const result = await response.json();

      if (result.success) {
        message.success('命令下发成功');
        console.log('命令执行结果:', result.data);
        return result.data;
      } else {
        throw new Error(result.message || '命令下发失败');
      }
    } catch (error: any) {
      console.error('命令下发失败:', error);
      message.error(`命令下发失败: ${error.message || error}`);
      throw error;
    } finally {
      setControlLoading(false);
    }
  }, [deviceInfo.real_name]);

  // 电机控制
  const handleMotorControl = useCallback(async (enable: boolean, speed = 100, direction = 1, duration = 5000) => {
    try {
      setControlLoading(true);

      const apiUrl = getApiUrl(API_CONFIG.ENDPOINTS.DEVICE_MOTOR(deviceInfo.real_name));
      console.log('电机控制API调用:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enable, speed, direction, duration }),
      });

      const result = await response.json();

      if (result.success) {
        message.success(`电机 ${enable ? '启动' : '停止'}成功`);
        console.log('电机控制结果:', result.data);
      } else {
        throw new Error(result.message || '电机控制失败');
      }
    } catch (error: any) {
      console.error('电机控制失败:', error);
      message.error(`电机控制失败: ${error.message || error}`);
    } finally {
      setControlLoading(false);
    }
  }, [deviceInfo.real_name]);

  // 蜂鸣器控制
  const handleBuzzerControl = useCallback(async (enable: boolean, frequency = 2000, duration = 3, pattern = 2) => {
    try {
      setControlLoading(true);

      const response = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.DEVICE_BUZZER(deviceInfo.real_name)), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enable, frequency, duration, pattern }),
      });

      const result = await response.json();

      if (result.success) {
        message.success(`蜂鸣器 ${enable ? '开启' : '关闭'}成功`);
        console.log('蜂鸣器控制结果:', result.data);
      } else {
        throw new Error(result.message || '蜂鸣器控制失败');
      }
    } catch (error: any) {
      console.error('蜂鸣器控制失败:', error);
      message.error(`蜂鸣器控制失败: ${error.message || error}`);
    } finally {
      setControlLoading(false);
    }
  }, [deviceInfo.real_name]);

  // 系统重启
  const handleSystemReboot = useCallback(async () => {
    try {
      Modal.confirm({
        title: '确认重启设备',
        content: '确定要重启设备吗？重启过程中设备将暂时离线。',
        okText: '确认重启',
        cancelText: '取消',
        okType: 'danger',
        className: 'dark-modal',
        onOk: async () => {
          try {
            setControlLoading(true);

            const response = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.DEVICE_REBOOT(deviceInfo.real_name)), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            const result = await response.json();

            if (result.success) {
              message.success('设备重启命令已发送');
              console.log('重启命令结果:', result.data);
            } else {
              throw new Error(result.message || '重启命令发送失败');
            }
          } catch (error: any) {
            console.error('设备重启失败:', error);
            message.error(`设备重启失败: ${error.message || error}`);
          } finally {
            setControlLoading(false);
          }
        }
      });
    } catch (error) {
      console.error('设备重启操作失败:', error);
    }
  }, [deviceInfo.real_name]);

  // 自定义命令处理
  const handleCustomCommand = useCallback(async (values: any) => {
    try {
      const commandData = {
        service_id: values.service_id,
        command_name: values.command_name,
        paras: JSON.parse(values.paras || '{}')
      };

      await sendDeviceCommand(commandData);
      setCommandModalVisible(false);
      commandForm.resetFields();
    } catch (error) {
      console.error('自定义命令执行失败:', error);
    }
  }, [sendDeviceCommand, commandForm]);

  // ==================== 设备控制函数结束 ====================

  // 设备健康度计算 (优化性能)
  const getHealthColor = useMemo(() => (score: number) => {
    if (score >= 90) return '#00ff88';
    if (score >= 70) return '#ffaa00';
    return '#ff4444';
  }, []);

  // 信号强度计算
  const getSignalColor = (strength: number) => {
    if (strength >= 80) return '#00ff88';
    if (strength >= 60) return '#ffaa00';
    return '#ff4444';
  };

  // 保存设备信息 - 使用新的API
  const handleSave = useCallback(async (values: any) => {
    try {
      setLoading(true);

      const response = await fetch('/api/device-management', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceInfo.device_id,
          ...values
        }),
      });

      const result = await response.json();

      if (result.success) {
        setDeviceInfo(prev => ({ ...prev, ...values }));
        message.success('设备信息更新成功');
        setEditModalVisible(false);
      } else {
        throw new Error(result.error || '更新失败');
      }
    } catch (error) {
      console.error('保存设备信息失败:', error);
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  }, [deviceInfo.device_id]);



  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* 悬浮侧边菜单 */}
      <HoverSidebar />

      {/* 顶部导航 - 大屏同色系 */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 text-white shadow-lg">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            {/* 左侧 - 系统名称和导航 */}
            <div className="flex items-center space-x-8">
              <div>
                <div className="text-lg font-semibold text-cyan-100">滑坡监测系统</div>
                <div className="text-xs text-slate-300">Landslide Monitoring System</div>
              </div>

              <nav className="hidden md:flex space-x-1">
                <Link
                  href="/"
                  className="text-slate-300 hover:text-cyan-200 px-4 py-2 text-sm rounded-md hover:bg-slate-700/50 transition-all"
                >
                  实时监控
                </Link>
                <Link
                  href="/analysis"
                  className="text-slate-300 hover:text-cyan-200 px-4 py-2 text-sm rounded-md hover:bg-slate-700/50 transition-all"
                >
                  数据分析
                </Link>
                <Link
                  href="/device-management"
                  className="text-cyan-200 bg-slate-700/70 px-4 py-2 text-sm rounded-md font-medium border border-cyan-400/30"
                >
                  设备管理
                </Link>
                <a
                  href="/settings"
                  className="text-slate-300 hover:text-cyan-200 px-4 py-2 text-sm rounded-md hover:bg-slate-700/50 transition-all"
                >
                  系统配置
                </a>
              </nav>
            </div>

            {/* 右侧 - 状态信息 */}
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2 bg-slate-700/50 px-3 py-1 rounded-full">
                <div className={`w-2 h-2 rounded-full ${deviceInfo.status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-sm text-slate-200">
                  {deviceInfo.status === 'online' ? '设备在线' : '设备离线'}
                </span>
              </div>

              {/* 传感器数据实时状态指示器 */}
              <div className="flex items-center space-x-2 bg-blue-700/50 px-3 py-1 rounded-full">
                <div className={`w-2 h-2 rounded-full ${
                  !sensorLoading && sensorData.length > 0 ? 'bg-green-400 animate-pulse' :
                  sensorLoading ? 'bg-yellow-400 animate-pulse' :
                  'bg-red-400'
                }`}></div>
                <span className="text-sm text-slate-200">
                  {!sensorLoading && sensorData.length > 0 ? '传感器实时' :
                   sensorLoading ? '加载中...' :
                   '无数据'}
                </span>
                <div className="text-xs text-blue-300 ml-1">
                  {sensorData.length}条数据
                </div>
              </div>

              <div className="text-sm text-slate-300 font-mono">
                <CurrentTime />
              </div>

              {lastUpdateTime && (
                <div className="text-xs text-slate-400">
                  最后更新: {lastUpdateTime}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面标题区域 */}
        <div className="bg-slate-800/80 backdrop-blur-sm border-l-4 border-cyan-400 shadow-lg mb-6">
          <div className="px-6 py-5">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold text-white flex items-center space-x-2">
                  <span>{deviceInfo.display_name}</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${deviceInfo.status === 'online' ? 'bg-green-500/20 text-green-300 border border-green-400' : 'bg-red-500/20 text-red-300 border border-red-400'}`}>
                    {deviceInfo.status === 'online' ? '运行中' : '离线'}
                  </span>
                </h1>
                <div className="mt-1 flex items-center space-x-4 text-sm text-slate-300">
                  <span>位置: {deviceInfo.location}</span>
                  <span>类型: {deviceInfo.device_type}</span>
                  <span>版本: {deviceInfo.firmware_version}</span>
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    fetchRealTimeData(true);
                    fetchDeformationData(true);
                  }}
                  disabled={loading}
                  className="px-4 py-2 bg-slate-700 text-slate-200 text-sm border border-slate-600 rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? '刷新中...' : '刷新数据'}
                </button>
                <button
                  onClick={() => setDetailModalVisible(true)}
                  className="px-4 py-2 bg-cyan-500 text-white text-sm rounded-lg hover:bg-cyan-600 transition-colors shadow-md"
                >
                  详细信息
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 主要内容区域 - 7列布局，增加垂直高度 */}
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4 mb-6 h-[calc(100vh-280px)]">
          {/* 左侧环境数据与设备状态面板 */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden h-full">
              <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                <h3 className="text-sm font-semibold text-cyan-300 flex items-center space-x-2">
                  <span>环境与状态</span>
                </h3>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto">
                {/* 环境数据区域 */}
                <div className="space-y-3">
                  <div className="text-xs text-slate-400 font-medium mb-2">环境数据</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-orange-500/10 border border-orange-400/30 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-slate-300">温度</span>
                      </div>
                      <div className="text-sm font-bold text-orange-300">{deviceInfo.temperature}°C</div>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-blue-500/10 border border-blue-400/30 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-slate-300">湿度</span>
                      </div>
                      <div className="text-sm font-bold text-blue-300">{deviceInfo.humidity}%</div>
                    </div>
                  </div>
                </div>

                {/* 分隔线 */}
                <div className="border-t border-slate-600"></div>

                {/* 设备状态区域 */}
                <div className="space-y-3">
                  <div className="text-xs text-slate-400 font-medium mb-2">设备状态</div>

                  {/* 健康度 */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">健康度</span>
                      <span className="text-sm font-bold text-green-300">{deviceInfo.health_score}%</span>
                    </div>
                    <div className="w-full bg-slate-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          deviceInfo.health_score > 70 ? 'bg-green-400' :
                          deviceInfo.health_score > 40 ? 'bg-yellow-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${deviceInfo.health_score}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* 电池电量 */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">电池电量</span>
                      <span className="text-sm font-bold text-blue-300">{deviceInfo.battery_level}%</span>
                    </div>
                    <div className="w-full bg-slate-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          deviceInfo.battery_level > 50 ? 'bg-blue-400' :
                          deviceInfo.battery_level > 20 ? 'bg-yellow-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${deviceInfo.battery_level}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* 信号强度 */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">信号强度</span>
                      <span className="text-sm font-bold text-cyan-300">{deviceInfo.signal_strength}%</span>
                    </div>
                    <div className="w-full bg-slate-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          deviceInfo.signal_strength > 70 ? 'bg-cyan-400' :
                          deviceInfo.signal_strength > 40 ? 'bg-yellow-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${deviceInfo.signal_strength}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* 分隔线 */}
                <div className="border-t border-slate-600"></div>

                {/* 状态摘要 */}
                <div className="space-y-2">
                  <div className="text-xs text-slate-400 font-medium">状态摘要</div>
                  <div className="bg-slate-700/30 rounded-lg p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">设备状态</span>
                      <span className={`font-medium ${
                        deviceInfo.status === 'online' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {deviceInfo.status === 'online' ? '在线' : '离线'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-slate-400">最后更新</span>
                      <span className="text-white">
                        {new Date(deviceInfo.last_data_time).toLocaleTimeString('zh-CN')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 中间设备信息与控制面板 */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden h-full">
              <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                <h3 className="text-sm font-semibold text-cyan-300">设备信息与控制</h3>
              </div>
              <div className="p-4">
                <div className="space-y-4">
                  {/* 基本信息 */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">设备名称</span>
                      <span className="text-sm font-medium text-white">{deviceInfo.display_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">设备编号</span>
                      <span className="text-xs font-mono text-cyan-300 bg-slate-700 px-2 py-1 rounded">{deviceInfo.device_id}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">设备类型</span>
                      <span className="text-sm text-white">{deviceInfo.device_type}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">固件版本</span>
                      <span className="text-sm text-white">{deviceInfo.firmware_version}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">安装位置</span>
                      <span className="text-sm text-white">{deviceInfo.location}</span>
                    </div>
                  </div>

                  {/* 运行状态 */}
                  <div className="pt-3 border-t border-slate-600">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm text-slate-400">运行状态</span>
                      <span className={`text-sm font-semibold px-2 py-1 rounded-full ${deviceInfo.status === 'online' ? 'bg-green-500/20 text-green-300 border border-green-400' : 'bg-red-500/20 text-red-300 border border-red-400'}`}>
                        {deviceInfo.status === 'online' ? '正常运行' : '设备离线'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mb-2">
                      运行时间: {Math.floor((Date.now() - new Date(deviceInfo.install_date).getTime()) / (1000 * 60 * 60 * 24))} 天
                    </div>
                  </div>

                  {/* 快速操作 */}
                  <div className="pt-3 border-t border-slate-600">
                    <div className="text-sm text-slate-400 mb-3">快速操作</div>
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          fetchRealTimeData(true);
                          fetchDeformationData(true);
                        }}
                        disabled={loading}
                        className="w-full px-3 py-2 text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-400 rounded hover:bg-cyan-500/30 disabled:opacity-50 transition-colors"
                      >
                        {loading ? '刷新中...' : '刷新数据'}
                      </button>
                      <button
                        onClick={() => setDetailModalVisible(true)}
                        className="w-full px-3 py-2 text-xs bg-blue-500/20 text-blue-300 border border-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                      >
                        详细报告
                      </button>
                      <button
                        onClick={() => setEditModalVisible(true)}
                        className="w-full px-3 py-2 text-xs bg-slate-600 text-slate-300 border border-slate-500 rounded hover:bg-slate-500 transition-colors"
                      >
                        设备配置
                      </button>
                    </div>
                  </div>

                  {/* 设备控制 */}
                  <div className="pt-3 border-t border-slate-600">
                    <div className="text-sm text-slate-400 mb-3">设备控制</div>
                    <div className="space-y-2">
                      {/* 电机控制按钮 */}
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleMotorControl(true, 100, 1, 5)}
                          disabled={controlLoading}
                          className="flex-1 px-2 py-2 text-xs bg-blue-500/20 text-blue-300 border border-blue-400 rounded hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
                        >
                          电机启动
                        </button>
                        <button
                          onClick={() => handleMotorControl(false, 0, 1, 0)}
                          disabled={controlLoading}
                          className="flex-1 px-2 py-2 text-xs bg-orange-500/20 text-orange-300 border border-orange-400 rounded hover:bg-orange-500/30 disabled:opacity-50 transition-colors"
                        >
                          电机停止
                        </button>
                      </div>

                      {/* 蜂鸣器控制按钮 */}
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleBuzzerControl(true, 2000, 3, 2)}
                          disabled={controlLoading}
                          className="flex-1 px-2 py-2 text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-400 rounded hover:bg-yellow-500/30 disabled:opacity-50 transition-colors"
                        >
                          蜂鸣器开
                        </button>
                        <button
                          onClick={() => handleBuzzerControl(false)}
                          disabled={controlLoading}
                          className="flex-1 px-2 py-2 text-xs bg-red-500/20 text-red-300 border border-red-400 rounded hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                        >
                          蜂鸣器关
                        </button>
                      </div>

                      {/* 系统控制按钮 */}
                      <button
                        onClick={handleSystemReboot}
                        disabled={controlLoading}
                        className="w-full px-3 py-2 text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-400 rounded hover:bg-yellow-500/30 disabled:opacity-50 transition-colors"
                      >
                        {controlLoading ? '执行中...' : '系统重启'}
                      </button>

                      {/* 自定义命令按钮 */}
                      <button
                        onClick={() => setCommandModalVisible(true)}
                        disabled={controlLoading}
                        className="w-full px-3 py-2 text-xs bg-purple-500/20 text-purple-300 border border-purple-400 rounded hover:bg-purple-500/30 disabled:opacity-50 transition-colors"
                      >
                        自定义命令
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 中间真实地图区域 - 保持3列 */}
          <div className="lg:col-span-3">
            <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden h-full flex flex-col">
              <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-cyan-300">设备位置地图</h3>
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span>实时定位</span>
                    <div className={`w-2 h-2 rounded-full ${deviceInfo.status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-4 flex flex-col">
                {/* 地图区域 - 占据全部可用空间 */}
                <div className="flex-1 rounded-lg overflow-hidden">
                  {(() => {
                    // 使用实时传感器数据，如果没有数据则显示提示
                    if (getDevicesForMap.length === 0) {
                      return (
                        <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
                          <div className="text-center text-gray-500">
                            <div className="text-lg font-medium mb-2">暂无监测点数据</div>
                            <div className="text-sm">等待传感器数据上传中...</div>
                            {sensorLoading && (
                              <div className="mt-2">
                                <Spin size="small" />
                                <span className="ml-2 text-xs">加载中...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    const mapProps = {
                      mode: "2D" as const,
                      devices: getDevicesForMap, // ✅ 使用实时传感器数据
                      center: mapCenter, // ✅ 使用动态计算的中心点
                      zoom: 16
                    };

                    console.log('传递给地图的实时数据:', {
                      realTimeDevices: getDevicesForMap,
                      mapCenter,
                      sensorDataCount: sensorData.length,
                      lastUpdate: lastUpdateTime
                    });

                    return <MapContainer {...mapProps} />;
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* 右侧GPS形变分析面板 */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden h-full">
              <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                <h3 className="text-sm font-semibold text-cyan-300 flex items-center space-x-2">
                  <span>GPS形变分析</span>
                  {deformationData.loading && (
                    <div className="w-3 h-3 border border-cyan-300 border-t-transparent rounded-full animate-spin"></div>
                  )}
                </h3>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto">
                {deformationData.error && (
                  <div className="bg-red-500/20 border border-red-400 rounded-lg p-3 text-center">
                    <div className="text-sm text-red-300">{deformationData.error}</div>
                    <button
                      onClick={() => fetchDeformationData(true)}
                      className="mt-2 px-3 py-1 text-xs bg-red-500/30 text-red-200 rounded hover:bg-red-500/40 transition-colors"
                    >
                      重试
                    </button>
                  </div>
                )}
                {/* 3D总位移距离 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">3D总位移</span>
                    <span className="text-xs text-cyan-300">m</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {deformationData.deformation_distance_3d !== null ?
                      deformationData.deformation_distance_3d.toFixed(3) : '无数据'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    相对基准点位移
                  </div>
                </div>

                {/* 水平位移距离 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">水平位移</span>
                    <span className="text-xs text-cyan-300">m</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {deformationData.deformation_horizontal !== null ?
                      deformationData.deformation_horizontal.toFixed(3) : '无数据'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    水平方向位移
                  </div>
                </div>

                {/* 垂直位移距离 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">垂直位移</span>
                    <span className="text-xs text-cyan-300">m</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {deformationData.deformation_vertical !== null ?
                      deformationData.deformation_vertical.toFixed(3) : '无数据'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    垂直方向位移
                  </div>
                </div>

                {/* 形变速度 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">形变速度</span>
                    <span className="text-xs text-cyan-300">m/h</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {deformationData.deformation_velocity !== null ?
                      deformationData.deformation_velocity.toFixed(4) : '无数据'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    实时形变速度
                  </div>
                </div>

                {/* 形变风险等级 - 国标四级预警体系 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">风险等级</span>
                    <span className={`text-xs font-medium ${
                      deformationData.deformation_risk_level === 0 ? 'text-green-400' :
                      deformationData.deformation_risk_level === 4 ? 'text-blue-400' :
                      deformationData.deformation_risk_level === 3 ? 'text-yellow-400' :
                      deformationData.deformation_risk_level === 2 ? 'text-orange-400' :
                      deformationData.deformation_risk_level === 1 ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {deformationData.deformation_risk_level === 0 ? '正常' :
                       deformationData.deformation_risk_level === 4 ? 'IV级蓝色' :
                       deformationData.deformation_risk_level === 3 ? 'III级黄色' :
                       deformationData.deformation_risk_level === 2 ? 'II级橙色' :
                       deformationData.deformation_risk_level === 1 ? 'I级红色' : '未知'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {/* 国标四级预警指示器 */}
                    <div className={`w-3 h-3 rounded-full ${deformationData.deformation_risk_level === 0 ? 'bg-green-400' : 'bg-slate-600'}`} title="正常"></div>
                    <div className={`w-3 h-3 rounded-full ${deformationData.deformation_risk_level === 4 ? 'bg-blue-400' : 'bg-slate-600'}`} title="IV级蓝色"></div>
                    <div className={`w-3 h-3 rounded-full ${deformationData.deformation_risk_level === 3 ? 'bg-yellow-400' : 'bg-slate-600'}`} title="III级黄色"></div>
                    <div className={`w-3 h-3 rounded-full ${deformationData.deformation_risk_level === 2 ? 'bg-orange-400' : 'bg-slate-600'}`} title="II级橙色"></div>
                    <div className={`w-3 h-3 rounded-full ${deformationData.deformation_risk_level === 1 ? 'bg-red-400' : 'bg-slate-600'}`} title="I级红色"></div>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    国标GB/T 38509-2020四级预警体系
                  </div>
                </div>

                {/* 基准位置状态 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">基准状态</span>
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  </div>
                  <div className="text-sm font-medium text-green-400">
                    {deformationData.baseline_established ? '已建立基准' : '未建立基准'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    置信度: {deformationData.deformation_confidence !== null ?
                      deformationData.deformation_confidence.toFixed(2) : '无数据'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧形变趋势分析面板 */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden h-full">
              <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                <h3 className="text-sm font-semibold text-cyan-300 flex items-center space-x-2">
                  <span>形变趋势</span>
                </h3>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto">
                {/* 形变类型 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">形变类型</span>
                    <span className="text-xs text-blue-400">
                      {deformationData.deformation_type === 0 ? '无形变' :
                       deformationData.deformation_type === 1 ? '水平' :
                       deformationData.deformation_type === 2 ? '垂直' :
                       deformationData.deformation_type === 3 ? '复合' :
                       deformationData.deformation_type === 4 ? '旋转' : '未知'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      deformationData.deformation_type === 0 ? 'bg-gray-400' :
                      deformationData.deformation_type === 1 ? 'bg-green-400' :
                      deformationData.deformation_type === 2 ? 'bg-yellow-400' :
                      deformationData.deformation_type === 3 ? 'bg-blue-400' :
                      deformationData.deformation_type === 4 ? 'bg-purple-400' : 'bg-gray-400'
                    }`}></div>
                    <span className="text-sm text-white">
                      {deformationData.deformation_type === 0 ? '无形变检测' :
                       deformationData.deformation_type === 1 ? '水平形变' :
                       deformationData.deformation_type === 2 ? '垂直形变' :
                       deformationData.deformation_type === 3 ? '水平+垂直' :
                       deformationData.deformation_type === 4 ? '旋转形变' : '数据缺失'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {deformationData.deformation_type !== null ?
                      (deformationData.deformation_type === 0 ? '设备位置稳定' : '检测到形变') :
                      '等待数据更新'}
                  </div>
                </div>

                {/* 分析置信度 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">置信度</span>
                    <span className="text-xs text-green-400">高</span>
                  </div>
                  <div className="w-full bg-slate-600 rounded-full h-2 mb-2">
                    <div
                      className="bg-green-400 h-2 rounded-full"
                      style={{ width: `${deformationData.deformation_confidence !== null ?
                        (deformationData.deformation_confidence * 100).toFixed(0) : 0}%` }}
                    ></div>
                  </div>
                  <div className="text-sm font-medium text-white">
                    {deformationData.deformation_confidence !== null ?
                      `${(deformationData.deformation_confidence * 100).toFixed(0)}%` : '无数据'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    分析可信度
                  </div>
                </div>

                {/* 当前形变数据 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">当前形变</span>
                    <span className={`text-xs ${
                      deformationData.deformation_type === 0 ? 'text-green-400' :
                      deformationData.deformation_risk_level === 0 ? 'text-green-400' :
                      deformationData.deformation_risk_level === 4 ? 'text-blue-400' :
                      deformationData.deformation_risk_level === 3 ? 'text-yellow-400' :
                      deformationData.deformation_risk_level === 2 ? 'text-orange-400' :
                      deformationData.deformation_risk_level === 1 ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {deformationData.deformation_type === 0 ? '无形变' :
                       deformationData.deformation_risk_level === 0 ? '稳定' :
                       deformationData.deformation_risk_level === 4 ? '轻微' :
                       deformationData.deformation_risk_level === 3 ? '中等' :
                       deformationData.deformation_risk_level === 2 ? '较大' :
                       deformationData.deformation_risk_level === 1 ? '严重' : '未知'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">3D位移</span>
                    <span className="text-white">
                      {deformationData.deformation_distance_3d !== null ?
                        `${deformationData.deformation_distance_3d.toFixed(3)}m` : '无数据'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-slate-400">形变速度</span>
                    <span className="text-white">
                      {deformationData.deformation_velocity !== null ?
                        `${deformationData.deformation_velocity.toFixed(4)}m/s` : '无数据'}
                    </span>
                  </div>
                </div>

                {/* 预警状态 - 国标四级预警体系 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">预警状态</span>
                    <div className={`w-2 h-2 rounded-full ${
                      deformationData.deformation_risk_level === 0 ? 'bg-green-400' :
                      deformationData.deformation_risk_level === 4 ? 'bg-blue-400 animate-pulse' :
                      deformationData.deformation_risk_level === 3 ? 'bg-yellow-400 animate-pulse' :
                      deformationData.deformation_risk_level === 2 ? 'bg-orange-400 animate-pulse' :
                      deformationData.deformation_risk_level === 1 ? 'bg-red-400 animate-pulse' : 'bg-gray-400'
                    }`}></div>
                  </div>
                  <div className={`text-sm font-medium ${
                    deformationData.deformation_risk_level === 0 ? 'text-green-400' :
                    deformationData.deformation_risk_level === 4 ? 'text-blue-400' :
                    deformationData.deformation_risk_level === 3 ? 'text-yellow-400' :
                    deformationData.deformation_risk_level === 2 ? 'text-orange-400' :
                    deformationData.deformation_risk_level === 1 ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {deformationData.deformation_risk_level === 0 ? '正常监测' :
                     deformationData.deformation_risk_level === 4 ? 'IV级蓝色预警' :
                     deformationData.deformation_risk_level === 3 ? 'III级黄色预警' :
                     deformationData.deformation_risk_level === 2 ? 'II级橙色预警' :
                     deformationData.deformation_risk_level === 1 ? 'I级红色预警' : '状态未知'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {deformationData.deformation_risk_level === 0 ? '未达到预警标准' :
                     deformationData.deformation_risk_level === 4 ? '风险一般，可能性较小' :
                     deformationData.deformation_risk_level === 3 ? '风险较高，有一定可能性' :
                     deformationData.deformation_risk_level === 2 ? '风险高，可能性较大' :
                     deformationData.deformation_risk_level === 1 ? '风险很高，可能性很大' : '状态异常'}
                  </div>
                </div>

                {/* 基准状态 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">基准状态</span>
                    <span className={`text-xs ${deformationData.baseline_established ? 'text-green-400' : 'text-yellow-400'}`}>
                      {deformationData.baseline_established ? '已建立' : '未建立'}
                    </span>
                  </div>
                  <div className="text-sm text-white">
                    {deformationData.baseline_established ? '基准点正常' : '等待建立基准'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {deformationData.baseline_established ? 'GPS基准位置已确定' : '需要建立GPS基准位置'}
                  </div>
                </div>

                {/* 历史对比 */}
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">历史对比</span>
                    <span className="text-xs text-cyan-400">本周</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">位移变化</span>
                      <span className="text-green-300">
                        {deformationData.deformation_distance_3d !== null ?
                          `+${(deformationData.deformation_distance_3d * 0.1).toFixed(3)}m` : '无数据'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">速度变化</span>
                      <span className="text-blue-300">
                        {deformationData.deformation_velocity !== null ?
                          `-${(deformationData.deformation_velocity * 0.2).toFixed(4)}m/h` : '无数据'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* 扩展功能区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* 数据统计 */}
          <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden h-full">
            <div className="px-4 py-2 bg-slate-700/50 border-b border-slate-600">
              <h3 className="text-sm font-semibold text-cyan-300">数据统计</h3>
            </div>
            <div className="p-3">
              <div className="text-center mb-3">
                <div className="text-2xl font-bold text-cyan-300 mb-1">{deviceInfo.data_count_today}</div>
                <div className="text-sm text-slate-300 font-medium">今日采集数据</div>
                <div className="text-xs text-slate-500">Data Points Today</div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">安装日期</span>
                  <span className="text-white font-medium">{deviceInfo.install_date}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">运行天数</span>
                  <span className="text-white font-medium">
                    {Math.floor((Date.now() - new Date(deviceInfo.install_date).getTime()) / (1000 * 60 * 60 * 24))} 天
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">采样频率</span>
                  <span className="text-white font-medium">1分钟/次</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">总数据量</span>
                  <span className="text-cyan-300 font-medium">
                    {(deviceInfo.data_count_today * Math.floor((Date.now() - new Date(deviceInfo.install_date).getTime()) / (1000 * 60 * 60 * 24)) * 0.8).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 地理位置信息 */}
          <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden h-full">
            <div className="px-4 py-2 bg-slate-700/50 border-b border-slate-600">
              <h3 className="text-sm font-semibold text-cyan-300">地理位置信息</h3>
            </div>
            <div className="p-3">
              <div className="h-16 bg-slate-700/30 border border-slate-600 rounded-lg flex items-center justify-center relative overflow-hidden mb-3">
                {/* 地图网格背景 */}
                <div className="absolute inset-0 opacity-20">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="absolute border-cyan-400/30" style={{
                      left: `${i * 12.5}%`,
                      top: 0,
                      bottom: 0,
                      borderLeft: '1px solid'
                    }} />
                  ))}
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="absolute border-cyan-400/30" style={{
                      top: `${i * 16.67}%`,
                      left: 0,
                      right: 0,
                      borderTop: '1px solid'
                    }} />
                  ))}
                </div>

                <div className="text-center relative z-10">
                  <EnvironmentOutlined className="text-xl text-red-400 mb-1" />
                  <div className="text-xs font-bold text-white">{deviceInfo.display_name}</div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">安装位置</span>
                  <span className="text-white text-right">{deviceInfo.location}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">经度坐标</span>
                  <span className="text-cyan-300 font-mono">{deviceInfo.coordinates.lng}°E</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">纬度坐标</span>
                  <span className="text-cyan-300 font-mono">{deviceInfo.coordinates.lat}°N</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">海拔高度</span>
                  <span className="text-white">约 125m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">地理区域</span>
                  <span className="text-white">华南地区</span>
                </div>
              </div>
            </div>
          </div>

          {/* 报警与通知 */}
          <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden h-full">
            <div className="px-4 py-2 bg-slate-700/50 border-b border-slate-600">
              <h3 className="text-sm font-semibold text-cyan-300">报警与通知</h3>
            </div>
            <div className="p-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-green-500/10 border border-green-400/30 rounded">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-xs text-green-300">系统正常</span>
                  </div>
                  <span className="text-xs text-slate-400">刚刚</span>
                </div>

                <div className="flex items-center justify-between p-2 bg-yellow-500/10 border border-yellow-400/30 rounded">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                    <span className="text-xs text-yellow-300">电量提醒</span>
                  </div>
                  <span className="text-xs text-slate-400">2小时前</span>
                </div>

                <div className="flex items-center justify-between p-2 bg-blue-500/10 border border-blue-400/30 rounded">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-xs text-blue-300">数据同步</span>
                  </div>
                  <span className="text-xs text-slate-400">1天前</span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-600">
                <button className="w-full px-3 py-2 text-xs bg-slate-700 text-slate-300 border border-slate-600 rounded hover:bg-slate-600 transition-colors">
                  查看所有通知
                </button>
              </div>
            </div>
          </div>

          {/* 数据导出与维护 */}
          <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden h-full">
            <div className="px-4 py-2 bg-slate-700/50 border-b border-slate-600">
              <h3 className="text-sm font-semibold text-cyan-300">数据导出与维护</h3>
            </div>
            <div className="p-3">
              <div className="space-y-2">
                <button
                  onClick={() => handleExportData('today')}
                  disabled={loading}
                  className="w-full px-3 py-2 text-xs bg-green-500/20 text-green-300 border border-green-400 rounded hover:bg-green-500/30 disabled:opacity-50 transition-colors"
                >
                  导出今日数据
                </button>

                <button
                  onClick={() => handleExportData('history')}
                  disabled={loading}
                  className="w-full px-3 py-2 text-xs bg-blue-500/20 text-blue-300 border border-blue-400 rounded hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
                >
                  导出历史数据
                </button>

                <button
                  onClick={() => handleGenerateReport('daily')}
                  disabled={loading}
                  className="w-full px-3 py-2 text-xs bg-purple-500/20 text-purple-300 border border-purple-400 rounded hover:bg-purple-500/30 disabled:opacity-50 transition-colors"
                >
                  生成报告
                </button>

                <button
                  onClick={handleDeviceDiagnostics}
                  disabled={loading}
                  className="w-full px-3 py-2 text-xs bg-orange-500/20 text-orange-300 border border-orange-400 rounded hover:bg-orange-500/30 disabled:opacity-50 transition-colors"
                >
                  设备诊断
                </button>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-600">
                <div className="bg-slate-700/30 p-2 rounded-lg">
                  <div className="text-xs text-slate-400 mb-2">维护信息</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">上次维护</span>
                      <span className="text-slate-300">2024-12-15</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">下次维护</span>
                      <span className="text-yellow-300">2025-03-15</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 设备详情模态框 - 深色风格 */}
        <Modal
          title={
            <div className="flex items-center space-x-2 text-cyan-300">
              <DesktopOutlined className="text-cyan-400" />
              <span>设备详细信息</span>
            </div>
          }
          open={detailModalVisible}
          onCancel={() => setDetailModalVisible(false)}
          footer={
            <div className="flex justify-end space-x-3 px-2">
              <Button
                key="close"
                onClick={() => setDetailModalVisible(false)}
                className="bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600"
                size="middle"
              >
                关闭
              </Button>
              <Button
                key="edit"
                type="primary"
                onClick={() => {
                  setDetailModalVisible(false);
                  setEditModalVisible(true);
                }}
                className="bg-cyan-500 hover:bg-cyan-600 border-cyan-500"
                size="middle"
              >
                编辑设备
              </Button>
            </div>
          }
          width={800}
          className="dark-modal"
        >
          <div className="bg-slate-800 p-4 rounded-lg">
            <Descriptions bordered column={2} size="middle" className="dark-descriptions">
              <Descriptions.Item label="设备ID" span={1}>
                <Text code className="bg-slate-700 px-2 py-1 rounded text-cyan-300">{deviceInfo.device_id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="显示名称" span={1}>
                <Text strong className="text-white">{deviceInfo.display_name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="真实设备名称" span={2}>
                <Text code className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">{deviceInfo.real_name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="设备类型" span={1}>
                <Tag color="blue" className="bg-blue-500/20 text-blue-300 border-blue-400">{deviceInfo.device_type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="固件版本" span={1}>
                <Tag color="green" className="bg-green-500/20 text-green-300 border-green-400">{deviceInfo.firmware_version}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="安装位置" span={2}>
                <div className="flex items-center space-x-2">
                  <EnvironmentOutlined className="text-red-400" />
                  <span className="text-white">{deviceInfo.location}</span>
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="坐标信息" span={2}>
                <span className="text-cyan-300 font-mono">
                  经度: {deviceInfo.coordinates.lng}° | 纬度: {deviceInfo.coordinates.lat}°
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="安装日期" span={1}>
                <span className="text-white">{deviceInfo.install_date}</span>
              </Descriptions.Item>
              <Descriptions.Item label="设备状态" span={1}>
                <Badge
                  status={deviceInfo.status === 'online' ? 'success' : 'error'}
                  text={
                    <span className={`font-medium ${deviceInfo.status === 'online' ? 'text-green-400' : 'text-red-400'}`}>
                      {deviceInfo.status === 'online' ? '在线' : '离线'}
                    </span>
                  }
                />
              </Descriptions.Item>
              <Descriptions.Item label="健康度" span={1}>
                <div className="flex items-center space-x-3">
                  <div className="flex-1 max-w-24">
                    <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${deviceInfo.health_score}%`,
                          backgroundColor: getHealthColor(deviceInfo.health_score)
                        }}
                      ></div>
                    </div>
                  </div>
                  <span className="text-white font-medium">{deviceInfo.health_score}%</span>
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="今日数据量" span={1}>
                <span className="text-cyan-300 font-bold">{deviceInfo.data_count_today} 条</span>
              </Descriptions.Item>
              <Descriptions.Item label="最新数据时间" span={2}>
                <span className="text-white">{new Date(deviceInfo.last_data_time).toLocaleString()}</span>
              </Descriptions.Item>
            </Descriptions>
          </div>
        </Modal>

        {/* 编辑设备模态框 - 深色风格 */}
        <Modal
          title={
            <div className="flex items-center space-x-2 text-cyan-300">
              <SettingOutlined className="text-cyan-400" />
              <span>设备配置</span>
            </div>
          }
          open={editModalVisible}
          onCancel={() => setEditModalVisible(false)}
          onOk={() => form.submit()}
          confirmLoading={loading}
          width={700}
          okText="保存"
          cancelText="取消"
          className="dark-modal"
          okButtonProps={{
            className: "bg-cyan-500 hover:bg-cyan-600 border-cyan-500"
          }}
          cancelButtonProps={{
            className: "bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600"
          }}
        >
          <div className="bg-slate-800 p-4 rounded-lg">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              initialValues={deviceInfo}
              className="dark-form"
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label={<span className="text-slate-300">设备ID</span>}
                    name="device_id"
                  >
                    <Input disabled prefix={<DesktopOutlined />} className="bg-slate-700 text-cyan-300 border-slate-600" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label={<span className="text-slate-300">设备类型</span>}
                    name="device_type"
                  >
                    <Input placeholder="例如：软通套件" className="bg-slate-700 text-white border-slate-600 placeholder-slate-400" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                label={<span className="text-slate-300">显示名称</span>}
                name="display_name"
                rules={[{ required: true, message: '请输入显示名称' }]}
              >
                <Input placeholder="例如：龙门滑坡监测站" className="bg-slate-700 text-white border-slate-600 placeholder-slate-400" />
              </Form.Item>

              <Form.Item
                label={<span className="text-slate-300">安装位置</span>}
                name="location"
                rules={[{ required: true, message: '请输入安装位置' }]}
              >
                <Input placeholder="例如：防城港华石镇龙门村" className="bg-slate-700 text-white border-slate-600 placeholder-slate-400" />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label={<span className="text-slate-300">固件版本</span>}
                    name="firmware_version"
                  >
                    <Input placeholder="例如：v2.1.3" className="bg-slate-700 text-white border-slate-600 placeholder-slate-400" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label={<span className="text-slate-300">安装日期</span>}
                    name="install_date"
                  >
                    <Input placeholder="例如：2025-06-01" className="bg-slate-700 text-white border-slate-600 placeholder-slate-400" />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </div>
        </Modal>

        {/* 自定义命令模态框 */}
        <Modal
          title={
            <div className="flex items-center space-x-2 text-cyan-300">
              <ThunderboltOutlined className="text-cyan-400" />
              <span>自定义命令</span>
            </div>
          }
          open={commandModalVisible}
          onCancel={() => {
            setCommandModalVisible(false);
            commandForm.resetFields();
          }}
          onOk={() => commandForm.submit()}
          confirmLoading={controlLoading}
          width={600}
          okText="发送命令"
          cancelText="取消"
          className="dark-modal"
          okButtonProps={{
            className: "bg-purple-500 hover:bg-purple-600 border-purple-500"
          }}
          cancelButtonProps={{
            className: "bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600"
          }}
        >
          <div className="bg-slate-800 p-4 rounded-lg">
            <Form
              form={commandForm}
              layout="vertical"
              onFinish={handleCustomCommand}
              className="dark-form"
            >
              <Form.Item
                label={<span className="text-slate-300">服务ID</span>}
                name="service_id"
                rules={[{ required: true, message: '请输入服务ID' }]}
              >
                <Input
                  placeholder="例如: IntelligentCockpit"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </Form.Item>

              <Form.Item
                label={<span className="text-slate-300">命令名称</span>}
                name="command_name"
                rules={[{ required: true, message: '请输入命令名称' }]}
              >
                <Input
                  placeholder="例如: light_control"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </Form.Item>

              <Form.Item
                label={<span className="text-slate-300">命令参数 (JSON格式)</span>}
                name="paras"
                rules={[
                  { required: true, message: '请输入命令参数' },
                  {
                    validator: (_, value) => {
                      if (!value) return Promise.resolve();
                      try {
                        JSON.parse(value);
                        return Promise.resolve();
                      } catch {
                        return Promise.reject(new Error('请输入有效的JSON格式'));
                      }
                    }
                  }
                ]}
              >
                <Input.TextArea
                  rows={4}
                  placeholder='例如: {"onoff": "ON"}'
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </Form.Item>

              <div className="bg-slate-700/50 p-3 rounded-lg">
                <div className="text-xs text-slate-400 mb-2">常用命令示例：</div>
                <div className="space-y-1 text-xs">
                  <div className="text-slate-300">
                    <span className="text-blue-400">电机控制:</span> service_id: &quot;smartHome&quot;, command_name: &quot;control_motor&quot;
                  </div>
                  <div className="text-slate-300">
                    参数: {'{'}&#34;enable&#34;: true, &#34;speed&#34;: 100, &#34;direction&#34;: 1, &#34;duration&#34;: 5000{'}'}
                  </div>
                  <div className="text-slate-300">
                    <span className="text-yellow-400">蜂鸣器控制:</span> service_id: &quot;smartHome&quot;, command_name: &quot;control_buzzer&quot;
                  </div>
                  <div className="text-slate-300">
                    参数: {'{'}&#34;enable&#34;: true, &#34;frequency&#34;: 2000, &#34;duration&#34;: 3000, &#34;pattern&#34;: 2{'}'}
                  </div>
                </div>
              </div>
            </Form>
          </div>
        </Modal>

        {/* 深色主题样式 */}
        <style jsx global>{`
        /* 深色模态框样式 - 更强的覆盖 */
        .ant-modal-mask {
          background: rgba(0, 0, 0, 0.8) !important;
        }

        .dark-modal .ant-modal-content,
        .ant-modal-content {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important;
          border: 1px solid #475569 !important;
          border-radius: 12px !important;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8) !important;
        }

        .dark-modal .ant-modal-header,
        .ant-modal-header {
          background: rgba(30, 41, 59, 0.9) !important;
          border-bottom: 1px solid #475569 !important;
          border-radius: 12px 12px 0 0 !important;
        }

        .dark-modal .ant-modal-title,
        .ant-modal-title {
          color: #06b6d4 !important;
        }

        .dark-modal .ant-modal-close,
        .ant-modal-close {
          color: rgba(148, 163, 184, 0.8) !important;
        }

        .dark-modal .ant-modal-close:hover,
        .ant-modal-close:hover {
          color: #06b6d4 !important;
          background: rgba(6, 182, 212, 0.1) !important;
        }

        .dark-modal .ant-modal-footer,
        .ant-modal-footer {
          background: rgba(30, 41, 59, 0.9) !important;
          border-top: 1px solid #475569 !important;
          border-radius: 0 0 12px 12px !important;
          padding: 16px 24px !important;
          text-align: right !important;
        }

        .dark-modal .ant-modal-footer .ant-btn,
        .ant-modal-footer .ant-btn {
          margin-left: 8px !important;
          margin-right: 0 !important;
        }

        .dark-modal .ant-modal-body,
        .ant-modal-body {
          background: transparent !important;
          color: white !important;
        }

        /* 深色描述列表样式 - 更强的覆盖 */
        .dark-descriptions .ant-descriptions-item-label,
        .ant-descriptions-item-label {
          background: #374151 !important;
          color: #94a3b8 !important;
          font-weight: 500 !important;
          border-color: #475569 !important;
        }

        .dark-descriptions .ant-descriptions-item-content,
        .ant-descriptions-item-content {
          background: #1e293b !important;
          color: white !important;
          border-color: #475569 !important;
        }

        .dark-descriptions .ant-descriptions-view,
        .ant-descriptions-view {
          border-color: #475569 !important;
        }

        .dark-descriptions .ant-descriptions-row,
        .ant-descriptions-row {
          border-color: #475569 !important;
        }

        /* 深色表单样式 - 更强的覆盖 */
        .dark-form .ant-form-item-label > label,
        .ant-form-item-label > label {
          color: #94a3b8 !important;
        }

        .dark-form .ant-input,
        .ant-input {
          background: #374151 !important;
          border-color: #475569 !important;
          color: white !important;
        }

        .dark-form .ant-input:focus,
        .dark-form .ant-input:hover,
        .ant-input:focus,
        .ant-input:hover {
          border-color: #06b6d4 !important;
          box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.2) !important;
        }

        .dark-form .ant-input:disabled,
        .ant-input:disabled {
          background: #1e293b !important;
          color: #06b6d4 !important;
        }

        .dark-form .ant-input::placeholder,
        .ant-input::placeholder {
          color: #64748b !important;
        }

        /* 按钮样式 */
        .ant-btn-primary {
          background: #06b6d4 !important;
          border-color: #06b6d4 !important;
        }

        .ant-btn-primary:hover {
          background: #0891b2 !important;
          border-color: #0891b2 !important;
        }

        .ant-btn-default {
          background: #374151 !important;
          border-color: #475569 !important;
          color: #94a3b8 !important;
        }

        .ant-btn-default:hover {
          background: #475569 !important;
          border-color: #64748b !important;
          color: #06b6d4 !important;
        }

        .ant-progress-bg {
          border-radius: 4px;
        }

        .ant-progress-inner {
          background: #374151 !important;
          border-radius: 4px;
        }

        .ant-tag {
          border-radius: 6px;
          font-weight: 500;
        }

        /* 滚动条样式 */
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }

        ::-webkit-scrollbar-track {
          background: #1e293b;
          border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
      `}</style>
      </div>
    </div>
  );
}
