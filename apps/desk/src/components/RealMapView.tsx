import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

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

function RecenterOnReset(props: { resetKey: number | undefined; bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (props.resetKey == null) return;
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

export function RealMapView(props: RealMapViewProps) {
  const tdtKey = (import.meta.env.VITE_TDT_KEY as string | undefined) ?? "";
  const useTdt = Boolean(tdtKey);
  const defaultLat = 22.6263;
  const defaultLng = 110.1805;

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
      bounds={bounds}
      boundsOptions={{ padding: [24, 24] }}
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
      <RecenterOnReset resetKey={props.resetKey} bounds={bounds} />
      <ClearSelectionOnMapClick
        onClear={() => {
          props.onSelectStationIds([]);
        }}
      />

      {props.stations.map((s) => {
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
      })}
    </MapContainer>
  );
}
