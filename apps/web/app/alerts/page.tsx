'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Card, DatePicker, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { CheckOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { actionAlert as actionAlertApi, listAlerts, type AlertRow } from '../../lib/api/alerts'

const { Title, Text } = Typography

function severityTag(sev: AlertRow['severity']) {
  const color = sev === 'critical' ? 'red' : sev === 'high' ? 'volcano' : sev === 'medium' ? 'orange' : 'green'
  return <Tag color={color}>{sev}</Tag>
}

export default function AlertsPage() {
  const [rows, setRows] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState<AlertRow['status'] | 'all'>('all')
  const [severity, setSeverity] = useState<AlertRow['severity'] | 'all'>('all')

  const [range, setRange] = useState<[Date, Date]>(() => {
    const end = new Date()
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
    return [start, end]
  })

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await listAlerts({
        page: 1,
        pageSize: 200,
        startTime: range[0].toISOString(),
        endTime: range[1].toISOString(),
        status: status === 'all' ? undefined : status,
        severity: severity === 'all' ? undefined : severity,
      })
      setRows(json.data?.list ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [range, severity, status])

  useEffect(() => {
    void fetchAlerts()
  }, [fetchAlerts])

  const actionAlert = async (alertId: string, action: 'ack' | 'resolve') => {
    const title = action === 'ack' ? 'Ack 告警' : 'Resolve 告警'
    const okText = action === 'ack' ? '确认 Ack' : '确认 Resolve'

    let notes = ''

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
      okText,
      cancelText: '取消',
      onOk: async () => {
        const trimmed = notes.trim()
        await actionAlertApi(alertId, action, trimmed ? { notes: trimmed } : undefined)
        message.success(`${title} 成功`)
        await fetchAlerts()
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            告警
          </Title>
          <Text type="secondary">数据源：v2 API（/api/v1/alerts）</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchAlerts()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <Card>
        <Space wrap>
          <span>时间范围</span>
          <DatePicker.RangePicker
            showTime
            value={[dayjs(range[0]), dayjs(range[1])]}
            onChange={(value) => {
              if (!value || value.length !== 2 || !value[0] || !value[1]) return
              setRange([value[0].toDate(), value[1].toDate()])
            }}
          />
          <span>状态</span>
          <Select
            style={{ width: 160 }}
            value={status}
            onChange={(v) => setStatus(v)}
            options={[
              { value: 'all', label: 'all' },
              { value: 'active', label: 'active' },
              { value: 'acked', label: 'acked' },
              { value: 'resolved', label: 'resolved' },
            ]}
          />
          <span>级别</span>
          <Select
            style={{ width: 160 }}
            value={severity}
            onChange={(v) => setSeverity(v)}
            options={[
              { value: 'all', label: 'all' },
              { value: 'low', label: 'low' },
              { value: 'medium', label: 'medium' },
              { value: 'high', label: 'high' },
              { value: 'critical', label: 'critical' },
            ]}
          />
        </Space>

        <div className="mt-4">
          {error ? <Text type="danger">加载失败：{error}</Text> : null}
          <Table
            rowKey="alertId"
            loading={loading}
            dataSource={rows}
            pagination={{ pageSize: 20 }}
            size="small"
            columns={[
              { title: 'Time', dataIndex: 'lastEventAt', render: (v: string) => <span className="font-mono">{v}</span> },
              { title: 'Severity', dataIndex: 'severity', render: (v: AlertRow['severity']) => severityTag(v) },
              { title: 'Title', dataIndex: 'title', render: (v: string | null | undefined) => v || '-' },
              {
                title: 'Target',
                render: (_: unknown, r: AlertRow) => r.deviceId || r.stationId || '-',
              },
              { title: 'Status', dataIndex: 'status' },
              {
                title: 'Detail',
                dataIndex: 'alertId',
                render: (v: string) => (
                  <Link href={`/alerts/${encodeURIComponent(v)}`} className="font-mono">
                    {v.slice(0, 8)}…
                  </Link>
                ),
              },
              {
                title: 'Actions',
                render: (_: unknown, r: AlertRow) => (
                  <Space>
                    <Button
                      size="small"
                      icon={<CheckOutlined />}
                      disabled={r.status !== 'active'}
                      onClick={() => void actionAlert(r.alertId, 'ack')}
                    >
                      Ack
                    </Button>
                    <Button
                      size="small"
                      disabled={r.status === 'resolved'}
                      onClick={() => void actionAlert(r.alertId, 'resolve')}
                    >
                      Resolve
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </div>
      </Card>
    </div>
  )
}
