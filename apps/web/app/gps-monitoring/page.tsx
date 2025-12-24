'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, DatePicker, Descriptions, Dropdown, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd'
import type { MenuProps } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import ReactECharts from 'echarts-for-react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import useDeviceList from '../hooks/useDeviceList'
import useSensors from '../hooks/useSensors'
import { exportData, getDeviceSeries } from '../../lib/api/data'
import { listAiPredictions, type AiPredictionRow } from '../../lib/api/aiPredictions'
import { downloadArrayBuffer, downloadDataUrl, downloadTextFile } from '../../lib/download'
import { qualityCheckGpsBaseline, type GpsBaselineQualityCheckResponse } from '../../lib/api/gpsBaselinesAdvanced'
import { toNumber } from '../../lib/v2Api'

const { Title, Text } = Typography

type TrackPoint = { ts: string; lat: number; lon: number; alt: number | null }

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const r = 6371000
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function trackToCsv(points: TrackPoint[]): string {
  const lines: string[] = ['ts,lat,lon,alt']
  for (const p of points) {
    lines.push(`${p.ts},${p.lat},${p.lon},${p.alt ?? ''}`)
  }
  return lines.join('\n')
}

function movingAverage(values: number[], windowSize: number): number[] {
  const w = Math.max(1, Math.floor(windowSize))
  const out: number[] = []
  let sum = 0
  const q: number[] = []
  for (const v of values) {
    q.push(v)
    sum += v
    if (q.length > w) sum -= q.shift() ?? 0
    out.push(sum / q.length)
  }
  return out
}

