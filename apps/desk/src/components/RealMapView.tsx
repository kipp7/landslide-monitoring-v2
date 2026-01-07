import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";

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

function RecenterOnReset(props: { resetKey: number | undefined; bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (props.resetKey == null) return;
    map.fitBounds(props.bounds, { padding: [24, 24] });
  }, [map, props.bounds, props.resetKey]);
  return null;
}

export function RealMapView(props: RealMapViewProps) {
  const tdtKey = (import.meta.env.VITE_TDT_KEY as string | undefined) ?? "";
  const useTdt = Boolean(tdtKey);

  const bounds = useMemo<L.LatLngBoundsExpression>(() => {
    const pts = props.stations
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .map((s) => [s.lat, s.lng] as [number, number]);
    if (!pts.length) return [[0, 0], [1, 1]];
    return pts as unknown as L.LatLngBoundsExpression;
  }, [props.stations]);

  const center = useMemo<[number, number]>(() => {
    const first = props.stations.find((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
    return first ? [first.lat, first.lng] : [0.5, 0.5];
  }, [props.stations]);

  const osmAttribution = `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors`;
  const esriAttribution =
    `Tiles &copy; Esri` +
    ` &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community`;
  const tdtAttribution = `&copy; 天地图`;

  const tdtBaseLayer = props.layer === "卫星图" ? "img" : "vec";
  const tdtLabelLayer = props.layer === "卫星图" ? "cia" : "cva";
  const tdtUrl = (layer: string) =>
    `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?tk=${tdtKey}` +
    `&SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
    `&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}`;

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
      center={center}
      zoom={13}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
      doubleClickZoom
      scrollWheelZoom
      attributionControl
      preferCanvas
    >
      {useTdt ? (
        <>
          <TileLayer url={tdtUrl(tdtBaseLayer)} attribution={tdtAttribution} subdomains={["0", "1", "2", "3", "4", "5", "6", "7"]} />
          <TileLayer url={tdtUrl(tdtLabelLayer)} attribution={tdtAttribution} subdomains={["0", "1", "2", "3", "4", "5", "6", "7"]} />
        </>
      ) : (
        <TileLayer url={fallbackTile.url} attribution={fallbackTile.attribution} />
      )}
      <RecenterOnReset resetKey={props.resetKey} bounds={bounds} />

      {props.stations.map((s) => {
        const isSelected = props.selectedStationId === s.id;
        const color = riskColor(s.risk);
        const stroke = isSelected ? "rgba(34, 211, 238, 1)" : "rgba(15, 23, 42, 0.85)";
        const weight = isSelected ? 3 : 2;

        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={isSelected ? 10 : 7}
            pathOptions={{
              color: stroke,
              weight,
              fillColor: color,
              fillOpacity: 0.95
            }}
            eventHandlers={{
              click: () => props.onSelectStationId(s.id)
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1} sticky>
              <div style={{ fontWeight: 800 }}>{s.name}</div>
              <div style={{ opacity: 0.9, fontSize: 12 }}>
                区域：{s.area} 传感器：{s.deviceCount}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
