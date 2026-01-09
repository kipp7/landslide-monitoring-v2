import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

import type { Station } from "../api/client";

type BaseLayer = "2D" | "卫星图";

export type StationMapMetrics = {
  deviceOnline: number;
  deviceWarn: number;
  deviceOffline: number;
  lastSeenAt?: string;
  types?: Partial<Record<"gnss" | "rain" | "tilt" | "temp_hum" | "camera", number>>;
};

type RealMapViewProps = {
  layer: BaseLayer;
  stations: Station[];
  selectedStationIds: string[];
  onSelectStationIds: (ids: string[]) => void;
  resetKey?: number;
  metricsByStationId?: Record<string, StationMapMetrics | undefined>;
};

function riskColor(risk: Station["risk"]) {
  if (risk === "high") return "#ef4444";
  if (risk === "mid") return "#f59e0b";
  return "#22c55e";
}

function riskText(risk: Station["risk"]) {
  if (risk === "high") return "高风险";
  if (risk === "mid") return "中风险";
  return "低风险";
}

function statusText(status: Station["status"]) {
  if (status === "online") return "在线";
  if (status === "warning") return "预警";
  return "离线";
}

function riskClass(risk: Station["risk"]) {
  if (risk === "high") return "is-high";
  if (risk === "mid") return "is-mid";
  return "is-low";
}

type AreaOverlay = {
  area: string;
  stationIds: string[];
  bounds: L.LatLngBounds;
  center: L.LatLng;
  radiusMeters: number;
  stats: {
    total: number;
    high: number;
    mid: number;
    low: number;
    warn: number;
    off: number;
    online: number;
  };
};

