'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Descriptions, Select, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import useDeviceList from '../hooks/useDeviceList'
import useDeviceShadow from '../hooks/useDeviceShadow'
import useSensors from '../hooks/useSensors'
import { listAlerts, type AlertRow } from '../../lib/api/alerts'
import { getDashboard, getSystemStatus, type DashboardSummary, type SystemStatus } from '../../lib/api/dashboard'

const { Title, Text } = Typography

function severityTag(sev: AlertRow['severity']) {
  const color = sev === 'critical' ? 'red' : sev === 'high' ? 'volcano' : sev === 'medium' ? 'orange' : 'green'
  return <Tag color={color}>{sev}</Tag>
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return '-'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export default function AnalysisPage() {
  const { devices, loading: devicesLoading, error: devicesError, refetch } = useDeviceList()
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')

  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) setSelectedDeviceId(devices[0].device_id)
  }, [devices, selectedDeviceId])

  const { data: shadow, loading: shadowLoading, error: shadowError, refreshShadow } = useDeviceShadow(selectedDeviceId, 15_000)
  const { byKey: sensorsByKey, error: sensorsError } = useSensors()

  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [systemStatusError, setSystemStatusError] = useState<string | null>(null)

  const fetchDashboard = useCallback(async () => {
    try {
      setDashboardError(null)
      const json = await getDashboard()
      setDashboard(json.data ?? null)
    } catch (caught) {
      setDashboardError(caught instanceof Error ? caught.message : String(caught))
      setDashboard(null)
    }
  }, [])

  const fetchSystemStatus = useCallback(async () => {
    try {
      setSystemStatusError(null)
      const json = await getSystemStatus()
      setSystemStatus(json.data ?? null)
    } catch (caught) {
      setSystemStatusError(caught instanceof Error ? caught.message : String(caught))
      setSystemStatus(null)
    }
  }, [])

  const fetchAlerts = useCallback(async () => {
    try {
      setAlertsLoading(true)
      setAlertsError(null)

      const end = new Date()
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)

      const json = await listAlerts({ page: 1, pageSize: 50, startTime: start.toISOString(), endTime: end.toISOString() })

      setAlerts(json.data?.list ?? [])
    } catch (caught) {
      setAlertsError(caught instanceof Error ? caught.message : String(caught))
      setAlerts([])
    } finally {
      setAlertsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAlerts()
  }, [fetchAlerts])

  useEffect(() => {
    void fetchDashboard()
    void fetchSystemStatus()
  }, [fetchDashboard, fetchSystemStatus])

  const selectedDevice = useMemo(() => devices.find((d) => d.device_id === selectedDeviceId) ?? null, [
    devices,
    selectedDeviceId,
  ])

  const metricsRows = useMemo(() => {
    const metrics = shadow?.metrics ?? {}
    const entries = Object.entries(metrics).filter(([k]) => !k.startsWith('_'))
    entries.sort((a, b) => a[0].localeCompare(b[0]))
    return entries.map(([sensorKey, value]) => {
      const sensor = sensorsByKey.get(sensorKey)
      return {
        sensorKey,
        name: sensor?.displayName ?? sensorKey,
        unit: sensor?.unit ?? '',
        value,
      }
    })
  }, [shadow?.metrics, sensorsByKey])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            运行概览（v2）
          </Title>
          <Text type="secondary">数据源：v2 API（/api/v1/dashboard、/api/v1/system/status、/api/v1/*）</Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void refetch()
              void refreshShadow()
              void fetchAlerts()
              void fetchDashboard()
              void fetchSystemStatus()
            }}
            loading={devicesLoading || shadowLoading || alertsLoading}
          >
            刷新
          </Button>
        </Space>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Dashboard（/dashboard）" size="small">
          {dashboardError ? <Text type="danger">加载失败：{dashboardError}</Text> : null}
          {dashboard ? (
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="今日数据量">{dashboard.todayDataCount}</Descriptions.Item>
              <Descriptions.Item label="站点数">{dashboard.stations}</Descriptions.Item>
              <Descriptions.Item label="在线设备">{dashboard.onlineDevices}</Descriptions.Item>
              <Descriptions.Item label="离线设备">{dashboard.offlineDevices}</Descriptions.Item>
              <Descriptions.Item label="待处理告警">{dashboard.pendingAlerts}</Descriptions.Item>
              <Descriptions.Item label="最后更新时间">{dashboard.lastUpdatedAt}</Descriptions.Item>
            </Descriptions>
          ) : (
            <Text type="secondary">暂无数据</Text>
          )}
        </Card>

        <Card title="系统状态（/system/status）" size="small">
          {systemStatusError ? <Text type="danger">加载失败：{systemStatusError}</Text> : null}
          {systemStatus ? (
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Uptime(s)">{systemStatus.uptimeS}</Descriptions.Item>
              <Descriptions.Item label="Postgres">
                <Tag color={systemStatus.postgres.status === 'healthy' ? 'green' : 'red'}>{systemStatus.postgres.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="ClickHouse">
                <Tag color={systemStatus.clickhouse.status === 'healthy' ? 'green' : 'red'}>
                  {systemStatus.clickhouse.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Kafka">{systemStatus.kafka.status}</Descriptions.Item>
              <Descriptions.Item label="EMQX">{systemStatus.emqx.status}</Descriptions.Item>
            </Descriptions>
          ) : (
            <Text type="secondary">暂无数据</Text>
          )}
        </Card>
      </div>

      <Card title="设备概览" size="small">
        {devicesError ? <Text type="danger">设备列表加载失败：{devicesError.message}</Text> : null}
        <Space wrap>
          <span>选择设备</span>
          <Select
            style={{ minWidth: 260 }}
            value={selectedDeviceId || undefined}
            showSearch
            placeholder="请选择 deviceId"
            options={devices.map((d) => ({ value: d.device_id, label: `${d.display_name} (${d.device_id})` }))}
            onChange={(v) => setSelectedDeviceId(v)}
          />
        </Space>
        <div className="mt-3">
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="设备数量">{devices.length}</Descriptions.Item>
            <Descriptions.Item label="在线设备">{devices.filter((d) => d.status === 'online').length}</Descriptions.Item>
            <Descriptions.Item label="当前选择">{selectedDevice?.display_name || selectedDeviceId || '-'}</Descriptions.Item>
            <Descriptions.Item label="Device ID">{selectedDeviceId || '-'}</Descriptions.Item>
          </Descriptions>
        </div>
      </Card>

      <Card title="当前设备状态（/data/state/{deviceId}）" size="small">
        {sensorsError ? <Text type="warning">传感器字典不可用：{sensorsError}</Text> : null}
        {shadowError ? <Text type="danger">状态获取失败：{shadowError}</Text> : null}
        {shadow ? (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="更新时间">{shadow.updatedAt}</Descriptions.Item>
              <Descriptions.Item label="Metrics 数量">{Object.keys(shadow.metrics ?? {}).length}</Descriptions.Item>
            </Descriptions>
            <div className="mt-3">
              <Table
                rowKey="sensorKey"
                loading={shadowLoading}
                dataSource={metricsRows}
                pagination={{ pageSize: 15 }}
                size="small"
                columns={[
                  { title: 'sensorKey', dataIndex: 'sensorKey', width: 220, render: (v: string) => <span className="font-mono">{v}</span> },
                  { title: '名称', dataIndex: 'name' },
                  { title: '值', dataIndex: 'value', render: (v: unknown) => <span className="font-mono">{formatValue(v)}</span> },
                  { title: '单位', dataIndex: 'unit', width: 80 },
                ]}
              />
            </div>
          </>
        ) : (
          <Text type="secondary">{shadowLoading ? '加载中…' : '暂无数据'}</Text>
        )}
      </Card>

      <Card title="近 24 小时告警">
        {alertsError ? <Text type="danger">告警加载失败：{alertsError}</Text> : null}
        <Table
          rowKey="alertId"
          loading={alertsLoading}
          dataSource={alerts}
          pagination={false}
          size="small"
          columns={[
            {
              title: '时间',
              dataIndex: 'lastEventAt',
              render: (v: string) => <span className="font-mono">{v}</span>,
            },
            {
              title: '级别',
              dataIndex: 'severity',
              render: (v: AlertRow['severity']) => severityTag(v),
            },
            { title: '标题', dataIndex: 'title', render: (v: string | null | undefined) => v || '-' },
            {
              title: '对象',
              dataIndex: 'deviceId',
              render: (_: unknown, row: AlertRow) => row.deviceId || row.stationId || '-',
            },
            { title: '状态', dataIndex: 'status' },
          ]}
        />
      </Card>
    </div>
  )
}
