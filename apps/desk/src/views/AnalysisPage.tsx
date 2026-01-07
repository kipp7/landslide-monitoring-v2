import clsx from "clsx";
import { Button, Spin, Switch, Tag } from "antd";
import ReactECharts from "echarts-for-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Device, Station } from "../api/client";
import { useApi } from "../api/ApiProvider";
import { BaseCard } from "../components/BaseCard";
import { MapSwitchPanel, type MapType } from "../components/MapSwitchPanel";
import { RealMapView } from "../components/RealMapView";
import { StatusTag } from "../components/StatusTag";
import { TerrainBackdrop } from "../components/TerrainBackdrop";
import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";

import "./analysis.css";

type AnomalyRow = {
  id: string;
  deviceName: string;
  stationName: string;
  level: "info" | "warn" | "critical";
  message: string;
  time: string;
};

function fmtMm(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(2)}`;
}

function fmtMmPerH(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(2)}`;
}

function hoursBetween(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / (60 * 60 * 1000);
}

function findPointAtOrBefore(points: { ts: string; dispMm: number }[], target: Date) {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const pt = points[i];
    if (!pt) continue;
    const t = new Date(pt.ts);
    if (t.getTime() <= target.getTime()) return pt;
  }
  return null;
}

function calcDelta(points: { ts: string; dispMm: number }[], hours: number) {
  if (points.length < 2) return null;
  const last = points.at(-1);
  if (!last) return null;
  const lastT = new Date(last.ts);
  const p = findPointAtOrBefore(points, new Date(lastT.getTime() - hours * 60 * 60 * 1000));
  if (!p) return null;
  return Number((last.dispMm - p.dispMm).toFixed(2));
}

function calcSlopeMmPerH(points: { ts: string; dispMm: number }[], hours: number) {
  if (points.length < 2) return null;
  const last = points.at(-1);
  if (!last) return null;
  const lastT = new Date(last.ts);
  const p = findPointAtOrBefore(points, new Date(lastT.getTime() - hours * 60 * 60 * 1000));
  if (!p) return null;
  const dt = Math.max(0.1, hoursBetween(lastT, new Date(p.ts)));
  return Number(((last.dispMm - p.dispMm) / dt).toFixed(2));
}

function darkAxis() {
  return {
    axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.45)" } },
    axisLabel: { color: "rgba(226, 232, 240, 0.85)" },
    splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.12)" } }
  };
}

function darkTooltip() {
  return {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderColor: "rgba(34, 211, 238, 0.22)",
    textStyle: { color: "rgba(226, 232, 240, 0.92)" }
  };
}