function areaSeed(area: string) {
  let h = 2166136261;
  for (let i = 0; i < area.length; i += 1) {
    h ^= area.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function areaColor(area: string) {
  const x = areaSeed(area);
  if (x < 0.33) return { stroke: "rgba(34, 211, 238, 0.55)", fill: "rgba(34, 211, 238, 0.10)" };
  if (x < 0.66) return { stroke: "rgba(96, 165, 250, 0.55)", fill: "rgba(96, 165, 250, 0.10)" };
  return { stroke: "rgba(16, 185, 129, 0.55)", fill: "rgba(16, 185, 129, 0.10)" };
}

function makeAreaOverlay(stations: Station[], metrics?: Record<string, StationMapMetrics | undefined>) {
  const byArea = new Map<string, Station[]>();
  for (const s of stations) {
    const key = (s.area || "未分区").trim() || "未分区";
    const list = byArea.get(key) ?? [];
    list.push(s);
    byArea.set(key, list);
  }

  const overlays: AreaOverlay[] = [];
  for (const [area, list] of byArea) {
    const pts = list
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .map((s) => L.latLng(s.lat, s.lng));
    if (!pts.length) continue;
    const bounds = L.latLngBounds(pts);
    const padLat = Math.max(0.0025, (bounds.getNorth() - bounds.getSouth()) * 0.25);
    const padLng = Math.max(0.0025, (bounds.getEast() - bounds.getWest()) * 0.25);
    const padded = L.latLngBounds(
      L.latLng(bounds.getSouth() - padLat, bounds.getWest() - padLng),
      L.latLng(bounds.getNorth() + padLat, bounds.getEast() + padLng)
    );
    const center = padded.getCenter();
    const maxDist = pts.reduce((acc, p) => Math.max(acc, center.distanceTo(p)), 0);
    const radiusMeters = Math.max(120, Math.min(1600, maxDist * 1.25));

    const stats = {
      total: list.length,
      high: list.filter((s) => s.risk === "high").length,
      mid: list.filter((s) => s.risk === "mid").length,
      low: list.filter((s) => s.risk === "low").length,
      warn: list.filter((s) => s.status === "warning").length,
      off: list.filter((s) => s.status === "offline").length,
      online: list.filter((s) => s.status === "online").length
    };

    // Blend in device-level anomalies when available (warn/offline device counts)
    if (metrics) {
      let deviceWarn = 0;
      let deviceOff = 0;
      for (const s of list) {
        const m = metrics[s.id];
        deviceWarn += m?.deviceWarn ?? 0;
        deviceOff += m?.deviceOffline ?? 0;
      }
      if (deviceWarn > 0) stats.warn += 1;
      if (deviceOff > 0) stats.off += 1;
    }

    overlays.push({
      area,
      stationIds: list.map((s) => s.id),
      bounds: padded,
      center,
      radiusMeters,
      stats
    });
  }

  overlays.sort((a, b) => b.stats.total - a.stats.total || a.area.localeCompare(b.area));
  return overlays;
}

function AreaOverlays(props: {
  overlays: AreaOverlay[];
  selectedStationIds: string[];
  onSelectStationIds: (ids: string[]) => void;
  showLabels?: boolean;
}) {
  const map = useMap();
  const showLabels = props.showLabels ?? true;

  const labelIcons = useMemo(() => {
    const byArea = new Map<string, L.DivIcon>();
    for (const o of props.overlays) {
      const c = areaColor(o.area);
      const html =
        `<div class="desk-map-area-ripple" style="--desk-area-stroke:${c.stroke};--desk-area-fill:${c.fill};">` +
        `<span class="ring r1"></span>` +
        `<span class="ring r2"></span>` +
        `<span class="ring r3"></span>` +
        `<span class="drop"></span>` +
        `</div>`;
      byArea.set(
        o.area,
        L.divIcon({
          className: "desk-map-area-icon",
          html,
          iconSize: [72, 72],
          iconAnchor: [36, 36]
        })
      );
    }
    return byArea;
  }, [props.overlays]);

  const handleSelect = (o: AreaOverlay, e?: L.LeafletMouseEvent) => {
    e?.originalEvent?.stopPropagation?.();
    e?.originalEvent?.preventDefault?.();
    props.onSelectStationIds(o.stationIds);
    map.fitBounds(o.bounds, { padding: [24, 24] });
  };

  return (
    <>
      {props.overlays.map((o) => {
        const c = areaColor(o.area);
        return (
          <Circle
            key={`area-diffuse:${o.area}`}
            center={o.center}
            radius={o.radiusMeters}
            pathOptions={{
              className: "desk-map-area-diffuse",
              color: c.stroke,
              weight: 2.0,
              opacity: 0.82,
              dashArray: "6 10",
              lineCap: "round",
              lineJoin: "round",
              fillColor: c.fill,
              fillOpacity: 0.22
            }}
            eventHandlers={{
              click: (e) => {
                handleSelect(o, e as unknown as L.LeafletMouseEvent);
              }
            }}
          />
        );
      })}

      {showLabels
        ? props.overlays.map((o) => {
            const icon = labelIcons.get(o.area);
            return (
              <Marker
                key={`area-label:${o.area}`}
                position={o.center}
                icon={icon}
                eventHandlers={{
                  click: (e) => {
                    handleSelect(o, e as unknown as L.LeafletMouseEvent);
                  }
                }}
              >
                <Tooltip className="desk-map-tooltip" direction="top" offset={[0, -10]} opacity={1} sticky>
                  <div style={{ fontWeight: 900 }}>{o.area}</div>
                  <div style={{ opacity: 0.9, fontSize: 12 }}>
                    站点 {o.stats.total} · 高 {o.stats.high} · 中 {o.stats.mid} · 低 {o.stats.low}
                  </div>
                  <div style={{ opacity: 0.9, fontSize: 12 }}>
                    在线 {o.stats.online} · 预警 {o.stats.warn} · 离线 {o.stats.off}
                  </div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>点击聚焦并选中区域站点</div>
                </Tooltip>
              </Marker>
            );
          })
        : null}
    </>
  );
}

function AutoFitBounds(props: { resetKey: number | undefined; bounds: L.LatLngBoundsExpression; userMovedRef: React.MutableRefObject<boolean> }) {
  const map = useMap();
  const prevResetRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const resetChanged = props.resetKey != null && props.resetKey !== prevResetRef.current;
    if (resetChanged) {
      prevResetRef.current = props.resetKey;
      props.userMovedRef.current = false;
    }

    if (props.userMovedRef.current) return;
    map.fitBounds(props.bounds, { padding: [24, 24] });
  }, [map, props.bounds, props.resetKey]);
  return null;
}

