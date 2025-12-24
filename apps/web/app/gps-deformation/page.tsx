'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, DatePicker, Descriptions, Dropdown, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { MenuProps } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import ReactECharts from 'echarts-for-react'
import useDeviceList from '../hooks/useDeviceList'
import { getGpsDeformationSeries, type GpsDeformationSeriesPoint, type GpsDeformationSeriesResponse } from '../../lib/api/gpsDeformations'
import { downloadTextFile } from '../../lib/download'

const { Title, Text } = Typography

function formatTs(ts: string): string {
  return ts.replace('T', ' ').replace('Z', '')
}

function buildDeformationOption(points: GpsDeformationSeriesPoint[]) {
  const x = points.map((p) => p.ts)
  return {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll' },
    grid: { left: 50, right: 30, top: 40, bottom: 40 },
    xAxis: { type: 'category', data: x, axisLabel: { formatter: (v: string) => formatTs(v) } },
    yAxis: { type: 'value', scale: true, name: 'meters' },
    series: [
      { name: 'horizontalMeters', type: 'line', showSymbol: false, connectNulls: true, data: points.map((p) => p.horizontalMeters) },
      { name: 'verticalMeters', type: 'line', showSymbol: false, connectNulls: true, data: points.map((p) => p.verticalMeters) },
      { name: 'distanceMeters', type: 'line', showSymbol: false, connectNulls: true, data: points.map((p) => p.distanceMeters) },
    ],
  }
}

function deformationToCsv(points: GpsDeformationSeriesPoint[]): string {
  const lines: string[] = ['ts,horizontalMeters,verticalMeters,distanceMeters']
  for (const p of points) {
    lines.push(`${p.ts},${p.horizontalMeters ?? ''},${p.verticalMeters ?? ''},${p.distanceMeters ?? ''}`)
  }
  return lines.join('\n')
}

