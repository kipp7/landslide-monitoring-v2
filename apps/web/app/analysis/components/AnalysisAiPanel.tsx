'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Card, Table, Tag, Typography } from 'antd'
import ReactECharts from 'echarts-for-react'
import { getDeviceSeries, type DataSeriesRow } from '../../../lib/api/data'
import { listAiPredictions, type AiPredictionRow, type AiPredictionRiskLevel } from '../../../lib/api/aiPredictions'

const { Text } = Typography

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function riskTag(level: AiPredictionRiskLevel | null) {
  if (!level) return <Tag>n/a</Tag>
  const color = level === 'high' ? 'red' : level === 'medium' ? 'orange' : 'green'
  return <Tag color={color}>{level}</Tag>
}

function buildLineOption(series: DataSeriesRow[], sensorsByKey: Map<string, { displayName: string; unit: string }>) {
  const x = new Set<string>()
  for (const s of series) for (const p of s.points) x.add(p.ts)
  const xAxis = Array.from(x.values()).sort()

  return {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
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

export default function AnalysisAiPanel({
  deviceId,
  sensorsByKey,
}: {
  deviceId: string
  sensorsByKey: Map<string, { displayName: string; unit: string }>
}) {
  const [predictionsLoading, setPredictionsLoading] = useState(false)
  const [predictionsError, setPredictionsError] = useState<string | null>(null)
  const [predictions, setPredictions] = useState<AiPredictionRow[]>([])

  const [seriesLoading, setSeriesLoading] = useState(false)
  const [seriesError, setSeriesError] = useState<string | null>(null)
  const [series, setSeries] = useState<DataSeriesRow[]>([])

  const sensorKeysForCharts = useMemo(() => {
    const preferred = ['temperature', 'humidity', 'accel', 'gyro']
    const out: string[] = []
    for (const [key] of sensorsByKey) {
      const lower = key.toLowerCase()
      if (preferred.some((p) => lower.includes(p))) out.push(key)
    }
    out.sort((a, b) => a.localeCompare(b))
    return out.slice(0, 6)
  }, [sensorsByKey])

  const refreshPredictions = useCallback(async () => {
    if (!deviceId) return
    try {
      setPredictionsLoading(true)
      setPredictionsError(null)
      const json = await listAiPredictions({ page: 1, pageSize: 5, deviceId })
      setPredictions(json.data?.list ?? [])
    } catch (caught) {
      setPredictionsError(caught instanceof Error ? caught.message : String(caught))
      setPredictions([])
    } finally {
      setPredictionsLoading(false)
    }
  }, [deviceId])

  const refreshSeries = useCallback(async () => {
    if (!deviceId) return
    if (sensorKeysForCharts.length === 0) {
      setSeries([])
      return
    }
    try {
      setSeriesLoading(true)
      setSeriesError(null)

      const end = new Date()
      const start = new Date(end.getTime() - 6 * 60 * 60 * 1000)

      const json = await getDeviceSeries({
        deviceId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        sensorKeys: sensorKeysForCharts,
        interval: '5m',
        timeField: 'received',
      })
      setSeries(json.data?.series ?? [])
    } catch (caught) {
      setSeriesError(caught instanceof Error ? caught.message : String(caught))
      setSeries([])
    } finally {
      setSeriesLoading(false)
    }
  }, [deviceId, sensorKeysForCharts])

  useEffect(() => {
    void refreshPredictions()
    void refreshSeries()
  }, [refreshPredictions, refreshSeries])

  const chartOption = useMemo(() => buildLineOption(series, sensorsByKey), [series, sensorsByKey])

  return (
    <div className="space-y-3">
      {predictionsError ? <Alert type="error" message={predictionsError} showIcon /> : null}
      <Table
        size="small"
        rowKey="predictionId"
        loading={predictionsLoading}
        dataSource={predictions}
        pagination={false}
        columns={[
          { title: 'modelKey', dataIndex: 'modelKey', width: 180, render: (v: string) => <span className="font-mono">{v}</span> },
          { title: 'risk', dataIndex: 'riskLevel', width: 90, render: (v: AiPredictionRiskLevel | null) => riskTag(v) },
          { title: 'score', dataIndex: 'riskScore', width: 90, render: (v: number) => <span className="font-mono">{v.toFixed(3)}</span> },
          { title: 'predictedTs', dataIndex: 'predictedTs', render: (v: string) => <span className="font-mono">{v}</span> },
        ]}
      />

      {seriesError ? <Alert type="error" message={seriesError} showIcon /> : null}
      <Card size="small" title="Sensor charts (last 6h, 5m)" loading={seriesLoading}>
        {sensorKeysForCharts.length === 0 ? (
          <Text type="secondary">No matching sensors for charts (temperature/humidity/accel/gyro).</Text>
        ) : series.length === 0 && !seriesLoading ? (
          <Text type="secondary">No series data.</Text>
        ) : (
          <ReactECharts option={chartOption} style={{ height: 260 }} />
        )}
      </Card>
    </div>
  )
}