export default function GpsMonitoringPage() {
  const ceemdChartRef = useRef<InstanceType<typeof ReactECharts> | null>(null)

  const { devices, loading: devicesLoading, error: devicesError, refetch } = useDeviceList()
  const { byKey: sensorsByKey } = useSensors()

  const [deviceId, setDeviceId] = useState<string>('')
  useEffect(() => {
    if (!deviceId && devices.length > 0) setDeviceId(devices[0].device_id)
  }, [deviceId, devices])

  const [range, setRange] = useState<[Date, Date]>(() => {
    const end = new Date()
    const start = new Date(end.getTime() - 6 * 60 * 60 * 1000)
    return [start, end]
  })

  const [latKey, setLatKey] = useState('gps_latitude')
  const [lonKey, setLonKey] = useState('gps_longitude')
  const [altKey, setAltKey] = useState<string>('gps_altitude')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [track, setTrack] = useState<TrackPoint[]>([])

  const [qcLoading, setQcLoading] = useState(false)
  const [qcError, setQcError] = useState<string | null>(null)
  const [qc, setQc] = useState<GpsBaselineQualityCheckResponse | null>(null)

  const [predLoading, setPredLoading] = useState(false)
  const [predError, setPredError] = useState<string | null>(null)
  const [predictions, setPredictions] = useState<AiPredictionRow[]>([])

  const doExportTrackCsv = useCallback(() => {
    if (!deviceId) return
    if (track.length === 0) {
      message.info('没有可导出的轨迹点')
      return
    }
    const filename = `gps_track_${deviceId}_${dayjs(range[0]).format('YYYYMMDDHHmm')}-${dayjs(range[1]).format('YYYYMMDDHHmm')}.csv`
    downloadTextFile(trackToCsv(track), filename, 'text/csv;charset=utf-8')
  }, [deviceId, range, track])

  const doExportTelemetryCsv = useCallback(async () => {
    if (!deviceId) return
    const keys = altKey.trim() ? [latKey, lonKey, altKey] : [latKey, lonKey]
    try {
      const json = await exportData({
        scope: 'device',
        deviceId,
        startTime: range[0].toISOString(),
        endTime: range[1].toISOString(),
        sensorKeys: keys,
        format: 'csv',
      })
      const csv = typeof json.data?.data === 'string' ? json.data.data : ''
      if (!csv) throw new Error('导出返回为空')
      const filename = `gps_telemetry_${deviceId}_${dayjs(range[0]).format('YYYYMMDDHHmm')}-${dayjs(range[1]).format(
        'YYYYMMDDHHmm',
      )}.csv`
      downloadTextFile(csv, filename, 'text/csv;charset=utf-8')
      if (json.data?.limitHit) message.warning('导出命中限制：数据被截断（请缩小时间范围或减少指标）')
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    }
  }, [altKey, deviceId, latKey, lonKey, range])

  const doExportTrackXlsx = useCallback(async () => {
    if (!deviceId) return
    if (track.length === 0) {
      message.info('没有可导出的轨迹点')
      return
    }
    try {
      const mod = await import('xlsx')
      const XLSX = (mod as unknown as { default?: typeof mod }).default ?? mod
      const rows = track.map((p) => ({
        ts: p.ts,
        lat: p.lat,
        lon: p.lon,
        alt: p.alt ?? null,
      }))
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, 'track')
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as unknown as ArrayBuffer
      const filename = `gps_track_${deviceId}_${dayjs(range[0]).format('YYYYMMDDHHmm')}-${dayjs(range[1]).format('YYYYMMDDHHmm')}.xlsx`
      downloadArrayBuffer(buf, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    }
  }, [deviceId, range, track])

  const doExportDisplacementXlsx = useCallback(async () => {
    if (!deviceId) return
    if (track.length < 2) {
      message.info('暂无位移序列可导出')
      return
    }
    try {
      const mod = await import('xlsx')
      const XLSX = (mod as unknown as { default?: typeof mod }).default ?? mod
      const wb = XLSX.utils.book_new()

      const base = track[0]
      const series = track.map((p) => ({
        ts: p.ts,
        meters: haversineMeters(base.lat, base.lon, p.lat, p.lon),
      }))
      const seriesRows = series.map((p) => ({ ts: p.ts, displacement_m: p.meters }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(seriesRows), 'displacement')

      const values = series.map((p) => p.meters)
      const summaryRows = [
        { key: 'deviceId', value: deviceId },
        { key: 'startTs', value: series[0].ts },
        { key: 'endTs', value: series[series.length - 1].ts },
        { key: 'points', value: series.length },
        { key: 'maxMeters', value: Math.max(...values) },
        { key: 'avgMeters', value: values.reduce((s, v) => s + v, 0) / values.length },
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'summary')

      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as unknown as ArrayBuffer
      const filename = `gps_displacement_${deviceId}_${dayjs(range[0]).format('YYYYMMDDHHmm')}-${dayjs(range[1]).format('YYYYMMDDHHmm')}.xlsx`
      downloadArrayBuffer(buf, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    }
  }, [deviceId, range, track])

  const doExportCeemdChartPng = useCallback(() => {
    if (!deviceId) return
    const instance = ceemdChartRef.current?.getEchartsInstance()
    const dataUrl = instance?.getDataURL?.({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
    if (!dataUrl) {
      message.info('暂无可导出的图表')
      return
    }
    const filename = `gps_ceemd_${deviceId}_${dayjs(range[0]).format('YYYYMMDDHHmm')}-${dayjs(range[1]).format('YYYYMMDDHHmm')}.png`
    downloadDataUrl(dataUrl, filename)
  }, [deviceId, range])

  const doExportMarkdownReport = useCallback(() => {
    if (!deviceId) return
    const parts: string[] = []
    parts.push(`# GPS 监测报告`)
    parts.push('')
    parts.push(`- deviceId: \`${deviceId}\``)
    parts.push(`- timeRange: \`${range[0].toISOString()}\` → \`${range[1].toISOString()}\``)
    parts.push(`- points: \`${track.length}\``)
    const localLatest = track.length > 0 ? track[track.length - 1] : null
    if (localLatest) {
      parts.push(
        `- latest: \`${localLatest.ts}\` (${localLatest.lat}, ${localLatest.lon}${localLatest.alt == null ? '' : `, alt=${localLatest.alt}`})`,
      )
    }
    parts.push('')

    if (track.length >= 2) {
      const base = track[0]
      const series = track.map((p) => haversineMeters(base.lat, base.lon, p.lat, p.lon))
      const maxMeters = Math.max(...series)
      const avgMeters = series.reduce((s, v) => s + v, 0) / series.length
      const startTs = track[0].ts
      const endTs = track[track.length - 1].ts
      parts.push('## 位移统计（相对首点）')
      parts.push('')
      parts.push(`- max: \`${maxMeters.toFixed(3)} m\``)
      parts.push(`- avg: \`${avgMeters.toFixed(3)} m\``)
      parts.push(`- time range: \`${startTs}\` → \`${endTs}\``)
      parts.push('')
    }

    if (qc) {
      parts.push('## 基准点质量检查')
      parts.push('')
      parts.push(`- recommendation: \`${qc.recommendation.level}\``)
      parts.push(`- drift p95/max: \`${qc.driftMeters.p95.toFixed(3)} / ${qc.driftMeters.max.toFixed(3)} m\``)
      parts.push('')
    }

    if (predictions.length > 0) {
      parts.push('## AI Predictions（最近 20 条）')
      parts.push('')
      parts.push('| createdAt | predictedTs | horizon(s) | riskScore | riskLevel | model |')
      parts.push('|---|---:|---:|---:|---:|---|')
      for (const p of predictions) {
        parts.push(
          `| \`${p.createdAt}\` | \`${p.predictedTs}\` | \`${p.horizonSeconds}\` | \`${p.riskScore.toFixed(3)}\` | \`${p.riskLevel ?? '-'}\` | \`${p.modelKey}\` |`,
        )
      }
      parts.push('')
    }

    const filename = `gps_report_${deviceId}_${dayjs(range[0]).format('YYYYMMDDHHmm')}-${dayjs(range[1]).format('YYYYMMDDHHmm')}.md`
    downloadTextFile(parts.join('\n'), filename, 'text/markdown;charset=utf-8')
  }, [deviceId, predictions, qc, range, track])

  const runQualityCheck = useCallback(async () => {
    if (!deviceId) return
    try {
      setQcLoading(true)
      setQcError(null)
      const json = await qualityCheckGpsBaseline(deviceId, {
        lookbackDays: 30,
        pointsCount: 200,
        latKey,
        lonKey,
        ...(altKey.trim() ? { altKey } : {}),
      })
      setQc(json.data ?? null)
    } catch (caught) {
      setQcError(caught instanceof Error ? caught.message : String(caught))
      setQc(null)
    } finally {
      setQcLoading(false)
    }
  }, [altKey, deviceId, latKey, lonKey])

  const refreshPredictions = useCallback(async () => {
    if (!deviceId) return
    try {
      setPredLoading(true)
      setPredError(null)
      const json = await listAiPredictions({ page: 1, pageSize: 20, deviceId })
      setPredictions(json.data?.list ?? [])
    } catch (caught) {
      setPredError(caught instanceof Error ? caught.message : String(caught))
      setPredictions([])
    } finally {
      setPredLoading(false)
    }
  }, [deviceId])

  const refresh = useCallback(async () => {
    if (!deviceId) return
    try {
      setLoading(true)
      setError(null)

      const keys = altKey.trim() ? [latKey, lonKey, altKey] : [latKey, lonKey]
      const json = await getDeviceSeries({
        deviceId,
        startTime: range[0].toISOString(),
        endTime: range[1].toISOString(),
        sensorKeys: keys,
        interval: 'raw',
        timeField: 'received',
      })

      const series = json.data?.series ?? []
      const latSeries = series.find((s) => s.sensorKey === latKey)?.points ?? []
      const lonSeries = series.find((s) => s.sensorKey === lonKey)?.points ?? []
      const altSeries = altKey.trim() ? series.find((s) => s.sensorKey === altKey)?.points ?? [] : []

      const lonByTs = new Map(lonSeries.map((p) => [p.ts, p.value] as const))
      const altByTs = new Map(altSeries.map((p) => [p.ts, p.value] as const))

      const points: TrackPoint[] = []
      for (const p of latSeries) {
        const lonVal = lonByTs.get(p.ts)
        const lat = toNumber(p.value)
        const lon = toNumber(lonVal)
        if (lat === undefined || lon === undefined) continue
        const altVal = altByTs.get(p.ts)
        points.push({
          ts: p.ts,
          lat,
          lon,
          alt: toNumber(altVal) ?? null,
        })
      }
      setTrack(points)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setTrack([])
    } finally {
      setLoading(false)
    }
  }, [altKey, deviceId, latKey, lonKey, range])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setQc(null)
    setQcError(null)
    setPredictions([])
    setPredError(null)
  }, [deviceId])

  const latest = useMemo(() => (track.length > 0 ? track[track.length - 1] : null), [track])
  const center = useMemo<[number, number]>(() => {
    if (latest) return [latest.lat, latest.lon]
    return [30.0, 120.0]
  }, [latest])

  const polyline = useMemo(() => track.map((p) => [p.lat, p.lon] as [number, number]), [track])

  const sensorLabel = useCallback(
    (key: string) => {
      const s = sensorsByKey.get(key)
      return s ? `${s.displayName}${s.unit ? ` (${s.unit})` : ''} · ${key}` : key
    },
    [sensorsByKey]
  )

  const displacementSeries = useMemo(() => {
    if (track.length < 2) return []
    const base = track[0]
    return track.map((p) => ({
      ts: p.ts,
      meters: haversineMeters(base.lat, base.lon, p.lat, p.lon),
    }))
  }, [track])

  const displacementStats = useMemo(() => {
    if (displacementSeries.length === 0) return null
    const values = displacementSeries.map((p) => p.meters)
    const maxMeters = Math.max(...values)
    const avgMeters = values.reduce((s, v) => s + v, 0) / values.length
    return {
      count: displacementSeries.length,
      maxMeters,
      avgMeters,
      startTs: displacementSeries[0].ts,
      endTs: displacementSeries[displacementSeries.length - 1].ts,
    }
  }, [displacementSeries])

  const ceemdLikeOption = useMemo(() => {
    if (displacementSeries.length < 3) return null
    const xs = displacementSeries.map((p) => p.ts.replace('T', ' ').replace('Z', ''))
    const values = displacementSeries.map((p) => p.meters)
    const trend = movingAverage(values, 12)
    const residual = values.map((v, i) => v - (trend[i] ?? 0))

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['displacement', 'trend', 'residual'] },
      grid: { left: 40, right: 20, top: 50, bottom: 55 },
      xAxis: { type: 'category', data: xs, axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value', name: 'm' },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 20, bottom: 20 }],
      series: [
        { name: 'displacement', type: 'line', showSymbol: false, smooth: true, data: values },
        { name: 'trend', type: 'line', showSymbol: false, smooth: true, data: trend },
        { name: 'residual', type: 'line', showSymbol: false, smooth: true, data: residual },
      ],
    }
  }, [displacementSeries])

  const predictionColumns = useMemo(() => {
    return [
      {
        title: 'createdAt',
        dataIndex: 'createdAt',
        width: 200,
        render: (v: string) => <span className="font-mono">{v}</span>,
      },
      {
        title: 'predictedTs',
        dataIndex: 'predictedTs',
        width: 200,
        render: (v: string) => <span className="font-mono">{v}</span>,
      },
      { title: 'horizon(s)', dataIndex: 'horizonSeconds', width: 120, render: (v: number) => <span className="font-mono">{v}</span> },
      { title: 'riskScore', dataIndex: 'riskScore', width: 120, render: (v: number) => <span className="font-mono">{v.toFixed(3)}</span> },
      {
        title: 'riskLevel',
        dataIndex: 'riskLevel',
        width: 120,
        render: (v: AiPredictionRow['riskLevel']) => {
          if (!v) return <Text type="secondary">-</Text>
          const color = v === 'high' ? 'red' : v === 'medium' ? 'orange' : 'green'
          return <Tag color={color}>{v.toUpperCase()}</Tag>
        },
      },
      { title: 'model', dataIndex: 'modelKey', width: 160, render: (v: string) => <span className="font-mono">{v}</span> },
      { title: 'explain', dataIndex: 'explain', ellipsis: true, render: (v: string | null) => v ?? '-' },
    ] as const
  }, [])

  const exportMenu = useMemo(() => {
    return {
      items: [
        { key: 'track_csv', label: '导出轨迹 CSV（本页点位）', onClick: () => doExportTrackCsv() },
        { key: 'track_xlsx', label: '导出轨迹 XLSX', onClick: () => void doExportTrackXlsx() },
        { type: 'divider' as const },
        { key: 'telemetry_csv', label: '导出遥测 CSV（/api/v1/data/export）', onClick: () => void doExportTelemetryCsv() },
        { key: 'displacement_xlsx', label: '导出位移 XLSX（相对首点）', onClick: () => void doExportDisplacementXlsx() },
        { type: 'divider' as const },
        { key: 'ceemd_png', label: '导出 CEEMD 图表 PNG（当前分栏）', onClick: () => doExportCeemdChartPng() },
        { key: 'report_md', label: '导出报告 Markdown（本页汇总）', onClick: () => doExportMarkdownReport() },
      ],
    } satisfies MenuProps
  }, [doExportCeemdChartPng, doExportDisplacementXlsx, doExportMarkdownReport, doExportTelemetryCsv, doExportTrackCsv, doExportTrackXlsx])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            GPS 监测
          </Title>
          <Text type="secondary">对接：`/api/v1/data/series/{'{deviceId}'}`（需要 `data:view`）</Text>
        </div>
        <Space>
          <Link href="/data">数据查询</Link>
          <Dropdown trigger={['click']} menu={exportMenu}>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Dropdown>
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

      <Card size="small" title="查询条件">
        <Space wrap>
          <span>设备</span>
          <Select
            style={{ minWidth: 420 }}
            value={deviceId || undefined}
            loading={devicesLoading}
            placeholder="选择设备"
            onChange={(v) => setDeviceId(v)}
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

          <span>latKey</span>
          <Select
            style={{ width: 240 }}
            value={latKey}
            onChange={(v) => setLatKey(v)}
            options={[
              { value: 'gps_latitude', label: sensorLabel('gps_latitude') },
              { value: 'gps_lat', label: sensorLabel('gps_lat') },
            ]}
          />
          <span>lonKey</span>
          <Select
            style={{ width: 240 }}
            value={lonKey}
            onChange={(v) => setLonKey(v)}
            options={[
              { value: 'gps_longitude', label: sensorLabel('gps_longitude') },
              { value: 'gps_lng', label: sensorLabel('gps_lng') },
            ]}
          />
          <span>altKey</span>
          <Select
            allowClear
            style={{ width: 240 }}
            value={altKey || undefined}
            onChange={(v) => setAltKey(v ?? '')}
            options={[
              { value: 'gps_altitude', label: sensorLabel('gps_altitude') },
              { value: 'gps_alt', label: sensorLabel('gps_alt') },
            ]}
          />
        </Space>
        {error ? (
          <div className="mt-2">
            <Text type="danger">加载失败：{error}</Text>
          </div>
        ) : null}
      </Card>

      <Tabs
        defaultActiveKey="realtime"
        items={[
          {
            key: 'realtime',
            label: '实时监测',
            children: (
              <Card
                size="small"
                title={
                  <Space>
                    <span>轨迹</span>
                    <Tag>{track.length}</Tag>
                    {latest ? (
                      <Text type="secondary">
                        最新：<span className="font-mono">{latest.ts}</span>
                      </Text>
                    ) : (
                      <Text type="secondary">暂无点</Text>
                    )}
                  </Space>
                }
              >
                <div style={{ height: 420 }}>
                  <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }}>
                    <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {polyline.length > 1 ? <Polyline positions={polyline} /> : null}
                    {latest ? (
                      <CircleMarker center={[latest.lat, latest.lon]} radius={7} pathOptions={{ color: '#1677ff' }}>
                        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                          {latest.ts.replace('T', ' ').replace('Z', '')}
                        </Tooltip>
                      </CircleMarker>
                    ) : null}
                  </MapContainer>
                </div>
              </Card>
            ),
          },
          {
            key: 'ceemd',
            label: 'CEEMD（轻量）',
            children: (
              <div className="space-y-4">
                <Alert
                  type="info"
                  message="说明：参考区包含 CEEMD 分解等高级分析。本页先提供一个“轻量级（前端）分解”用于保留体验入口，后续可按契约下沉到 worker/API。"
                />
                <Card size="small" title="位移分解（displacement / trend / residual）">
                  {ceemdLikeOption ? (
                    <ReactECharts ref={ceemdChartRef} option={ceemdLikeOption} style={{ height: 360 }} />
                  ) : (
                    <Text type="secondary">暂无数据</Text>
                  )}
                </Card>
              </div>
            ),
          },
          {
            key: 'prediction',
            label: '预测分析',
            children: (
              <div className="space-y-4">
                <Card
                  size="small"
                  title="AI Predictions"
                  extra={
                    <Button onClick={() => void refreshPredictions()} loading={predLoading} disabled={!deviceId}>
                      刷新预测
                    </Button>
                  }
                >
                  {predError ? <Text type="danger">预测加载失败：{predError}</Text> : null}
                  <Table rowKey="predictionId" size="small" dataSource={predictions} columns={[...predictionColumns]} pagination={{ pageSize: 20 }} />
                </Card>
              </div>
            ),
          },
          {
            key: 'data',
            label: '数据详情',
            children: (
              <div className="space-y-4">
                {displacementStats ? (
                  <Card size="small" title="统计概览">
                    <Descriptions bordered size="small" column={2}>
                      <Descriptions.Item label="points">{displacementStats.count}</Descriptions.Item>
                      <Descriptions.Item label="max displacement">{displacementStats.maxMeters.toFixed(3)} m</Descriptions.Item>
                      <Descriptions.Item label="avg displacement">{displacementStats.avgMeters.toFixed(3)} m</Descriptions.Item>
                      <Descriptions.Item label="time range">
                        <span className="font-mono">
                          {displacementStats.startTs} → {displacementStats.endTs}
                        </span>
                      </Descriptions.Item>
                    </Descriptions>
                  </Card>
                ) : (
                  <Alert type="info" message="暂无足够点位用于统计（至少 2 个点）" />
                )}

                <Card size="small" title="点位明细">
                  <Table
                    rowKey="ts"
                    size="small"
                    dataSource={track}
                    pagination={{ pageSize: 20 }}
                    columns={[
                      { title: 'ts', dataIndex: 'ts', width: 190, render: (v: string) => <span className="font-mono">{v}</span> },
                      { title: 'lat', dataIndex: 'lat', width: 140, render: (v: number) => <span className="font-mono">{v.toFixed(6)}</span> },
                      { title: 'lon', dataIndex: 'lon', width: 140, render: (v: number) => <span className="font-mono">{v.toFixed(6)}</span> },
                      { title: 'alt', dataIndex: 'alt', width: 120, render: (v: number | null) => <span className="font-mono">{v ?? '-'}</span> },
                    ]}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'risk',
            label: '风险/基准点',
            children: (
              <div className="space-y-4">
                <Card
                  size="small"
                  title="基准点质量检查（quality-check）"
                  extra={
                    <Space>
                      <Button onClick={() => void runQualityCheck()} loading={qcLoading} disabled={!deviceId}>
                        运行质量检查
                      </Button>
                      <Link href="/device-management/baselines">打开基准点管理</Link>
                    </Space>
                  }
                >
                  {qcError ? <Text type="danger">质量检查失败：{qcError}</Text> : null}
                  {qc ? (
                    <div className="space-y-3">
                      <Space wrap>
                        <Tag
                          color={
                            qc.recommendation.level === 'good' ? 'green' : qc.recommendation.level === 'warn' ? 'orange' : 'red'
                          }
                        >
                          {qc.recommendation.level.toUpperCase()}
                        </Tag>
                        <Text type="secondary">
                          baselineAgeHours: <span className="font-mono">{qc.baselineAgeHours.toFixed(1)}</span>
                        </Text>
                        <Text type="secondary">
                          p95 threshold: <span className="font-mono">{qc.recommendation.thresholds.goodP95Meters.toFixed(2)}</span> /{' '}
                          <span className="font-mono">{qc.recommendation.thresholds.warnP95Meters.toFixed(2)}</span> m
                        </Text>
                      </Space>

                      <Descriptions bordered size="small" column={2}>
                        <Descriptions.Item label="baseline method">{qc.baseline.method}</Descriptions.Item>
                        <Descriptions.Item label="baseline computedAt">
                          <span className="font-mono">{qc.baseline.computedAt}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label="baseline lat">
                          <span className="font-mono">{qc.baseline.latitude.toFixed(7)}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label="baseline lon">
                          <span className="font-mono">{qc.baseline.longitude.toFixed(7)}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label="drift mean/std">
                          <span className="font-mono">
                            {qc.driftMeters.mean.toFixed(3)} / {qc.driftMeters.std.toFixed(3)}
                          </span>{' '}
                          m
                        </Descriptions.Item>
                        <Descriptions.Item label="drift p95/max">
                          <span className="font-mono">
                            {qc.driftMeters.p95.toFixed(3)} / {qc.driftMeters.max.toFixed(3)}
                          </span>{' '}
                          m
                        </Descriptions.Item>
                        <Descriptions.Item label="sample pointsUsed">{qc.sample.pointsUsed}</Descriptions.Item>
                        <Descriptions.Item label="sample range">
                          <span className="font-mono">
                            {qc.sample.timeRange.start ?? '-'} → {qc.sample.timeRange.end ?? '-'}
                          </span>
                        </Descriptions.Item>
                      </Descriptions>
                    </div>
                  ) : (
                    <Alert type="info" message="点击“运行质量检查”获取基准点漂移与建议等级。" />
                  )}
                </Card>
              </div>
            ),
          },
          {
            key: 'help',
            label: '说明',
            children: (
              <Card size="small" title="说明">
                <Text type="secondary">
                  如果设备上传的键名不同，可在上方切换 `latKey/lonKey/altKey`；若无高度，清空 `altKey` 即可。形变分析请前往{' '}
                  <Link href="/gps-deformation">GPS 形变</Link>。
                </Text>
              </Card>
            ),
          },
        ]}
      />
    </div>
  )
}
