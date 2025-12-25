'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Card, Col, Progress, Row, Select, Space, Statistic, Switch, Tabs } from 'antd'
import { DatabaseOutlined, GlobalOutlined, LineChartOutlined, MonitorOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { useOptimizedDeviceData } from '../hooks/useOptimizedDeviceData'
import { useDataAggregation } from '../hooks/useDataAggregation'
import { useRealtimeStream } from '../hooks/useRealtimeStream'
import { useGPSCalculationWorker } from '../hooks/useWebWorker'
import { CacheUtils } from '../utils/advancedCache'
import { apiJson } from '../../lib/v2Api'
import HoverSidebar from '../analysis/legacy/components/HoverSidebar'

type ClientStats = { success: true; stats: any; timestamp: string } | { success: false; error?: string; timestamp?: string }

export default function SystemMonitorPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(5000)
  const [systemMetrics, setSystemMetrics] = useState<any>({})
  const [performanceHistory, setPerformanceHistory] = useState<any[]>([])
  const [clientStats, setClientStats] = useState<ClientStats | null>(null)
  const [systemStatus, setSystemStatus] = useState<any>(null)

  const { data: deviceData, loading: deviceLoading, healthStatus, refresh: refreshDevice } = useOptimizedDeviceData({
    deviceId: 'device_1',
    autoRefresh,
    refreshInterval,
    enableCache: true,
  })

  const { getHierarchyStats, getNetworkStats, getRealTimeDashboard, loading: aggregationLoading, resultCount } = useDataAggregation()

  const realtime = useRealtimeStream({
    deviceId: 'all',
    onMessage: (msg) => {
      if (msg.type === 'system_status') setSystemStatus(msg.data)
    },
  })

  const { isWorkerSupported, getWorkerStatus } = useGPSCalculationWorker()

  const collectSystemMetrics = useCallback(() => {
    const metrics = {
      timestamp: new Date().toISOString(),
      cache: CacheUtils.getAllStats(),
      realtime: realtime.stats,
      worker: getWorkerStatus(),
      aggregation: { loading: aggregationLoading, resultCount },
      device: { loading: deviceLoading, healthStatus, lastUpdate: deviceData?.last_data_time },
      systemStatus,
    }

    setSystemMetrics(metrics)
    setPerformanceHistory((prev) => [metrics, ...prev.slice(0, 99)])
  }, [aggregationLoading, deviceData?.last_data_time, deviceLoading, getWorkerStatus, healthStatus, realtime.stats, resultCount, systemStatus])

  const fetchClientStats = useCallback(async () => {
    try {
      const stats = await apiJson<ClientStats>('/api/realtime-stream', { action: 'get_client_stats' })
      setClientStats(stats)
    } catch {
      setClientStats(null)
    }
  }, [])

  useEffect(() => {
    collectSystemMetrics()
    void fetchClientStats()
  }, [collectSystemMetrics, fetchClientStats])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      collectSystemMetrics()
      void fetchClientStats()
    }, refreshInterval)
    return () => clearInterval(interval)
  }, [autoRefresh, collectSystemMetrics, fetchClientStats, refreshInterval])

  const getCachePerformanceChart = useCallback(() => {
    const history = performanceHistory.slice(0, 30).reverse()
    return {
      title: { text: '缓存性能趋势', left: 'center' },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      xAxis: { type: 'category', data: history.map((h) => new Date(h.timestamp).toLocaleTimeString()) },
      yAxis: [
        { type: 'value', name: '命中率 (%)', max: 100 },
        { type: 'value', name: '大小', position: 'right' },
      ],
      series: [
        {
          name: '全局缓存命中率',
          type: 'line',
          yAxisIndex: 0,
          data: history.map((h) => parseFloat(h.cache?.global?.hitRate || '0')),
          smooth: true,
          itemStyle: { color: '#1890ff' },
        },
        {
          name: '设备缓存命中率',
          type: 'line',
          yAxisIndex: 0,
          data: history.map((h) => parseFloat(h.cache?.deviceData?.hitRate || '0')),
          smooth: true,
          itemStyle: { color: '#52c41a' },
        },
        {
          name: 'GPS缓存命中率',
          type: 'line',
          yAxisIndex: 0,
          data: history.map((h) => parseFloat(h.cache?.gpsData?.hitRate || '0')),
          smooth: true,
          itemStyle: { color: '#faad14' },
        },
        {
          name: '缓存大小',
          type: 'bar',
          yAxisIndex: 1,
          data: history.map((h) => (h.cache?.global?.size || 0) + (h.cache?.deviceData?.size || 0) + (h.cache?.gpsData?.size || 0)),
          itemStyle: { color: '#722ed1', opacity: 0.6 },
        },
      ],
    }
  }, [performanceHistory])

  const getRealtimeStatusChart = useCallback(() => {
    const history = performanceHistory.slice(0, 20).reverse()
    return {
      title: { text: '实时连接状态', left: 'center' },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: history.map((h) => new Date(h.timestamp).toLocaleTimeString()) },
      yAxis: { type: 'value', name: '消息数量' },
      series: [
        {
          name: '接收消息',
          type: 'line',
          data: history.map((h) => h.realtime?.messagesReceived || 0),
          smooth: true,
          areaStyle: { opacity: 0.3 },
          itemStyle: { color: '#1890ff' },
        },
      ],
    }
  }, [performanceHistory])

  const tabs = useMemo(
    () => [
      {
        key: 'overview',
        label: '系统概览',
        children: (
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card title="缓存性能" size="small">
                <ReactECharts option={getCachePerformanceChart()} style={{ height: '300px' }} />
              </Card>
            </Col>
            <Col span={12}>
              <Card title="实时数据流" size="small">
                <ReactECharts option={getRealtimeStatusChart()} style={{ height: '300px' }} />
              </Card>
            </Col>
          </Row>
        ),
      },
      {
        key: 'cache',
        label: '缓存详情',
        children: (
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Card title="全局缓存" size="small">
                <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
                  <div>
                    大小: {systemMetrics.cache?.global?.size || 0} / {systemMetrics.cache?.global?.maxSize || 0}
                  </div>
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
                  <div>
                    大小: {systemMetrics.cache?.deviceData?.size || 0} / {systemMetrics.cache?.deviceData?.maxSize || 0}
                  </div>
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
                  <div>
                    大小: {systemMetrics.cache?.gpsData?.size || 0} / {systemMetrics.cache?.gpsData?.maxSize || 0}
                  </div>
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
        ),
      },
      {
        key: 'realtime',
        label: '实时连接',
        children: (
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card title="连接状态" size="small">
                <div style={{ fontSize: '14px', lineHeight: '2' }}>
                  <div>
                    <Badge status={realtime.isConnected ? 'success' : 'error'} text={realtime.isConnected ? '已连接' : '断开连接'} />
                  </div>
                  <div>连接时间: {realtime.stats.connectedAt ? new Date(realtime.stats.connectedAt).toLocaleString() : '未连接'}</div>
                  <div>重连次数: {realtime.stats.reconnectCount}</div>
                  <div>消息总数: {realtime.stats.messagesReceived}</div>
                  <div>最后心跳: {realtime.stats.lastHeartbeat ? new Date(realtime.stats.lastHeartbeat).toLocaleTimeString() : '无'}</div>
                </div>
              </Card>
            </Col>
            <Col span={12}>
              <Card title="客户端统计" size="small">
                {clientStats && clientStats.success ? (
                  <div style={{ fontSize: '14px', lineHeight: '2' }}>
                    <div>总客户端: {clientStats.stats?.totalClients || 0}</div>
                    <div>数据缓存设备: {clientStats.stats?.dataCache?.totalDevices || 0}</div>
                    <div>
                      服务器运行时间:{' '}
                      {clientStats.stats?.performance?.uptime ? `${Math.round(clientStats.stats.performance.uptime / 60)}分钟` : '未知'}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#999' }}>加载中...</div>
                )}
              </Card>
            </Col>
          </Row>
        ),
      },
      {
        key: 'performance',
        label: '性能分析',
        children: (
          <>
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
                        CacheUtils.clearAll()
                        collectSystemMetrics()
                      }}
                    >
                      清空所有缓存
                    </Button>
                    <Button
                      icon={<ThunderboltOutlined />}
                      onClick={async () => {
                        await CacheUtils.warmupDeviceCache(['device_1', 'device_2', 'device_3'])
                        collectSystemMetrics()
                      }}
                    >
                      预热设备缓存
                    </Button>
                    <Button
                      icon={<LineChartOutlined />}
                      onClick={async () => {
                        await getHierarchyStats(true)
                        await getNetworkStats(['device_1', 'device_2', 'device_3'], true)
                        await getRealTimeDashboard('24h', true, true, true)
                      }}
                    >
                      刷新所有聚合数据
                    </Button>
                  </Space>
                </Card>
              </Col>
            </Row>
          </>
        ),
      },
    ],
    [
      clientStats,
      collectSystemMetrics,
      getCachePerformanceChart,
      getHierarchyStats,
      getNetworkStats,
      getRealTimeDashboard,
      getRealtimeStatusChart,
      systemMetrics,
      realtime.isConnected,
      realtime.stats.connectedAt,
      realtime.stats.lastHeartbeat,
      realtime.stats.messagesReceived,
      realtime.stats.reconnectCount,
    ],
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
      <HoverSidebar />

      <div style={{ padding: '24px' }}>
        <Card style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <MonitorOutlined style={{ color: '#1890ff' }} />
                系统性能监控中心
              </h1>
              <p style={{ margin: '8px 0 0 0', color: '#666' }}>实时监控系统性能、缓存状态、连接质量和资源使用情况</p>
            </div>

            <Space>
              <Select
                value={refreshInterval}
                onChange={setRefreshInterval}
                style={{ width: 120 }}
                size="small"
                options={[
                  { value: 1000, label: '1秒' },
                  { value: 5000, label: '5秒' },
                  { value: 10000, label: '10秒' },
                  { value: 30000, label: '30秒' },
                ]}
              />

              <Switch checked={autoRefresh} onChange={setAutoRefresh} checkedChildren="自动" unCheckedChildren="手动" />

              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  collectSystemMetrics()
                  void fetchClientStats()
                  void refreshDevice(true)
                }}
                type="primary"
                size="small"
              >
                刷新
              </Button>
            </Space>
          </div>
        </Card>

        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="缓存命中率"
                value={parseFloat(systemMetrics.cache?.global?.hitRate || '0')}
                suffix="%"
                prefix={<DatabaseOutlined />}
                valueStyle={{ color: parseFloat(systemMetrics.cache?.global?.hitRate || '0') > 80 ? '#3f8600' : '#cf1322' }}
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
                value={realtime.isConnected ? '已连接' : '断开'}
                prefix={<GlobalOutlined />}
                valueStyle={{ color: realtime.isConnected ? '#3f8600' : '#cf1322' }}
              />
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>消息: {systemMetrics.realtime?.messagesReceived || 0}</div>
            </Card>
          </Col>

          <Col span={6}>
            <Card>
              <Statistic
                title="WebWorker"
                value={isWorkerSupported() ? '支持' : '不支持'}
                prefix={<ThunderboltOutlined />}
                valueStyle={{ color: isWorkerSupported() ? '#3f8600' : '#cf1322' }}
              />
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>{getWorkerStatus().isInitialized ? '已初始化' : '未初始化'}</div>
            </Card>
          </Col>

          <Col span={6}>
            <Card>
              <Statistic title="聚合查询" value={resultCount} prefix={<LineChartOutlined />} valueStyle={{ color: '#1890ff' }} />
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>{aggregationLoading ? '加载中...' : '就绪'}</div>
            </Card>
          </Col>
        </Row>

        <Card>
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} />
        </Card>
      </div>
    </div>
  )
}
