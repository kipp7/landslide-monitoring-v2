'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, DatePicker, Select, Space, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import useDeviceList from '../hooks/useDeviceList'
import useSensors from '../hooks/useSensors'
import { getDeviceSeries } from '../../lib/api/data'

const { Title, Text } = Typography

type TrackPoint = { ts: string; lat: number; lon: number; alt: number | null }

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export default function GpsMonitoringPage() {
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
        if (!isFiniteNumber(p.value) || !isFiniteNumber(lonVal)) continue
        const altVal = altByTs.get(p.ts)
        points.push({
          ts: p.ts,
          lat: p.value,
          lon: lonVal,
          alt: isFiniteNumber(altVal) ? altVal : null,
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
            value={[dayjs(range[0]), dayjs(range[1])] as any}
            onChange={(v) => {
              if (!v || v.length !== 2 || !v[0] || !v[1]) return
              setRange([v[0].toDate(), v[1].toDate()])
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

      <Card size="small" title="说明">
        <Text type="secondary">
          如果设备上传的键名不同，可在上方切换 `latKey/lonKey/altKey`；若无高度，清空 `altKey` 即可。形变分析请前往 <Link href="/gps-deformation">GPS 形变</Link>。
        </Text>
      </Card>
    </div>
  )
}

