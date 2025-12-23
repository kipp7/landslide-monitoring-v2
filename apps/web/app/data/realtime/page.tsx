'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Select, Space, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import useDeviceList from '../../hooks/useDeviceList'
import { useRealtimeStream, type RealtimeMessage } from '../../hooks/useRealtimeStream'

const { Title, Text } = Typography

function stringify(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default function DataRealtimePage() {
  const { devices, loading: devicesLoading, refetch } = useDeviceList()
  const deviceOptions = useMemo(
    () => [
      { value: 'all', label: 'all (broadcast / heartbeat only)' },
      ...devices.map((d) => ({ value: d.device_id, label: `${d.display_name} (${d.device_id})` })),
    ],
    [devices],
  )

  const [selected, setSelected] = useState<string>('all')
  const [messages, setMessages] = useState<RealtimeMessage[]>([])

  const stream = useRealtimeStream({
    deviceId: selected,
    onMessage: (msg) => setMessages((prev) => [msg, ...prev].slice(0, 200)),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Realtime (SSE)
          </Title>
          <Text type="secondary">`/api/v1/realtime/stream` 的最小订阅调试页（fetch streaming，支持 Bearer Token）。</Text>
        </div>
        <Space>
          <Link href="/analysis">概览</Link>
          <Link href="/data">数据浏览器</Link>
          <Button icon={<ReloadOutlined />} onClick={() => void refetch()} loading={devicesLoading}>
            刷新设备
          </Button>
        </Space>
      </div>

      <Card title="连接" size="small">
        <Space wrap>
          <span>device</span>
          <Select
            style={{ minWidth: 360 }}
            value={selected}
            showSearch
            loading={devicesLoading}
            options={deviceOptions}
            onChange={(v) => setSelected(v)}
          />
          <Button type="primary" onClick={stream.connect} disabled={stream.isConnected || stream.isConnecting}>
            连接
          </Button>
          <Button onClick={stream.disconnect} disabled={!stream.isConnected && !stream.isConnecting}>
            断开
          </Button>
          <Text type={stream.isConnected ? 'success' : stream.connectionError ? 'danger' : 'secondary'}>
            {stream.isConnected ? '已连接' : stream.isConnecting ? '连接中…' : stream.connectionError ?? '未连接'}
          </Text>
          <Text type="secondary">
            messages: <span className="font-mono">{stream.stats.messagesReceived}</span>
          </Text>
          {stream.stats.lastHeartbeat ? (
            <Text type="secondary">
              lastHeartbeat: <span className="font-mono">{stream.stats.lastHeartbeat}</span>
            </Text>
          ) : null}
        </Space>
      </Card>

      <Card title={`消息（最近 ${messages.length} 条）`} size="small">
        {messages.length ? (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }} className="font-mono">
            {stringify(messages)}
          </pre>
        ) : (
          <Text type="secondary">暂无消息</Text>
        )}
      </Card>
    </div>
  )
}

