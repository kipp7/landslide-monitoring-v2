'use client'

import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'

export type StationMapTile = { url: string; attribution: string }

export type StationMapPoint = {
  deviceId: string
  label: string
  stationName: string
  status: 'online' | 'offline' | 'maintenance'
  lat: number
  lon: number
}

export default function StationMap({
  center,
  zoom,
  tile,
  points,
  onSelectDevice,
}: {
  center: [number, number]
  zoom: number
  tile: StationMapTile
  points: StationMapPoint[]
  onSelectDevice: (deviceId: string) => void
}) {
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
      <TileLayer url={tile.url} attribution={tile.attribution} />
      {points.map((p) => {
        const color = p.status === 'online' ? '#16a34a' : p.status === 'maintenance' ? '#f59e0b' : '#64748b'
        return (
          <CircleMarker
            key={p.deviceId}
            center={[p.lat, p.lon]}
            radius={10}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.8 }}
            eventHandlers={{ click: () => onSelectDevice(p.deviceId) }}
          >
            <Tooltip direction="top" opacity={1} permanent={false}>
              <div className="space-y-0.5">
                <div className="font-medium">{p.label}</div>
                <div className="text-xs opacity-80">{p.stationName}</div>
                <div className="text-xs font-mono">
                  {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
                </div>
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}

