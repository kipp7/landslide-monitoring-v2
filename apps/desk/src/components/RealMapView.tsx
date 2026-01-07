import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";

import type { Station } from "../api/client";

type BaseLayer = "2D" | "卫星图";

type RealMapViewProps = {
  layer: BaseLayer;
  stations: Station[];
  selectedStationId: string | null;
  onSelectStationId: (id: string | null) => void;
  resetKey?: number;
};

function riskColor(risk: Station["risk"]) {
  if (risk === "high") return "#ef4444";
  if (risk === "mid") return "#f59e0b";
  return "#22c55e";
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

export function RealMapView(props: RealMapViewProps) {
  const tdtKey = (import.meta.env.VITE_TDT_KEY as string | undefined) ?? "";
  const useTdt = Boolean(tdtKey);
  const defaultLat = 22.6263;
  const defaultLng = 110.1805;

  const icons = useMemo(() => {
    const byId = new Map<string, L.DivIcon>();

    for (const s of props.stations) {
      const isSelected = props.selectedStationId === s.id;
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
  }, [props.selectedStationId, props.stations]);

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

      {props.stations.map((s) => {
        const isSelected = props.selectedStationId === s.id;
        const icon = icons.get(s.id);
        if (!icon) return null;
        const risk = s.risk === "high" ? "高风险" : s.risk === "mid" ? "中风险" : "低风险";
        const status = s.status === "online" ? "在线" : s.status === "warning" ? "预警" : "离线";

        return (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={icon}
            eventHandlers={{
              click: () => props.onSelectStationId(s.id)
            }}
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={1} sticky>
              <div style={{ fontWeight: 900 }}>{s.name}</div>
              <div style={{ opacity: 0.92, fontSize: 12 }}>
                {risk} | {status}
              </div>
              <div style={{ opacity: 0.9, fontSize: 12 }}>
                区域：{s.area} 传感器：{s.deviceCount}
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
