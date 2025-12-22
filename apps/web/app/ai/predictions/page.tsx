'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, DatePicker, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import ReactECharts from 'echarts-for-react'
import useDeviceList from '../../hooks/useDeviceList'
import { listAiPredictions, type AiPredictionRow } from '../../../lib/api/aiPredictions'

const { Title, Text } = Typography

function formatTs(ts: string): string {
  return ts.replace('T', ' ').replace('Z', '')
}

function riskTag(level: AiPredictionRow['riskLevel']) {
  const color = level === 'high' ? 'red' : level === 'medium' ? 'orange' : level === 'low' ? 'green' : 'default'
  return <Tag color={color}>{level ?? 'n/a'}</Tag>
}

function buildRiskOption(rows: AiPredictionRow[]) {
  const x = rows.map((r) => r.createdAt)
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
    xAxis: { type: 'category', data: x, axisLabel: { formatter: (v: string) => formatTs(v) } },
    yAxis: { type: 'value', min: 0, max: 1, name: 'riskScore' },
    series: [{ name: 'riskScore', type: 'line', showSymbol: false, connectNulls: true, data: rows.map((r) => r.riskScore) }],
  }
}

export default function AiPredictionsPage() {
  const { devices, loading: devicesLoading, error: devicesError, refetch } = useDeviceList()

  const [deviceId, setDeviceId] = useState<string>('')
  const [modelKey, setModelKey] = useState<string>('')
  const [range, setRange] = useState<[Date, Date]>(() => {
    const end = new Date()
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
    return [start, end]
  })
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<AiPredictionRow[]>([])
  const [pagination, setPagination] = useState<{ page: number; pageSize: number; total: number; totalPages: number } | null>(null)

  const [payloadOpen, setPayloadOpen] = useState(false)
  const [selected, setSelected] = useState<AiPredictionRow | null>(null)

  const deviceNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of devices) map.set(d.device_id, d.display_name || d.device_id)
    return map
  }, [devices])

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await listAiPredictions({
        page,
        pageSize,
        deviceId: deviceId || undefined,
        modelKey: modelKey || undefined,
        startTime: range[0].toISOString(),
        endTime: range[1].toISOString(),
        order,
      })
      setRows(json.data?.list ?? [])
      setPagination(json.data?.pagination ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setRows([])
      setPagination(null)
    } finally {
      setLoading(false)
    }
  }, [deviceId, modelKey, order, page, pageSize, range])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setPage(1)
  }, [deviceId, modelKey, order, range])

  const riskOption = useMemo(() => buildRiskOption(rows.slice().reverse()), [rows])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            AI 预测
          </Title>
          <Text type="secondary">对接：`/api/v1/ai/predictions*`（需要 `data:analysis`）</Text>
        </div>
        <Space>
          <Link href="/analysis">概览</Link>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void refetch()
              void refresh()
            }}
            loading={devicesLoading || loading}
          >
            刷新
          </Button>
        </Space>
      </div>

      {devicesError ? (
        <Card>
          <Text type="danger">设备列表加载失败：{devicesError.message}</Text>
        </Card>
      ) : null}

      <Card size="small" title="查询条件" extra={error ? <Text type="danger">加载失败：{error}</Text> : null}>
        <Space wrap>
          <span>设备</span>
          <Select
            style={{ minWidth: 420 }}
            value={deviceId || undefined}
            allowClear
            showSearch
            loading={devicesLoading}
            placeholder="选择设备（可选）"
            onChange={(v) => setDeviceId(v ?? '')}
            options={devices.map((d) => ({
              value: d.device_id,
              label: `${d.display_name || d.device_id} (${d.device_id.slice(0, 8)}…)`,
            }))}
          />

          <span>时间</span>
          <DatePicker.RangePicker
            showTime
            value={[dayjs(range[0]), dayjs(range[1])] as [Dayjs, Dayjs]}
            onChange={(v) => {
              const a = v?.[0] ?? null
              const b = v?.[1] ?? null
              if (!a || !b) return
              setRange([a.toDate(), b.toDate()])
            }}
          />

          <span>modelKey</span>
          <Input
            style={{ width: 240 }}
            value={modelKey}
            onChange={(e) => setModelKey(e.target.value)}
            placeholder="可选（例如 heuristic.v1）"
          />

          <span>order</span>
          <Select
            style={{ width: 120 }}
            value={order}
            onChange={(v) => setOrder(v)}
            options={[
              { value: 'desc', label: 'desc' },
              { value: 'asc', label: 'asc' },
            ]}
          />
        </Space>
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <span>风险曲线（riskScore）</span>
            <Tag>{rows.length}</Tag>
          </Space>
        }
      >
        <ReactECharts option={riskOption} style={{ height: 320 }} />
      </Card>

      <Card size="small" title="预测列表">
        <Table
          rowKey="predictionId"
          size="small"
          loading={loading}
          dataSource={rows}
          pagination={{
            current: pagination?.page ?? page,
            pageSize: pagination?.pageSize ?? pageSize,
            total: pagination?.total ?? 0,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
          }}
          columns={[
            { title: 'createdAt', dataIndex: 'createdAt', width: 180, render: (v: string) => <span className="font-mono">{formatTs(v)}</span> },
            {
              title: 'device',
              dataIndex: 'deviceId',
              width: 220,
              render: (v: string) => (
                <span>
                  {deviceNameById.get(v) ?? v.slice(0, 8) + '…'} <span className="font-mono">({v.slice(0, 8)}…)</span>
                </span>
              ),
            },
            { title: 'modelKey', dataIndex: 'modelKey', width: 160, render: (v: string) => <span className="font-mono">{v}</span> },
            { title: 'riskScore', dataIndex: 'riskScore', width: 120, render: (v: number) => v.toFixed(3) },
            { title: 'riskLevel', dataIndex: 'riskLevel', width: 110, render: (v: AiPredictionRow['riskLevel']) => riskTag(v) },
            { title: 'horizon(s)', dataIndex: 'horizonSeconds', width: 110 },
            { title: 'predictedTs', dataIndex: 'predictedTs', width: 180, render: (v: string) => <span className="font-mono">{formatTs(v)}</span> },
            { title: 'explain', dataIndex: 'explain', ellipsis: true, render: (v: string | null) => v ?? '-' },
            {
              title: 'payload',
              dataIndex: 'payload',
              width: 90,
              render: (_: unknown, row: AiPredictionRow) => (
                <Button
                  size="small"
                  onClick={() => {
                    setSelected(row)
                    setPayloadOpen(true)
                  }}
                >
                  查看
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={selected ? `payload · ${selected.predictionId.slice(0, 8)}…` : 'payload'}
        open={payloadOpen}
        onCancel={() => setPayloadOpen(false)}
        onOk={() => setPayloadOpen(false)}
        width={860}
      >
        {selected ? (
          <pre style={{ maxHeight: 520, overflow: 'auto', background: '#0b1220', color: '#e5e7eb', padding: 12, borderRadius: 8 }}>
            {JSON.stringify(selected.payload ?? {}, null, 2)}
          </pre>
        ) : (
          <Text type="secondary">未选择</Text>
        )}
      </Modal>
    </div>
  )
}
