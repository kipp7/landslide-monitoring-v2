'use client'

import { Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { AnomalyAssessmentItem } from '../../../lib/api/anomalyAssessment'

const { Text } = Typography

export type RealtimeAnomalyEvent = {
  alertId?: string
  deviceId: string
  timestamp: string
  severity?: string
  title: string
  raw: unknown
}

function severityTag(sev: string | undefined) {
  const s = (sev ?? '').toLowerCase()
  if (s === 'critical') return <Tag color="red">critical</Tag>
  if (s === 'high') return <Tag color="volcano">high</Tag>
  if (s === 'medium') return <Tag color="orange">medium</Tag>
  if (s === 'low') return <Tag color="green">low</Tag>
  if (s === 'red') return <Tag color="red">red</Tag>
  if (s === 'orange') return <Tag color="orange">orange</Tag>
  if (s === 'yellow') return <Tag color="gold">yellow</Tag>
  if (s === 'blue') return <Tag color="blue">blue</Tag>
  if (s === 'normal') return <Tag color="green">normal</Tag>
  return <Tag>{sev ?? '-'}</Tag>
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

type Row = {
  key: string
  kind: 'realtime' | 'aggregate'
  deviceId?: string
  time: string
  severity: string
  title: string
  raw?: unknown
  count?: number
  recommendedAction?: string
}

export function RealtimeAnomalyTable({
  events,
  aggregates,
  loadingAggregates,
  aggregatesError,
  maxRows = 10,
}: {
  events: RealtimeAnomalyEvent[]
  aggregates?: AnomalyAssessmentItem[]
  loadingAggregates?: boolean
  aggregatesError?: string | null
  maxRows?: number
}) {
  const rows: Row[] = []

  for (const e of events.slice(0, maxRows)) {
    rows.push({
      key: `rt:${e.alertId ?? `${e.deviceId}:${e.timestamp}`}`,
      kind: 'realtime',
      deviceId: e.deviceId,
      time: e.timestamp,
      severity: e.severity ?? '-',
      title: e.title || '-',
      raw: e.raw,
    })
  }

  for (const agg of (aggregates ?? []).slice(0, maxRows)) {
    rows.push({
      key: `agg:${agg.anomaly_type}`,
      kind: 'aggregate',
      time: agg.latest_time,
      severity: agg.severity,
      title: agg.display_name,
      count: agg.count,
      recommendedAction: agg.recommended_action,
    })
  }

  const columns: ColumnsType<Row> = [
    {
      title: 'Source',
      dataIndex: 'kind',
      width: 90,
      render: (v: Row['kind']) => (v === 'realtime' ? <Tag color="processing">SSE</Tag> : <Tag>24h</Tag>),
    },
    { title: 'Time', dataIndex: 'time', width: 190, render: (v: string) => <span className="font-mono">{v}</span> },
    {
      title: 'Severity',
      dataIndex: 'severity',
      width: 100,
      render: (v: string) => severityTag(v),
    },
    {
      title: 'Type / Title',
      dataIndex: 'title',
      render: (v: string, row) => (
        <div className="space-y-1">
          <div>{v}</div>
          {row.kind === 'aggregate' ? (
            <Text type="secondary">
              Count: <span className="font-mono">{row.count ?? 0}</span>
              {row.recommendedAction ? ` · ${row.recommendedAction}` : null}
            </Text>
          ) : row.deviceId ? (
            <Text type="secondary">
              Device: <span className="font-mono">{row.deviceId}</span>
            </Text>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-2">
      {aggregatesError ? <Text type="danger">Anomaly assessment load failed: {aggregatesError}</Text> : null}
      <Table<Row>
        rowKey="key"
        size="small"
        pagination={{ pageSize: maxRows }}
        loading={loadingAggregates}
        dataSource={rows}
        columns={columns}
        expandable={{
          expandedRowRender: (row) =>
            row.kind === 'realtime' && row.raw !== undefined ? (
              <pre className="text-xs whitespace-pre-wrap break-words font-mono m-0">{toJson(row.raw)}</pre>
            ) : null,
          rowExpandable: (row) => row.kind === 'realtime' && row.raw !== undefined,
        }}
      />
    </div>
  )
}

