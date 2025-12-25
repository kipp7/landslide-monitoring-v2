'use client'

import { useState } from 'react'
import { Badge, Button, Card, Col, Progress, Row, Space, Statistic, Tooltip, message } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  WifiOutlined,
} from '@ant-design/icons'
import { useOptimizedDeviceData } from '../hooks/useOptimizedDeviceData'
import { useDataAggregation } from '../hooks/useDataAggregation'

export interface OptimizedDeviceStatusProps {
  deviceId: string
  autoRefresh?: boolean
  refreshInterval?: number
  showAggregatedStats?: boolean
}

function healthColor(status: string): string {
  switch (status) {
    case 'excellent':
      return '#52c41a'
    case 'good':
      return '#1890ff'
    case 'fair':
      return '#faad14'
    default:
      return '#ff4d4f'
  }
}

export default function OptimizedDeviceStatus({
  deviceId,
  autoRefresh = false,
  refreshInterval = 30_000,
  showAggregatedStats = true,
}: OptimizedDeviceStatusProps) {
  const [gpsData, setGpsData] = useState<any[]>([])

  const { data: deviceData, loading, error, lastUpdateTime, refresh, fetchGPSData, performHealthCheck, clearCache, isOnline, healthStatus } =
    useOptimizedDeviceData({
      deviceId,
      autoRefresh,
      refreshInterval,
      enableCache: true,
    })

  const { loading: aggregationLoading, getRealTimeDashboard, getDeviceSummary, clearAggregationCache } = useDataAggregation()

  const handleFetchGPSData = async () => {
    try {
      const data = await fetchGPSData(20)
      setGpsData(data || [])
      message.success(`获取到 ${data?.length || 0} 条 GPS 数据`)
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : '获取 GPS 数据失败')
    }
  }

  const handleHealthCheck = async () => {
    try {
      const results = await performHealthCheck([deviceId])
      const deviceResult = results.find((r: any) => r.device_id === deviceId)
      if (deviceResult) {
        message.success(`设备健康检查完成：${deviceResult.status} (健康度 ${deviceResult.health_score}%)`)
      }
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : '健康检查失败')
    }
  }

  const handleShowDashboard = async () => {
    try {
      const dashboard = await getRealTimeDashboard('24h', true, true, true)
      if (dashboard) message.success('实时仪表盘数据已获取（见控制台）')
      console.log('real_time_dashboard', dashboard?.data)
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : '获取实时仪表盘失败')
    }
  }

  const handleDeviceSummary = async () => {
    try {
      const summary = await getDeviceSummary([deviceId], '24h', true)
      if (summary) message.success('设备摘要数据已更新（见控制台）')
      console.log('device_summary', summary?.data)
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : '获取设备摘要失败')
    }
  }

  const handleClearAllCache = async () => {
    await Promise.all([clearCache(), clearAggregationCache()])
  }

  const statusIcon = () => {
    if (loading) return <ClockCircleOutlined />
    if (error) return <WarningOutlined style={{ color: '#ff4d4f' }} />
    if (isOnline) return <CheckCircleOutlined style={{ color: '#52c41a' }} />
    return <WarningOutlined style={{ color: '#faad14' }} />
  }

  if (error) {
    return (
      <Card title="设备状态错误">
        <div style={{ textAlign: 'center', padding: 20 }}>
          <WarningOutlined style={{ fontSize: 48, color: '#ff4d4f', marginBottom: 16 }} />
          <p style={{ color: '#ff4d4f', marginBottom: 16 }}>{error}</p>
          <Button type="primary" onClick={() => void refresh(true)}>
            重试
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {statusIcon()}
              <span>优化设备状态 - {deviceData?.display_name || deviceId}</span>
              <Badge status={isOnline ? 'success' : 'error'} text={isOnline ? '在线' : '离线'} />
            </div>
            <Space>
              <Tooltip title="刷新设备数据">
                <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refresh(true)}>
                  刷新
                </Button>
              </Tooltip>
              <Tooltip title="清理缓存">
                <Button icon={<DeleteOutlined />} onClick={handleClearAllCache}>
                  清理缓存
                </Button>
              </Tooltip>
            </Space>
          </div>
        }
        size="small"
        loading={loading}
      >
        {deviceData ? (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Statistic
                  title="健康度"
                  value={deviceData.health_score}
                  suffix="%"
                  valueStyle={{ color: healthColor(healthStatus) }}
                  prefix={<Progress percent={deviceData.health_score} size="small" showInfo={false} strokeColor={healthColor(healthStatus)} />}
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
                <Statistic title="今日数据" value={deviceData.data_count_today} suffix="条" />
              </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Statistic title="温度" value={deviceData.temperature ?? '-'} suffix={deviceData.temperature == null ? '' : '°C'} precision={1} />
              </Col>
              <Col span={6}>
                <Statistic title="湿度" value={deviceData.humidity ?? '-'} suffix={deviceData.humidity == null ? '' : '%'} precision={1} />
              </Col>
              <Col span={6}>
                <div>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>位置</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <EnvironmentOutlined />
                    <span style={{ fontSize: 12 }}>
                      {typeof deviceData.coordinates?.lat === 'number' ? deviceData.coordinates.lat.toFixed(4) : '-'},
                      {typeof deviceData.coordinates?.lng === 'number' ? deviceData.coordinates.lng.toFixed(4) : '-'}
                    </span>
                  </div>
                </div>
              </Col>
              <Col span={6}>
                <div>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>最后更新</div>
                  <div style={{ fontSize: 12 }}>{lastUpdateTime || '-'}</div>
                </div>
              </Col>
            </Row>

            {showAggregatedStats ? (
              <Row gutter={[8, 8]}>
                <Col span={6}>
                  <Button block size="small" loading={loading} onClick={handleFetchGPSData}>
                    获取 GPS 数据
                  </Button>
                </Col>
                <Col span={6}>
                  <Button block size="small" loading={loading} onClick={handleHealthCheck}>
                    健康检查
                  </Button>
                </Col>
                <Col span={6}>
                  <Button block size="small" loading={aggregationLoading} onClick={handleDeviceSummary}>
                    设备摘要
                  </Button>
                </Col>
                <Col span={6}>
                  <Button block size="small" loading={aggregationLoading} onClick={handleShowDashboard}>
                    实时仪表盘
                  </Button>
                </Col>
              </Row>
            ) : null}

            {gpsData.length > 0 ? (
              <Card title={`GPS 数据 (${gpsData.length} 条)`} size="small" style={{ marginTop: 16 }}>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {gpsData.slice(0, 5).map((item, index) => (
                    <div
                      key={index}
                      style={{ padding: 8, borderBottom: '1px solid #f0f0f0', fontSize: 12 }}
                    >
                      <div>时间: {item.event_time ? new Date(item.event_time).toLocaleString() : '-'}</div>
                      <div>
                        位置: (
                        {typeof item.latitude === 'number' ? item.latitude.toFixed(6) : '-'},
                        {typeof item.longitude === 'number' ? item.longitude.toFixed(6) : '-'})
                        {typeof item.deformation_distance_3d === 'number' ? (
                          <span style={{ marginLeft: 16, color: '#1890ff' }}>
                            位移: {(item.deformation_distance_3d * 1000).toFixed(2)}mm
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </>
        ) : null}
      </Card>
    </div>
  )
}