function RemoveLeafletAttributionPrefix() {
  const map = useMap();
  useEffect(() => {
    if (!map.attributionControl) return;
    map.attributionControl.setPrefix(false);
  }, [map]);
  return null;
}

function ClearSelectionOnMapClick(props: { onClear: () => void }) {
  useMapEvents({
    click: (e) => {
      const target = e.originalEvent?.target as Element | null | undefined;
      if (target?.closest?.(".leaflet-marker-icon") || target?.closest?.(".leaflet-tooltip")) return;
      if (e.originalEvent?.defaultPrevented) return;
      props.onClear();
    }
  });
  return null;
}

function MarkUserMoved(props: { userMovedRef: React.MutableRefObject<boolean> }) {
  useMapEvents({
    dragstart: () => {
      props.userMovedRef.current = true;
    },
    zoomstart: () => {
      props.userMovedRef.current = true;
    }
  });
  return null;
}

function TrackZoom(props: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    props.onZoomChange(map.getZoom());
  }, [map, props]);

  useMapEvents({
    zoomend: () => {
      props.onZoomChange(map.getZoom());
    }
  });
  return null;
}

export function RealMapView(props: RealMapViewProps) {
  const tdtKey = (import.meta.env.VITE_TDT_KEY as string | undefined) ?? "";
  const useTdt = Boolean(tdtKey);
  const defaultLat = 22.6847;
  const defaultLng = 110.1893;
  const userMovedRef = useRef(false);
  const [zoom, setZoom] = useState(12);

  const showAreaLabels = zoom <= 13;
  const showStationMarkers = zoom >= 14;

  const icons = useMemo(() => {
    const byId = new Map<string, L.DivIcon>();

    for (const s of props.stations) {
      const isSelected = props.selectedStationIds.includes(s.id);
      const cls = `${riskClass(s.risk)}${isSelected ? " is-selected" : ""}`;
      const count = Math.max(0, Math.round(s.deviceCount ?? 0));
      const badge = count > 0 ? `<span class="badge">${count}</span>` : "";
      const html =
        `<div class="desk-map-marker ${cls}">` +
        `<span class="halo"></span>` +
        `<span class="pulse"></span>` +
        `<span class="core"></span>` +
        badge +
        `</div>`;

      byId.set(
        s.id,
        L.divIcon({
          className: "desk-map-marker-icon",
          html,
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        })
      );
    }

    return byId;
  }, [props.selectedStationIds, props.stations]);

  const bounds = useMemo<L.LatLngBoundsExpression>(() => {
    const pts = props.stations
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .map((s) => [s.lat, s.lng] as [number, number]);
    if (!pts.length) return [[defaultLat - 0.05, defaultLng - 0.06], [defaultLat + 0.05, defaultLng + 0.06]];
    return pts as unknown as L.LatLngBoundsExpression;
  }, [props.stations]);

  const areaOverlays = useMemo(() => {
    return makeAreaOverlay(props.stations, props.metricsByStationId);
  }, [props.metricsByStationId, props.stations]);

  const osmAttribution = `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors`;
  const esriAttribution =
    `Tiles &copy; Esri` +
    ` &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community`;
  const tdtAttribution = `&copy; 天地图`;

  const tdtBaseLayer = props.layer === "卫星图" ? "img" : "vec";
  const tdtLabelLayer = props.layer === "卫星图" ? "cia" : "cva";
  const tdtUrl = (layer: string) => `https://t{s}.tianditu.gov.cn/DataServer?T=${layer}_w&x={x}&y={y}&l={z}&tk=${tdtKey}`;

  const fallbackTile =
    props.layer === "卫星图"
      ? {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          attribution: esriAttribution
        }
      : {
          url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          attribution: osmAttribution
        };

  return (
    <MapContainer
      center={[defaultLat, defaultLng]}
      zoom={12}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
      doubleClickZoom
      scrollWheelZoom
      attributionControl
      preferCanvas
    >
      {useTdt ? (
        <>
          <TileLayer
            url={tdtUrl(tdtBaseLayer)}
            attribution={tdtAttribution}
            subdomains={["0", "1", "2", "3", "4", "5", "6", "7"]}
            maxZoom={18}
            maxNativeZoom={18}
            detectRetina
            updateWhenIdle
          />
          <TileLayer
            url={tdtUrl(tdtLabelLayer)}
            attribution={tdtAttribution}
            subdomains={["0", "1", "2", "3", "4", "5", "6", "7"]}
            maxZoom={18}
            maxNativeZoom={18}
            detectRetina
            updateWhenIdle
          />
        </>
      ) : (
        <TileLayer url={fallbackTile.url} attribution={fallbackTile.attribution} maxZoom={18} maxNativeZoom={18} detectRetina updateWhenIdle />
      )}
      <RemoveLeafletAttributionPrefix />
      <TrackZoom onZoomChange={setZoom} />
      <MarkUserMoved userMovedRef={userMovedRef} />
      <AutoFitBounds resetKey={props.resetKey} bounds={bounds} userMovedRef={userMovedRef} />
      <ClearSelectionOnMapClick
        onClear={() => {
          props.onSelectStationIds([]);
        }}
      />
      <AreaOverlays
        overlays={areaOverlays}
        selectedStationIds={props.selectedStationIds}
        onSelectStationIds={props.onSelectStationIds}
        showLabels={showAreaLabels}
      />

      {showStationMarkers
        ? props.stations.map((s) => {
            const isSelected = props.selectedStationIds.includes(s.id);
            const icon = icons.get(s.id);
            if (!icon) return null;
            const risk = riskText(s.risk);
            const status = statusText(s.status);
            const m = props.metricsByStationId?.[s.id];

            return (
              <Marker
                key={s.id}
                position={[s.lat, s.lng]}
                icon={icon}
                eventHandlers={{
                  click: (e) => {
                    e.originalEvent?.stopPropagation?.();
                    e.originalEvent?.preventDefault?.();
                    const multi =
                      Boolean(e.originalEvent && ("ctrlKey" in e.originalEvent ? (e.originalEvent as MouseEvent).ctrlKey : false)) ||
                      Boolean(e.originalEvent && ("shiftKey" in e.originalEvent ? (e.originalEvent as MouseEvent).shiftKey : false));

                    if (!multi) {
                      props.onSelectStationIds([s.id]);
                      return;
                    }

                    const set = new Set(props.selectedStationIds);
                    if (set.has(s.id)) set.delete(s.id);
                    else set.add(s.id);
                    props.onSelectStationIds(Array.from(set));
                  }
                }}
              >
                <Tooltip className="desk-map-tooltip" direction="top" offset={[0, -12]} opacity={1} sticky>
                  <div style={{ fontWeight: 900 }}>{s.name}</div>
                  <div style={{ opacity: 0.9, fontSize: 12 }}>
                    {risk} · {status} · 传感器 {s.deviceCount}
                  </div>
                  {m ? (
                    <div style={{ opacity: 0.9, fontSize: 12 }}>
                      在线 {m.deviceOnline} 预警 {m.deviceWarn} 离线 {m.deviceOffline}
                    </div>
                  ) : null}
                </Tooltip>
              </Marker>
            );
          })
        : null}
    </MapContainer>
  );
}