export default function GpsDeformationPage() {
  const { devices, loading: devicesLoading, error: devicesError, refetch } = useDeviceList()

  const [deviceId, setDeviceId] = useState<string>('')
  useEffect(() => {
    if (!deviceId && devices.length > 0) setDeviceId(devices[0].device_id)
  }, [deviceId, devices])

  const [range, setRange] = useState<[Date, Date]>(() => {
    const end = new Date()
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
    return [start, end]
  })

  const [interval, setInterval] = useState<'1m' | '5m' | '1h' | '1d'>('1h')
  const [latKey, setLatKey] = useState('gps_latitude')
  const [lonKey, setLonKey] = useState('gps_longitude')
  const [altKey, setAltKey] = useState<string>('gps_altitude')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    baseline: GpsDeformationSeriesResponse['baseline']
    points: GpsDeformationSeriesPoint[]
    keys: GpsDeformationSeriesResponse['keys']
  } | null>(null)

  const doExportCsv = useCallback(() => {
    if (!deviceId) return
    const points = data?.points ?? []
    if (points.length === 0) {
      message.info('没有可导出的形变点')
      return
    }
    const filename = `gps_deformation_${deviceId}_${dayjs(range[0]).format('YYYYMMDDHHmm')}-${dayjs(range[1]).format('YYYYMMDDHHmm')}.csv`
    downloadTextFile(deformationToCsv(points), filename, 'text/csv;charset=utf-8')
  }, [data?.points, deviceId, range])

  const doExportReportJson = useCallback(() => {
    if (!deviceId) return
    const payload = {
      deviceId,
      startTime: range[0].toISOString(),
      endTime: range[1].toISOString(),
      interval,
      keys: { latKey, lonKey, altKey: altKey.trim() ? altKey : null },
      baseline: data?.baseline ?? null,
      points: data?.points ?? [],
    }
    const filename = `gps_deformation_report_${deviceId}_${dayjs(range[0]).format('YYYYMMDDHHmm')}-${dayjs(range[1]).format('YYYYMMDDHHmm')}.json`
    downloadTextFile(JSON.stringify(payload, null, 2), filename, 'application/json;charset=utf-8')
  }, [altKey, data?.baseline, data?.points, deviceId, interval, latKey, lonKey, range])

  const refresh = useCallback(async () => {
    if (!deviceId) return
    try {
      setLoading(true)
      setError(null)
      const json = await getGpsDeformationSeries({
        deviceId,
        startTime: range[0].toISOString(),
        endTime: range[1].toISOString(),
        interval,
        latKey,
        lonKey,
        ...(altKey.trim() ? { altKey } : {}),
      })
      setData(json.data ? { baseline: json.data.baseline, points: json.data.points ?? [], keys: json.data.keys } : null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [altKey, deviceId, interval, latKey, lonKey, range])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const option = useMemo(() => buildDeformationOption(data?.points ?? []), [data?.points])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            GPS 形变
          </Title>
          <Text type="secondary">对接：`/api/v1/gps/deformations/{'{deviceId}'}/series`（需要 `data:analysis`）</Text>
        </div>
        <Space>
          <Link href="/device-management/baselines">基准点管理</Link>
          <Dropdown
            trigger={['click']}
            menu={
              {
                items: [
                  { key: 'csv', label: '导出 CSV（本页形变曲线）', onClick: () => doExportCsv() },
                  { key: 'report_json', label: '导出报告 JSON（baseline+points）', onClick: () => doExportReportJson() },
                ],
              } satisfies MenuProps
            }
          >
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

          <span>interval</span>
          <Select
            style={{ width: 120 }}
            value={interval}
            onChange={(v) => setInterval(v)}
            options={[
              { value: '1m', label: '1m' },
              { value: '5m', label: '5m' },
              { value: '1h', label: '1h' },
              { value: '1d', label: '1d' },
            ]}
          />

          <span>latKey</span>
          <Select
            style={{ width: 220 }}
            value={latKey}
            onChange={(v) => setLatKey(v)}
            options={[
              { value: 'gps_latitude', label: 'gps_latitude' },
              { value: 'gps_lat', label: 'gps_lat' },
            ]}
          />
          <span>lonKey</span>
          <Select
            style={{ width: 220 }}
            value={lonKey}
            onChange={(v) => setLonKey(v)}
            options={[
              { value: 'gps_longitude', label: 'gps_longitude' },
              { value: 'gps_lng', label: 'gps_lng' },
            ]}
          />
          <span>altKey</span>
          <Select
            allowClear
            style={{ width: 220 }}
            value={altKey || undefined}
            onChange={(v) => setAltKey(v ?? '')}
            options={[
              { value: 'gps_altitude', label: 'gps_altitude' },
              { value: 'gps_alt', label: 'gps_alt' },
            ]}
          />
        </Space>
        {error ? (
          <div className="mt-2">
            <Text type="danger">加载失败：{error}</Text>
          </div>
        ) : null}
      </Card>

      <Card size="small" title="基准点（Baseline）" loading={loading}>
        {data?.baseline ? (
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="method">{data.baseline.method}</Descriptions.Item>
            <Descriptions.Item label="pointsCount">{data.baseline.pointsCount ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="computedAt">
              <span className="font-mono">{data.baseline.computedAt}</span>
            </Descriptions.Item>
            <Descriptions.Item label="location">
              <span className="font-mono">
                {data.baseline.latitude}, {data.baseline.longitude}
              </span>
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Text type="secondary">暂无（请先为该设备配置基准点）</Text>
        )}
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <span>形变曲线</span>
            <Tag>{data?.points?.length ?? 0}</Tag>
            {data?.keys ? (
              <Text type="secondary">
                keys: <span className="font-mono">{data.keys.latKey}</span>, <span className="font-mono">{data.keys.lonKey}</span>
                {data.keys.altKey ? (
                  <>
                    , <span className="font-mono">{data.keys.altKey}</span>
                  </>
                ) : null}
              </Text>
            ) : null}
          </Space>
        }
      >
        <ReactECharts option={option} style={{ height: 380 }} />
      </Card>

      <Card size="small" title="明细（前 500 条）">
        <Table
          rowKey={(r) => r.ts}
          size="small"
          dataSource={(data?.points ?? []).slice(0, 500)}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'ts', dataIndex: 'ts', width: 180, render: (v: string) => <span className="font-mono">{formatTs(v)}</span> },
            { title: 'horizontal', dataIndex: 'horizontalMeters', width: 120, render: (v: number) => v.toFixed(3) },
            { title: 'vertical', dataIndex: 'verticalMeters', width: 120, render: (v: number | null) => (v === null ? '-' : v.toFixed(3)) },
            { title: 'distance', dataIndex: 'distanceMeters', width: 120, render: (v: number) => v.toFixed(3) },
          ]}
        />
      </Card>
    </div>
  )
}
