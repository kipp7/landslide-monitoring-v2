'use client'

import { useState } from 'react'
import { Badge, Button, Card, Col, Divider, InputNumber, Row, Select, Space, Switch, Tag, Typography } from 'antd'
import { BarChartOutlined, ClockCircleOutlined, DatabaseOutlined, ExperimentOutlined, ThunderboltOutlined } from '@ant-design/icons'
import OptimizedDeviceStatus from './legacy/components/OptimizedDeviceStatus'
import { useDataAggregation } from './legacy/hooks/useDataAggregation'
import HoverSidebar from '../analysis/legacy/components/HoverSidebar'

const { Title, Paragraph, Text } = Typography
const { Option } = Select

export default function OptimizedDemoPage() {
  const [selectedDevice, setSelectedDevice] = useState('device_1')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [aggregationResults, setAggregationResults] = useState<any>({})

  const {
    loading: aggregationLoading,
    getHierarchyStats,
    getNetworkStats,
    getRealTimeDashboard,
    batchAggregate,
    clearAggregationCache,
    hasResults,
    resultCount,
  } = useDataAggregation()

  const handleHierarchyStats = async () => {
    const result = await getHierarchyStats(true)
    if (result) setAggregationResults((prev: any) => ({ ...prev, hierarchy: result }))
  }

  const handleNetworkStats = async () => {
    const result = await getNetworkStats(['device_1', 'device_2', 'device_3'], true)
    if (result) setAggregationResults((prev: any) => ({ ...prev, network: result }))
  }

  const handleRealTimeDashboard = async () => {
    const result = await getRealTimeDashboard('24h', true, true, true)
    if (result) setAggregationResults((prev: any) => ({ ...prev, dashboard: result }))
  }

  const handleBatchAggregate = async () => {
    const requests = [
      { type: 'hierarchy_stats' as const },
      { type: 'network_stats' as const, devices: ['device_1', 'device_2', 'device_3'] },
      { type: 'real_time_dashboard' as const, timeRange: '24h' as const },
    ]

    const results = await batchAggregate(requests, true)
    const aggregated: any = {}
    results.forEach((r) => {
      aggregated[r.type] = r
    })
    setAggregationResults(aggregated)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
      <HoverSidebar />

      <div style={{ padding: 24 }}>
        <Card style={{ marginBottom: 24 }}>
          <Title level={2}>
            <ExperimentOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            数据库优化演示页面
          </Title>
          <Paragraph>
            本页面展示了优化后的 API 端点和数据聚合能力。已移除对冗余视图/备份表的依赖，使用应用层聚合替代数据库视图，并提供更可控的缓存策略。
          </Paragraph>

          <Row gutter={[16, 16]}>
            <Col span={6}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <DatabaseOutlined style={{ fontSize: 24, color: '#52c41a', marginBottom: 8 }} />
                  <div style={{ fontWeight: 'bold' }}>移除冗余</div>
                  <div style={{ fontSize: 12, color: '#666' }}>清理备份/冗余查询路径</div>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <ThunderboltOutlined style={{ fontSize: 24, color: '#1890ff', marginBottom: 8 }} />
                  <div style={{ fontWeight: 'bold' }}>性能优化</div>
                  <div style={{ fontSize: 12, color: '#666' }}>更少查询 + 聚合复用</div>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <BarChartOutlined style={{ fontSize: 24, color: '#faad14', marginBottom: 8 }} />
                  <div style={{ fontWeight: 'bold' }}>应用层聚合</div>
                  <div style={{ fontSize: 12, color: '#666' }}>替代数据库视图</div>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <ClockCircleOutlined style={{ fontSize: 24, color: '#722ed1', marginBottom: 8 }} />
                  <div style={{ fontWeight: 'bold' }}>实时计算</div>
                  <div style={{ fontSize: 12, color: '#666' }}>动态 GPS 位移分析</div>
                </div>
              </Card>
            </Col>
          </Row>
        </Card>

        <Card title="控制面板" style={{ marginBottom: 24 }}>
          <Row gutter={[16, 16]} align="middle">
            <Col span={4}>
              <div>
                <Text strong>选择设备:</Text>
                <Select value={selectedDevice} onChange={setSelectedDevice} style={{ width: '100%', marginTop: 4 }}>
                  <Option value="device_1">Device 1</Option>
                  <Option value="device_2">Device 2</Option>
                  <Option value="device_3">Device 3</Option>
                </Select>
              </div>
            </Col>
            <Col span={3}>
              <div>
                <Text strong>自动刷新:</Text>
                <div style={{ marginTop: 4 }}>
                  <Switch checked={autoRefresh} onChange={setAutoRefresh} checkedChildren="开" unCheckedChildren="关" />
                </div>
              </div>
            </Col>
            <Col span={4}>
              <div>
                <Text strong>刷新间隔(秒):</Text>
                <InputNumber
                  value={refreshInterval}
                  onChange={(value) => setRefreshInterval(value || 30)}
                  min={5}
                  max={300}
                  style={{ width: '100%', marginTop: 4 }}
                  disabled={!autoRefresh}
                />
              </div>
            </Col>
            <Col span={13}>
              <div>
                <Text strong>数据聚合操作:</Text>
                <div style={{ marginTop: 4 }}>
                  <Space wrap>
                    <Button size="small" loading={aggregationLoading} onClick={handleHierarchyStats}>
                      层级统计
                    </Button>
                    <Button size="small" loading={aggregationLoading} onClick={handleNetworkStats}>
                      网络统计
                    </Button>
                    <Button size="small" loading={aggregationLoading} onClick={handleRealTimeDashboard}>
                      实时仪表盘
                    </Button>
                    <Button type="primary" size="small" loading={aggregationLoading} onClick={handleBatchAggregate}>
                      批量聚合
                    </Button>
                    <Button size="small" onClick={() => void clearAggregationCache()}>
                      清理缓存
                    </Button>
                  </Space>
                </div>
              </div>
            </Col>
          </Row>
        </Card>

        <OptimizedDeviceStatus
          deviceId={selectedDevice}
          autoRefresh={autoRefresh}
          refreshInterval={refreshInterval * 1000}
          showAggregatedStats={true}
        />

        {hasResults ? (
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>数据聚合结果</span>
                <Badge count={resultCount} style={{ backgroundColor: '#52c41a' }}>
                  <Tag color="blue">已缓存</Tag>
                </Badge>
              </div>
            }
            style={{ marginTop: 24 }}
          >
            <Row gutter={[16, 16]}>
              {aggregationResults.hierarchy ? (
                <Col span={8}>
                  <Card size="small" title="层级统计" type="inner">
                    <div style={{ fontSize: 12 }}>
                      <div>生成时间: {new Date(aggregationResults.hierarchy.generatedAt).toLocaleString()}</div>
                      <div>数据源: {aggregationResults.hierarchy.source}</div>
                      <Divider style={{ margin: '8px 0' }} />
                      <div>区域数: {aggregationResults.hierarchy.data?.summary?.total_regions}</div>
                      <div>网络数: {aggregationResults.hierarchy.data?.summary?.total_networks}</div>
                      <div>设备数: {aggregationResults.hierarchy.data?.summary?.total_devices}</div>
                      <div>在线设备: {aggregationResults.hierarchy.data?.summary?.active_devices}</div>
                    </div>
                  </Card>
                </Col>
              ) : null}

              {aggregationResults.network ? (
                <Col span={8}>
                  <Card size="small" title="网络统计" type="inner">
                    <div style={{ fontSize: 12 }}>
                      <div>生成时间: {new Date(aggregationResults.network.generatedAt).toLocaleString()}</div>
                      <div>数据源: {aggregationResults.network.source}</div>
                      <Divider style={{ margin: '8px 0' }} />
                      <div>设备数: {aggregationResults.network.data?.network_summary?.total_devices}</div>
                      <div>数据点: {aggregationResults.network.data?.network_summary?.total_data_points}</div>
                      <div>时间范围: {aggregationResults.network.data?.network_summary?.timeRange}</div>
                    </div>
                  </Card>
                </Col>
              ) : null}

              {aggregationResults.dashboard ? (
                <Col span={8}>
                  <Card size="small" title="实时仪表盘" type="inner">
                    <div style={{ fontSize: 12 }}>
                      <div>生成时间: {new Date(aggregationResults.dashboard.generatedAt).toLocaleString()}</div>
                      <div>数据源: {aggregationResults.dashboard.source}</div>
                      <Divider style={{ margin: '8px 0' }} />
                      <div>数据点: {aggregationResults.dashboard.data?.overview?.total_data_points}</div>
                      <div>活跃设备: {aggregationResults.dashboard.data?.overview?.active_devices}</div>
                      <div>异常总数: {aggregationResults.dashboard.data?.overview?.total_anomalies}</div>
                      <div>时间范围: {aggregationResults.dashboard.data?.overview?.time_range}</div>
                    </div>
                  </Card>
                </Col>
              ) : null}
            </Row>
          </Card>
        ) : null}

        <Card title="优化说明" style={{ marginTop: 24 }}>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Title level={4}>数据库优化</Title>
              <ul style={{ fontSize: 14, lineHeight: 1.6 }}>
                <li>
                  移除冗余表/视图依赖（示例：<Text code>monitoring_hierarchy_stats</Text>、<Text code>network_management_stats</Text>）
                </li>
                <li>用应用层聚合替代数据库视图查询</li>
              </ul>
            </Col>
            <Col span={12}>
              <Title level={4}>性能优化</Title>
              <ul style={{ fontSize: 14, lineHeight: 1.6 }}>
                <li>聚合接口复用，减少重复查询</li>
                <li>批量聚合一次获取多类数据</li>
                <li>实时 GPS 位移计算基于 ClickHouse 数据</li>
              </ul>
            </Col>
          </Row>

          <Divider />

          <Title level={4}>API 端点对比</Title>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card size="small" title="Legacy compat" type="inner">
                <Text code>/api/device-management</Text>
                <br />
                <Text code>/api/monitoring-stations</Text>
                <br />
                <Text code>/api/data-aggregation</Text>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title="v2 核心" type="inner">
                <Text code>/api/v1/data/state</Text>
                <br />
                <Text code>/api/v1/data/series</Text>
                <br />
                <Text type="secondary">本页主要复用 legacy compat 以保持参考区演示逻辑。</Text>
              </Card>
            </Col>
          </Row>
        </Card>
      </div>
    </div>
  )
}
