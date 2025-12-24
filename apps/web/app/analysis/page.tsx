'use client'

import { ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Descriptions, Select, Segmented, Space, Switch, Table, Tag, Typography } from 'antd'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAnomalyAssessment, type AnomalyAssessmentItem } from '../../lib/api/anomalyAssessment'
import { listAlerts, type AlertRow } from '../../lib/api/alerts'
import { getCameraStatus, listCameraDevices, type CameraDevice } from '../../lib/api/camera'
import { getDashboard, getSystemStatus, type DashboardSummary, type SystemStatus } from '../../lib/api/dashboard'
import useDeviceList from '../hooks/useDeviceList'
import useDeviceShadow from '../hooks/useDeviceShadow'
import { useRealtimeStream } from '../hooks/useRealtimeStream'
import useSensors from '../hooks/useSensors'
import useStationList from '../hooks/useStationList'
import { RealtimeAnomalyTable, type RealtimeAnomalyEvent } from './components/RealtimeAnomalyTable'
import { RealtimeSensorStatusTable, type RealtimeDeviceLastSeen } from './components/RealtimeSensorStatusTable'
import type { StationMapPoint, StationMapTile } from './components/StationMap'

const StationMap = dynamic(() => import('./components/StationMap'), { ssr: false })
const AnalysisAiPanel = dynamic(() => import('./components/AnalysisAiPanel'), { ssr: false })

const { Title, Text } = Typography

