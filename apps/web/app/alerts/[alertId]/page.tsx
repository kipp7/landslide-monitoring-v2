'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Card, Input, Modal, Space, Table, Tag, Typography, message } from 'antd'
import { ArrowLeftOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons'
import { apiGetJson, apiJson, type ApiSuccessResponse } from '../../../lib/v2Api'

const { Title, Text } = Typography

type AlertEvent = {
  eventId: string
  eventType: 'ALERT_TRIGGER' | 'ALERT_UPDATE' | 'ALERT_RESOLVE' | 'ALERT_ACK'
  severity: 'low' | 'medium' | 'high' | 'critical'
  createdAt: string
  ruleId: string
  ruleVersion: number
  deviceId?: string | null
  stationId?: string | null
  evidence?: Record<string, unknown>
}

type AlertEventsResponse = {
  alertId: string
  events: AlertEvent[]
}

function severityTag(sev: AlertEvent['severity']) {
  const color = sev === 'critical' ? 'red' : sev === 'high' ? 'volcano' : sev === 'medium' ? 'orange' : 'green'
  return <Tag color={color}>{sev}</Tag>
}

export default function AlertDetailPage() {
  const params = useParams<{ alertId: string }>()
  const router = useRouter()
  const alertId = params.alertId

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<AlertEvent[]>([])

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await apiGetJson<ApiSuccessResponse<AlertEventsResponse>>(
        `/api/v1/alerts/${encodeURIComponent(alertId)}/events`
      )
      setEvents(json.data?.events ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [alertId])

  useEffect(() => {
    void fetchEvents()
  }, [fetchEvents])

  const latest = useMemo(() => events[0] ?? null, [events])

  const actionAlert = async (action: 'ack' | 'resolve') => {
    let notes = ''
    const title = action === 'ack' ? 'Ack 告警' : 'Resolve 告警'

    Modal.confirm({
      title,
      content: (
        <Input.TextArea
          placeholder="可选：notes"
          autoSize={{ minRows: 3, maxRows: 8 }}
          onChange={(e) => {
            notes = e.target.value
          }}
        />
      ),
      okText: action === 'ack' ? '确认 Ack' : '确认 Resolve',
      cancelText: '取消',
      onOk: async () => {
        const trimmed = notes.trim()
        await apiJson<ApiSuccessResponse<unknown>>(`/api/v1/alerts/${encodeURIComponent(alertId)}/${action}`, {
          ...(trimmed ? { notes: trimmed } : {}),
        })
        message.success(`${title} 成功`)
        await fetchEvents()
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/alerts')}>
              返回
            </Button>
            <Title level={3} style={{ margin: 0 }}>
              告警详情
            </Title>
          </Space>
          <Text type="secondary">alertId: <span className="font-mono">{alertId}</span></Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchEvents()} loading={loading}>
            刷新
          </Button>
          <Button icon={<CheckOutlined />} onClick={() => void actionAlert('ack')}>
            Ack
          </Button>
          <Button onClick={() => void actionAlert('resolve')}>Resolve</Button>
        </Space>
      </div>

      <Card title="最新事件（摘要）" size="small">
        {latest ? (
          <Space wrap>
            {severityTag(latest.severity)}
            <Tag>{latest.eventType}</Tag>
            <span>时间：<span className="font-mono">{latest.createdAt}</span></span>
            <span>规则：<span className="font-mono">{latest.ruleId}</span> v{latest.ruleVersion}</span>
            <span>对象：<span className="font-mono">{latest.deviceId || latest.stationId || '-'}</span></span>
          </Space>
        ) : (
          <Text type="secondary">暂无事件</Text>
        )}
      </Card>

      <Card title="事件流（审计）" size="small">
        {error ? <Text type="danger">加载失败：{error}</Text> : null}
        <Table
          rowKey="eventId"
          size="small"
          loading={loading}
          dataSource={events}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'createdAt', dataIndex: 'createdAt', width: 200, render: (v: string) => <span className="font-mono">{v}</span> },
            { title: 'severity', dataIndex: 'severity', width: 110, render: (v: AlertEvent['severity']) => severityTag(v) },
            { title: 'eventType', dataIndex: 'eventType', width: 140, render: (v: string) => <Tag>{v}</Tag> },
            { title: 'rule', render: (_: unknown, r: AlertEvent) => <span className="font-mono">{r.ruleId} v{r.ruleVersion}</span> },
            { title: 'target', render: (_: unknown, r: AlertEvent) => <span className="font-mono">{r.deviceId || r.stationId || '-'}</span> },
            {
              title: 'evidence',
              dataIndex: 'evidence',
              render: (v: unknown) => (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{v ? JSON.stringify(v, null, 2) : '-'}</pre>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}

