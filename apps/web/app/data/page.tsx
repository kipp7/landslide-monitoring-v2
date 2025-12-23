'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, DatePicker, InputNumber, Select, Space, Table, Tag, Typography, message } from 'antd'
import { DownloadOutlined, LineChartOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import ReactECharts from 'echarts-for-react'
import useDeviceList from '../hooks/useDeviceList'
import useSensors from '../hooks/useSensors'
import {
  exportData,
  getDeviceRaw,
  getDeviceSeries,
  getStatistics,
  type DataSeriesRow,
  type RawPointRow,
  type StatisticsResponse,
} from '../../lib/api/data'

const { Title, Text } = Typography

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function toCsvDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function buildLineOption(series: DataSeriesRow[], sensorsByKey: Map<string, { displayName: string; unit: string }>) {
  const x = new Set<string>()
  for (const s of series) for (const p of s.points) x.add(p.ts)
  const xAxis = Array.from(x.values()).sort()

  return {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll' },
    grid: { left: 50, right: 30, top: 40, bottom: 40 },
    xAxis: { type: 'category', data: xAxis, axisLabel: { formatter: (v: string) => v.replace('T', ' ').replace('Z', '') } },
    yAxis: { type: 'value', scale: true },
    series: series.map((s) => {
      const sensor = sensorsByKey.get(s.sensorKey)
      const name = `${sensor?.displayName ?? s.sensorKey}${sensor?.unit ? ` (${sensor.unit})` : ''}`
      const pointMap = new Map(s.points.map((p) => [p.ts, p.value] as const))
      return {
        name,
        type: 'line',
        showSymbol: false,
        connectNulls: true,
        data: xAxis.map((ts) => {
          const v = pointMap.get(ts)
          if (isNumber(v)) return v
          return null
        }),
      }
    }),
  }
}

function buildStatisticsOption(stats: StatisticsResponse | null, sensorsByKey: Map<string, { displayName: string; unit: string }>) {
  const buckets = stats?.buckets ?? []
  const sensor = stats ? sensorsByKey.get(stats.sensorKey) : undefined
  const label = stats ? `${sensor?.displayName ?? stats.sensorKey}${sensor?.unit ? ` (${sensor.unit})` : ''}` : ''

  return {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll' },
    grid: { left: 50, right: 50, top: 40, bottom: 40 },
    xAxis: {
      type: 'category',
      data: buckets.map((b) => b.ts),
      axisLabel: { formatter: (v: string) => v.replace('T', ' ').replace('Z', '') },
    },
    yAxis: [
      { type: 'value', scale: true, name: label },
      { type: 'value', name: 'count' },
    ],
    series: [
      { name: 'avg', type: 'line', showSymbol: false, connectNulls: true, data: buckets.map((b) => b.avg) },
      { name: 'min', type: 'line', showSymbol: false, connectNulls: true, data: buckets.map((b) => b.min) },
      { name: 'max', type: 'line', showSymbol: false, connectNulls: true, data: buckets.map((b) => b.max) },
      { name: 'count', type: 'bar', yAxisIndex: 1, data: buckets.map((b) => b.count) },
    ],
  }
}

export default function DataExplorerPage() {
  const { devices, loading: devicesLoading, error: devicesError, refetch } = useDeviceList()
  const { list: sensors, byKey: sensorsByKey, loading: sensorsLoading, error: sensorsError } = useSensors()

  const [deviceId, setDeviceId] = useState<string>('')
  useEffect(() => {
    if (!deviceId && devices.length > 0) setDeviceId(devices[0].device_id)
  }, [deviceId, devices])

  const [range, setRange] = useState<[Date, Date]>(() => {
    const end = new Date()
    const start = new Date(end.getTime() - 6 * 60 * 60 * 1000)
    return [start, end]
  })

  const [interval, setInterval] = useState<'raw' | '1m' | '5m' | '1h' | '1d'>('raw')
  const [timeField, setTimeField] = useState<'received' | 'event'>('received')
  const [sensorKeys, setSensorKeys] = useState<string[]>([])

  const [seriesLoading, setSeriesLoading] = useState(false)
  const [seriesError, setSeriesError] = useState<string | null>(null)
  const [seriesRows, setSeriesRows] = useState<DataSeriesRow[]>([])
  const [missing, setMissing] = useState<Array<{ sensorKey: string; reason: string }>>([])

  const [rawSensorKey, setRawSensorKey] = useState<string>('')
  const [rawLimit, setRawLimit] = useState<number>(2000)
  const [rawLoading, setRawLoading] = useState(false)
  const [rawError, setRawError] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<RawPointRow[]>([])

  const [statsSensorKey, setStatsSensorKey] = useState<string>('')
  const [statsInterval, setStatsInterval] = useState<'1h' | '1d'>('1h')
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [stats, setStats] = useState<StatisticsResponse | null>(null)

  useEffect(() => {
    if (!rawSensorKey && sensorKeys.length === 1) setRawSensorKey(sensorKeys[0])
  }, [rawSensorKey, sensorKeys])

  useEffect(() => {
    if (!statsSensorKey && sensorKeys.length === 1) setStatsSensorKey(sensorKeys[0])
  }, [statsSensorKey, sensorKeys])

  const sensorOptions = useMemo(
    () =>
      sensors.map((s) => ({
        value: s.sensorKey,
        label: `${s.displayName}${s.unit ? ` (${s.unit})` : ''} · ${s.sensorKey}`,
      })),
    [sensors],
  )

  const refreshSeries = useCallback(async () => {
    if (!deviceId) return
    if (sensorKeys.length === 0) {
      message.info('请先选择 sensorKeys')
      return
    }
    try {
      setSeriesLoading(true)
      setSeriesError(null)
      const json = await getDeviceSeries({
        deviceId,
        startTime: range[0].toISOString(),
        endTime: range[1].toISOString(),
        sensorKeys,
        interval,
        timeField,
      })
      setSeriesRows(json.data?.series ?? [])
      setMissing(json.data?.missing ?? [])
    } catch (caught) {
      setSeriesError(caught instanceof Error ? caught.message : String(caught))
      setSeriesRows([])
      setMissing([])
    } finally {
      setSeriesLoading(false)
    }
  }, [deviceId, interval, range, sensorKeys, timeField])

  const refreshRaw = useCallback(async () => {
    if (!deviceId) return
    if (!rawSensorKey) {
      message.info('请选择 raw 的 sensorKey')
      return
    }
    try {
      setRawLoading(true)
      setRawError(null)
      const json = await getDeviceRaw({
        deviceId,
        startTime: range[0].toISOString(),
        endTime: range[1].toISOString(),
        sensorKey: rawSensorKey,
        limit: rawLimit,
        order: 'asc',
      })
      setRawRows(json.data?.list ?? [])
    } catch (caught) {
      setRawError(caught instanceof Error ? caught.message : String(caught))
      setRawRows([])
    } finally {
      setRawLoading(false)
    }
  }, [deviceId, range, rawLimit, rawSensorKey])

  const refreshStats = useCallback(async () => {
    if (!deviceId) return
    if (!statsSensorKey) {
      message.info('请选择 statistics 的 sensorKey')
      return
    }
    try {
      setStatsLoading(true)
      setStatsError(null)
      const json = await getStatistics({
        scope: 'device',
        deviceId,
        sensorKey: statsSensorKey,
        startTime: range[0].toISOString(),
        endTime: range[1].toISOString(),
        interval: statsInterval,
      })
      setStats(json.data ?? null)
    } catch (caught) {
      setStatsError(caught instanceof Error ? caught.message : String(caught))
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
  }, [deviceId, range, statsInterval, statsSensorKey])

  const doExportCsv = useCallback(async () => {
    if (!deviceId) return
    if (sensorKeys.length === 0) {
      message.info('请先选择 sensorKeys')
      return
    }
    try {
      const json = await exportData({
        scope: 'device',
        deviceId,
        startTime: range[0].toISOString(),
        endTime: range[1].toISOString(),
        sensorKeys,
        format: 'csv',
      })
      const csv = typeof json.data?.data === 'string' ? json.data.data : ''
      if (!csv) throw new Error('导出返回为空')
      const filename = `telemetry_${deviceId}_${dayjs(range[0]).format('YYYYMMDDHHmm')}-${dayjs(range[1]).format(
        'YYYYMMDDHHmm',
      )}.csv`
      toCsvDownload(csv, filename)
      if (json.data?.limitHit) message.warning('导出命中限制：数据被截断（请缩小时间范围或减少指标）')
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    }
  }, [deviceId, range, sensorKeys])

  const option = useMemo(() => buildLineOption(seriesRows, sensorsByKey), [seriesRows, sensorsByKey])
  const statsOption = useMemo(() => buildStatisticsOption(stats, sensorsByKey), [stats, sensorsByKey])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            数据浏览器
          </Title>
          <Text type="secondary">曲线：`/api/v1/data/series/*`；原始点：`/api/v1/data/raw/*`；导出：`/api/v1/data/export`</Text>
        </div>
        <Space>
          <Link href="/analysis">概览</Link>
          <Link href="/data/realtime">Realtime</Link>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void refetch()
            }}
            loading={devicesLoading}
          >
            刷新设备
          </Button>
        </Space>
      </div>

      {devicesError ? (
        <Card>
          <Text type="danger">设备列表加载失败：{devicesError.message}</Text>
        </Card>
      ) : null}

      {sensorsError ? (
        <Card>
          <Text type="danger">传感器字典加载失败：{sensorsError}</Text>
        </Card>
      ) : null}

      <Card title="查询条件" size="small">
        <Space wrap>
          <span>设备</span>
          <Select
            style={{ minWidth: 260 }}
            value={deviceId || undefined}
            showSearch
            loading={devicesLoading}
            options={devices.map((d) => ({ value: d.device_id, label: `${d.display_name} (${d.device_id})` }))}
            onChange={(v) => setDeviceId(v)}
          />
          <span>时间范围</span>
          <DatePicker.RangePicker
            showTime
            value={[dayjs(range[0]), dayjs(range[1])]}
            onChange={(value) => {
              if (!value || value.length !== 2 || !value[0] || !value[1]) return
              setRange([value[0].toDate(), value[1].toDate()])
            }}
          />
          <span>interval</span>
          <Select
            style={{ width: 110 }}
            value={interval}
            options={['raw', '1m', '5m', '1h', '1d'].map((v) => ({ value: v, label: v }))}
            onChange={(v) => setInterval(v)}
          />
          <span>timeField</span>
          <Select
            style={{ width: 120 }}
            value={timeField}
            options={[
              { value: 'received', label: 'received' },
              { value: 'event', label: 'event' },
            ]}
            onChange={(v) => setTimeField(v)}
          />
        </Space>

        <div className="mt-3">
          <Space wrap align="start">
            <div>
              <div className="mb-1">
                <Text type="secondary">sensorKeys（多选）</Text>
              </div>
              <Select
                style={{ minWidth: 680 }}
                mode="multiple"
                allowClear
                showSearch
                loading={sensorsLoading}
                options={sensorOptions}
                value={sensorKeys}
                onChange={(v) => setSensorKeys(v)}
                placeholder="选择要查询的指标（来自 sensors 字典）"
              />
            </div>
            <div className="pt-6">
              <Space>
                <Button type="primary" icon={<LineChartOutlined />} onClick={() => void refreshSeries()} loading={seriesLoading}>
                  查询曲线
                </Button>
                <Button icon={<DownloadOutlined />} onClick={() => void doExportCsv()} disabled={sensorKeys.length === 0}>
                  导出 CSV
                </Button>
              </Space>
            </div>
          </Space>
        </div>
      </Card>

      <Card title="曲线" size="small" extra={seriesError ? <Text type="danger">加载失败：{seriesError}</Text> : null}>
        {missing.length > 0 ? (
          <div className="mb-3">
            <Text type="secondary">缺失：</Text>{' '}
            {missing.map((m) => (
              <Tag key={m.sensorKey} color="orange">
                {m.sensorKey}:{m.reason}
              </Tag>
            ))}
          </div>
        ) : null}
        {seriesRows.length > 0 ? (
          <ReactECharts option={option} style={{ height: 380 }} />
        ) : (
          <Text type="secondary">{seriesLoading ? '加载中…' : '暂无数据（请先查询）'}</Text>
        )}
      </Card>

      <Card
        title="统计（statistics）"
        size="small"
        extra={
          <Space>
            <Select
              style={{ width: 360 }}
              showSearch
              loading={sensorsLoading}
              options={sensorOptions}
              value={statsSensorKey || undefined}
              onChange={(v) => setStatsSensorKey(v)}
              placeholder="选择统计 sensorKey"
            />
            <Select
              style={{ width: 110 }}
              value={statsInterval}
              options={[
                { value: '1h', label: '1h' },
                { value: '1d', label: '1d' },
              ]}
              onChange={(v) => setStatsInterval(v)}
            />
            <Button onClick={() => void refreshStats()} loading={statsLoading}>
              查询统计
            </Button>
          </Space>
        }
      >
        {statsError ? <Text type="danger">加载失败：{statsError}</Text> : null}
        {stats?.buckets?.length ? (
          <ReactECharts option={statsOption} style={{ height: 320 }} />
        ) : (
          <Text type="secondary">{statsLoading ? '加载中…' : '暂无数据（请先查询）'}</Text>
        )}
      </Card>

      <Card
        title="原始点（raw）"
        size="small"
        extra={
          <Space>
            <Select
              style={{ width: 360 }}
              showSearch
              loading={sensorsLoading}
              options={sensorOptions}
              value={rawSensorKey || undefined}
              onChange={(v) => setRawSensorKey(v)}
              placeholder="选择 raw sensorKey"
            />
            <InputNumber min={1} max={100000} value={rawLimit} onChange={(v) => setRawLimit(Number(v ?? 2000))} />
            <Button onClick={() => void refreshRaw()} loading={rawLoading}>
              查询 raw
            </Button>
          </Space>
        }
      >
        {rawError ? <Text type="danger">加载失败：{rawError}</Text> : null}
        <Table
          rowKey={(_, idx) => String(idx)}
          size="small"
          loading={rawLoading}
          dataSource={rawRows}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'receivedTs', dataIndex: 'receivedTs', width: 220, render: (v: string) => <span className="font-mono">{v}</span> },
            { title: 'eventTs', dataIndex: 'eventTs', width: 220, render: (v: string | null) => <span className="font-mono">{v ?? '-'}</span> },
            { title: 'seq', dataIndex: 'seq', width: 90, render: (v: number | null) => v ?? '-' },
            { title: 'quality', dataIndex: 'quality', width: 90, render: (v: number | null) => v ?? '-' },
            { title: 'value', dataIndex: 'value', render: (v: unknown) => <span className="font-mono">{formatValue(v)}</span> },
          ]}
        />
      </Card>
    </div>
  )
}
