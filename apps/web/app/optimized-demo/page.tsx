'use client';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Space, Select, Switch, InputNumber, Divider, Typography, message, Badge, Tag } from 'antd';
import { 
  ThunderboltOutlined, 
  DatabaseOutlined, 
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import OptimizedDeviceStatus from '../components/OptimizedDeviceStatus';
import { useDataAggregation } from '../hooks/useDataAggregation';
import HoverSidebar from '../components/HoverSidebar';

const { Title, Paragraph, Text } = Typography;
const { Option } = Select;

const OptimizedDemoPage: React.FC = () => {
  const [selectedDevice, setSelectedDevice] = useState('device_1');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [aggregationResults, setAggregationResults] = useState<Record<string, any>>({});

  // 使用数据聚合Hook
  const {
    loading: aggregationLoading,
    getHierarchyStats,
    getNetworkStats,
    getRealTimeDashboard,
    batchAggregate,
    clearAggregationCache,
    hasResults,
    resultCount
  } = useDataAggregation();

  // 执行层级统计
  const handleHierarchyStats = async () => {
    try {
      const result = await getHierarchyStats(true);
      if (result) {
        setAggregationResults(prev => ({
          ...prev,
          hierarchy: result
        }));
      }
    } catch (error) {
      console.error('层级统计失败:', error);
    }
  };

  // 执行网络统计
  const handleNetworkStats = async () => {
    try {
      const result = await getNetworkStats(['device_1', 'device_2', 'device_3'], true);
      if (result) {
        setAggregationResults(prev => ({
          ...prev,
          network: result
        }));
      }
    } catch (error) {
      console.error('网络统计失败:', error);
    }
  };

  // 执行实时仪表板
  const handleRealTimeDashboard = async () => {
    try {
      const result = await getRealTimeDashboard('24h', true, true, true);
      if (result) {
        setAggregationResults(prev => ({
          ...prev,
          dashboard: result
        }));
      }
    } catch (error) {
      console.error('实时仪表板失败:', error);
    }
  };

  // 批量聚合所有数据
  const handleBatchAggregate = async () => {
    try {
      const requests = [
        { type: 'hierarchy_stats' as const },
        { type: 'network_stats' as const, devices: ['device_1', 'device_2', 'device_3'] },
        { type: 'real_time_dashboard' as const, timeRange: '24h' as const }
      ];

      const results = await batchAggregate(requests, true);
      
      const aggregatedData: any = {};
      results.forEach(result => {
        aggregatedData[result.type] = result;
      });
      
      setAggregationResults(aggregatedData);
      
    } catch (error) {
      console.error('批量聚合失败:', error);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
      <HoverSidebar />
      
      <div style={{ padding: '24px' }}>
        {/* 页面标题 */}
        <Card style={{ marginBottom: '24px' }}>
          <Title level={2}>
            <ExperimentOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
            数据库优化演示页面
          </Title>
          <Paragraph>
            本页面展示了优化后的API端点和数据聚合功能。我们已经移除了对冗余视图的依赖，
            使用应用层聚合替代数据库视图，并实现了智能缓存策略。
          </Paragraph>
          
          <Row gutter={[16, 16]}>
            <Col span={6}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <DatabaseOutlined style={{ fontSize: '24px', color: '#52c41a', marginBottom: '8px' }} />
                  <div style={{ fontWeight: 'bold' }}>已删除冗余表</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>2个备份表已清理</div>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <ThunderboltOutlined style={{ fontSize: '24px', color: '#1890ff', marginBottom: '8px' }} />
                  <div style={{ fontWeight: 'bold' }}>性能优化</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>内存缓存 + 并行查询</div>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <BarChartOutlined style={{ fontSize: '24px', color: '#faad14', marginBottom: '8px' }} />
                  <div style={{ fontWeight: 'bold' }}>应用层聚合</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>替代数据库视图</div>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  <ClockCircleOutlined style={{ fontSize: '24px', color: '#722ed1', marginBottom: '8px' }} />
                  <div style={{ fontWeight: 'bold' }}>实时计算</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>动态GPS位移分析</div>
                </div>
              </Card>
            </Col>
          </Row>
        </Card>

        {/* 控制面板 */}
        <Card title="控制面板" style={{ marginBottom: '24px' }}>
          <Row gutter={[16, 16]} align="middle">
            <Col span={4}>
              <div>
                <Text strong>选择设备:</Text>
                <Select
                  value={selectedDevice}
                  onChange={setSelectedDevice}
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  <Option value="device_1">Device 1 (龙门)</Option>
                  <Option value="device_2">Device 2 (黄石岭)</Option>
                  <Option value="device_3">Device 3 (龙门坳)</Option>
                </Select>
              </div>
            </Col>
            <Col span={3}>
              <div>
                <Text strong>自动刷新:</Text>
                <div style={{ marginTop: '4px' }}>
                  <Switch
                    checked={autoRefresh}
                    onChange={setAutoRefresh}
                    checkedChildren="开"
                    unCheckedChildren="关"
                  />
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
                  style={{ width: '100%', marginTop: '4px' }}
                  disabled={!autoRefresh}
                />
              </div>
            </Col>
            <Col span={13}>
              <div>
                <Text strong>数据聚合操作:</Text>
                <div style={{ marginTop: '4px' }}>
                  <Space wrap>
                    <Button 
                      size="small" 
                      loading={aggregationLoading}
                      onClick={handleHierarchyStats}
                    >
                      层级统计
                    </Button>
                    <Button 
                      size="small" 
                      loading={aggregationLoading}
                      onClick={handleNetworkStats}
                    >
                      网络统计
                    </Button>
                    <Button 
                      size="small" 
                      loading={aggregationLoading}
                      onClick={handleRealTimeDashboard}
                    >
                      实时仪表板
                    </Button>
                    <Button 
                      type="primary" 
                      size="small" 
                      loading={aggregationLoading}
                      onClick={handleBatchAggregate}
                    >
                      批量聚合
                    </Button>
                    <Button 
                      size="small" 
                      onClick={clearAggregationCache}
                    >
                      清理缓存
                    </Button>
                  </Space>
                </div>
              </div>
            </Col>
          </Row>
        </Card>

        {/* 优化设备状态组件 */}
        <OptimizedDeviceStatus
          deviceId={selectedDevice}
          autoRefresh={autoRefresh}
          refreshInterval={refreshInterval * 1000}
          showAggregatedStats={true}
        />

        {/* 聚合结果显示 */}
        {hasResults && (
          <Card 
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>数据聚合结果</span>
                <Badge count={resultCount} style={{ backgroundColor: '#52c41a' }}>
                  <Tag color="blue">已缓存</Tag>
                </Badge>
              </div>
            }
            style={{ marginTop: '24px' }}
          >
            <Row gutter={[16, 16]}>
              {/* 层级统计结果 */}
              {aggregationResults.hierarchy && (
                <Col span={8}>
                  <Card size="small" title="层级统计" type="inner">
                    <div style={{ fontSize: '12px' }}>
                      <div>生成时间: {new Date(aggregationResults.hierarchy.generatedAt).toLocaleString()}</div>
                      <div>数据源: {aggregationResults.hierarchy.source}</div>
                      <Divider style={{ margin: '8px 0' }} />
                      <div>区域数: {aggregationResults.hierarchy.data.summary.total_regions}</div>
                      <div>网络数: {aggregationResults.hierarchy.data.summary.total_networks}</div>
                      <div>设备数: {aggregationResults.hierarchy.data.summary.total_devices}</div>
                      <div>在线设备: {aggregationResults.hierarchy.data.summary.active_devices}</div>
                    </div>
                  </Card>
                </Col>
              )}

              {/* 网络统计结果 */}
              {aggregationResults.network && (
                <Col span={8}>
                  <Card size="small" title="网络统计" type="inner">
                    <div style={{ fontSize: '12px' }}>
                      <div>生成时间: {new Date(aggregationResults.network.generatedAt).toLocaleString()}</div>
                      <div>数据源: {aggregationResults.network.source}</div>
                      <Divider style={{ margin: '8px 0' }} />
                      <div>设备数: {aggregationResults.network.data.network_summary.total_devices}</div>
                      <div>在线设备: {aggregationResults.network.data.network_summary.active_devices}</div>
                      <div>已建基准: {aggregationResults.network.data.network_summary.devices_with_baseline}</div>
                      <div>数据点: {aggregationResults.network.data.network_summary.total_data_points}</div>
                    </div>
                  </Card>
                </Col>
              )}

              {/* 实时仪表板结果 */}
              {aggregationResults.dashboard && (
                <Col span={8}>
                  <Card size="small" title="实时仪表板" type="inner">
                    <div style={{ fontSize: '12px' }}>
                      <div>生成时间: {new Date(aggregationResults.dashboard.generatedAt).toLocaleString()}</div>
                      <div>数据源: {aggregationResults.dashboard.source}</div>
                      <Divider style={{ margin: '8px 0' }} />
                      <div>数据点: {aggregationResults.dashboard.data.overview.total_data_points}</div>
                      <div>活跃设备: {aggregationResults.dashboard.data.overview.active_devices}</div>
                      <div>异常总数: {aggregationResults.dashboard.data.overview.total_anomalies}</div>
                      <div>时间范围: {aggregationResults.dashboard.data.overview.time_range}</div>
                    </div>
                  </Card>
                </Col>
              )}
            </Row>
          </Card>
        )}

        {/* 优化说明 */}
        <Card title="优化说明" style={{ marginTop: '24px' }}>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Title level={4}>数据库优化</Title>
              <ul style={{ fontSize: '14px', lineHeight: '1.6' }}>
                <li><Text code>displacement_anomalies_backup</Text> 表已删除 (2,701条冗余记录)</li>
                <li><Text code>temp_gps_data_backup</Text> 表已删除 (5列备份数据)</li>
                <li>移除对 <Text code>monitoring_hierarchy_stats</Text> 视图的依赖</li>
                <li>移除对 <Text code>network_management_stats</Text> 视图的依赖</li>
                <li>使用应用层聚合替代数据库视图查询</li>
              </ul>
            </Col>
            <Col span={12}>
              <Title level={4}>性能优化</Title>
              <ul style={{ fontSize: '14px', lineHeight: '1.6' }}>
                <li>实现内存缓存策略 (3-5分钟TTL)</li>
                <li>并行查询替代串行查询</li>
                <li>实时GPS位移计算优化</li>
                <li>批量数据聚合功能</li>
                <li>智能缓存失效和更新机制</li>
              </ul>
            </Col>
          </Row>

          <Divider />

          <Title level={4}>API端点对比</Title>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card size="small" title="原始API" type="inner">
                <Text code>/api/device-management</Text>
                <br />
                <Text code>/api/monitoring-stations</Text>
                <br />
                <Text type="secondary">依赖多个视图和冗余表</Text>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title="优化API" type="inner">
                <Text code>/api/device-management-optimized</Text>
                <br />
                <Text code>/api/monitoring-stations-optimized</Text>
                <br />
                <Text code>/api/data-aggregation</Text>
                <br />
                <Text type="secondary">直接查询核心表 + 应用层聚合</Text>
              </Card>
            </Col>
          </Row>
        </Card>
      </div>
    </div>
  );
};

export default OptimizedDemoPage;
