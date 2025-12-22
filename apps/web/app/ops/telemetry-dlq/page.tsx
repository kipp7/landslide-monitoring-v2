'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Card, DatePicker, Input, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  getTelemetryDlqStats,
  listTelemetryDlq,
  type TelemetryDlqMessageRow,
  type TelemetryDlqStatsResponse,
} from '../../../lib/api/telemetryDlq'

const { Title, Text } = Typography

type DraftFilters = {
  reasonCode: string
  deviceId: string
  range: [Dayjs | null, Dayjs | null]
}

type AppliedFilters = {
  reasonCode?: string
  deviceId?: string
  range?: [Dayjs, Dayjs]
}

export default function TelemetryDlqPage() {
  const router = useRouter()

  const [draft, setDraft] = useState<DraftFilters>(() => ({
    reasonCode: '',
    deviceId: '',
    range: [dayjs().subtract(24, 'hour'), dayjs()],
  }))
  const [filters, setFilters] = useState<AppliedFilters>(() => ({
    range: [dayjs().subtract(24, 'hour'), dayjs()],
  }))

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<TelemetryDlqMessageRow[]>([])
  const [total, setTotal] = useState(0)

  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [stats, setStats] = useState<TelemetryDlqStatsResponse | null>(null)

  const startTime = filters.range ? filters.range[0].toISOString() : undefined
  const endTime = filters.range ? filters.range[1].toISOString() : undefined

  const fetchList = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await listTelemetryDlq({
        page,
        pageSize,
        reasonCode: filters.reasonCode,
        deviceId: filters.deviceId,
        startTime,
        endTime,
      })
      setRows(json.data?.list ?? [])
      setTotal(json.data?.pagination?.total ?? 0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [endTime, filters.deviceId, filters.reasonCode, page, pageSize, startTime])

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true)
      setStatsError(null)
      const json = await getTelemetryDlqStats({ deviceId: filters.deviceId, startTime, endTime })
      setStats(json.data ?? null)
    } catch (caught) {
      setStats(null)
      setStatsError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setStatsLoading(false)
    }
  }, [endTime, filters.deviceId, startTime])

  useEffect(() => {
    void fetchList()
    void fetchStats()
  }, [fetchList, fetchStats])

  const applyFilters = () => {
    const nextReason = draft.reasonCode.trim()
    const nextDevice = draft.deviceId.trim()
    const nextRange =
      draft.range[0] && draft.range[1] ? ([draft.range[0], draft.range[1]] as [Dayjs, Dayjs]) : undefined

    setPage(1)
    setFilters({
      reasonCode: nextReason ? nextReason : undefined,
      deviceId: nextDevice ? nextDevice : undefined,
      range: nextRange,
    })
  }

  const columns = useMemo(
    () => [
      { title: 'receivedAt', dataIndex: 'receivedAt', width: 190, render: (v: string) => <span className="font-mono">{v}</span> },
      { title: 'reasonCode', dataIndex: 'reasonCode', width: 160, render: (v: string) => <Tag>{v}</Tag> },
      {
        title: 'deviceId',
        dataIndex: 'deviceId',
        width: 280,
        render: (v: string) => (v ? <span className="font-mono">{v}</span> : <span className="text-gray-400">-</span>),
      },
      { title: 'reasonDetail', dataIndex: 'reasonDetail', width: 220, render: (v: string) => v || '-' },
      { title: 'rawPayloadPreview', dataIndex: 'rawPayloadPreview', render: (v: string) => <span className="font-mono">{v}</span> },
      {
        title: 'kafka',
        dataIndex: 'kafka',
        width: 260,
        render: (_: unknown, r: TelemetryDlqMessageRow) => (
          <span className="font-mono">
            {r.kafka.topic} #{r.kafka.partition} @{r.kafka.offset}
          </span>
        ),
      },
      { title: 'action', key: 'action', width: 90, render: (_: unknown, r: TelemetryDlqMessageRow) => <Link href={`/ops/telemetry-dlq/${r.messageId}`}>详情</Link> },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Telemetry DLQ
          </Title>
          <Text type="secondary">数据源：`/api/v1/telemetry/dlq*`（需要权限：`data:analysis`）</Text>
        </div>
        <Space>
          <Link href="/ops/system-monitor">系统监控</Link>
          <Link href="/ops/configs">系统配置</Link>
          <Link href="/ops/logs">操作日志</Link>
          <Link href="/ops/api-stats">API Stats</Link>
          <Link href="/ops/debug-api">Debug API</Link>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void fetchList()
              void fetchStats()
            }}
            loading={loading || statsLoading}
          >
            刷新
          </Button>
        </Space>
      </div>

      <Card title="查询条件" size="small">
        <Space wrap>
          <Input
            placeholder="reasonCode（可选）"
            value={draft.reasonCode}
            onChange={(e) => setDraft((prev) => ({ ...prev, reasonCode: e.target.value }))}
            allowClear
            style={{ width: 220 }}
          />
          <Input
            placeholder="deviceId（可选，UUID）"
            value={draft.deviceId}
            onChange={(e) => setDraft((prev) => ({ ...prev, deviceId: e.target.value }))}
            allowClear
            style={{ width: 340 }}
          />
          <DatePicker.RangePicker
            showTime
            value={draft.range}
            onChange={(value) => setDraft((prev) => ({ ...prev, range: (value ?? [null, null]) as DraftFilters['range'] }))}
          />
          <Button type="primary" onClick={applyFilters}>
            查询
          </Button>
        </Space>
      </Card>

      <Card title="统计" size="small" extra={statsLoading ? <Text type="secondary">加载中…</Text> : null}>
        {statsError ? <Text type="danger">加载失败：{statsError}</Text> : null}
        {stats ? (
          <div className="space-y-2">
            <div>
              <Text>
                total: <Text strong>{stats.totals.total}</Text>
              </Text>
            </div>
            <div>
              <Space wrap>
                {(stats.byReasonCode ?? []).map((r) => (
                  <Tag key={r.reasonCode}>
                    {r.reasonCode}: {r.count}
                  </Tag>
                ))}
              </Space>
            </div>
          </div>
        ) : (
          <Text type="secondary">暂无数据</Text>
        )}
      </Card>

      <Card title="DLQ 列表" size="small" extra={error ? <Text type="danger">加载失败：{error}</Text> : null}>
        <Table
          rowKey="messageId"
          size="small"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
          }}
          onRow={(record) => ({
            onDoubleClick: () => router.push(`/ops/telemetry-dlq/${record.messageId}`),
          })}
        />
      </Card>
    </div>
  )
}

