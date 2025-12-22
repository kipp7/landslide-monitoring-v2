'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Descriptions, Space, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { getDashboard, getSystemStatus, type DashboardSummary, type SystemStatus } from '../../../lib/api/dashboard'

const { Title, Text } = Typography

function statusTag(status: string) {
  const color = status === 'healthy' ? 'green' : status === 'degraded' ? 'orange' : 'red'
  return <Tag color={color}>{status}</Tag>
}

export default function OpsSystemMonitorPage() {
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [systemJson, dashboardJson] = await Promise.all([getSystemStatus(), getDashboard()])
      setSystem(systemJson.data ?? null)
      setDashboard(dashboardJson.data ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setSystem(null)
      setDashboard(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            系统监控
          </Title>
          <Text type="secondary">数据源：`/api/v1/system/status` + `/api/v1/dashboard`（需要权限：`system:log`）</Text>
        </div>
        <Space>
          <Link href="/ops/configs">系统配置</Link>
          <Link href="/ops/logs">操作日志</Link>
          <Link href="/ops/telemetry-dlq">Telemetry DLQ</Link>
          <Link href="/ops/api-stats">API Stats</Link>
          <Link href="/ops/debug-api">Debug API</Link>
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {error ? (
        <Card>
          <Text type="danger">加载失败：{error}</Text>
        </Card>
      ) : null}

      <Card title="系统状态" size="small">
        {system ? (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="uptimeS">{system.uptimeS}</Descriptions.Item>
            <Descriptions.Item label="Kafka">{statusTag(system.kafka.status)}</Descriptions.Item>
            <Descriptions.Item label="Postgres">{statusTag(system.postgres.status)}</Descriptions.Item>
            <Descriptions.Item label="ClickHouse">{statusTag(system.clickhouse.status)}</Descriptions.Item>
            <Descriptions.Item label="EMQX">{statusTag(system.emqx.status)}</Descriptions.Item>
            <Descriptions.Item label="errors">
              <div className="space-y-1">
                {system.postgres.error ? <div>postgres: {system.postgres.error}</div> : null}
                {system.clickhouse.error ? <div>clickhouse: {system.clickhouse.error}</div> : null}
                {system.kafka.error ? <div>kafka: {system.kafka.error}</div> : null}
              </div>
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Text type="secondary">{loading ? '加载中…' : '暂无数据'}</Text>
        )}
      </Card>

      <Card title="概览摘要" size="small">
        {dashboard ? (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="stations">{dashboard.stations}</Descriptions.Item>
            <Descriptions.Item label="todayDataCount">{dashboard.todayDataCount}</Descriptions.Item>
            <Descriptions.Item label="onlineDevices">{dashboard.onlineDevices}</Descriptions.Item>
            <Descriptions.Item label="offlineDevices">{dashboard.offlineDevices}</Descriptions.Item>
            <Descriptions.Item label="pendingAlerts">{dashboard.pendingAlerts}</Descriptions.Item>
            <Descriptions.Item label="lastUpdatedAt">
              <span className="font-mono">{dashboard.lastUpdatedAt}</span>
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Text type="secondary">{loading ? '加载中…' : '暂无数据'}</Text>
        )}
      </Card>
    </div>
  )
}
