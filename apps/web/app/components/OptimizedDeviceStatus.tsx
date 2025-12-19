'use client';

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Button, Space, Progress, Tooltip, Badge, message } from 'antd';
import { 
  ReloadOutlined, 
  WifiOutlined, 
  ThunderboltOutlined, 
  EnvironmentOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { useOptimizedDeviceData } from '../hooks/useOptimizedDeviceData';
import { useDataAggregation } from '../hooks/useDataAggregation';

interface OptimizedDeviceStatusProps {
  deviceId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  showAggregatedStats?: boolean;
}

const OptimizedDeviceStatus: React.FC<OptimizedDeviceStatusProps> = ({
  deviceId,
  autoRefresh = false,
  refreshInterval = 30000,
  showAggregatedStats = true
}) => {
  const [gpsData, setGpsData] = useState<any[]>([]);
  const [showDashboard, setShowDashboard] = useState(false);

  // 使用优化的设备数据Hook
  const {
    data: deviceData,
    loading,
    error,
    lastUpdateTime,
    refresh,
    fetchGPSData,
    performHealthCheck,
    clearCache,
    isOnline,
    healthStatus
  } = useOptimizedDeviceData({
    deviceId,
    autoRefresh,
    refreshInterval,
    enableCache: true
  });

  // 使用数据聚合Hook
  const {
    loading: aggregationLoading,
    getRealTimeDashboard,
    getDeviceSummary,
    clearAggregationCache,
    getCachedResult
  } = useDataAggregation();

  // 获取GPS数据
  const handleFetchGPSData = async () => {
    try {
      const data = await fetchGPSData(20);
      setGpsData(data || []);
      message.success(`获取到 ${data?.length || 0} 条GPS数据`);
    } catch (error) {
      console.error('获取GPS数据失败:', error);
    }
  };

  // 执行健康检查
  const handleHealthCheck = async () => {
    try {
      const results = await performHealthCheck([deviceId]);
      const deviceResult = results.find((r: any) => r.device_id === deviceId);
      if (deviceResult) {
        message.success(`设备健康检查完成: ${deviceResult.status} (健康度: ${deviceResult.health_score}%)`);
      }
    } catch (error) {
      console.error('健康检查失败:', error);
    }
  };

  // 获取实时仪表板数据
  const handleShowDashboard = async () => {
    try {
      const dashboard = await getRealTimeDashboard('24h', true, true, true);
      if (dashboard) {
        setShowDashboard(true);
        console.log('仪表板数据:', dashboard.data);
      }
    } catch (error) {
      console.error('获取仪表板数据失败:', error);
    }
  };

  // 获取设备摘要
  const handleDeviceSummary = async () => {
    try {
      const summary = await getDeviceSummary([deviceId], '24h', true);
      if (summary) {
        message.success('设备摘要数据已更新');
        console.log('设备摘要:', summary.data);
      }
    } catch (error) {
      console.error('获取设备摘要失败:', error);
    }
  };

  // 清理所有缓存
  const handleClearAllCache = async () => {
    try {
      await Promise.all([
        clearCache(),
        clearAggregationCache()
      ]);
      message.success('所有缓存已清理');
    } catch (error) {
      console.error('清理缓存失败:', error);
    }
  };

  // 获取健康状态颜色
  const getHealthColor = (status: string) => {
    switch (status) {
      case 'excellent': return '#52c41a';
      case 'good': return '#1890ff';
      case 'fair': return '#faad14';
      case 'poor': return '#ff4d4f';
      default: return '#d9d9d9';
    }
  };

  // 获取状态图标
  const getStatusIcon = () => {
    if (loading) return <ClockCircleOutlined />;
    if (error) return <WarningOutlined style={{ color: '#ff4d4f' }} />;
    if (isOnline) return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    return <WarningOutlined style={{ color: '#faad14' }} />;
  };

  if (error) {
    return (
      <Card title="设备状态错误">
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <WarningOutlined style={{ fontSize: '48px', color: '#ff4d4f', marginBottom: '16px' }} />
          <p style={{ color: '#ff4d4f', marginBottom: '16px' }}>{error}</p>
          <Button type="primary" onClick={() => refresh(true)}>
            重试
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      {/* 设备基本状态卡片 */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {getStatusIcon()}
              <span>优化设备状态 - {deviceData?.display_name || deviceId}</span>
              <Badge 
                status={isOnline ? 'success' : 'error'} 
                text={isOnline ? '在线' : '离线'} 
              />
            </div>
            <Space>
              <Tooltip title="刷新设备数据">
                <Button 
                  icon={<ReloadOutlined />} 
                  loading={loading}
                  onClick={() => refresh(true)}
                >
                  刷新
                </Button>
              </Tooltip>
              <Tooltip title="清理缓存">
                <Button 
                  icon={<DeleteOutlined />} 
                  onClick={handleClearAllCache}
                >
                  清理缓存
                </Button>
              </Tooltip>
            </Space>
          </div>
        }
        size="small"
        loading={loading}
      >
        {deviceData && (
          <>
            {/* 第一行：基本信息 */}
            <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
              <Col span={6}>
                <Statistic
                  title="健康度"
                  value={deviceData.health_score}
                  suffix="%"
                  valueStyle={{ color: getHealthColor(healthStatus) }}
                  prefix={
                    <Progress 
                      percent={deviceData.health_score} 
                      size="small" 
                      showInfo={false}
                      strokeColor={getHealthColor(healthStatus)}
                    />
                  }
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="信号强度"
                  value={deviceData.signal_strength}
                  suffix="%"
                  prefix={<WifiOutlined />}
                  valueStyle={{ color: deviceData.signal_strength > 70 ? '#52c41a' : '#faad14' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="电池电量"
                  value={deviceData.battery_level}
                  suffix="%"
                  prefix={<ThunderboltOutlined />}
                  valueStyle={{ color: deviceData.battery_level > 30 ? '#52c41a' : '#ff4d4f' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="今日数据"
                  value={deviceData.data_count_today}
                  suffix="条"
                />
              </Col>
            </Row>

            {/* 第二行：环境数据 */}
            <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
              <Col span={6}>
                <Statistic
                  title="温度"
                  value={deviceData.temperature}
                  suffix="°C"
                  precision={1}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="湿度"
                  value={deviceData.humidity}
                  suffix="%"
                  precision={1}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={6}>
                <div>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>位置</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <EnvironmentOutlined />
                    <span style={{ fontSize: '12px' }}>
                      {deviceData.coordinates.lat.toFixed(4)}, {deviceData.coordinates.lng.toFixed(4)}
                    </span>
                  </div>
                </div>
              </Col>
              <Col span={6}>
                <div>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>最后更新</div>
                  <div style={{ fontSize: '12px' }}>
                    {lastUpdateTime || '未知'}
                  </div>
                </div>
              </Col>
            </Row>

            {/* 操作按钮区 */}
            <Row gutter={[8, 8]}>
              <Col span={6}>
                <Button 
                  block 
                  size="small" 
                  loading={loading}
                  onClick={handleFetchGPSData}
                >
                  获取GPS数据
                </Button>
              </Col>
              <Col span={6}>
                <Button 
                  block 
                  size="small" 
                  loading={loading}
                  onClick={handleHealthCheck}
                >
                  健康检查
                </Button>
              </Col>
              <Col span={6}>
                <Button 
                  block 
                  size="small" 
                  loading={aggregationLoading}
                  onClick={handleDeviceSummary}
                >
                  设备摘要
                </Button>
              </Col>
              <Col span={6}>
                <Button 
                  block 
                  size="small" 
                  loading={aggregationLoading}
                  onClick={handleShowDashboard}
                >
                  实时仪表板
                </Button>
              </Col>
            </Row>

            {/* GPS数据显示 */}
            {gpsData.length > 0 && (
              <Card 
                title={`GPS数据 (${gpsData.length}条)`} 
                size="small" 
                style={{ marginTop: '16px' }}
              >
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {gpsData.slice(0, 5).map((item, index) => (
                    <div key={index} style={{ 
                      padding: '8px', 
                      borderBottom: '1px solid #f0f0f0',
                      fontSize: '12px'
                    }}>
                      <div>时间: {new Date(item.event_time).toLocaleString()}</div>
                      <div>
                        位置: ({item.latitude.toFixed(6)}, {item.longitude.toFixed(6)})
                        {item.deformation_distance_3d && (
                          <span style={{ marginLeft: '16px', color: '#1890ff' }}>
                            位移: {(item.deformation_distance_3d * 1000).toFixed(2)}mm
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* 形变数据显示 */}
            {deviceData.deformation_data && (
              <Card title="形变数据" size="small" style={{ marginTop: '16px' }}>
                <Row gutter={[16, 8]}>
                  <Col span={8}>
                    <Statistic
                      title="3D位移"
                      value={deviceData.deformation_data.deformation_distance_3d}
                      suffix="m"
                      precision={4}
                      valueStyle={{ fontSize: '14px' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="水平位移"
                      value={deviceData.deformation_data.deformation_horizontal}
                      suffix="m"
                      precision={4}
                      valueStyle={{ fontSize: '14px' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="垂直位移"
                      value={deviceData.deformation_data.deformation_vertical}
                      suffix="m"
                      precision={4}
                      valueStyle={{ fontSize: '14px' }}
                    />
                  </Col>
                </Row>
              </Card>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default OptimizedDeviceStatus;
