'use client'

import { Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

export type RealtimeDeviceLastSeen = Record<string, string | undefined>

type DeviceLike = { device_id: string; display_name: string }

type Row = {
  deviceId: string
  name: string
  lastSeen?: string
  status: 'fresh' | 'stale' | 'missing'
}

function secondsAgo(ts: string | undefined): number | undefined {
  if (!ts) return undefined
  const ms = Date.parse(ts)
  if (!Number.isFinite(ms)) return undefined
  return Math.max(0, Math.floor((Date.now() - ms) / 1000))
}

function statusTag(status: Row['status']) {
  if (status === 'fresh') return <Tag color="green">fresh</Tag>
  if (status === 'stale') return <Tag color="orange">stale</Tag>
  return <Tag>missing</Tag>
}

export function RealtimeSensorStatusTable({
  devices,
  lastSeenByDeviceId,
  freshWithinSeconds = 60,
  maxRows = 10,
}: {
  devices: DeviceLike[]
  lastSeenByDeviceId: RealtimeDeviceLastSeen
  freshWithinSeconds?: number
  maxRows?: number
}) {
  const rows: Row[] = devices.map((d) => {
    const lastSeen = lastSeenByDeviceId[d.device_id]
    const ageSec = secondsAgo(lastSeen)
    const status: Row['status'] =
      ageSec === undefined ? 'missing' : ageSec <= freshWithinSeconds ? 'fresh' : 'stale'
    return {
      deviceId: d.device_id,
      name: d.display_name || d.device_id,
      lastSeen,
      status,
    }
  })

  rows.sort((a, b) => {
    const aa = secondsAgo(a.lastSeen)
    const bb = secondsAgo(b.lastSeen)
    if (aa === undefined && bb === undefined) return a.name.localeCompare(b.name)
    if (aa === undefined) return 1
    if (bb === undefined) return -1
    return aa - bb
  })

  const freshCount = rows.filter((r) => r.status === 'fresh').length

  const columns: ColumnsType<Row> = [
    { title: 'Device', dataIndex: 'name', render: (v: string, row) => <span title={row.deviceId}>{v}</span> },
    {
      title: 'Last seen',
      dataIndex: 'lastSeen',
      width: 190,
      render: (v: string | undefined) => <span className="font-mono">{v ?? '-'}</span>,
    },
    {
      title: 'Age',
      key: 'age',
      width: 90,
      render: (_: unknown, row) => {
        const age = secondsAgo(row.lastSeen)
        return <span className="font-mono">{age === undefined ? '-' : `${age}s`}</span>
      },
    },
    { title: 'SSE', dataIndex: 'status', width: 90, render: (v: Row['status']) => statusTag(v) },
  ]

  return (
    <div className="space-y-2">
      <Text type="secondary">
        Fresh (&lt;= {freshWithinSeconds}s): <span className="font-mono">{freshCount}</span> /{' '}
        <span className="font-mono">{rows.length}</span>
      </Text>
      <Table<Row>
        rowKey="deviceId"
        size="small"
        pagination={{ pageSize: maxRows }}
        dataSource={rows.slice(0, Math.max(maxRows, 1))}
        columns={columns}
      />
    </div>
  )
}
