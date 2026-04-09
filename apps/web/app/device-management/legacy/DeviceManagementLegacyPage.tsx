'use client'

import { useState, useEffect, useCallback, useMemo } from 'react';
import { message, Modal, Select, Button, Space } from 'antd';
import {
  ReloadOutlined,
  ExportOutlined,
  SettingOutlined,
  DesktopOutlined
} from '@ant-design/icons';
import Link from 'next/link';
import HoverSidebar from '../../analysis/legacy/components/HoverSidebar';
import MonitoringStationManagement from './components/MonitoringStationManagement';
import BaselineManagementV2 from '../../baseline-management/legacy/components/BaselineManagementV2';
import { apiGetJson } from '../../../lib/v2Api';
import { loadDeviceSnapshotView, type DeviceSnapshotView } from '../../../lib/api/deviceStateView';
import { useHierarchicalDevices } from './hooks/useHierarchicalDevices';
// import RealTimeMapComponent from '../map/RealTimeMapComponent';

const { Option } = Select;

export default function DeviceManagementPage() {
  // 活跃标签页状态
  const [activeTab, setActiveTab] = useState('status');
  
  // 加载状态
  const [loading, setLoading] = useState(false);
  
  // 设备详情模态框状态
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  
  // 最后更新时间
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');
  
  // 实时传感器数据
  const [sensorData, setSensorData] = useState<any[]>([]);
  const [sensorLoading, setSensorLoading] = useState(false);
  
  // 实时数据状态
  const [realTimeData, setRealTimeData] = useState<any>(null);
  const [deviceSnapshot, setDeviceSnapshot] = useState<DeviceSnapshotView | null>(null);
  const [deviceSnapshotSource, setDeviceSnapshotSource] = useState<string>('');
  
  // 当前选择的设备和区域
  const [selectedDevice, setSelectedDevice] = useState('device_1');
  const [selectedRegion, setSelectedRegion] = useState('all');
  
  // 使用分层设备数据Hook
  const { data: hierarchicalData, loading: devicesLoading, error: devicesError, getDeviceBySimpleId } = useHierarchicalDevices();
  
  // 设备信息状态 - 基于选中的设备动态更新
  const getCurrentDeviceInfo = () => {
    const device = getDeviceBySimpleId(selectedDevice);
    const activeSnapshot = deviceSnapshotSource === selectedDevice ? deviceSnapshot : null;
    if (device) {
      return {
        device_id: device.simple_id,
        display_name: device.device_name,
        device_type: device.device_type,
        firmware_version: 'v2.1.3',
        location: device.location_name,
        install_date: device.install_date,
        status: activeSnapshot?.status || device.online_status,
        health_score: activeSnapshot?.health_score ?? ((device as any).health_score || 0),
        battery_level: activeSnapshot?.battery_level ?? ((device as any).battery_level || 0),
        signal_strength: activeSnapshot?.signal_strength ?? ((device as any).signal_strength || 0),
        data_count_today: activeSnapshot?.data_count_today ?? ((device as any).today_data_count || 0),
        last_data_time: activeSnapshot?.last_data_time || device.last_data_time,
        temperature: activeSnapshot?.temperature ?? 15.99,
        humidity: activeSnapshot?.humidity ?? 84.70,
        coordinates: {
          lat: activeSnapshot?.coordinates.lat ?? device.latitude,
          lng: activeSnapshot?.coordinates.lng ?? device.longitude
        },
        baseline_established: activeSnapshot?.baseline_established ?? ((device as any).baseline_established || false)
      };
    }
    
    // 默认设备信息
    return {
      device_id: 'device_1',
      display_name: '龙门滑坡监测站',
      device_type: 'GPS监测站',
      firmware_version: 'v2.1.3',
      location: '防城港华石镇龙门村',
      install_date: '2025-06-01',
      status: 'online',
      health_score: 100,
      battery_level: 85,
      signal_strength: 95,
      data_count_today: 500,
      last_data_time: new Date().toISOString(),
      temperature: 15.99,
      humidity: 84.70,
      coordinates: {
        lat: 22.684674,
        lng: 110.189371
      },
      baseline_established: false
    };
  };
  
  const deviceInfo = getCurrentDeviceInfo();
  const coordinatesLat = deviceInfo.coordinates?.lat;
  const coordinatesLng = deviceInfo.coordinates?.lng;

  // 获取实时数据
  const fetchRealTimeData = useCallback(async (showMessage = false) => {
    try {
      if (showMessage) setLoading(true);
      setSensorLoading(true);

      const snapshot = await loadDeviceSnapshotView(selectedDevice);
      setDeviceSnapshot(snapshot);
      setDeviceSnapshotSource(selectedDevice);
      setRealTimeData((prev: any) => ({
        ...(prev || {}),
        mapCenter:
          snapshot.coordinates.lat != null && snapshot.coordinates.lng != null
            ? [snapshot.coordinates.lng, snapshot.coordinates.lat]
            : prev?.mapCenter || [110.189371, 22.684674],
        lastUpdate: snapshot.last_data_time,
      }));
      setLastUpdateTime(new Date().toLocaleTimeString('zh-CN'));

      if (showMessage) {
        const device = getDeviceBySimpleId(selectedDevice);
        message.success(`${snapshot.display_name || device?.device_name || selectedDevice} 数据刷新成功`);
      }
    } catch (error) {
      console.error('获取实时数据错误:', error);
      if (showMessage) {
        message.error('获取数据失败: 网络连接错误');
      }
    } finally {
      setSensorLoading(false);
      if (showMessage) setLoading(false);
    }
  }, [selectedDevice, getDeviceBySimpleId]);

  // 设备诊断处理 - 接入 v2 expert API（legacy compat）
  const handleDeviceDiagnostics = useCallback(async () => {
    try {
      setLoading(true);
      const device = getDeviceBySimpleId(selectedDevice);
      if (!device) {
        message.error('未找到选中的设备');
        return;
      }

      const deviceKey = (device as any).actual_device_id || selectedDevice;
      const result = await apiGetJson<any>(
        `/api/device-health-expert?device_id=${encodeURIComponent(deviceKey)}&metric=all`,
      );

      if (result.success) {
        const expert = result.data || {};
        const health = expert.health || {};
        const battery = expert.battery || {};
        const signal = expert.signal || {};

        const healthScore = typeof health.score === 'number' ? health.score : 0;
        const healthLevel = typeof health.level === 'string' ? health.level : 'bad';
        const overall_status = healthLevel === 'good' ? 'healthy' : healthLevel === 'warn' ? 'warning' : 'error';

        const dataFreshnessScore =
          typeof health.components?.dataFreshnessScore === 'number' ? health.components.dataFreshnessScore : null;
        const data_quality = dataFreshnessScore != null && dataFreshnessScore >= 70 ? 'normal' : 'abnormal';

        const strength = typeof signal.strength === 'number' ? signal.strength : null;
        const connection_status = strength != null && strength >= 70 ? 'stable' : 'unstable';

        const baselineEstablished = Boolean((device as any).baseline_established);
        const baseline_status = baselineEstablished ? 'active' : 'inactive';

        const recommendations: string[] = [];
        for (const w of battery.warnings || []) recommendations.push(w);
        for (const w of signal.warnings || []) recommendations.push(w);
        for (const w of health.warnings || []) recommendations.push(w);
        if (!baselineEstablished) recommendations.push('建议尽快建立/更新 GPS 基准点以提升形变评估准确性');
        if (recommendations.length === 0) recommendations.push('设备运行状态良好，建议保持定期巡检');

        const diagnostics = {
          overall_status,
          health_score: healthScore,
          data_quality,
          connection_status,
          baseline_status,
          performance_metrics: {
            today_data_count: (device as any).today_data_count || 0,
            avg_response_time: 0,
            last_communication: device.last_data_time,
          },
          recommendations,
        };
        
        Modal.info({
          title: (
            <div className="flex items-center space-x-2">
              <span className="text-cyan-500">🔧</span>
              <span>设备诊断结果 - {device.device_name}</span>
            </div>
          ),
          content: (
            <div className="space-y-4 mt-4">
              {/* 整体状态 */}
              <div className="bg-slate-50 p-3 rounded">
                <div className="flex justify-between items-center">
                  <span className="font-medium">整体状态:</span>
                  <span className={`px-2 py-1 rounded text-sm ${
                    diagnostics.overall_status === 'healthy' ? 'bg-green-100 text-green-700' : 
                    diagnostics.overall_status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {diagnostics.overall_status === 'healthy' ? '健康' : 
                     diagnostics.overall_status === 'warning' ? '需要关注' : '异常'}
                  </span>
                </div>
              </div>

              {/* 详细指标 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-sm text-gray-600">健康评分:</span>
                  <div className="font-medium text-lg">{diagnostics.health_score}%</div>
                </div>
                <div>
                  <span className="text-sm text-gray-600">数据质量:</span>
                  <div className={`font-medium ${diagnostics.data_quality === 'normal' ? 'text-green-600' : 'text-red-600'}`}>
                    {diagnostics.data_quality === 'normal' ? '正常' : '异常'}
                  </div>
                </div>
                <div>
                  <span className="text-sm text-gray-600">连接状态:</span>
                  <div className={`font-medium ${diagnostics.connection_status === 'stable' ? 'text-green-600' : 'text-yellow-600'}`}>
                    {diagnostics.connection_status === 'stable' ? '稳定' : '不稳定'}
                  </div>
                </div>
                <div>
                  <span className="text-sm text-gray-600">基准点:</span>
                  <div className={`font-medium ${diagnostics.baseline_status === 'active' ? 'text-green-600' : 'text-orange-600'}`}>
                    {diagnostics.baseline_status === 'active' ? '已建立' : '待建立'}
                  </div>
                </div>
              </div>

              {/* 性能指标 */}
              {diagnostics.performance_metrics && (
                <div>
                  <div className="font-medium mb-2">性能指标:</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>今日数据量:</span>
                      <span>{diagnostics.performance_metrics.today_data_count}条</span>
                    </div>
                    <div className="flex justify-between">
                      <span>平均响应时间:</span>
                      <span>{diagnostics.performance_metrics.avg_response_time}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span>最后通信时间:</span>
                      <span>{new Date(diagnostics.performance_metrics.last_communication).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 建议 */}
              {diagnostics.recommendations && diagnostics.recommendations.length > 0 && (
                <div>
                  <div className="font-medium mb-2">诊断建议:</div>
                  <ul className="list-disc list-inside space-y-1 text-sm bg-blue-50 p-3 rounded">
                    {diagnostics.recommendations.map((rec: string, index: number) => (
                      <li key={index} className="text-blue-800">{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-xs text-gray-500 mt-4 pt-3 border-t">
                诊断时间: {new Date().toLocaleString('zh-CN')}
              </div>
            </div>
          ),
          width: 600,
          okText: '确定'
        });
        
        message.success('设备诊断完成');
      } else {
        message.error(`设备诊断失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('设备诊断失败:', error);
      const msg = error instanceof Error ? error.message : '网络连接错误';
      message.error(`设备诊断失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, getDeviceBySimpleId]);

  // 设备控制函数
  const handleDeviceControl = useCallback((action: string) => {
    message.info(`${action} 命令已发送到 ${selectedDevice}`);
    // TODO: 实现真实的设备控制逻辑
  }, [selectedDevice]);

  // 切换设备
  const handleDeviceSwitch = useCallback((deviceId: string) => {
    const device = getDeviceBySimpleId(deviceId);
    if (device) {
      setSelectedDevice(deviceId);
      message.success(`已切换到 ${device.device_name}`);
    }
  }, [getDeviceBySimpleId]);

  // 获取当前区域的设备列表
  const getFilteredDevices = useCallback(() => {
    if (selectedRegion === 'all') {
      return hierarchicalData.allDevices;
    }
    
    const region = hierarchicalData.regions.find(r => r.id === selectedRegion);
    return region ? region.devices : [];
  }, [hierarchicalData, selectedRegion]);

  // 获取可用设备列表
  const getDevicesForMap = useCallback(() => {
    return [
      {
        id: 'device_1',
        name: '龙门滑坡监测站',
        latitude: 22.684674,
        longitude: 110.189371,
        status: 'online'
      },
      {
        id: 'device_2', 
        name: '华石镇监测站',
        latitude: 22.690000,
        longitude: 110.195000,
        status: 'offline'
      },
      {
        id: 'device_3',
        name: '龙门村监测站', 
        latitude: 22.680000,
        longitude: 110.185000,
        status: 'offline'
      }
    ];
  }, []);

  // 模拟实时数据
  useEffect(() => {
    setRealTimeData({
      mapCenter: [110.189371, 22.684674],
      lastUpdate: new Date().toISOString()
    });
  }, []);

  // 初始化时获取数据
  useEffect(() => {
    fetchRealTimeData();
  }, [fetchRealTimeData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      {/* 侧边栏 */}
      <HoverSidebar />

      <div className="px-4 sm:px-6 lg:px-8">
        {/* 页面标题区域 - 不悬浮，直接贴在顶部 */}
        <div className="mb-6">
          <div className="flex justify-between items-center">
            {/* 左侧 - 标题和导航 */}
            <div className="flex items-center space-x-8">
              <div>
                <h1 className="text-2xl font-bold text-cyan-300">设备管理中心</h1>
                <p className="text-sm text-slate-400 mt-1">Device Management Center</p>
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
                  className="text-cyan-300 bg-slate-700/70 px-4 py-2 text-sm rounded-md font-medium border border-cyan-400/30"
                >
                  设备管理
                </Link>
                <Link
                  href="/gps-deformation"
                  className="text-slate-300 hover:text-cyan-200 px-4 py-2 text-sm rounded-md hover:bg-slate-700/50 transition-all"
                >
                  地质形变监测
                </Link>
                <Link
                  href="/settings"
                  className="text-slate-300 hover:text-cyan-200 px-4 py-2 text-sm rounded-md hover:bg-slate-700/50 transition-all"
                >
                  系统配置
                </Link>
              </nav>
            </div>

            {/* 右侧 - 时间显示 */}
            <div className="flex items-center space-x-4">
              <div className="text-sm text-slate-300 font-mono">
                {new Date().toLocaleTimeString('zh-CN')}
              </div>

              {lastUpdateTime && (
                <div className="text-xs text-slate-400">
                  数据更新: {lastUpdateTime}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* 标签页导航 */}
        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg mb-6">
          <div className="flex justify-between items-center border-b border-slate-600">
            <div className="flex">
              <button
                onClick={() => setActiveTab('status')}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === 'status'
                    ? 'text-cyan-300 bg-slate-700/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                }`}
              >
                设备状态监控
                {activeTab === 'status' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"></div>
                )}
              </button>
              <button
                onClick={() => setActiveTab('management')}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === 'management'
                    ? 'text-cyan-300 bg-slate-700/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                }`}
              >
                监测站管理
                {activeTab === 'management' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"></div>
                )}
              </button>
              <button
                onClick={() => setActiveTab('baselines')}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === 'baselines'
                    ? 'text-cyan-300 bg-slate-700/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                }`}
              >
                基准点管理
                {activeTab === 'baselines' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"></div>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 标签页内容 */}
        {activeTab === 'status' && (
          <>
            {/* 新的设备管理布局 */}
            <div className="space-y-6">
              {/* 设备选择和概览区域 */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* 设备选择器 */}
                <div className="lg:col-span-1">
                  <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden">
                    <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                      <h3 className="text-sm font-semibold text-cyan-300">设备选择</h3>
                      <div className="text-xs text-slate-400 mt-1">
                        总计: {hierarchicalData.totalDevices}台 | 在线: {hierarchicalData.onlineDevices}台
                      </div>
                    </div>
                    <div className="p-4">
                      {/* 区域选择 */}
                      <div className="mb-4">
                        <label className="text-xs text-slate-400 mb-2 block">监测区域</label>
                        <Select
                          value={selectedRegion}
                          onChange={setSelectedRegion}
                          className="w-full"
                          size="small"
                          style={{ 
                            backgroundColor: 'rgba(51, 65, 85, 0.8)', 
                            borderColor: 'rgba(100, 116, 139, 0.5)' 
                          }}
                          dropdownStyle={{ 
                            backgroundColor: 'rgba(51, 65, 85, 0.95)', 
                            border: '1px solid rgba(100, 116, 139, 0.5)' 
                          }}
                        >
                          <Option value="all">全部区域</Option>
                          {hierarchicalData.regions.map(region => (
                            <Option key={region.id} value={region.id}>
                              {region.name} ({region.total_devices}台)
                            </Option>
                          ))}
                        </Select>
                      </div>

                      {/* 设备列表 */}
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 block">监测设备</label>
                        {devicesLoading ? (
                          <div className="text-center py-4">
                            <div className="text-slate-400 text-sm">加载设备列表...</div>
                          </div>
                        ) : getFilteredDevices().length === 0 ? (
                          <div className="text-center py-4">
                            <div className="text-slate-400 text-sm">暂无设备</div>
                          </div>
                        ) : (
                          getFilteredDevices().map((device) => (
                            <div
                              key={device.simple_id}
                              className={`p-3 rounded-lg cursor-pointer transition-all ${
                                selectedDevice === device.simple_id
                                  ? 'bg-cyan-500/20 border border-cyan-400'
                                  : 'bg-slate-700/30 border border-slate-600 hover:bg-slate-600/30'
                              }`}
                              onClick={() => handleDeviceSwitch(device.simple_id)}
                            >
                              <div className="flex items-center space-x-3">
                                <div className={`w-3 h-3 rounded-full ${
                                  device.online_status === 'online' ? 'bg-green-400 animate-pulse' : 
                                  device.online_status === 'maintenance' ? 'bg-yellow-400' : 'bg-slate-500'
                                }`}></div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-white truncate">
                                    {device.device_name}
                                  </div>
                                  <div className="text-xs text-slate-400 truncate">
                                    {device.simple_id} · {device.location_name}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-1">
                                    {device.device_type} · {device.online_status === 'online' ? '在线' : 
                                     device.online_status === 'maintenance' ? '维护中' : '离线'}
                                  </div>
                                </div>
                              </div>
                              {selectedDevice === device.simple_id && (
                                <div className="mt-2 pt-2 border-t border-cyan-400/30">
                                  <div className="text-xs text-cyan-300">当前选中设备</div>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 设备状态概览 */}
                <div className="lg:col-span-2">
                  <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden">
                    <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                      <h3 className="text-sm font-semibold text-cyan-300">设备状态概览</h3>
                      <div className="text-xs text-slate-400 mt-1">
                        设备ID: {deviceInfo.device_id} | 最后活跃: {new Date(deviceInfo.last_data_time).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-3 gap-4">
                        {/* 基本信息 */}
                        <div className="space-y-3">
                          <div className="text-xs text-slate-400 font-medium">基本信息</div>
                          <div className="space-y-2">
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">设备名称</span>
                              <span className="text-sm text-white font-medium">{deviceInfo.display_name}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">设备类型</span>
                              <span className="text-sm text-cyan-300">{deviceInfo.device_type}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">固件版本</span>
                              <span className="text-sm text-white">{deviceInfo.firmware_version}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">安装位置</span>
                              <span className="text-sm text-white truncate" title={deviceInfo.location}>
                                {deviceInfo.location}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">安装日期</span>
                              <span className="text-sm text-slate-300">
                                {new Date(deviceInfo.install_date).toLocaleDateString('zh-CN')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 运行状态 */}
                        <div className="space-y-3">
                          <div className="text-xs text-slate-400 font-medium">运行状态</div>
                          <div className="space-y-2">
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">在线状态</span>
                              <div className="flex items-center space-x-2">
                                <div className={`w-2 h-2 rounded-full ${
                                  deviceInfo.status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                                }`}></div>
                                <span className={`text-sm font-medium ${
                                  deviceInfo.status === 'online' ? 'text-green-400' : 'text-red-400'
                                }`}>
                                  {deviceInfo.status === 'online' ? '在线' : '离线'}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">健康度</span>
                              <div className="flex items-center space-x-2">
                                <div className="flex-1 bg-slate-600 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all duration-300 ${
                                      deviceInfo.health_score > 70 ? 'bg-green-400' :
                                      deviceInfo.health_score > 40 ? 'bg-yellow-400' : 'bg-red-400'
                                    }`}
                                    style={{ width: `${deviceInfo.health_score}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm text-white">{deviceInfo.health_score}%</span>
                              </div>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">电池电量</span>
                              <div className="flex items-center space-x-2">
                                <div className="flex-1 bg-slate-600 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all duration-300 ${
                                      deviceInfo.battery_level > 50 ? 'bg-blue-400' :
                                      deviceInfo.battery_level > 20 ? 'bg-yellow-400' : 'bg-red-400'
                                    }`}
                                    style={{ width: `${deviceInfo.battery_level}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm text-white">{deviceInfo.battery_level}%</span>
                              </div>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">信号强度</span>
                              <div className="flex items-center space-x-2">
                                <div className="flex-1 bg-slate-600 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all duration-300 ${
                                      deviceInfo.signal_strength > 70 ? 'bg-cyan-400' :
                                      deviceInfo.signal_strength > 40 ? 'bg-yellow-400' : 'bg-red-400'
                                    }`}
                                    style={{ width: `${deviceInfo.signal_strength}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm text-white">{deviceInfo.signal_strength}%</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 数据统计 */}
                        <div className="space-y-3">
                          <div className="text-xs text-slate-400 font-medium">数据统计</div>
                          <div className="space-y-2">
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">今日数据</span>
                              <span className="text-sm text-cyan-300 font-medium">{deviceInfo.data_count_today}条</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">基准点状态</span>
                              <span className={`text-sm font-medium ${
                                deviceInfo.baseline_established ? 'text-green-400' : 'text-orange-400'
                              }`}>
                                {deviceInfo.baseline_established ? '已建立' : '待建立'}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">GPS坐标</span>
                              <div className="text-xs text-slate-300 font-mono">
                                <div>{typeof coordinatesLat === 'number' ? `${coordinatesLat.toFixed(6)}°N` : '-'}</div>
                                <div>{typeof coordinatesLng === 'number' ? `${coordinatesLng.toFixed(6)}°E` : '-'}</div>
                              </div>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400">运行时长</span>
                              <span className="text-sm text-slate-300">
                                {Math.floor((Date.now() - new Date(deviceInfo.install_date).getTime()) / (1000 * 60 * 60 * 24))} 天
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 快速操作 */}
                <div className="lg:col-span-1">
                  <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden">
                    <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                      <h3 className="text-sm font-semibold text-cyan-300">快速操作</h3>
                    </div>
                    <div className="p-4">
                      <div className="space-y-2">
                        <button
                          onClick={() => fetchRealTimeData(true)}
                          disabled={loading}
                          className="w-full px-3 py-2 text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-400 rounded hover:bg-cyan-500/30 disabled:opacity-50 transition-colors"
                        >
                          {loading ? '刷新中...' : '刷新数据'}
                        </button>
                        <button
                          onClick={handleDeviceDiagnostics}
                          className="w-full px-3 py-2 text-xs bg-orange-500/20 text-orange-300 border border-orange-400 rounded hover:bg-orange-500/30 transition-colors"
                        >
                          设备诊断
                        </button>
                        <button
                          onClick={() => setDetailModalVisible(true)}
                          className="w-full px-3 py-2 text-xs bg-blue-500/20 text-blue-300 border border-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                        >
                          详细信息
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 设备控制和地图区域 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 设备控制面板 */}
                <div className="lg:col-span-1">
                  <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden">
                    <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                      <h3 className="text-sm font-semibold text-cyan-300">
                        设备控制 - {selectedDevice}
                      </h3>
                    </div>
                    <div className="p-4">
                      <div className="space-y-4">
                        {/* 电机控制 */}
                        <div>
                          <div className="text-sm text-slate-400 mb-3">电机控制</div>
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => handleDeviceControl('启动电机')}
                              className="flex-1 px-3 py-2 text-xs bg-green-500/20 text-green-300 border border-green-400 rounded hover:bg-green-500/30 transition-colors"
                            >
                              启动电机
                            </button>
                            <button 
                              onClick={() => handleDeviceControl('停止电机')}
                              className="flex-1 px-3 py-2 text-xs bg-red-500/20 text-red-300 border border-red-400 rounded hover:bg-red-500/30 transition-colors"
                            >
                              停止电机
                            </button>
                          </div>
                        </div>

                        {/* 蜂鸣器控制 */}
                        <div>
                          <div className="text-sm text-slate-400 mb-3">蜂鸣器控制</div>
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => handleDeviceControl('开启蜂鸣器')}
                              className="flex-1 px-3 py-2 text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-400 rounded hover:bg-yellow-500/30 transition-colors"
                            >
                              开启蜂鸣器
                            </button>
                            <button 
                              onClick={() => handleDeviceControl('关闭蜂鸣器')}
                              className="flex-1 px-3 py-2 text-xs bg-gray-500/20 text-gray-300 border border-gray-400 rounded hover:bg-gray-500/30 transition-colors"
                            >
                              关闭蜂鸣器
                            </button>
                          </div>
                        </div>

                        {/* 系统控制 */}
                        <div>
                          <div className="text-sm text-slate-400 mb-3">系统控制</div>
                          <div className="space-y-2">
                            <button
                              onClick={() => handleDeviceControl('系统重启')}
                              className="w-full px-3 py-2 text-xs bg-orange-500/20 text-orange-300 border border-orange-400 rounded hover:bg-orange-500/30 transition-colors"
                            >
                              系统重启
                            </button>
                            <button
                              onClick={() => handleDeviceControl('自定义命令')}
                              className="w-full px-3 py-2 text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-400 rounded hover:bg-indigo-500/30 transition-colors"
                            >
                              自定义命令
                            </button>
                          </div>
                        </div>

                        {/* 控制历史 */}
                        <div className="pt-3 border-t border-slate-600">
                          <div className="text-sm text-slate-400 mb-3">控制历史</div>
                          <div className="bg-slate-700/30 rounded-lg p-3">
                            <div className="text-xs text-slate-500">
                              暂无控制记录
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 设备位置地图 */}
                <div className="lg:col-span-1">
                  <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden">
                    <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-cyan-300">设备位置地图</h3>
                        <div className="flex items-center space-x-2 text-xs text-slate-400">
                          <span>实时定位</span>
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4">
                      <div className="h-80 bg-slate-700/30 border border-slate-600 rounded-lg overflow-hidden relative">
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center">
                            <div className="text-cyan-300 text-lg mb-2">🗺️ 设备位置地图</div>
                            <div className="text-slate-400 text-sm mb-2">设备位置：{deviceInfo.location}</div>
                            <div className="text-xs text-slate-500 mb-4">地图功能开发中...</div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              {getDevicesForMap().map((device) => (
                                <div
                                  key={device.id}
                                  className={`p-2 rounded border ${
                                    device.status === 'online'
                                      ? 'bg-green-500/20 border-green-400 text-green-300'
                                      : 'bg-slate-600/30 border-slate-500 text-slate-400'
                                  }`}
                                >
                                  <div className="font-medium">{device.id}</div>
                                  <div className="text-xs">{device.status}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* GPS坐标信息 */}
                      <div className="mt-4 bg-slate-700/30 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-2">GPS坐标</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-500">纬度: </span>
                            <span className="text-cyan-300 font-mono">
                              {deviceInfo.coordinates?.lat?.toFixed(6)}°N
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">经度: </span>
                            <span className="text-cyan-300 font-mono">
                              {deviceInfo.coordinates?.lng?.toFixed(6)}°E
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 监测站管理标签页 */}
        {activeTab === 'management' && (
          <div className="space-y-6">
            <MonitoringStationManagement />
          </div>
        )}

        {/* 基准点管理标签页 */}
        {activeTab === 'baselines' && (
          <div className="space-y-6">
            <BaselineManagementV2 />
          </div>
        )}

        {/* 设备详情模态框 */}
        <Modal
          title={
            <div className="flex items-center space-x-2 text-cyan-300">
              <DesktopOutlined className="text-cyan-400" />
              <span>设备详细信息</span>
            </div>
          }
          open={detailModalVisible}
          onCancel={() => setDetailModalVisible(false)}
          footer={null}
          width={800}
          className="dark-modal"
        >
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-slate-300 mb-2">基本信息</div>
                <div className="space-y-1 text-sm">
                  <div><span className="text-slate-400">设备ID:</span> <span className="text-white">{deviceInfo.device_id}</span></div>
                  <div><span className="text-slate-400">设备名称:</span> <span className="text-white">{deviceInfo.display_name}</span></div>
                  <div><span className="text-slate-400">设备类型:</span> <span className="text-white">{deviceInfo.device_type}</span></div>
                  <div><span className="text-slate-400">固件版本:</span> <span className="text-white">{deviceInfo.firmware_version}</span></div>
                  <div><span className="text-slate-400">安装位置:</span> <span className="text-white">{deviceInfo.location}</span></div>
                  <div><span className="text-slate-400">安装日期:</span> <span className="text-white">{deviceInfo.install_date}</span></div>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-slate-300 mb-2">运行状态</div>
                <div className="space-y-1 text-sm">
                  <div><span className="text-slate-400">设备状态:</span> 
                    <span className={`ml-1 ${deviceInfo.status === 'online' ? 'text-green-400' : 'text-red-400'}`}>
                      {deviceInfo.status === 'online' ? '在线' : '离线'}
                    </span>
                  </div>
                  <div><span className="text-slate-400">健康度:</span> <span className="text-green-300">{deviceInfo.health_score}%</span></div>
                  <div><span className="text-slate-400">信号强度:</span> <span className="text-cyan-300">{deviceInfo.signal_strength}%</span></div>
                  <div><span className="text-slate-400">电池电量:</span> <span className="text-blue-300">{deviceInfo.battery_level}%</span></div>
                  <div><span className="text-slate-400">今日数据:</span> <span className="text-white">{deviceInfo.data_count_today}条</span></div>
                  <div><span className="text-slate-400">最后更新:</span> <span className="text-white">{new Date(deviceInfo.last_data_time).toLocaleString('zh-CN')}</span></div>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
