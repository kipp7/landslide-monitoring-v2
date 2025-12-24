'use client'

import { useMemo } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'

export type StationMapTile = { url: string; attribution: string }

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical'

export type StationMapPoint = {
  deviceId: string
  label: string
  stationId: string
  stationName: string
  status: 'online' | 'offline' | 'maintenance'
  risk?: RiskSeverity
  lat: number
  lon: number
}

const severityRank: Record<RiskSeverity, number> = { low: 1, medium: 2, high: 3, critical: 4 }
const statusRank: Record<StationMapPoint['status'], number> = { offline: 1, maintenance: 2, online: 3 }

function riskColor(risk?: RiskSeverity): string {
  if (!risk) return '#1677ff'
  if (risk === 'critical') return '#ff4d4f'
  if (risk === 'high') return '#fa541c'
  if (risk === 'medium') return '#fa8c16'
  return '#52c41a'
}

function statusColor(status: StationMapPoint['status']): string {
  return status === 'online' ? '#16a34a' : status === 'maintenance' ? '#f59e0b' : '#64748b'
}

type Cluster = {
  clusterId: string
  lat: number
  lon: number
  status: StationMapPoint['status']
  worstRisk?: RiskSeverity
  selected: boolean
  counts: { total: number; online: number; maintenance: number; offline: number }
  stations: Array<{
    stationId: string
    stationName: string
    lat: number
    lon: number
    devices: StationMapPoint[]
  }>
}

function gridSizeByZoom(zoom: number): number | null {
  if (zoom <= 6) return 0.2
  if (zoom <= 8) return 0.1
  if (zoom <= 10) return 0.05
  return null
}

function normalizeClusters(
  clusters: Cluster[],
  zoom: number,
  selectedDeviceId?: string,
): Cluster[] {
  const grid = gridSizeByZoom(zoom)
  if (!grid) return clusters

  const buckets = new Map<
    string,
    {
      latSum: number
      lonSum: number
      stations: Cluster['stations']
    }
  >()

  for (const c of clusters) {
    const key = `${Math.round(c.lat / grid)},${Math.round(c.lon / grid)}`
    const existing = buckets.get(key)
    if (existing) {
      existing.latSum += c.lat
      existing.lonSum += c.lon
      existing.stations.push(...c.stations)
    } else {
      buckets.set(key, { latSum: c.lat, lonSum: c.lon, stations: c.stations.slice() })
    }
  }

  const out: Cluster[] = []
  for (const [bucketKey, b] of buckets) {
    const allDevices = b.stations.flatMap((s) => s.devices)
    const counts = {
      total: allDevices.length,
      online: allDevices.filter((d) => d.status === 'online').length,
      maintenance: allDevices.filter((d) => d.status === 'maintenance').length,
      offline: allDevices.filter((d) => d.status === 'offline').length,
    }

    let clusterStatus: StationMapPoint['status'] = 'offline'
    for (const d of allDevices) {
      if (d.status === 'online') {
        clusterStatus = 'online'
        break
      }
      if (d.status === 'maintenance') clusterStatus = 'maintenance'
    }

    let worstRisk: RiskSeverity | undefined
    for (const d of allDevices) {
      if (!d.risk) continue
      if (!worstRisk || severityRank[d.risk] > severityRank[worstRisk]) worstRisk = d.risk
    }

    const selected = selectedDeviceId ? allDevices.some((d) => d.deviceId === selectedDeviceId) : false

    out.push({
      clusterId: `grid:${bucketKey}`,
      lat: b.latSum / b.stations.length,
      lon: b.lonSum / b.stations.length,
      status: clusterStatus,
      worstRisk,
      selected,
      counts,
      stations: b.stations,
    })
  }

  out.sort((a, b) => {
    const ra = a.worstRisk ? severityRank[a.worstRisk] : 0
    const rb = b.worstRisk ? severityRank[b.worstRisk] : 0
    if (rb !== ra) return rb - ra
    const sa = statusRank[a.status]
    const sb = statusRank[b.status]
    if (sb !== sa) return sb - sa
    return a.clusterId.localeCompare(b.clusterId)
  })

  return out
}