function severityTag(sev: AlertRow['severity']) {
  const color = sev === 'critical' ? 'red' : sev === 'high' ? 'volcano' : sev === 'medium' ? 'orange' : 'green'
  return <Tag color={color}>{sev}</Tag>
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return '-'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function anomalyTitle(data: unknown): string {
  if (!data) return '-'
  if (typeof data === 'string') return data
  if (typeof data !== 'object') return String(data)
  const rec = data as Record<string, unknown>
  const cand =
    (typeof rec.title === 'string' && rec.title) ||
    (typeof rec.anomaly_type === 'string' && rec.anomaly_type) ||
    (typeof rec.type === 'string' && rec.type) ||
    (typeof rec.message === 'string' && rec.message)
  if (cand && cand.trim()) return cand.trim()
  return 'anomaly_alert'
}

const severityRank: Record<AlertRow['severity'], number> = { low: 1, medium: 2, high: 3, critical: 4 }

function maxSeverity(
  a: AlertRow['severity'] | undefined,
  b: AlertRow['severity'] | undefined,
): AlertRow['severity'] | undefined {
  if (!a) return b
  if (!b) return a
  return severityRank[a] >= severityRank[b] ? a : b
}

export default function AnalysisPage() {
  const { devices, loading: devicesLoading, error: devicesError, refetch } = useDeviceList()
  const { stations, loading: stationsLoading, error: stationsError, refetch: refetchStations } = useStationList()
  const realtime = useRealtimeStream({ deviceId: 'all' })
  const connectRealtime = realtime.connect
  const disconnectRealtime = realtime.disconnect
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [mapMode, setMapMode] = useState<'2d' | '3d' | 'satellite' | 'video'>('2d')
  const [realtimeAnomalies, setRealtimeAnomalies] = useState<RealtimeAnomalyEvent[]>([])
  const [realtimeLastSeenByDeviceId, setRealtimeLastSeenByDeviceId] = useState<RealtimeDeviceLastSeen>({})
  const [showAiWidgets, setShowAiWidgets] = useState(false)

  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) setSelectedDeviceId(devices[0].device_id)
  }, [devices, selectedDeviceId])

  const selectedDevice = useMemo(
    () => devices.find((d) => d.device_id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId]
  )

  const mapPoints = useMemo(() => {
    const stationById = new Map(stations.map((s) => [s.stationId, s] as const))
    const points = devices.flatMap((d) => {
      const stationId = d.station_id ?? null
      if (!stationId) return []
      const station = stationById.get(stationId)
      if (!station) return []
      if (station.latitude === null || station.longitude === null) return []
      return [
        {
          deviceId: d.device_id,
          label: d.display_name || d.device_id,
          stationId,
          stationName: station.stationName,
          status: d.status,
          lat: station.latitude,
          lon: station.longitude,
        },
      ]
    })
    points.sort((a, b) => a.label.localeCompare(b.label))
    return points as StationMapPoint[]
  }, [devices, stations])

  const mapCenter = useMemo<[number, number]>(() => {
    if (mapPoints.length === 0) return [22.6263, 110.1805]
    const avgLat = mapPoints.reduce((s, p) => s + p.lat, 0) / mapPoints.length
    const avgLon = mapPoints.reduce((s, p) => s + p.lon, 0) / mapPoints.length
    return [avgLat, avgLon]
  }, [mapPoints])

  const tile = useMemo(() => {
    if (mapMode === 'satellite') {
      return {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles © Esri',
      } satisfies StationMapTile
    }
    return {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
    } satisfies StationMapTile
  }, [mapMode])

  const { data: shadow, loading: shadowLoading, error: shadowError, refreshShadow } = useDeviceShadow(selectedDeviceId, 15_000)
  const { byKey: sensorsByKey, error: sensorsError } = useSensors()

  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [camerasLoading, setCamerasLoading] = useState(false)
  const [camerasError, setCamerasError] = useState<string | null>(null)
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')
  const [cameraStreamError, setCameraStreamError] = useState<string | null>(null)

  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [systemStatusError, setSystemStatusError] = useState<string | null>(null)

  const [anomalyAggregates, setAnomalyAggregates] = useState<AnomalyAssessmentItem[]>([])
  const [anomalyAggregatesLoading, setAnomalyAggregatesLoading] = useState(false)
  const [anomalyAggregatesError, setAnomalyAggregatesError] = useState<string | null>(null)

  const fetchDashboard = useCallback(async () => {
    try {
      setDashboardError(null)
      const json = await getDashboard()
      setDashboard(json.data ?? null)
    } catch (caught) {
      setDashboardError(caught instanceof Error ? caught.message : String(caught))
      setDashboard(null)
    }
  }, [])

  const fetchSystemStatus = useCallback(async () => {
    try {
      setSystemStatusError(null)
      const json = await getSystemStatus()
      setSystemStatus(json.data ?? null)
    } catch (caught) {
      setSystemStatusError(caught instanceof Error ? caught.message : String(caught))
      setSystemStatus(null)
    }
  }, [])

  const fetchAnomalyAssessment = useCallback(async () => {
    try {
      setAnomalyAggregatesLoading(true)
      setAnomalyAggregatesError(null)
      const json = await getAnomalyAssessment(24)
      setAnomalyAggregates(json.data?.data ?? [])
    } catch (caught) {
      setAnomalyAggregatesError(caught instanceof Error ? caught.message : String(caught))
      setAnomalyAggregates([])
    } finally {
      setAnomalyAggregatesLoading(false)
    }
  }, [])

  const fetchAlerts = useCallback(async () => {
    try {
      setAlertsLoading(true)
      setAlertsError(null)

      const end = new Date()
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)

      const json = await listAlerts({ page: 1, pageSize: 50, startTime: start.toISOString(), endTime: end.toISOString() })

      setAlerts(json.data?.list ?? [])
    } catch (caught) {
      setAlertsError(caught instanceof Error ? caught.message : String(caught))
      setAlerts([])
    } finally {
      setAlertsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAlerts()
    void fetchDashboard()
    void fetchSystemStatus()
    void fetchAnomalyAssessment()
  }, [fetchAlerts, fetchAnomalyAssessment, fetchDashboard, fetchSystemStatus])

  useEffect(() => {
    connectRealtime()
    return () => disconnectRealtime()
  }, [connectRealtime, disconnectRealtime])

  useEffect(() => {
    const msg = realtime.lastMessage
    if (!msg) return

    if (msg.type === 'device_data' || msg.type === 'initial_data') {
      setRealtimeLastSeenByDeviceId((prev) => ({ ...prev, [msg.deviceId]: msg.timestamp }))
      return
    }

    if (msg.type === 'anomaly_alert') {
      setRealtimeAnomalies((prev) => {
        const next: RealtimeAnomalyEvent[] = [
          {
            alertId: msg.alertId,
            deviceId: msg.deviceId,
            timestamp: msg.timestamp,
            severity: msg.severity,
            title: anomalyTitle(msg.data),
            raw: msg.data,
          },
          ...prev,
        ]
        return next.slice(0, 50)
      })
    }
  }, [realtime.lastMessage])

  const riskByDeviceId = useMemo<Record<string, AlertRow['severity']>>(() => {
    const map: Record<string, AlertRow['severity']> = {}
    for (const a of alerts) {
      if (a.status !== 'active') continue
      if (!a.deviceId) continue
      const prev = map[a.deviceId]
      if (!prev || severityRank[a.severity] > severityRank[prev]) map[a.deviceId] = a.severity
    }
    return map
  }, [alerts])

  const riskByStationId = useMemo<Record<string, AlertRow['severity']>>(() => {
    const map: Record<string, AlertRow['severity']> = {}
    for (const a of alerts) {
      if (a.status !== 'active') continue
      if (!a.stationId) continue
      const prev = map[a.stationId]
      if (!prev || severityRank[a.severity] > severityRank[prev]) map[a.stationId] = a.severity
    }
    return map
  }, [alerts])

  const mapPointsWithRisk = useMemo<StationMapPoint[]>(() => {
    return mapPoints.map((p) => ({
      ...p,
      risk: maxSeverity(riskByDeviceId[p.deviceId], riskByStationId[p.stationId]),
    }))
  }, [mapPoints, riskByDeviceId, riskByStationId])

  const mapClusterCount = useMemo(() => new Set(mapPointsWithRisk.map((p) => p.stationId)).size, [mapPointsWithRisk])

  const fetchCameras = useCallback(async () => {
    try {
      setCamerasLoading(true)
      setCamerasError(null)
      const json = await listCameraDevices()
      setCameras(json.data?.devices ?? [])
    } catch (caught) {
      setCamerasError(caught instanceof Error ? caught.message : String(caught))
      setCameras([])
    } finally {
      setCamerasLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchCameras()
  }, [fetchCameras])

  useEffect(() => {
    if (!selectedCameraId && cameras.length > 0) setSelectedCameraId(cameras[0].id)
  }, [cameras, selectedCameraId])

  const refreshCameraStatus = useCallback(async () => {
    if (!selectedCameraId) return
    try {
      const json = await getCameraStatus(selectedCameraId, { timeoutMs: 5000 })
      const updated = json.data
      setCameras((prev) => {
        const next = prev.slice()
        const idx = next.findIndex((c) => c.id === updated.id)
        if (idx >= 0) next[idx] = updated
        return next
      })
    } catch {
      // ignore
    }
  }, [selectedCameraId])

  const metricsRows = useMemo(() => {
    const metrics = shadow?.metrics ?? {}
    const entries = Object.entries(metrics).filter(([k]) => !k.startsWith('_'))
    entries.sort((a, b) => a[0].localeCompare(b[0]))
    return entries.map(([sensorKey, value]) => {
      const sensor = sensorsByKey.get(sensorKey)
      return {
        sensorKey,
        name: sensor?.displayName ?? sensorKey,
        unit: sensor?.unit ?? '',
        value,
      }
    })
  }, [shadow?.metrics, sensorsByKey])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Analysis (big-screen layout, v2)
          </Title>
          <Text type="secondary">WS-N.1: restore legacy /analysis information architecture (map slot + sidebar + status)</Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void refetch()
              void refetchStations()
              void refreshShadow()
              void fetchAlerts()
              void fetchDashboard()
              void fetchSystemStatus()
              void fetchAnomalyAssessment()
              void fetchCameras()
              realtime.disconnect()
              realtime.connect()
            }}
            loading={devicesLoading || shadowLoading || alertsLoading || anomalyAggregatesLoading || camerasLoading}
          >
            Refresh
          </Button>
        </Space>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Dashboard" size="small">
          {dashboardError ? <Text type="danger">Load failed: {dashboardError}</Text> : null}
          {dashboard ? (
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Today data">{dashboard.todayDataCount}</Descriptions.Item>
              <Descriptions.Item label="Stations">{dashboard.stations}</Descriptions.Item>
              <Descriptions.Item label="Online devices">{dashboard.onlineDevices}</Descriptions.Item>
              <Descriptions.Item label="Offline devices">{dashboard.offlineDevices}</Descriptions.Item>
              <Descriptions.Item label="Pending alerts">{dashboard.pendingAlerts}</Descriptions.Item>
              <Descriptions.Item label="Last updated">{dashboard.lastUpdatedAt}</Descriptions.Item>
            </Descriptions>
          ) : (
            <Text type="secondary">No data</Text>
          )}
        </Card>

        <Card title="System status (/system/status)" size="small">
          {systemStatusError ? <Text type="danger">Load failed: {systemStatusError}</Text> : null}
          {systemStatus ? (
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Uptime(s)">{systemStatus.uptimeS}</Descriptions.Item>
              <Descriptions.Item label="Postgres">
                <Tag color={systemStatus.postgres.status === 'healthy' ? 'green' : 'red'}>{systemStatus.postgres.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="ClickHouse">
                <Tag color={systemStatus.clickhouse.status === 'healthy' ? 'green' : 'red'}>{systemStatus.clickhouse.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Kafka">{systemStatus.kafka.status}</Descriptions.Item>
              <Descriptions.Item label="EMQX">{systemStatus.emqx.status}</Descriptions.Item>
            </Descriptions>
          ) : (
            <Text type="secondary">No data</Text>
          )}
        </Card>
      </div>

      <Card title="Realtime (SSE) status" size="small">
        <Space wrap>
          <Button type="primary" onClick={realtime.connect} disabled={realtime.isConnected || realtime.isConnecting}>
            Connect
          </Button>
          <Button onClick={realtime.disconnect} disabled={!realtime.isConnected && !realtime.isConnecting}>
            Disconnect
          </Button>
          <Tag color={realtime.isConnected ? 'green' : realtime.connectionError ? 'red' : 'default'}>
            {realtime.isConnected ? 'connected' : realtime.isConnecting ? 'connecting' : 'disconnected'}
          </Tag>
          {realtime.stats.lastHeartbeat ? (
            <Text type="secondary">
              lastHeartbeat: <span className="font-mono">{realtime.stats.lastHeartbeat}</span>
            </Text>
          ) : null}
          <Text type="secondary">
            messages: <span className="font-mono">{realtime.stats.messagesReceived}</span>
          </Text>
          {realtime.connectionError ? <Text type="danger">{realtime.connectionError}</Text> : null}
        </Space>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          size="small"
          title="Map / Video"
          extra={
            <Segmented
              size="small"
              value={mapMode}
              options={[
                { label: '2D', value: '2d' },
                { label: '3D', value: '3d', disabled: true },
                { label: 'Satellite', value: 'satellite' },
                { label: 'Video', value: 'video' },
              ]}
              onChange={(v) => setMapMode(v as typeof mapMode)}
            />
          }
        >
          {mapMode === 'video' ? (
            <div>
              {camerasError ? <Text type="danger">Camera list failed: {camerasError}</Text> : null}
              <Space wrap>
                <span>Camera</span>
                <Select
                  style={{ minWidth: 280 }}
                  value={selectedCameraId || undefined}
                  showSearch
                  placeholder="Select camera"
                  loading={camerasLoading}
                  options={cameras.map((c) => ({ value: c.id, label: `${c.name} (${c.ip})` }))}
                  onChange={(v) => {
                    setSelectedCameraId(v)
                    setCameraStreamError(null)
                  }}
                />
                <Button onClick={() => void fetchCameras()} loading={camerasLoading}>
                  Refresh
                </Button>
                <Button onClick={() => void refreshCameraStatus()} disabled={!selectedCameraId}>
                  Refresh status
                </Button>
                {selectedCameraId ? <Tag>{cameras.find((c) => c.id === selectedCameraId)?.status ?? 'offline'}</Tag> : null}
              </Space>

              <div className="mt-3">
                {(() => {
                  const cam = cameras.find((c) => c.id === selectedCameraId)
                  if (!cam) return <Text type="secondary">No camera selected</Text>
                  const streamUrl = `http://${cam.ip}/stream?t=${Date.now()}`
                  return (
                    <div>
                      <div className="mb-2">
                        <Text type="secondary">
                          stream: <span className="font-mono">{streamUrl}</span>
                        </Text>
                      </div>
                      {cameraStreamError ? <Text type="danger">{cameraStreamError}</Text> : null}
                      <div className="w-full bg-black rounded-lg overflow-hidden">
                        <img
                          src={streamUrl}
                          alt="ESP32-CAM stream"
                          className="w-full h-auto object-contain"
                          onError={() => setCameraStreamError('Stream load failed (make sure browser can reach the camera IP)')}
                          onLoad={() => setCameraStreamError(null)}
                        />
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {stationsError ? <Text type="danger">Stations load failed: {stationsError.message}</Text> : null}
              <div className="h-[420px] rounded-lg overflow-hidden">
                <StationMap
                  center={mapCenter}
                  zoom={mapPointsWithRisk.length > 0 ? 11 : 5}
                  tile={tile}
                  points={mapPointsWithRisk}
                  onSelectDevice={setSelectedDeviceId}
                  selectedDeviceId={selectedDeviceId}
                />
              </div>

              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Stations">{stations.length}</Descriptions.Item>
                <Descriptions.Item label="Map clusters">{mapClusterCount}</Descriptions.Item>
                <Descriptions.Item label="Selected device">{selectedDevice?.display_name || selectedDeviceId || '-'}</Descriptions.Item>
                <Descriptions.Item label="Mode">{mapMode.toUpperCase()}</Descriptions.Item>
                <Descriptions.Item label="Mapped devices">{mapPointsWithRisk.length}</Descriptions.Item>
                <Descriptions.Item label="Active alerts (24h)">{alerts.filter((a) => a.status === 'active').length}</Descriptions.Item>
              </Descriptions>
              {stationsLoading ? <Text type="secondary">Loading stations…</Text> : null}
              {mapPointsWithRisk.length === 0 && !stationsLoading ? (
                <Text type="secondary">No station coordinates configured yet (set lat/lon on stations to show markers).</Text>
              ) : null}
              <Space wrap>
                <Text type="secondary">Risk legend:</Text>
                {severityTag('critical')}
                {severityTag('high')}
                {severityTag('medium')}
                {severityTag('low')}
              </Space>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Device" size="small">
            {devicesError ? <Text type="danger">Device list failed: {devicesError.message}</Text> : null}
            <Space wrap>
              <span>Select</span>
              <Select
                style={{ minWidth: 260 }}
                value={selectedDeviceId || undefined}
                showSearch
                placeholder="Select deviceId"
                options={devices.map((d) => ({ value: d.device_id, label: `${d.display_name} (${d.device_id})` }))}
                onChange={(v) => setSelectedDeviceId(v)}
              />
            </Space>
            <div className="mt-3">
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Total">{devices.length}</Descriptions.Item>
                <Descriptions.Item label="Online">{devices.filter((d) => d.status === 'online').length}</Descriptions.Item>
                <Descriptions.Item label="Selected">{selectedDevice?.display_name || selectedDeviceId || '-'}</Descriptions.Item>
                <Descriptions.Item label="Device ID">{selectedDeviceId || '-'}</Descriptions.Item>
              </Descriptions>
            </div>
          </Card>

          <Card title="Device state (/data/state/{deviceId})" size="small">
            {sensorsError ? <Text type="warning">Sensors dict not available: {sensorsError}</Text> : null}
            {shadowError ? <Text type="danger">State load failed: {shadowError}</Text> : null}
            {shadow ? (
              <>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="Updated">{shadow.updatedAt}</Descriptions.Item>
                  <Descriptions.Item label="Metrics">{Object.keys(shadow.metrics ?? {}).length}</Descriptions.Item>
                </Descriptions>
                <div className="mt-3">
                  <Table
                    rowKey="sensorKey"
                    loading={shadowLoading}
                    dataSource={metricsRows}
                    pagination={{ pageSize: 10 }}
                    size="small"
                    columns={[
                      { title: 'sensorKey', dataIndex: 'sensorKey', width: 220, render: (v: string) => <span className="font-mono">{v}</span> },
                      { title: 'Name', dataIndex: 'name' },
                      { title: 'Value', dataIndex: 'value', render: (v: unknown) => <span className="font-mono">{formatValue(v)}</span> },
                      { title: 'Unit', dataIndex: 'unit', width: 80 },
                    ]}
                  />
                </div>
              </>
            ) : (
              <Text type="secondary">{shadowLoading ? 'Loading…' : 'No data'}</Text>
            )}
          </Card>

          <Card
            title="AI widgets"
            size="small"
            extra={
              <Space size="small">
                <Switch checked={showAiWidgets} onChange={setShowAiWidgets} />
                <Link href="/data/ai-predictions">AI Predictions</Link>
              </Space>
            }
          >
            {showAiWidgets ? (
              <AnalysisAiPanel deviceId={selectedDeviceId} sensorsByKey={sensorsByKey} />
            ) : (
              <Text type="secondary">Toggle on to load AI prediction widgets (lazy-loaded).</Text>
            )}
          </Card>

          <Card title="Realtime sensor status (SSE)" size="small">
            <RealtimeSensorStatusTable devices={devices} lastSeenByDeviceId={realtimeLastSeenByDeviceId} />
          </Card>

          <Card title="Realtime anomalies (SSE + /anomaly-assessment)" size="small">
            <RealtimeAnomalyTable
              events={realtimeAnomalies}
              aggregates={anomalyAggregates}
              loadingAggregates={anomalyAggregatesLoading}
              aggregatesError={anomalyAggregatesError}
              maxRows={8}
            />
          </Card>

          <Card title="Alerts (last 24h)" size="small">
            {alertsError ? <Text type="danger">Alerts load failed: {alertsError}</Text> : null}
            <Table
              rowKey="alertId"
              loading={alertsLoading}
              dataSource={alerts}
              pagination={{ pageSize: 8 }}
              size="small"
              columns={[
                { title: 'Time', dataIndex: 'lastEventAt', render: (v: string) => <span className="font-mono">{v}</span> },
                { title: 'Severity', dataIndex: 'severity', render: (v: AlertRow['severity']) => severityTag(v) },
                { title: 'Title', dataIndex: 'title', render: (v: string | null | undefined) => v || '-' },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}
