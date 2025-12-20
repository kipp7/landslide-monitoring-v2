'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Descriptions, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import useDeviceList from '../hooks/useDeviceList'
import useDeviceShadow from '../hooks/useDeviceShadow'
import { apiGetJson, type ApiSuccessResponse } from '../../lib/v2Api'

const { Title, Text } = Typography

type AlertRow = {
  alertId: string
  status: 'active' | 'acked' | 'resolved'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title?: string | null
  deviceId?: string | null
  stationId?: string | null
  lastEventAt: string
}

type AlertsListResponse = {
  list: AlertRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

function severityTag(sev: AlertRow['severity']) {
  const color = sev === 'critical' ? 'red' : sev === 'high' ? 'volcano' : sev === 'medium' ? 'orange' : 'green'
  return <Tag color={color}>{sev}</Tag>
}

export default function AnalysisPage() {
  const { devices, loading: devicesLoading, error: devicesError, refetch } = useDeviceList()
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')

  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) setSelectedDeviceId(devices[0].device_id)
  }, [devices, selectedDeviceId])

  const { data: shadow, loading: shadowLoading, error: shadowError, refreshShadow } = useDeviceShadow(
    selectedDeviceId || undefined,
    15_000
  )

  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      setAlertsLoading(true)
      setAlertsError(null)

      const end = new Date()
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)

      const json = await apiGetJson<ApiSuccessResponse<AlertsListResponse>>(
        `/api/v1/alerts?page=1&pageSize=50&startTime=${encodeURIComponent(start.toISOString())}&endTime=${encodeURIComponent(
          end.toISOString()
        )}`
      )

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

  const selectedDevice = useMemo(() => devices.find((d) => d.device_id === selectedDeviceId) ?? null, [
    devices,
    selectedDeviceId,
  ])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            运行概览（v2）
          </Title>
          <Text type="secondary">数据源：v2 API（services/api）</Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void refetch()
              void refreshShadow()
              void fetchAlerts()
            }}
            loading={devicesLoading || shadowLoading || alertsLoading}
          >
            刷新
          </Button>
        </Space>
      </div>

      <Card title="设备概览">
        {devicesError ? <Text type="danger">设备列表加载失败：{devicesError.message}</Text> : null}
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="设备数量">{devices.length}</Descriptions.Item>
          <Descriptions.Item label="在线设备">{devices.filter((d) => d.status === 'online').length}</Descriptions.Item>
          <Descriptions.Item label="当前选择">{selectedDevice?.display_name || selectedDeviceId || '-'}</Descriptions.Item>
          <Descriptions.Item label="Device ID">{selectedDeviceId || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="当前设备状态（shadow）">
        {shadowError ? <Text type="danger">状态获取失败：{shadowError}</Text> : null}
        {shadow?.properties ? (
          <Descriptions bordered size="small" column={3}>
            <Descriptions.Item label="时间">{shadow.event_time}</Descriptions.Item>
            <Descriptions.Item label="风险等级">{shadow.properties.risk_level ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="告警">{shadow.properties.alarm_active ? '是' : '否'}</Descriptions.Item>
            <Descriptions.Item label="温度">{shadow.properties.temperature ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="湿度">{shadow.properties.humidity ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="振动">{shadow.properties.vibration ?? '-'}</Descriptions.Item>
          </Descriptions>
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

