'use client';

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Progress, 
  Table, 
  Tag, 
  Button, 
  Space, 
  Tabs, 
  Alert,
  Badge,
  Tooltip,
  Select,
  Switch
} from 'antd';
import {
  MonitorOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  LineChartOutlined,
  GlobalOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useOptimizedDeviceData } from '../hooks/useOptimizedDeviceData';
import { useDataAggregation } from '../hooks/useDataAggregation';
import { useRealtimeStream } from '../hooks/useRealtimeStream';
import { useGPSCalculationWorker } from '../hooks/useWebWorker';
import { CacheUtils, globalCache, deviceDataCache, gpsDataCache } from '../utils/advancedCache';
import HoverSidebar from '../components/HoverSidebar';

const { TabPane } = Tabs;
const { Option } = Select;

const SystemMonitorPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [systemMetrics, setSystemMetrics] = useState<any>({});
  const [performanceHistory, setPerformanceHistory] = useState<any[]>([]);

  // 使用各种优化后的Hooks
  const {
    data: deviceData,
    loading: deviceLoading,
    healthStatus,
    refresh: refreshDevice
  } = useOptimizedDeviceData({
    deviceId: 'device_1',
    autoRefresh,
    refreshInterval,
    enableCache: true
  });

  const {
    getHierarchyStats,
    getNetworkStats,
    getRealTimeDashboard,
    loading: aggregationLoading,
    resultCount
  } = useDataAggregation();

  const {
    isConnected: realtimeConnected,
    connectionStats,
    systemStatus,
    getClientStats
  } = useRealtimeStream({
    deviceId: 'all',
    enableSystemStatus: true
  });

  const {
    isWorkerSupported,
    getWorkerStatus
  } = useGPSCalculationWorker();

  // 收集系统指标
  const collectSystemMetrics = async () => {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        cache: CacheUtils.getAllStats(),
        realtime: connectionStats,
        worker: getWorkerStatus(),
        aggregation: {
          loading: aggregationLoading,
          resultCount
        },
        device: {
          loading: deviceLoading,
          healthStatus,
          lastUpdate: deviceData?.last_data_time
        }
      };

      setSystemMetrics(metrics);
      
      // 添加到历史记录
      setPerformanceHistory(prev => [
        metrics,
        ...prev.slice(0, 99) // 保留最近100条记录
      ]);

    } catch (error) {
      console.error('收集系统指标失败:', error);
    }
  };

  // 获取实时客户端统计
  const [clientStats, setClientStats] = useState<any>(null);
  const fetchClientStats = async () => {
    try {
      const stats = await getClientStats();
      setClientStats(stats);
    } catch (error) {
      console.error('获取客户端统计失败:', error);
    }
  };

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        collectSystemMetrics();
        fetchClientStats();
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  // 初始加载
  useEffect(() => {
    collectSystemMetrics();
    fetchClientStats();
  }, []);

  // 缓存性能图表
  const getCachePerformanceChart = () => {
    const history = performanceHistory.slice(0, 30).reverse();
    
    return {
      title: { text: '缓存性能趋势', left: 'center' },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      xAxis: {
        type: 'category',
        data: history.map(h => new Date(h.timestamp).toLocaleTimeString())
      },
      yAxis: [
        { type: 'value', name: '命中率 (%)', max: 100 },
        { type: 'value', name: '大小', position: 'right' }
      ],
      series: [
        {
          name: '全局缓存命中率',
          type: 'line',
          yAxisIndex: 0,
          data: history.map(h => parseFloat(h.cache?.global?.hitRate || '0')),
          smooth: true,
          itemStyle: { color: '#1890ff' }
        },
        {
          name: '设备缓存命中率',
          type: 'line',
          yAxisIndex: 0,
          data: history.map(h => parseFloat(h.cache?.deviceData?.hitRate || '0')),
          smooth: true,
          itemStyle: { color: '#52c41a' }
        },
        {
          name: 'GPS缓存命中率',
          type: 'line',
          yAxisIndex: 0,
          data: history.map(h => parseFloat(h.cache?.gpsData?.hitRate || '0')),
          smooth: true,
          itemStyle: { color: '#faad14' }
        },
        {
          name: '缓存大小',
          type: 'bar',
          yAxisIndex: 1,
          data: history.map(h => (h.cache?.global?.size || 0) + (h.cache?.deviceData?.size || 0) + (h.cache?.gpsData?.size || 0)),
          itemStyle: { color: '#722ed1', opacity: 0.6 }
        }
      ]
    };
  };

  // 实时连接状态图表
  const getRealtimeStatusChart = () => {
    const history = performanceHistory.slice(0, 20).reverse();
    
    return {
      title: { text: '实时连接状态', left: 'center' },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: history.map(h => new Date(h.timestamp).toLocaleTimeString())
      },
      yAxis: { type: 'value', name: '消息数量' },
      series: [
        {
          name: '接收消息',
          type: 'line',
          data: history.map(h => h.realtime?.messagesReceived || 0),
          smooth: true,
          areaStyle: { opacity: 0.3 },
          itemStyle: { color: '#1890ff' }
        }
      ]
    };
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
      <HoverSidebar />
      
      <div style={{ padding: '24px' }}>
        {/* 页面标题 */}
        <Card style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <MonitorOutlined style={{ color: '#1890ff' }} />
                系统性能监控中心
              </h1>
              <p style={{ margin: '8px 0 0 0', color: '#666' }}>
                实时监控系统性能、缓存状态、连接质量和资源使用情况
              </p>
            </div>
            
            <Space>
              <Select
                value={refreshInterval}
                onChange={setRefreshInterval}
                style={{ width: 120 }}
                size="small"
              >
                <Option value={1000}>1秒</Option>
                <Option value={5000}>5秒</Option>
                <Option value={10000}>10秒</Option>
                <Option value={30000}>30秒</Option>
              </Select>
              
              <Switch
                checked={autoRefresh}
                onChange={setAutoRefresh}
                checkedChildren="自动"
                unCheckedChildren="手动"
              />
              
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  collectSystemMetrics();
                  fetchClientStats();
                }}
                type="primary"
                size="small"
              >
                刷新
              </Button>
            </Space>
          </div>
        </Card>

        {/* 主要指标概览 */}
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="缓存命中率"
                value={parseFloat(systemMetrics.cache?.global?.hitRate || '0')}
                suffix="%"
                prefix={<DatabaseOutlined />}
                valueStyle={{ 
                  color: parseFloat(systemMetrics.cache?.global?.hitRate || '0') > 80 ? '#3f8600' : '#cf1322' 
                }}
              />
              <Progress 
                percent={parseFloat(systemMetrics.cache?.global?.hitRate || '0')} 
                showInfo={false} 
                size="small"
                strokeColor={parseFloat(systemMetrics.cache?.global?.hitRate || '0') > 80 ? '#3f8600' : '#cf1322'}
              />
            </Card>
          </Col>
          
          <Col span={6}>
            <Card>
              <Statistic
                title="实时连接"
                value={realtimeConnected ? '已连接' : '断开'}
                prefix={<GlobalOutlined />}
                valueStyle={{ 
                  color: realtimeConnected ? '#3f8600' : '#cf1322' 
                }}
              />
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                消息: {systemMetrics.realtime?.messagesReceived || 0}
              </div>
            </Card>
          </Col>
          
          <Col span={6}>
            <Card>
              <Statistic
                title="WebWorker"
                value={isWorkerSupported() ? '支持' : '不支持'}
                prefix={<ThunderboltOutlined />}
                valueStyle={{ 
                  color: isWorkerSupported() ? '#3f8600' : '#cf1322' 
                }}
              />
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                {getWorkerStatus().isInitialized ? '已初始化' : '未初始化'}
              </div>
            </Card>
          </Col>
          
          <Col span={6}>
            <Card>
              <Statistic
                title="聚合查询"
                value={resultCount}
                prefix={<LineChartOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                {aggregationLoading ? '加载中...' : '就绪'}
              </div>
            </Card>
          </Col>
        </Row>

        {/* 详细监控面板 */}
        <Card>
          <Tabs activeKey={activeTab} onChange={setActiveTab}>
            <TabPane tab="系统概览" key="overview">
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Card title="缓存性能" size="small">
                    <ReactECharts 
                      option={getCachePerformanceChart()} 
                      style={{ height: '300px' }}
                    />
                  </Card>
                </Col>
                
                <Col span={12}>
                  <Card title="实时数据流" size="small">
                    <ReactECharts 
                      option={getRealtimeStatusChart()} 
                      style={{ height: '300px' }}
                    />
                  </Card>
                </Col>
              </Row>
            </TabPane>

            <TabPane tab="缓存详情" key="cache">
              <Row gutter={[16, 16]}>
                <Col span={8}>
                  <Card title="全局缓存" size="small">
                    <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
                      <div>大小: {systemMetrics.cache?.global?.size || 0} / {systemMetrics.cache?.global?.maxSize || 0}</div>
                      <div>命中率: {systemMetrics.cache?.global?.hitRate || '0%'}</div>
                      <div>命中: {systemMetrics.cache?.global?.hits || 0}</div>
                      <div>未命中: {systemMetrics.cache?.global?.misses || 0}</div>
                      <div>清理: {systemMetrics.cache?.global?.evictions || 0}</div>
                      <div>预加载: {systemMetrics.cache?.global?.preloads || 0}</div>
                      <div>压缩: {systemMetrics.cache?.global?.compressions || 0}</div>
                    </div>
                  </Card>
                </Col>
                
                <Col span={8}>
                  <Card title="设备数据缓存" size="small">
                    <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
                      <div>大小: {systemMetrics.cache?.deviceData?.size || 0} / {systemMetrics.cache?.deviceData?.maxSize || 0}</div>
                      <div>命中率: {systemMetrics.cache?.deviceData?.hitRate || '0%'}</div>
                      <div>命中: {systemMetrics.cache?.deviceData?.hits || 0}</div>
                      <div>未命中: {systemMetrics.cache?.deviceData?.misses || 0}</div>
                      <div>清理: {systemMetrics.cache?.deviceData?.evictions || 0}</div>
                      <div>预加载: {systemMetrics.cache?.deviceData?.preloads || 0}</div>
                      <div>压缩: {systemMetrics.cache?.deviceData?.compressions || 0}</div>
                    </div>
                  </Card>
                </Col>
                
                <Col span={8}>
                  <Card title="GPS数据缓存" size="small">
                    <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
                      <div>大小: {systemMetrics.cache?.gpsData?.size || 0} / {systemMetrics.cache?.gpsData?.maxSize || 0}</div>
                      <div>命中率: {systemMetrics.cache?.gpsData?.hitRate || '0%'}</div>
                      <div>命中: {systemMetrics.cache?.gpsData?.hits || 0}</div>
                      <div>未命中: {systemMetrics.cache?.gpsData?.misses || 0}</div>
                      <div>清理: {systemMetrics.cache?.gpsData?.evictions || 0}</div>
                      <div>预加载: {systemMetrics.cache?.gpsData?.preloads || 0}</div>
                      <div>压缩: {systemMetrics.cache?.gpsData?.compressions || 0}</div>
                    </div>
                  </Card>
                </Col>
              </Row>
            </TabPane>

            <TabPane tab="实时连接" key="realtime">
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Card title="连接状态" size="small">
                    <div style={{ fontSize: '14px', lineHeight: '2' }}>
                      <div>
                        <Badge 
                          status={realtimeConnected ? 'success' : 'error'} 
                          text={realtimeConnected ? '已连接' : '断开连接'} 
                        />
                      </div>
                      <div>连接时间: {connectionStats.connectedAt ? new Date(connectionStats.connectedAt).toLocaleString() : '未连接'}</div>
                      <div>重连次数: {connectionStats.reconnectCount}</div>
                      <div>消息总数: {connectionStats.messagesReceived}</div>
                      <div>最后心跳: {connectionStats.lastHeartbeat ? new Date(connectionStats.lastHeartbeat).toLocaleTimeString() : '无'}</div>
                    </div>
                  </Card>
                </Col>
                
                <Col span={12}>
                  <Card title="客户端统计" size="small">
                    {clientStats ? (
                      <div style={{ fontSize: '14px', lineHeight: '2' }}>
                        <div>总客户端: {clientStats.stats?.totalClients || 0}</div>
                        <div>数据缓存设备: {clientStats.stats?.dataCache?.totalDevices || 0}</div>
                        <div>服务器运行时间: {clientStats.stats?.performance?.uptime ? `${Math.round(clientStats.stats.performance.uptime / 60)}分钟` : '未知'}</div>
                      </div>
                    ) : (
                      <div style={{ color: '#999' }}>加载中...</div>
                    )}
                  </Card>
                </Col>
              </Row>
            </TabPane>

            <TabPane tab="性能分析" key="performance">
              <Alert
                message="性能监控"
                description="系统运行良好，所有关键指标在正常范围内。建议定期清理缓存以保持最佳性能。"
                type="success"
                showIcon
                style={{ marginBottom: '16px' }}
              />
              
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  <Card title="快速操作" size="small">
                    <Space wrap>
                      <Button
                        icon={<DatabaseOutlined />}
                        onClick={() => {
                          CacheUtils.clearAll();
                          collectSystemMetrics();
                        }}
                      >
                        清空所有缓存
                      </Button>
                      
                      <Button
                        icon={<ThunderboltOutlined />}
                        onClick={async () => {
                          await CacheUtils.warmupDeviceCache(['device_1', 'device_2', 'device_3']);
                          collectSystemMetrics();
                        }}
                      >
                        预热设备缓存
                      </Button>
                      
                      <Button
                        icon={<LineChartOutlined />}
                        onClick={async () => {
                          await getHierarchyStats(true);
                          await getNetworkStats(['device_1', 'device_2', 'device_3'], true);
                          await getRealTimeDashboard('24h', true, true, true);
                        }}
                      >
                        刷新所有聚合数据
                      </Button>
                    </Space>
                  </Card>
                </Col>
              </Row>
            </TabPane>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default SystemMonitorPage;