function ClusterMarkers({
  clusters,
  zoom,
  onSelectDevice,
  selectedDeviceId,
}: {
  clusters: Cluster[]
  zoom: number
  onSelectDevice: (deviceId: string) => void
  selectedDeviceId?: string
}) {
  const map = useMap()
  const grid = gridSizeByZoom(zoom)

  return clusters.map((c) => {
    const baseColor = c.worstRisk ? riskColor(c.worstRisk) : statusColor(c.status)
    const strokeColor = c.selected ? '#111827' : baseColor
    const radius = Math.min(28, 10 + Math.log2(Math.max(1, c.counts.total)) * 6)
    const fillOpacity = c.status === 'offline' ? 0.35 : 0.8

    return (
      <CircleMarker
        key={c.clusterId}
        center={[c.lat, c.lon]}
        radius={radius}
        pathOptions={{ color: strokeColor, fillColor: baseColor, fillOpacity, weight: c.selected ? 4 : 2 }}
        eventHandlers={{
          click: () => {
            if (grid) {
              map.setView([c.lat, c.lon], Math.min(18, zoom + 2))
              return
            }
            const flat = c.stations.flatMap((s) => s.devices)
            if (flat.length === 1) onSelectDevice(flat[0].deviceId)
          },
        }}
      >
        <Tooltip direction="top" opacity={1} permanent={false}>
          <div className="space-y-0.5">
            <div className="font-medium">
              {c.stations.length === 1 ? c.stations[0].stationName : `Cluster (${c.stations.length} stations)`}
            </div>
            <div className="text-xs opacity-80">
              devices: <span className="font-mono">{c.counts.total}</span> · online:{' '}
              <span className="font-mono">{c.counts.online}</span>
              {c.worstRisk ? (
                <>
                  {' '}
                  · risk: <span className="font-mono">{c.worstRisk}</span>
                </>
              ) : null}
            </div>
            <div className="text-xs font-mono">
              {c.lat.toFixed(5)}, {c.lon.toFixed(5)}
            </div>
          </div>
        </Tooltip>
        <Popup>
          <div className="space-y-2">
            <div className="space-y-0.5">
              <div className="font-medium">
                {c.stations.length === 1 ? c.stations[0].stationName : `Cluster (${c.stations.length} stations)`}
              </div>
              <div className="text-xs font-mono opacity-80">
                {c.lat.toFixed(6)}, {c.lon.toFixed(6)}
              </div>
              <div className="text-xs">
                devices: <span className="font-mono">{c.counts.total}</span> · online:{' '}
                <span className="font-mono">{c.counts.online}</span> · maintenance:{' '}
                <span className="font-mono">{c.counts.maintenance}</span>
                {c.worstRisk ? (
                  <>
                    {' '}
                    · worst risk: <span className="font-mono">{c.worstRisk}</span>
                  </>
                ) : null}
              </div>
              {grid ? (
                <div className="text-xs text-slate-600">Tip: click marker to zoom in.</div>
              ) : null}
            </div>

            <div className="space-y-1">
              {c.stations.map((s) => (
                <div key={s.stationId} className="rounded border border-slate-200 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{s.stationName}</div>
                    <a className="text-xs text-blue-600" href={`/stations/${encodeURIComponent(s.stationId)}`}>
                      站点详情
                    </a>
                  </div>
                  <div className="mt-1 space-y-1">
                    {s.devices.map((d) => {
                      const selected = d.deviceId === selectedDeviceId
                      const dColor = d.risk ? riskColor(d.risk) : statusColor(d.status)
                      return (
                        <button
                          key={d.deviceId}
                          type="button"
                          className={`w-full rounded px-2 py-1 text-left hover:bg-slate-100 ${selected ? 'bg-slate-100' : ''}`}
                          onClick={() => onSelectDevice(d.deviceId)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{d.label}</span>
                            <span className="text-xs font-mono" style={{ color: dColor }}>
                              {d.risk ?? d.status}
                            </span>
                          </div>
                          <div className="text-xs font-mono opacity-70">{d.deviceId}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Popup>
      </CircleMarker>
    )
  })
}

export default function StationMap({
  center,
  zoom,
  tile,
  points,
  onSelectDevice,
  selectedDeviceId,
}: {
  center: [number, number]
  zoom: number
  tile: StationMapTile
  points: StationMapPoint[]
  onSelectDevice: (deviceId: string) => void
  selectedDeviceId?: string
}) {
  const clusters = useMemo(() => {
    const byStationId = new Map<
      string,
      {
        stationId: string
        stationName: string
        lat: number
        lon: number
        devices: StationMapPoint[]
      }
    >()

    for (const p of points) {
      const key = p.stationId || `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
      const existing = byStationId.get(key)
      if (existing) {
        existing.devices.push(p)
      } else {
        byStationId.set(key, { stationId: p.stationId, stationName: p.stationName, lat: p.lat, lon: p.lon, devices: [p] })
      }
    }

    const clusters = Array.from(byStationId.values()).map((c) => {
      const devices = c.devices.slice().sort((a, b) => {
        const ra = a.risk ? severityRank[a.risk] : 0
        const rb = b.risk ? severityRank[b.risk] : 0
        if (rb !== ra) return rb - ra
        const sa = statusRank[a.status]
        const sb = statusRank[b.status]
        if (sb !== sa) return sb - sa
        return a.label.localeCompare(b.label)
      })

      let clusterStatus: StationMapPoint['status'] = 'offline'
      for (const d of devices) {
        if (d.status === 'online') {
          clusterStatus = 'online'
          break
        }
        if (d.status === 'maintenance') clusterStatus = 'maintenance'
      }

      let worstRisk: RiskSeverity | undefined
      for (const d of devices) {
        if (!d.risk) continue
        if (!worstRisk || severityRank[d.risk] > severityRank[worstRisk]) worstRisk = d.risk
      }

      const selected = selectedDeviceId ? devices.some((d) => d.deviceId === selectedDeviceId) : false
      return {
        ...c,
        devices,
        status: clusterStatus,
        worstRisk,
        selected,
        counts: {
          total: devices.length,
          online: devices.filter((d) => d.status === 'online').length,
          maintenance: devices.filter((d) => d.status === 'maintenance').length,
          offline: devices.filter((d) => d.status === 'offline').length,
        },
      }
    })

    clusters.sort((a, b) => {
      const ra = a.worstRisk ? severityRank[a.worstRisk] : 0
      const rb = b.worstRisk ? severityRank[b.worstRisk] : 0
      if (rb !== ra) return rb - ra
      const sa = statusRank[a.status]
      const sb = statusRank[b.status]
      if (sb !== sa) return sb - sa
      return a.stationName.localeCompare(b.stationName)
    })

    const stationClusters: Cluster[] = clusters.map((c) => ({
      clusterId: `station:${c.stationId}`,
      lat: c.lat,
      lon: c.lon,
      status: c.status,
      worstRisk: c.worstRisk,
      selected: c.selected,
      counts: c.counts,
      stations: [
        {
          stationId: c.stationId,
          stationName: c.stationName,
          lat: c.lat,
          lon: c.lon,
          devices: c.devices,
        },
      ],
    }))

    return normalizeClusters(stationClusters, zoom, selectedDeviceId)
  }, [points, selectedDeviceId, zoom])

  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
      <TileLayer url={tile.url} attribution={tile.attribution} />
      <ClusterMarkers clusters={clusters} zoom={zoom} onSelectDevice={onSelectDevice} selectedDeviceId={selectedDeviceId} />
    </MapContainer>
  )
}