export function AnalysisPage() {
  const api = useApi();
  const navigate = useNavigate();
  const apiMode = useSettingsStore((s) => s.apiMode);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const terrainQuality = useSettingsStore((s) => s.terrainQuality);
  const user = useAuthStore((s) => s.user);
  const [mapType, setMapType] = useState<MapType>("卫星图");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [stations, setStations] = useState<Station[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [alertOn, setAlertOn] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [rainRange, setRainRange] = useState<"7d" | "24h">("7d");
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([]);
  const [mapViewSeed, setMapViewSeed] = useState(0);
  const [stationPanelExpanded, setStationPanelExpanded] = useState(false);
  const [stationPanelPage, setStationPanelPage] = useState(0);
  const [stationPanelPlaying, setStationPanelPlaying] = useState(true);
  const [stationPanelActiveId, setStationPanelActiveId] = useState<string | null>(null);
  const [gpsCache, setGpsCache] = useState<Record<string, { deviceId: string; deviceName: string; points: { ts: string; dispMm: number }[] }>>({});
  const gpsAbortRef = useRef<AbortController | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      if (!silent) setLoading(true);
      else setRefreshing(true);

      try {
        const [s, d] = await Promise.all([api.stations.list(), api.devices.list()]);
        if (abort.signal.aborted) return;
        setStations(s);
        setDevices(d);
        setLastUpdate(new Date().toLocaleString("zh-CN"));
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [api]
  );

  useEffect(() => {
    void loadData();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = window.setInterval(() => {
      void loadData({ silent: true });
    }, 15000);
    return () => {
      window.clearInterval(t);
    };
  }, [autoRefresh, loadData]);

  useEffect(() => {
    if (mapType === "3D" || mapType === "视频") {
      setSelectedStationIds([]);
    }
  }, [mapType]);

  const stats = useMemo(() => {
    const online = devices.filter((d) => d.status === "online").length;
    const warn = devices.filter((d) => d.status === "warning").length;
    const offline = devices.filter((d) => d.status === "offline").length;
    return {
      stations: stations.length,
      devices: devices.length,
      online,
      warn,
      offline
    };
  }, [devices, stations.length]);

  useEffect(() => {
    const shouldAlert = stats.offline > 0 || stats.warn > 0;
    setAlertOn(shouldAlert);
  }, [stats.offline, stats.warn]);

  const chartBase = useMemo(() => {
    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      grid: { left: "10%", right: "6%", top: 42, bottom: 30, containLabel: true },
      tooltip: { trigger: "axis", ...darkTooltip() },
      xAxis: {
        type: "category",
        data: Array.from({ length: 12 }, (_, i) => String(i + 1)),
        ...darkAxis()
      },
      yAxis: { type: "value", ...darkAxis() }
    };
  }, []);

  const tempHumOption = useMemo(() => {
    const { axisLabel: _unusedAxisLabel, ...baseXAxis } = chartBase.xAxis as Record<string, unknown>;
    return {
      ...chartBase,
      grid: { left: "0%", right: "0%", top: 30, bottom: 0, containLabel: true },
      legend: {
        top: 2,
        left: "center",
        textStyle: { color: "rgba(226, 232, 240, 0.82)" },
        itemWidth: 10,
        itemHeight: 10
      },
      xAxis: {
        ...baseXAxis,
        data: Array.from({ length: 12 }, (_, i) => `${String(i + 1)}时`),
        axisLabel: { ...darkAxis().axisLabel, hideOverlap: true }
      },
      yAxis: [
        { type: "value", ...darkAxis(), axisLabel: { ...darkAxis().axisLabel, margin: 3 } },
        { type: "value", ...darkAxis(), axisLabel: { ...darkAxis().axisLabel, margin: 3 } }
      ],
      series: [
        {
          name: "温度",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: [14, 14.3, 14.1, 14.8, 15.2, 15.9, 16.1, 16.2, 16.5, 16.8, 16.4, 16.0],
          lineStyle: { width: 2, color: "#22d3ee" },
          areaStyle: { color: "rgba(34, 211, 238, 0.18)" }
        },
        {
          name: "湿度",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          data: [82, 83, 84, 85, 86, 87, 86, 85, 84, 83, 83, 82],
          lineStyle: { width: 2, color: "#60a5fa" },
          areaStyle: { color: "rgba(96, 165, 250, 0.14)" }
        }
      ]
    };
  }, [chartBase]);

  const vibrationOption = useMemo(() => {
    const { axisLabel: _unusedAxisLabel, ...baseXAxis } = chartBase.xAxis as Record<string, unknown>;
    return {
      ...chartBase,
      grid: { left: "0%", right: "0%", top: 30, bottom: 0, containLabel: true },
      legend: {
        top: 2,
        left: "center",
        textStyle: { color: "rgba(226, 232, 240, 0.82)" },
        itemWidth: 10,
        itemHeight: 10
      },
      xAxis: {
        ...baseXAxis,
        data: Array.from({ length: 12 }, (_, i) => `${String(i + 1)}时`),
        axisLabel: { ...darkAxis().axisLabel, hideOverlap: true }
      },
      yAxis: [
        { type: "value", ...darkAxis(), axisLabel: { ...darkAxis().axisLabel, margin: 3 } },
        { type: "value", ...darkAxis(), axisLabel: { ...darkAxis().axisLabel, margin: 3 } }
      ],
      series: [
        {
          name: "加速度",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: [2, 3, 2, 4, 5, 6, 5, 7, 6, 8, 6, 5],
          lineStyle: { width: 2, color: "#34d399" },
          areaStyle: { color: "rgba(52, 211, 153, 0.12)" }
        },
        {
          name: "陀螺仪",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          data: [0.2, 0.4, 0.3, 0.6, 0.8, 1.1, 0.9, 1.3, 1.1, 1.6, 1.2, 1.0],
          lineStyle: { width: 2, color: "#fbbf24" },
          areaStyle: { color: "rgba(251, 191, 36, 0.10)" }
        }
      ]
    };
  }, [chartBase]);

  const rainfallOption = useMemo(() => {
    const is24h = rainRange === "24h";
    const labels = is24h ? Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, "0")}:00`) : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const data = is24h ? [0, 0.6, 0.8, 2.6, 3.2, 1.8, 0.9, 0.5, 1.2, 2.8, 1.1, 0.4] : [12, 8, 15, 6, 9, 18, 11];

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      grid: { left: "0%", right: "0%", top: 30, bottom: 0, containLabel: true },
      tooltip: { trigger: "axis", ...darkTooltip() },
      xAxis: { type: "category", data: labels, ...darkAxis() },
      yAxis: { type: "value", ...darkAxis(), axisLabel: { ...darkAxis().axisLabel, margin: 6 } },
      series: [
        {
          name: "雨量",
          type: "bar",
          data,
          itemStyle: { color: "rgba(34, 211, 238, 0.85)" },
          barWidth: 14
        }
      ]
    };
  }, [rainRange]);

  const riskDistributionOption = useMemo(() => {
    const high = stations.filter((s) => s.risk === "high").length;
    const mid = stations.filter((s) => s.risk === "mid").length;
    const low = stations.filter((s) => s.risk === "low").length;
    const total = stations.length;

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: { trigger: "item", ...darkTooltip() },
      legend: {
        bottom: 0,
        left: "center",
        orient: "horizontal",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: "rgba(226, 232, 240, 0.82)" }
      },
      series: [
        {
          type: "pie",
          radius: ["52%", "78%"],
          center: ["50%", "44%"],
          label: {
            show: true,
            position: "center",
            formatter: `{v|${String(total)}}\n{l|监测站}`,
            rich: {
              v: { color: "rgba(226, 232, 240, 0.96)", fontSize: 22, fontWeight: 900, lineHeight: 24 },
              l: { color: "rgba(148, 163, 184, 0.9)", fontSize: 12, fontWeight: 800, lineHeight: 16 }
            }
          },
          labelLine: { show: false },
          data: [
            { name: "高风险", value: high, itemStyle: { color: "#ef4444" } },
            { name: "中风险", value: mid, itemStyle: { color: "#f59e0b" } },
            { name: "低风险", value: low, itemStyle: { color: "#22c55e" } }
          ]
        }
      ]
    };
  }, [stations]);

  const alertTrendOption = useMemo(() => {
    const labels = Array.from({ length: 12 }, (_, i) => `${String(12 - i).padStart(2, "0")}:00`).reverse();
    const seed = stations.length * 13 + devices.length * 7 + stats.warn * 3 + stats.offline * 11;
    const clamp = (n: number) => Math.max(0, Math.round(n));
    const warnBase = Math.max(0, stats.warn);
    const offBase = Math.max(0, stats.offline);

    const warnSeries = labels.map((_, idx) => clamp(warnBase * 0.55 + Math.sin((idx + seed) / 2.1) * 2 + (idx % 3 === 0 ? 1 : 0)));
    const offlineSeries = labels.map((_, idx) => clamp(offBase * 0.35 + Math.cos((idx + seed) / 3.2) * 1.2 + (idx % 4 === 0 ? 1 : 0)));
    const total = labels.map((_, idx) => (warnSeries[idx] ?? 0) + (offlineSeries[idx] ?? 0));

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: { trigger: "axis", ...darkTooltip() },
      grid: { left: "0%", right: "0%", top: 30, bottom: 0, containLabel: true },
      legend: {
        top: 2,
        left: "center",
        textStyle: { color: "rgba(226, 232, 240, 0.82)" },
        itemWidth: 10,
        itemHeight: 10
      },
      xAxis: { type: "category", data: labels, ...darkAxis() },
      yAxis: { type: "value", ...darkAxis() },
      series: [
        {
          name: "预警",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: warnSeries,
          lineStyle: { width: 2, color: "#f59e0b" },
          areaStyle: { color: "rgba(245, 158, 11, 0.10)" }
        },
        {
          name: "离线",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: offlineSeries,
          lineStyle: { width: 2, color: "#ef4444" },
          areaStyle: { color: "rgba(239, 68, 68, 0.08)" }
        },
        {
          name: "总计",
          type: "bar",
          data: total,
          barWidth: 10,
          itemStyle: { color: "rgba(34, 211, 238, 0.55)" }
        }
      ]
    };
  }, [devices.length, stations.length, stats.offline, stats.warn]);

  const anomalies: AnomalyRow[] = useMemo(() => {
    const sample = devices.slice(0, 6);
    return sample.map((d, idx) => ({
      id: `${d.id}-${String(idx)}`,
      deviceName: d.name,
      stationName: d.stationName,
      level: d.status === "warning" ? "warn" : d.status === "offline" ? "critical" : "info",
      message:
        d.status === "warning"
          ? "阈值触发：位移/雨量异常"
          : d.status === "offline"
            ? "离线：无数据上报"
            : "运行正常",
      time: new Date(Date.now() - idx * 6 * 60 * 1000).toLocaleTimeString("zh-CN")
    }));
  }, [devices]);

  const hasCritical = stats.offline > 0;
  const hasWarn = stats.warn > 0;
  const apiModeLabel = apiMode === "mock" ? "演示环境" : "联调环境";
  const selectedStations = useMemo(() => {
    if (!selectedStationIds.length) return [];
    const set = new Set(selectedStationIds);
    return stations.filter((s) => set.has(s.id));
  }, [selectedStationIds, stations]);

  const sortedSelectedStations = useMemo(() => {
    const score = (r: Station["risk"]) => (r === "high" ? 3 : r === "mid" ? 2 : 1);
    return selectedStations
      .slice()
      .sort((a, b) => score(b.risk) - score(a.risk) || a.name.localeCompare(b.name));
  }, [selectedStations]);

  const stationPanelPageSize = stationPanelExpanded ? 4 : 6;
  const stationPanelPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedSelectedStations.length / stationPanelPageSize));
  }, [sortedSelectedStations.length, stationPanelPageSize]);

  useEffect(() => {
    if (!selectedStationIds.length) {
      setStationPanelExpanded(false);
      setStationPanelPage(0);
      setStationPanelActiveId(null);
    }
  }, [selectedStationIds.length]);

  useEffect(() => {
    if (!stationPanelPlaying) return;
    if (stationPanelPages <= 1) return;
    const t = window.setInterval(() => {
      setStationPanelPage((p) => (p + 1) % stationPanelPages);
    }, 5000);
    return () => window.clearInterval(t);
  }, [stationPanelPages, stationPanelPlaying]);

  useEffect(() => {
    if (!sortedSelectedStations.length) return;
    if (stationPanelActiveId && sortedSelectedStations.some((s) => s.id === stationPanelActiveId)) return;
    const first = sortedSelectedStations.at(0);
    if (first) setStationPanelActiveId(first.id);
  }, [sortedSelectedStations, stationPanelActiveId]);

  useEffect(() => {
    if (!stationPanelPages) return;
    if (stationPanelPage < stationPanelPages) return;
    setStationPanelPage(0);
  }, [stationPanelPage, stationPanelPages]);

  const metricsByStationId = useMemo(() => {
    type Metrics = {
      deviceOnline: number;
      deviceWarn: number;
      deviceOffline: number;
      lastSeenAt?: string;
      types: Partial<Record<Device["type"], number>>;
    };

    const map: Record<string, Metrics> = {};

    for (const d of devices) {
      const slot: Metrics =
        map[d.stationId] ??
        (map[d.stationId] = {
          deviceOnline: 0,
          deviceWarn: 0,
          deviceOffline: 0,
          types: {}
        });

      if (d.status === "online") slot.deviceOnline += 1;
      else if (d.status === "warning") slot.deviceWarn += 1;
      else slot.deviceOffline += 1;

      slot.types[d.type] = (slot.types[d.type] ?? 0) + 1;
      if (!slot.lastSeenAt || d.lastSeenAt > slot.lastSeenAt) slot.lastSeenAt = d.lastSeenAt;
    }

    return map;
  }, [devices]);

  const selectedSummary = useMemo(() => {
    const high = sortedSelectedStations.filter((s) => s.risk === "high").length;
    const mid = sortedSelectedStations.filter((s) => s.risk === "mid").length;
    const low = sortedSelectedStations.filter((s) => s.risk === "low").length;
    const warn = sortedSelectedStations.filter((s) => s.status === "warning").length;
    const off = sortedSelectedStations.filter((s) => s.status === "offline").length;
    return { high, mid, low, warn, off, total: sortedSelectedStations.length };
  }, [sortedSelectedStations]);

  const activeStation = useMemo(() => {
    if (!stationPanelActiveId) return null;
    return sortedSelectedStations.find((s) => s.id === stationPanelActiveId) ?? null;
  }, [sortedSelectedStations, stationPanelActiveId]);

  const activeGnssDevice = useMemo(() => {
    if (!activeStation) return null;
    return devices.find((d) => d.stationId === activeStation.id && d.type === "gnss") ?? null;
  }, [activeStation, devices]);

  useEffect(() => {
    if (!activeGnssDevice) return;
    if (gpsCache[activeGnssDevice.id]) return;

    gpsAbortRef.current?.abort();
    const abort = new AbortController();
    gpsAbortRef.current = abort;

    (async () => {
      try {
        const series = await api.gps.getSeries({ deviceId: activeGnssDevice.id, days: 1 });
        if (abort.signal.aborted) return;
        setGpsCache((prev) => ({
          ...prev,
          [activeGnssDevice.id]: series
        }));
      } catch {
        // ignore for now (mock/http may not support)
      }
    })();

    return () => abort.abort();
  }, [activeGnssDevice, api.gps, gpsCache]);

  const activeDisplacementOption = useMemo(() => {
    if (!activeGnssDevice) return null;
    const series = gpsCache[activeGnssDevice.id];
    if (!series) return null;
    const pts = series.points.slice(-36);
    return {
      backgroundColor: "transparent",
      grid: { left: 24, right: 10, top: 10, bottom: 18, containLabel: true },
      xAxis: {
        type: "category",
        data: pts.map((p) => p.ts.slice(11, 16)),
        ...darkAxis(),
        axisLabel: { ...darkAxis().axisLabel, fontSize: 10 }
      },
      yAxis: {
        type: "value",
        ...darkAxis(),
        axisLabel: { ...darkAxis().axisLabel, fontSize: 10 }
      },
      tooltip: { trigger: "axis", ...darkTooltip() },
      series: [
        {
          type: "line",
          smooth: true,
          showSymbol: false,
          data: pts.map((p) => p.dispMm),
          lineStyle: { width: 2, color: "#22d3ee" },
          areaStyle: { color: "rgba(34, 211, 238, 0.14)" }
        }
      ]
    };
  }, [activeGnssDevice, gpsCache]);

  const activeGnssStats = useMemo(() => {
    if (!activeGnssDevice) return null;
    const series = gpsCache[activeGnssDevice.id];
    if (!series) return null;
    const pts = series.points.slice();
    if (!pts.length) return null;
    const last = pts.at(-1);
    if (!last) return null;
    const d1h = calcDelta(pts, 1);
    const d6h = calcDelta(pts, 6);
    const d24h = calcDelta(pts, 24);
    const v1h = calcSlopeMmPerH(pts, 1);
    const v6h = calcSlopeMmPerH(pts, 6);
    const lastAt = new Date(last.ts);
    return {
      lastMm: last.dispMm,
      lastAt: lastAt.toLocaleString("zh-CN"),
      d1h,
      d6h,
      d24h,
      v1h,
      v6h
    };
  }, [activeGnssDevice, gpsCache]);

  const activeAssessment = useMemo(() => {
    if (!activeStation) return null;
    const m = metricsByStationId[activeStation.id];
    const base = activeStation.risk === "high" ? 2 : activeStation.risk === "mid" ? 1 : 0;
    const status = activeStation.status === "offline" ? 2 : activeStation.status === "warning" ? 1 : 0;
    const offline = (m?.deviceOffline ?? 0) > 0 ? 1 : 0;
    const warn = (m?.deviceWarn ?? 0) > 0 ? 1 : 0;
    const slope = activeGnssStats?.v1h ?? null;
    const d24h = activeGnssStats?.d24h ?? null;

    let score = base + status + offline + warn;
    if (slope !== null) score += slope >= 0.6 ? 2 : slope >= 0.3 ? 1 : 0;
    if (d24h !== null) score += d24h >= 10 ? 2 : d24h >= 6 ? 1 : 0;
    score = Math.min(7, Math.max(0, score));

    const level = score >= 5 ? "高" : score >= 3 ? "中" : "低";
    const color = level === "高" ? "red" : level === "中" ? "orange" : "green";
    const actions =
      level === "高"
        ? ["优先复核 GNSS 形变曲线与基线", "核对雨量与阈值配置", "检查离线设备供电与通信"]
        : level === "中"
          ? ["关注近 6 小时形变速率变化", "核对预警设备与异常条目", "保持站点巡检记录更新"]
          : ["持续监测，保持数据上报稳定", "定期校验基线与设备时钟"];

    return { level, color, score, actions };
  }, [activeGnssStats?.d24h, activeGnssStats?.v1h, activeStation, metricsByStationId]);

  return (
    <div className="desk-analysis-screen">
      {alertOn ? (
        <div className="desk-analysis-alert-glow" aria-hidden="true">
          <div className="desk-analysis-alert-top" />
          <div className="desk-analysis-alert-bottom" />
          <div className="desk-analysis-alert-left" />
          <div className="desk-analysis-alert-right" />
        </div>
      ) : null}

      <div className="desk-analysis-topbar">
        <div className="desk-analysis-glowbar" aria-hidden="true" />

        <div className="desk-analysis-nav left">
          <button
            type="button"
            className="desk-analysis-navbtn"
            onClick={() => {
              navigate("/app/home");
            }}
          >
            首页
          </button>
          <button
            type="button"
            className="desk-analysis-navbtn"
            onClick={() => {
              navigate("/app/device-management");
            }}
          >
            设备管理
          </button>
        </div>

        <div className="desk-analysis-title">山体滑坡数据监测大屏</div>
        <div className="desk-analysis-meta" role="status" aria-label="系统信息">
          <div className="desk-analysis-meta-group">
            <span className="desk-analysis-meta-dot" aria-hidden="true" />
            <span>{now.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })}</span>
            <span className="desk-analysis-meta-muted">{now.toLocaleTimeString("zh-CN")}</span>
          </div>
          <div className="desk-analysis-meta-group">
            <Tag color={apiMode === "mock" ? "geekblue" : "blue"}>{apiModeLabel}</Tag>
            <Tag color={online ? "green" : "red"}>{online ? "网络正常" : "网络离线"}</Tag>
            <Tag color="cyan">{user?.name ?? "未登录"}</Tag>
          </div>
          <div className="desk-analysis-meta-group">
            <Tag color="cyan">站点 {stats.stations}</Tag>
            <Tag color="green">在线 {stats.online}</Tag>
            <Tag color={hasWarn ? "orange" : "blue"}>预警 {stats.warn}</Tag>
            <Tag color={hasCritical ? "red" : "blue"}>离线 {stats.offline}</Tag>
            <span className="desk-analysis-meta-muted">更新 {lastUpdate || "—"}</span>
          </div>
        </div>

        <div className="desk-analysis-nav right">
          <button
            type="button"
            className="desk-analysis-navbtn"
            onClick={() => {
              navigate("/app/gps-monitoring");
            }}
          >
            地质形变监测
          </button>
          <button
            type="button"
            className="desk-analysis-navbtn"
            onClick={() => {
              navigate("/app/settings");
            }}
          >
            系统设置
          </button>
        </div>
      </div>

      {loading ? (
        <div className="desk-analysis-loading">
          <Spin size="large" />
        </div>
      ) : null}

      <div className="desk-analysis-content">
        <div className="desk-analysis-grid">
          <div className="desk-analysis-leftcol">
            <BaseCard title="站点风险分布">
              <ReactECharts option={riskDistributionOption} style={{ height: "100%" }} />
            </BaseCard>
            <BaseCard title="告警趋势（近 12 小时）">
              <ReactECharts option={alertTrendOption} style={{ height: "100%" }} />
            </BaseCard>
            <BaseCard title="环境趋势（温度 °C / 湿度 %）">
              <ReactECharts option={tempHumOption} style={{ height: "100%" }} />
            </BaseCard>
            <BaseCard title="振动趋势（加速度 mg / 陀螺仪 °/s）">
              <ReactECharts option={vibrationOption} style={{ height: "100%" }} />
            </BaseCard>
          </div>

          <div className="desk-analysis-mapcol">
            <BaseCard
              title={
                <span>
                  <span className={`desk-live-dot${refreshing && !reducedMotion ? " is-loading" : ""}`} aria-hidden="true" />
                  滑坡监测地图与预警
                </span>
              }
              extra={
                <div className="desk-analysis-map-extra">
                  <Tag color={hasCritical ? "red" : hasWarn ? "orange" : "green"}>{hasCritical ? "告警" : hasWarn ? "预警" : "正常"}</Tag>
                  <Switch checked={autoRefresh} size="small" onChange={setAutoRefresh} />
                  <Button
                    size="small"
                    onClick={() => {
                      void loadData({ silent: true });
                    }}
                  >
                    刷新
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setSelectedStationIds([]);
                      setMapViewSeed((s) => s + 1);
                    }}
                  >
                    重置视图
                  </Button>
                  {selectedStations.length ? <Tag color="cyan">已选 {selectedStations.length}</Tag> : null}
                  <MapSwitchPanel selected={mapType} onSelect={setMapType} />
                </div>
              }
            >
              <div className="desk-analysis-mapstack">
                <div
                  className={clsx(
                    "desk-analysis-maptop",
                    (mapType === "卫星图" || mapType === "2D") && "is-realmap",
                    mapType === "卫星图" && "is-satellite",
                    mapType === "2D" && "is-2d",
                    mapType === "3D" && "is-3d"
                  )}
                >
                  {mapType === "视频" ? (
                    <div className="desk-video-mock">视频流（接入后展示）</div>
                  ) : mapType === "3D" ? (
                    <div className="desk-analysis-3dwrap">
                      <TerrainBackdrop className="desk-analysis-terrain" quality={terrainQuality} />
                      <div className="desk-analysis-map-overlay">
                        <div className="desk-analysis-map-hint">3D 视图：拖拽旋转，滚轮缩放，双击聚焦</div>
                        <div className="desk-analysis-map-legend">
                          <span className="dot high" />
                          高风险
                          <span className="dot mid" />
                          中风险
                          <span className="dot low" />
                          低风险
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <RealMapView
                        layer={mapType}
                        stations={stations}
                        selectedStationIds={selectedStationIds}
                        onSelectStationIds={setSelectedStationIds}
                        resetKey={mapViewSeed}
                        metricsByStationId={metricsByStationId}
                      />
                      <div className="desk-analysis-map-overlay">
                        <div className="desk-analysis-map-hint">拖拽移动，滚轮缩放，点击站点查看详情</div>
                        <div className="desk-analysis-map-legend">
                          <span className="dot high" />
                          高风险
                          <span className="dot mid" />
                          中风险
                          <span className="dot low" />
                          低风险
                        </div>
                        {selectedStations.length ? (
                          <div className={clsx("desk-analysis-map-selectedpanel", !stationPanelExpanded && "is-collapsed")}>
                            <div className="desk-analysis-map-selectedpanel-head">
                              <div className="desk-analysis-map-selectedpanel-title">
                                已选站点 <span className="muted">({selectedSummary.total})</span>
                              </div>
                              <div className="desk-analysis-map-selectedpanel-actions">
                                <div className="desk-analysis-map-selectedpanel-page">
                                  {stationPanelPages > 1 ? `${stationPanelPage + 1} / ${stationPanelPages}` : "—"}
                                </div>
                                <button
                                  type="button"
                                  className="desk-analysis-map-selectedpanel-close"
                                  onClick={() => setStationPanelExpanded((v) => !v)}
                                >
                                  {stationPanelExpanded ? "收起" : "展开"}
                                </button>
                                <button
                                  type="button"
                                  className="desk-analysis-map-selectedpanel-close"
                                  onClick={() => setSelectedStationIds([])}
                                >
                                  关闭
                                </button>
                              </div>
                            </div>
                            <div className="desk-analysis-map-selectedpanel-body">
                              <div className="desk-analysis-map-selectedpanel-summary">
                                <span className="badge">{selectedSummary.total} 个站点</span>
                                <span className="chip">高 {selectedSummary.high}</span>
                                <span className="chip">中 {selectedSummary.mid}</span>
                                <span className="chip">低 {selectedSummary.low}</span>
                                <span className="chip">预警 {selectedSummary.warn}</span>
                                <span className="chip">离线 {selectedSummary.off}</span>
                                <span className="hint">Ctrl/Shift 多选</span>
                              </div>

                              <div className={clsx("desk-analysis-map-selectedpanel-split", !stationPanelExpanded && "is-collapsed")}>
                                <div className="desk-analysis-map-selectedpanel-list">
                                  <div className="desk-analysis-map-selectedpanel-listhead">
                                    <div className="left">
                                      <button
                                        type="button"
                                        className="desk-analysis-map-selectedpanel-pill"
                                        onClick={() => {
                                          setStationPanelPlaying((v) => !v);
                                        }}
                                      >
                                        {stationPanelPlaying ? "暂停轮播" : "开始轮播"}
                                      </button>
                                      <button
                                        type="button"
                                        className="desk-analysis-map-selectedpanel-pill"
                                        onClick={() => {
                                          setStationPanelPage((p) => (p - 1 + stationPanelPages) % stationPanelPages);
                                          setStationPanelPlaying(false);
                                        }}
                                        disabled={stationPanelPages <= 1}
                                      >
                                        上一页
                                      </button>
                                      <button
                                        type="button"
                                        className="desk-analysis-map-selectedpanel-pill"
                                        onClick={() => {
                                          setStationPanelPage((p) => (p + 1) % stationPanelPages);
                                          setStationPanelPlaying(false);
                                        }}
                                        disabled={stationPanelPages <= 1}
                                      >
                                        下一页
                                      </button>
                                    </div>
                                    <div className="right">
                                      <button
                                        type="button"
                                        className="desk-analysis-map-selectedpanel-pill"
                                        onClick={() => {
                                          setSelectedStationIds([]);
                                        }}
                                      >
                                        清空
                                      </button>
                                    </div>
                                  </div>

                                  <div className="desk-analysis-map-selectedpanel-listbody">
                                    {sortedSelectedStations
                                      .slice(stationPanelPage * stationPanelPageSize, stationPanelPage * stationPanelPageSize + stationPanelPageSize)
                                      .map((s) => {
                                        const m = metricsByStationId[s.id];
                                        const risk = s.risk === "high" ? "高风险" : s.risk === "mid" ? "中风险" : "低风险";
                                        const status = s.status === "online" ? "在线" : s.status === "warning" ? "预警" : "离线";
                                        const isActive = stationPanelActiveId === s.id;
                                        const hasGnss = (m?.types?.gnss ?? 0) > 0;

                                        return (
                                          <button
                                            key={s.id}
                                            type="button"
                                            className={clsx("desk-analysis-map-selectedpanel-item", isActive && "is-active")}
                                            onClick={() => {
                                              setStationPanelActiveId(s.id);
                                              setStationPanelPlaying(false);
                                              if (!stationPanelExpanded && sortedSelectedStations.length === 1) setStationPanelExpanded(true);
                                            }}
                                          >
                                            <div className="row1">
                                              <span className="n">{s.name}</span>
                                              <span className={`t ${s.risk}`}>{risk}</span>
                                            </div>
                                            <div className="row2">
                                              <span className={`t ${s.status}`}>{status}</span>
                                              <span className="t">{s.area}</span>
                                              <span className="t">传感器 {s.deviceCount}</span>
                                              <span className="t">预警 {m?.deviceWarn ?? 0}</span>
                                              <span className="t">离线 {m?.deviceOffline ?? 0}</span>
                                              <span className={clsx("t", hasGnss ? "ok" : "muted")}>GNSS {hasGnss ? "有" : "无"}</span>
                                            </div>
                                          </button>
                                        );
                                      })}
                                  </div>
                                </div>

                                <div className="desk-analysis-map-selectedpanel-detail">
                                  {activeStation ? (
                                    <>
                                      <div className="h">
                                        <div className="n">{activeStation.name}</div>
                                        <div className="sub">
                                          <span className={`pill ${activeStation.risk}`}>
                                            {activeStation.risk === "high" ? "高风险" : activeStation.risk === "mid" ? "中风险" : "低风险"}
                                          </span>
                                          <span className={`pill ${activeStation.status}`}>
                                            {activeStation.status === "online" ? "在线" : activeStation.status === "warning" ? "预警" : "离线"}
                                          </span>
                                          <span className="pill">传感器 {activeStation.deviceCount}</span>
                                        </div>
                                      </div>

                                      <div className="kpis">
                                        {(() => {
                                          const lastSeenAt = metricsByStationId[activeStation.id]?.lastSeenAt;
                                          const lastSeenLabel = lastSeenAt ? new Date(lastSeenAt).toLocaleString("zh-CN") : "—";
                                          return (
                                            <>
                                        <div className="kpi">
                                          <div className="k">区域</div>
                                          <div className="v">{activeStation.area}</div>
                                        </div>
                                        <div className="kpi">
                                          <div className="k">坐标</div>
                                          <div className="v">
                                            {activeStation.lat.toFixed(5)}, {activeStation.lng.toFixed(5)}
                                          </div>
                                        </div>
                                        <div className="kpi">
                                          <div className="k">最后上报</div>
                                          <div className="v">{lastSeenLabel}</div>
                                        </div>
                                        <div className="kpi">
                                          <div className="k">预警设备</div>
                                          <div className="v">{metricsByStationId[activeStation.id]?.deviceWarn ?? 0}</div>
                                        </div>
                                        <div className="kpi">
                                          <div className="k">离线设备</div>
                                          <div className="v">{metricsByStationId[activeStation.id]?.deviceOffline ?? 0}</div>
                                        </div>
                                        <div className="kpi">
                                          <div className="k">GNSS</div>
                                          <div className="v">{activeGnssDevice ? "已接入" : "未接入"}</div>
                                        </div>
                                            </>
                                          );
                                        })()}
                                      </div>

                                      <div className="trend">
                                        <div className="tt">
                                          形变趋势 <span className="muted">（mm）</span>
                                        </div>
                                        {activeDisplacementOption ? (
                                          <div className="trendwrap">
                                            <div className="trendtop">
                                              <div className="metric">
                                                <div className="k">最新</div>
                                                <div className="v">{fmtMm(activeGnssStats?.lastMm)}</div>
                                              </div>
                                              <div className="metric">
                                                <div className="k">近 1h Δ</div>
                                                <div className="v">{fmtMm(activeGnssStats?.d1h)}</div>
                                              </div>
                                              <div className="metric">
                                                <div className="k">近 24h Δ</div>
                                                <div className="v">{fmtMm(activeGnssStats?.d24h)}</div>
                                              </div>
                                              <div className="metric">
                                                <div className="k">速率（mm/h）</div>
                                                <div className="v">{fmtMmPerH(activeGnssStats?.v6h)}</div>
                                              </div>
                                            </div>
                                            <ReactECharts option={activeDisplacementOption} style={{ height: 104 }} />
                                            <div className="trendfoot">采样至 {activeGnssStats?.lastAt ?? "—"}</div>
                                          </div>
                                        ) : (
                                          <div className="empty">暂无 GNSS 形变数据</div>
                                        )}
                                      </div>

                                      <div className="pred">
                                        <div className="tt">
                                          研判摘要 <span className="muted">（6h）</span>
                                        </div>
                                        {activeAssessment ? (
                                          <div className="predwrap">
                                            <div className="predhead">
                                              <span className={clsx("badge", activeAssessment.color)}>{activeAssessment.level}关注</span>
                                              <span className="score">综合评分 {activeAssessment.score}</span>
                                            </div>
                                            <div className="pd">
                                              <div className="pdtitle">建议动作</div>
                                              <ul className="pdlist">
                                                {activeAssessment.actions.map((a) => (
                                                  <li key={a}>{a}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="empty">请选择一个站点查看详情</div>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="empty">请选择一个站点查看详情</div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="desk-analysis-map-selectedpanel-foot">
                              <button
                                type="button"
                                className="desk-analysis-map-selectedpanel-link"
                                onClick={() => navigate("/app/device-management")}
                              >
                                前往设备管理
                              </button>
                              <button
                                type="button"
                                className="desk-analysis-map-selectedpanel-link"
                                onClick={() => navigate("/app/gps-monitoring")}
                              >
                                前往形变监测
                              </button>
                            </div>
                          </div>
                        ) : null}
                    </div>
                  </>
                )}
                </div>
                <div className="desk-analysis-mapbottom">
                  <div className="desk-analysis-subtitle">实时异常</div>
                  <div style={{ height: 8 }} />
                  <div className="desk-dark-table">
                    <table className="desk-table">
                      <thead>
                        <tr>
                          <th>设备</th>
                          <th>监测点</th>
                          <th>状态</th>
                          <th>信息</th>
                          <th>时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {anomalies.map((r) => (
                          <tr key={r.id}>
                            <td>{r.deviceName}</td>
                            <td>{r.stationName}</td>
                            <td>
                              <StatusTag value={r.level === "info" ? "online" : r.level === "warn" ? "warning" : "offline"} />
                            </td>
                            <td>{r.message}</td>
                            <td>{r.time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </BaseCard>
          </div>

          <div className="desk-analysis-rightcol">
            <div className="desk-analysis-right-top">
              <BaseCard
                title={rainRange === "24h" ? "降雨强度（24 小时，mm/h）" : "累计雨量（7 天，mm）"}
                extra={
                  <div className="desk-analysis-range-extra">
                    <Button
                      size="small"
                      type={rainRange === "24h" ? "primary" : "default"}
                      onClick={() => {
                        setRainRange("24h");
                      }}
                    >
                      24h
                    </Button>
                    <Button
                      size="small"
                      type={rainRange === "7d" ? "primary" : "default"}
                      onClick={() => {
                        setRainRange("7d");
                      }}
                    >
                      7d
                    </Button>
                  </div>
                }
              >
                <ReactECharts option={rainfallOption} style={{ height: "100%" }} />
              </BaseCard>
            </div>

            <div className="desk-analysis-right-mid">
              <BaseCard title="AI 分析与预测">
                <div className="desk-ai-box">
                  <div className="desk-ai-line">
                    <span className="desk-ai-dot" />
                    <span>短时风险：中（演示）</span>
                  </div>
                  <div className="desk-ai-line">
                    <span className="desk-ai-dot" />
                    <span>建议：加强雨后 24h 监测，关注 GNSS 位移变化。</span>
                  </div>
                  <div className="desk-ai-line">
                    <span className="desk-ai-dot" />
                    <span>说明：后续可切换到真实后端 API 与预测服务。</span>
                  </div>
                </div>
              </BaseCard>
            </div>

            <div className="desk-analysis-right-bot">
              <BaseCard title="传感器状态与异常分析">
                <div className="desk-sensor-row">
                  <div className="desk-sensor-col">
                    <div className="desk-sensor-item">
                      <span className="desk-sensor-label">在线</span>
                      <span className="desk-sensor-value" style={{ color: "#22c55e" }}>
                        {String(stats.online)}
                      </span>
                    </div>
                    <div className="desk-sensor-item">
                      <span className="desk-sensor-label">预警</span>
                      <span className="desk-sensor-value" style={{ color: "#f59e0b" }}>
                        {String(stats.warn)}
                      </span>
                    </div>
                    <div className="desk-sensor-item">
                      <span className="desk-sensor-label">离线</span>
                      <span className="desk-sensor-value" style={{ color: "#ef4444" }}>
                        {String(stats.offline)}
                      </span>
                    </div>
                  </div>
                  <div className="desk-sensor-col">
                    <ReactECharts
                      option={{
                        backgroundColor: "transparent",
                        tooltip: { trigger: "item", ...darkTooltip() },
                        series: [
                          {
                            type: "pie",
                            radius: ["55%", "80%"],
                            label: {
                              show: true,
                              position: "center",
                              formatter: `{v|${String(stats.devices)}}\n{l|传感器}`,
                              rich: {
                                v: { color: "rgba(226, 232, 240, 0.96)", fontSize: 20, fontWeight: 900, lineHeight: 22 },
                                l: { color: "rgba(148, 163, 184, 0.9)", fontSize: 12, fontWeight: 800, lineHeight: 16 }
                              }
                            },
                            labelLine: { show: false },
                            data: [
                              { name: "在线", value: stats.online, itemStyle: { color: "#22c55e" } },
                              { name: "预警", value: stats.warn, itemStyle: { color: "#f59e0b" } },
                              { name: "离线", value: stats.offline, itemStyle: { color: "#ef4444" } }
                            ]
                          }
                        ]
                      }}
                      style={{ height: "100%" }}
                    />
                  </div>
                </div>
              </BaseCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
