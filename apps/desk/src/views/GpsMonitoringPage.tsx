import type { MenuProps } from "antd";
import {
  App as AntApp,
  Alert,
  Button,
  Col,
  Drawer,
  Dropdown,
  Form,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tabs,
  Typography
} from "antd";
import { ExportOutlined, ReloadOutlined, SettingOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { Baseline, Device, GpsSeries } from "../api/client";
import { useApi } from "../api/ApiProvider";
import { BaseCard } from "../components/BaseCard";
import "./gpsMonitoring.css";

type TimeRange = "1h" | "6h" | "24h" | "7d" | "15d" | "30d";
type Thresholds = { blue: number; yellow: number; red: number };

function isTimeRange(value: string): value is TimeRange {
  return value === "1h" || value === "6h" || value === "24h" || value === "7d" || value === "15d" || value === "30d";
}

type GpsChartRow = {
  key: string;
  ts: string;
  time: string;
  displacement: number;
  horizontal: number;
  vertical: number;
  velocityMmH: number;
  temperature: number;
  humidity: number;
  confidence: number;
  riskLevel: number;
  lat: number;
  lng: number;
};

function daysFromRange(range: TimeRange) {
  if (range === "1h") return 1;
  if (range === "6h") return 1;
  if (range === "24h") return 1;
  if (range === "7d") return 7;
  if (range === "15d") return 15;
  return 30;
}

function stable01(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function noise(seed: string, amplitude: number) {
  return (stable01(seed) - 0.5) * 2 * amplitude;
}

function riskFromDispMm(dispMm: number, thresholds: Thresholds) {
  if (dispMm >= thresholds.red) return 3;
  if (dispMm >= thresholds.yellow) return 2;
  if (dispMm >= thresholds.blue) return 1;
  return 0;
}

function riskColor(level: number) {
  if (level >= 3) return "#ef4444";
  if (level >= 2) return "#f59e0b";
  if (level >= 1) return "#3b82f6";
  return "#22c55e";
}

function riskDesc(level: number) {
  if (level >= 3) return "红色预警";
  if (level >= 2) return "黄色预警";
  if (level >= 1) return "蓝色预警";
  return "正常";
}

function axisTheme() {
  return {
    axisLabel: { color: "rgba(226, 232, 240, 0.85)" },
    axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.45)" } },
    splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.12)" } }
  };
}

export function GpsMonitoringPage() {
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntApp.useApp();

  const [devices, setDevices] = useState<Device[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [series, setSeries] = useState<GpsSeries | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>("");
  const [nowTime, setNowTime] = useState<string>(new Date().toLocaleTimeString("zh-CN"));

  const [showSettings, setShowSettings] = useState(false);
  const [thresholds, setThresholds] = useState<Thresholds>({ blue: 2, yellow: 5, red: 8 });
  const [form] = Form.useForm<Thresholds>();

  const DATA_LIMIT_KEY = "desk.gps.dataLimit.v1";
  const [dataLimit, setDataLimit] = useState<number>(() => {
    const raw = localStorage.getItem(DATA_LIMIT_KEY);
    const parsed = raw ? Number(raw) : 200;
    const safe = Number.isFinite(parsed) ? Math.trunc(parsed) : 200;
    return Math.max(50, Math.min(2000, safe));
  });
  const [showLimit, setShowLimit] = useState(false);
  const [limitForm] = Form.useForm<{ limit: number }>();

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRowKey, setSelectedRowKey] = useState<string>("");
  const [selectedRow, setSelectedRow] = useState<GpsChartRow | null>(null);

  const openRowDetail = (row: GpsChartRow) => {
    setSelectedRowKey(row.key);
    setSelectedRow(row);
    setDetailOpen(true);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(new Date().toLocaleTimeString("zh-CN"));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const queryInitRef = useRef(false);

  useEffect(() => {
    if (queryInitRef.current) return;
    queryInitRef.current = true;
    const params = new URLSearchParams(location.search);
    const qDevice = params.get("deviceId");
    const qRange = params.get("range");
    const qAuto = params.get("autoRefresh");

    if (qDevice) setSelectedDeviceId(qDevice);
    if (qRange && isTimeRange(qRange)) setTimeRange(qRange);
    if (qAuto === "1" || qAuto === "true") setAutoRefresh(true);
    if (qAuto === "0" || qAuto === "false") setAutoRefresh(false);
  }, [location.search]);

  useEffect(() => {
    if (!queryInitRef.current) return;
    const params = new URLSearchParams(location.search);
    if (selectedDeviceId) params.set("deviceId", selectedDeviceId);
    else params.delete("deviceId");
    params.set("range", timeRange);
    params.set("autoRefresh", autoRefresh ? "1" : "0");
    const nextSearch = `?${params.toString()}`;
    if (nextSearch !== (location.search || "")) {
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
    }
  }, [autoRefresh, location.pathname, location.search, navigate, selectedDeviceId, timeRange]);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setLoadError(null);
    const run = async () => {
      try {
        const [deviceList, baselineList] = await Promise.all([api.devices.list(), api.baselines.list()]);
        if (abort.signal.aborted) return;
        const gnss = deviceList.filter((d) => d.type === "gnss");
        setDevices(gnss);
        setBaselines(baselineList);
        setSelectedDeviceId((prev) => prev || gnss[0]?.id || "");
      } catch (err) {
        if (abort.signal.aborted) return;
        const msg = (err as Error).message;
        setLoadError(msg);
        message.error(`GPS 页面加载失败：${msg}（可在系统设置切换数据源）`);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => abort.abort();
  }, [api]);

  const refresh = async () => {
    if (!selectedDeviceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const days = daysFromRange(timeRange);
      const s = await api.gps.getSeries({ deviceId: selectedDeviceId, days });
      setSeries(s);
      setLastUpdateTime(new Date().toLocaleTimeString("zh-CN"));
    } catch (err) {
      const msg = (err as Error).message;
      setLoadError(msg);
      message.error(`获取 GPS 数据失败：${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [selectedDeviceId, timeRange]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      void refresh();
    }, 10_000);
    return () => clearInterval(t);
  }, [autoRefresh, selectedDeviceId, timeRange]);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId]
  );
  const baseline = useMemo(
    () => baselines.find((b) => b.deviceId === selectedDeviceId) ?? null,
    [baselines, selectedDeviceId]
  );

  const pts = series?.points ?? [];

  const chartData: GpsChartRow[] = useMemo(() => {
    const baseLat = baseline?.baselineLat ?? 22.684674;
    const baseLng = baseline?.baselineLng ?? 110.189371;
    const rows: GpsChartRow[] = [];

    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i]!;
      const prev = i > 0 ? pts[i - 1]! : null;
      const disp = p.dispMm;

      const horizontal = Number((disp * 0.72 + noise(`${selectedDeviceId}-h-${i}`, 0.18)).toFixed(2));
      const vertical = Number((disp * 0.28 + noise(`${selectedDeviceId}-v-${i}`, 0.12)).toFixed(2));

      const dtHours = prev ? Math.max(1 / 60, (Date.parse(p.ts) - Date.parse(prev.ts)) / 3.6e6) : 1;
      const velocityMmH = prev ? Number(((disp - prev.dispMm) / dtHours).toFixed(3)) : 0;

      const temperature = Number(
        (15.5 + Math.sin(i / 5) * 1.4 + noise(`${selectedDeviceId}-t-${i}`, 0.2)).toFixed(1)
      );
      const humidity = Number(
        (82 + Math.cos(i / 6) * 5 + noise(`${selectedDeviceId}-hum-${i}`, 1.2)).toFixed(0)
      );
      const confidence = Number(
        (0.72 + Math.sin(i / 7) * 0.08 + noise(`${selectedDeviceId}-c-${i}`, 0.02)).toFixed(2)
      );
      const riskLevel = riskFromDispMm(disp, thresholds);

      const lat = Number((baseLat + noise(`${selectedDeviceId}-lat-${i}`, 0.00002)).toFixed(6));
      const lng = Number((baseLng + noise(`${selectedDeviceId}-lng-${i}`, 0.00002)).toFixed(6));

      rows.push({
        key: `${p.ts}-${i}`,
        ts: p.ts,
        time: dayjs(p.ts).format("MM-DD HH:mm"),
        displacement: Number(disp.toFixed(2)),
        horizontal,
        vertical,
        velocityMmH,
        temperature,
        humidity,
        confidence,
        riskLevel,
        lat,
        lng
      });
    }

    return rows.slice(-dataLimit);
  }, [baseline?.baselineLat, baseline?.baselineLng, dataLimit, pts, selectedDeviceId, thresholds]);

  const latest = chartData.at(-1) ?? null;

  const latestDisp = latest?.displacement ?? 0;
  const level = riskFromDispMm(latestDisp, thresholds);

  const quality = useMemo(() => {
    const expected = Math.min(200, daysFromRange(timeRange) * 24);
    const score = expected > 0 ? Math.min(1, pts.length / expected) : 0;
    return { score, pct: Number((score * 100).toFixed(1)) };
  }, [pts.length, timeRange]);

  const displacementOption = useMemo(() => {
    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        borderColor: "rgba(148, 163, 184, 0.22)",
        textStyle: { color: "rgba(226, 232, 240, 0.92)" }
      },
      legend: {
        data: ["总位移", "水平位移", "垂直位移"],
        top: 10,
        textStyle: { color: "rgba(226, 232, 240, 0.85)", fontSize: 12 }
      },
      grid: { left: 54, right: 16, top: 44, bottom: 54 },
      xAxis: { type: "category", data: chartData.map((x) => x.time), ...axisTheme() },
      yAxis: { type: "value", name: "mm", ...axisTheme() },
      series: [
        {
          name: "总位移",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: chartData.map((x) => x.displacement),
          lineStyle: { width: 3, color: "#22d3ee" },
          areaStyle: { color: "rgba(34, 211, 238, 0.14)" }
        },
        {
          name: "水平位移",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: chartData.map((x) => x.horizontal),
          lineStyle: { width: 2.5, color: "#34d399" },
          areaStyle: { color: "rgba(52, 211, 153, 0.10)" }
        },
        {
          name: "垂直位移",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: chartData.map((x) => x.vertical),
          lineStyle: { width: 2.5, color: "#60a5fa" },
          areaStyle: { color: "rgba(96, 165, 250, 0.10)" }
        }
      ]
    };
  }, [chartData]);

  const onChartEvents = useMemo(() => {
    return {
      click: (params: { dataIndex?: number }) => {
        const idx = params.dataIndex;
        if (typeof idx !== "number") return;
        const row = chartData[idx];
        if (!row) return;
        openRowDetail(row);
      }
    };
  }, [chartData]);

  const velocityOption = useMemo(() => {
    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: { trigger: "axis" },
      grid: { left: 54, right: 16, top: 20, bottom: 54 },
      xAxis: { type: "category", data: chartData.map((x) => x.time), ...axisTheme() },
      yAxis: { type: "value", name: "mm/h", ...axisTheme() },
      series: [
        {
          name: "形变速度",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: chartData.map((x) => x.velocityMmH),
          lineStyle: { width: 3, color: "#f87171" },
          areaStyle: { color: "rgba(248, 113, 113, 0.14)" }
        }
      ]
    };
  }, [chartData]);

  const envOption = useMemo(() => {
    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: { trigger: "axis" },
      legend: {
        data: ["温度", "湿度"],
        top: 10,
        textStyle: { color: "rgba(226, 232, 240, 0.85)", fontSize: 12 }
      },
      grid: { left: 54, right: 54, top: 44, bottom: 54 },
      xAxis: { type: "category", data: chartData.map((x) => x.time), ...axisTheme() },
      yAxis: [
        { type: "value", name: "°C", ...axisTheme() },
        { type: "value", name: "%", ...axisTheme() }
      ],
      series: [
        {
          name: "温度",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: chartData.map((x) => x.temperature),
          yAxisIndex: 0,
          lineStyle: { width: 2.5, color: "#fbbf24" },
          areaStyle: { color: "rgba(251, 191, 36, 0.10)" }
        },
        {
          name: "湿度",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: chartData.map((x) => x.humidity),
          yAxisIndex: 1,
          lineStyle: { width: 2.5, color: "#60a5fa" },
          areaStyle: { color: "rgba(96, 165, 250, 0.10)" }
        }
      ]
    };
  }, [chartData]);

  const coordOption = useMemo(() => {
    const baseLat = baseline?.baselineLat ?? 22.684674;
    const baseLng = baseline?.baselineLng ?? 110.189371;
    const curLat = latest?.lat ?? baseLat;
    const curLng = latest?.lng ?? baseLng;

    const pad = 0.00008;
    const minLng = Math.min(baseLng, curLng) - pad;
    const maxLng = Math.max(baseLng, curLng) + pad;
    const minLat = Math.min(baseLat, curLat) - pad;
    const maxLat = Math.max(baseLat, curLat) + pad;

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        borderColor: "rgba(148, 163, 184, 0.22)",
        textStyle: { color: "rgba(226, 232, 240, 0.92)" },
        formatter: (p: { data: { name: string; value: [number, number] } }) => {
          const [lng, lat] = p.data.value;
          return `${p.data.name}<br/>纬度：${lat.toFixed(6)}<br/>经度：${lng.toFixed(6)}`;
        }
      },
      grid: { left: 10, right: 10, top: 10, bottom: 10 },
      xAxis: { type: "value", min: minLng, max: maxLng, show: false },
      yAxis: { type: "value", min: minLat, max: maxLat, show: false },
      series: [
        {
          type: "scatter",
          data: [
            {
              name: "基线点",
              value: [baseLng, baseLat] as [number, number],
              symbolSize: 16,
              itemStyle: { color: "#22c55e", shadowBlur: 12, shadowColor: "rgba(34, 211, 238, 0.18)" }
            },
            {
              name: "最新点",
              value: [curLng, curLat] as [number, number],
              symbolSize: 18,
              itemStyle: { color: riskColor(level), shadowBlur: 14, shadowColor: "rgba(34, 211, 238, 0.22)" }
            }
          ]
        }
      ]
    };
  }, [baseline?.baselineLat, baseline?.baselineLng, latest?.lat, latest?.lng, level]);

  const ceemdMetrics = useMemo(() => {
    const q = Math.round(72 + stable01(`${selectedDeviceId}-ceemd-q`) * 26);
    const snr = Number((14 + stable01(`${selectedDeviceId}-ceemd-snr`) * 12).toFixed(1));
    const ortho = Number((0.82 + stable01(`${selectedDeviceId}-ceemd-ortho`) * 0.16).toFixed(2));
    const recon = Number((0.04 + stable01(`${selectedDeviceId}-ceemd-recon`) * 0.18).toFixed(3));
    return { q, snr, ortho, recon };
  }, [selectedDeviceId]);

  const longTermPredictionOption = useMemo(() => {
    const history = chartData.slice(-30);
    const historyX = history.map((x) => x.time);
    const historyY = history.map((x) => x.displacement);

    const last = history.at(-1)?.displacement ?? 0;
    const prev = history.at(-10)?.displacement ?? 0;
    const slope = (last - prev) / 10;

    const future = Array.from({ length: 14 }, (_, idx) => {
      const y = last + slope * (idx + 1) + noise(`${selectedDeviceId}-pred-long-${idx}`, 0.55);
      return Number(y.toFixed(2));
    });
    const futureX = Array.from({ length: 14 }, (_, idx) => dayjs().add(idx + 1, "day").format("MM-DD"));

    const allX = [...historyX, ...futureX];
    const historyPad: (number | null)[] = [...historyY, ...future.map(() => null)];
    const predPad: (number | null)[] = [...historyY.map(() => null), ...future];
    const lower: (number | null)[] = [...historyY.map(() => null), ...future.map((v) => Number((v - 1.8).toFixed(2)))];
    const upper: (number | null)[] = [...historyY.map(() => null), ...future.map((v) => Number((v + 1.8).toFixed(2)))];

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: { trigger: "axis" },
      legend: {
        data: ["历史", "预测", "置信区间"],
        top: 10,
        textStyle: { color: "rgba(226, 232, 240, 0.85)", fontSize: 12 }
      },
      grid: { left: 54, right: 16, top: 44, bottom: 54 },
      xAxis: { type: "category", data: allX, ...axisTheme() },
      yAxis: { type: "value", name: "mm", ...axisTheme() },
      series: [
        {
          name: "历史",
          type: "line",
          showSymbol: false,
          data: historyPad,
          lineStyle: { width: 2.5, color: "#22d3ee" }
        },
        {
          name: "预测",
          type: "line",
          showSymbol: false,
          data: predPad,
          lineStyle: { width: 2.5, color: "#34d399" },
          areaStyle: { color: "rgba(52, 211, 153, 0.10)" }
        },
        {
          name: "置信区间",
          type: "line",
          showSymbol: false,
          data: lower,
          lineStyle: { opacity: 0 },
          stack: "band-long"
        },
        {
          name: "置信区间",
          type: "line",
          showSymbol: false,
          data: upper,
          lineStyle: { opacity: 0 },
          areaStyle: { color: "rgba(52, 211, 153, 0.14)" },
          stack: "band-long"
        }
      ]
    };
  }, [chartData, selectedDeviceId]);

  const ceemdSeriesOption = useMemo(() => {
    const imf1 = chartData.map((_, i) =>
      Number((Math.sin(i / 1.8) * 0.4 + noise(`${selectedDeviceId}-imf1-${i}`, 0.08)).toFixed(3))
    );
    const imf2 = chartData.map((_, i) =>
      Number((Math.sin(i / 4.2) * 0.7 + noise(`${selectedDeviceId}-imf2-${i}`, 0.08)).toFixed(3))
    );
    const imf3 = chartData.map((_, i) =>
      Number((Math.sin(i / 10.5) * 1.1 + noise(`${selectedDeviceId}-imf3-${i}`, 0.08)).toFixed(3))
    );
    const residue = chartData.map((x, i) =>
      Number((x.displacement * 0.12 + noise(`${selectedDeviceId}-res-${i}`, 0.12)).toFixed(3))
    );

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: { trigger: "axis" },
      legend: {
        data: ["IMF-1", "IMF-2", "IMF-3", "Residue"],
        top: 10,
        textStyle: { color: "rgba(226, 232, 240, 0.85)", fontSize: 12 }
      },
      grid: { left: 54, right: 16, top: 44, bottom: 54 },
      xAxis: { type: "category", data: chartData.map((x) => x.time), ...axisTheme() },
      yAxis: { type: "value", name: "分量", ...axisTheme() },
      series: [
        { name: "IMF-1", type: "line", showSymbol: false, smooth: true, data: imf1, lineStyle: { width: 2, color: "#22d3ee" } },
        { name: "IMF-2", type: "line", showSymbol: false, smooth: true, data: imf2, lineStyle: { width: 2, color: "#34d399" } },
        { name: "IMF-3", type: "line", showSymbol: false, smooth: true, data: imf3, lineStyle: { width: 2, color: "#60a5fa" } },
        { name: "Residue", type: "line", showSymbol: false, smooth: true, data: residue, lineStyle: { width: 2.5, color: "#fbbf24" } }
      ]
    };
  }, [chartData, selectedDeviceId]);

  const ceemdEnergyOption = useMemo(() => {
    const e1 = Math.round(20 + stable01(`${selectedDeviceId}-e1`) * 20);
    const e2 = Math.round(25 + stable01(`${selectedDeviceId}-e2`) * 18);
    const e3 = Math.round(15 + stable01(`${selectedDeviceId}-e3`) * 25);
    const e4 = Math.max(1, 100 - e1 - e2 - e3);

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: { trigger: "item" },
      grid: { left: 40, right: 16, top: 20, bottom: 40 },
      xAxis: { type: "category", data: ["IMF-1", "IMF-2", "IMF-3", "Residue"], ...axisTheme() },
      yAxis: { type: "value", name: "%", ...axisTheme() },
      series: [
        {
          type: "bar",
          data: [
            { value: e1, itemStyle: { color: "#22d3ee" } },
            { value: e2, itemStyle: { color: "#34d399" } },
            { value: e3, itemStyle: { color: "#60a5fa" } },
            { value: e4, itemStyle: { color: "#fbbf24" } }
          ],
          barWidth: 18
        }
      ]
    };
  }, [selectedDeviceId]);

  const predictionOption = useMemo(() => {
    const history = chartData.slice(-24);
    const historyX = history.map((x) => x.time);
    const historyY = history.map((x) => x.displacement);

    const last = history.at(-1)?.displacement ?? 0;
    const prev = history.at(-6)?.displacement ?? 0;
    const slope = (last - prev) / 6;

    const future = Array.from({ length: 12 }, (_, idx) => {
      const y = last + slope * (idx + 1) + noise(`${selectedDeviceId}-pred-${idx}`, 0.25);
      return Number(y.toFixed(2));
    });
    const futureX = Array.from({ length: 12 }, (_, idx) => dayjs().add(idx + 1, "hour").format("MM-DD HH:mm"));

    const allX = [...historyX, ...futureX];
    const historyPad: (number | null)[] = [...historyY, ...future.map(() => null)];
    const predPad: (number | null)[] = [...historyY.map(() => null), ...future];
    const lower: (number | null)[] = [...historyY.map(() => null), ...future.map((v) => Number((v - 0.8).toFixed(2)))];
    const upper: (number | null)[] = [...historyY.map(() => null), ...future.map((v) => Number((v + 0.8).toFixed(2)))];

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: { trigger: "axis" },
      legend: {
        data: ["历史", "预测", "置信区间"],
        top: 10,
        textStyle: { color: "rgba(226, 232, 240, 0.85)", fontSize: 12 }
      },
      grid: { left: 54, right: 16, top: 44, bottom: 54 },
      xAxis: { type: "category", data: allX, ...axisTheme() },
      yAxis: { type: "value", name: "mm", ...axisTheme() },
      series: [
        {
          name: "历史",
          type: "line",
          showSymbol: false,
          data: historyPad,
          lineStyle: { width: 2.5, color: "#22d3ee" }
        },
        {
          name: "预测",
          type: "line",
          showSymbol: false,
          data: predPad,
          lineStyle: { width: 2.5, color: "#a78bfa" },
          areaStyle: { color: "rgba(167, 139, 250, 0.10)" }
        },
        {
          name: "置信区间",
          type: "line",
          showSymbol: false,
          data: lower,
          lineStyle: { opacity: 0 },
          stack: "band"
        },
        {
          name: "置信区间",
          type: "line",
          showSymbol: false,
          data: upper,
          lineStyle: { opacity: 0 },
          areaStyle: { color: "rgba(167, 139, 250, 0.14)" },
          stack: "band"
        }
      ]
    };
  }, [chartData, selectedDeviceId]);

  const realtimeRows = useMemo(() => chartData.slice(-24).reverse(), [chartData]);

  const exportItems: MenuProps["items"] = [
    { key: "csv", label: "导出当前设备数据" },
    { key: "analysis", label: "导出分析结果" },
    { key: "report", label: "导出综合报告" },
    { key: "chart", label: "导出图表图片" }
  ];

  return (
    <div className="desk-page desk-gps-page">
      <div className="desk-gps-head">
        <div className="desk-gps-head-left">
          <div className="desk-gps-titleblock">
            <div className="desk-gps-title">地质形变监测</div>
            <div className="desk-gps-subtitle">Geological Deformation Monitoring</div>
          </div>

          <div className="desk-gps-nav">
            <button type="button" className="desk-gps-navbtn" onClick={() => navigate("/app/analysis")}>
              数据分析
            </button>
            <button type="button" className="desk-gps-navbtn" onClick={() => navigate("/app/device-management")}>
              设备管理
            </button>
            <button type="button" className="desk-gps-navbtn active">
              地质形变监测
            </button>
            <button type="button" className="desk-gps-navbtn" onClick={() => navigate("/app/settings")}>
              系统设置
            </button>
          </div>
        </div>

        <div className="desk-gps-head-right">
          <div className="desk-gps-controls">
            <Space size={10} wrap>
            <Select
              value={selectedDeviceId}
              placeholder="选择设备"
              style={{ width: 260 }}
              options={devices.map((d) => ({ label: `${d.name}（${d.stationName}）`, value: d.id }))}
              onChange={(v) => setSelectedDeviceId(v)}
            />
            <Select
              value={timeRange}
              style={{ width: 140 }}
              onChange={(v) => setTimeRange(v)}
              options={[
                { label: "1小时", value: "1h" },
                { label: "6小时", value: "6h" },
                { label: "24小时", value: "24h" },
                { label: "7天", value: "7d" },
                { label: "15天", value: "15d" },
                { label: "30天", value: "30d" }
              ]}
            />

            <Button
              type={autoRefresh ? "primary" : "default"}
              icon={<ReloadOutlined spin={autoRefresh} />}
              onClick={() => setAutoRefresh((v) => !v)}
            >
              {autoRefresh ? "停止" : "刷新"}
            </Button>

            <Dropdown
              menu={{
                items: exportItems,
                onClick: ({ key }) => {
                  if (key === "csv") message.info("导出功能待接入：Excel/报告导出");
                  if (key === "analysis") message.info("导出功能待接入：分析结果");
                  if (key === "report") message.info("导出功能待接入：综合报告");
                  if (key === "chart") message.info("导出功能待接入：图表图片");
                }
              }}
              placement="bottomLeft"
              trigger={["click"]}
            >
              <Button icon={<ExportOutlined />}>导出</Button>
            </Dropdown>

            <Button
              icon={<SettingOutlined />}
              onClick={() => {
                form.setFieldsValue(thresholds);
                setShowSettings(true);
              }}
            >
              设置
            </Button>

            <Button
              onClick={() => {
                limitForm.setFieldsValue({ limit: dataLimit });
                setShowLimit(true);
              }}
            >
              点数设置
            </Button>

            <Button className="desk-gps-baseline-btn" onClick={() => navigate("/app/device-management?tab=baselines")}>
              基线管理
            </Button>
            </Space>
          </div>

          <div className="desk-gps-meta">
            <div className="desk-gps-time">{nowTime}</div>
            {lastUpdateTime ? <div className="desk-gps-updated">数据更新: {lastUpdateTime}</div> : null}
          </div>
        </div>
      </div>

      {loadError ? (
        <div style={{ marginBottom: 12 }}>
          <Alert
            type="error"
            showIcon
            message="数据加载失败"
            description={
              <div style={{ color: "rgba(226,232,240,0.9)" }}>
                <div style={{ marginBottom: 6 }}>{loadError}</div>
                <div style={{ color: "rgba(148,163,184,0.9)" }}>可在「系统设置」切换数据源（演示/在线接口）。</div>
              </div>
            }
          />
        </div>
      ) : null}

      <div className="desk-gps-stats">
        <div className="desk-gps-stat">
          <div className="desk-gps-stat-label">预警等级（国标）</div>
          <div className="desk-gps-stat-main">
            <span className="desk-gps-stat-value" style={{ color: riskColor(level) }}>
              {riskDesc(level)}
            </span>
            <Tag color={riskColor(level)} style={{ fontWeight: 800 }}>
              等级 {level}
            </Tag>
          </div>
          <div className="desk-gps-stat-sub">GB/T 38509-2020</div>
        </div>

        <div className="desk-gps-stat">
          <div className="desk-gps-stat-label">最新位移（基线点）</div>
          <div className="desk-gps-stat-main">
            <span className="desk-gps-stat-value" style={{ color: baseline ? "#22c55e" : "rgba(148,163,184,0.9)" }}>
              {baseline ? latestDisp.toFixed(2) : "0.00"}
            </span>
            <span className="desk-gps-stat-unit">mm</span>
          </div>
          <div className="desk-gps-stat-sub">
            {baseline ? (latest ? `更新: ${new Date(latest.ts).toLocaleString("zh-CN")}` : "无数据") : "未设置基线点"}
          </div>
        </div>

        <div className="desk-gps-stat">
          <div className="desk-gps-stat-label">数据质量</div>
          <div className="desk-gps-stat-main">
            <span
              className="desk-gps-stat-value"
              style={{ color: quality.pct >= 80 ? "#22c55e" : quality.pct >= 60 ? "#f59e0b" : "#ef4444" }}
            >
              {quality.pct}
            </span>
            <span className="desk-gps-stat-unit">%</span>
          </div>
          <Progress
            percent={quality.pct}
            showInfo={false}
            strokeColor={quality.pct >= 80 ? "#22c55e" : quality.pct >= 60 ? "#f59e0b" : "#ef4444"}
            size="small"
          />
        </div>

        <div className="desk-gps-stat">
          <div className="desk-gps-stat-label">数据点数</div>
          <div className="desk-gps-stat-main">
            <span className="desk-gps-stat-value" style={{ color: "rgba(96,165,250,0.95)" }}>
              {chartData.length}
            </span>
            <span className="desk-gps-stat-unit">条</span>
          </div>
          <div className="desk-gps-stat-sub">
            范围：{timeRange.toUpperCase()} · 上限：{dataLimit}
          </div>
        </div>
      </div>

      <div className="desk-gps-main">
        <Tabs
          defaultActiveKey="realtime"
          items={[
            {
              key: "realtime",
              label: "实时监测",
              children: (
                <Row gutter={[12, 12]}>
                  <Col xs={24} lg={12}>
                    <BaseCard title="位移趋势图">
                      {loading ? (
                        <div className="desk-loading">加载中…</div>
                      ) : (
                        <ReactECharts option={displacementOption} style={{ height: 320 }} onEvents={onChartEvents} />
                      )}
                    </BaseCard>
                  </Col>
                  <Col xs={24} lg={12}>
                    <BaseCard title="形变速度">
                      {loading ? <div className="desk-loading">加载中…</div> : <ReactECharts option={velocityOption} style={{ height: 320 }} />}
                    </BaseCard>
                  </Col>
                  <Col xs={24} lg={12}>
                    <BaseCard title="环境因素">
                      {loading ? <div className="desk-loading">加载中…</div> : <ReactECharts option={envOption} style={{ height: 320 }} />}
                    </BaseCard>
                  </Col>
                  <Col xs={24} lg={12}>
                    <BaseCard title="最近数据">
                      <div className="desk-dark-table">
                        <Table<GpsChartRow>
                          rowKey="key"
                          size="small"
                          dataSource={realtimeRows}
                          pagination={{ pageSize: 8 }}
                          rowClassName={(row) => (row.key === selectedRowKey ? "desk-gps-row-active" : "")}
                          onRow={(row) => ({
                            onClick: () => openRowDetail(row)
                          })}
                          columns={[
                            {
                              title: "时间",
                              dataIndex: "ts",
                              render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm:ss")
                            },
                            { title: "位移(mm)", dataIndex: "displacement" },
                            { title: "速度(mm/h)", dataIndex: "velocityMmH" },
                            {
                              title: "风险",
                              dataIndex: "riskLevel",
                              render: (v: number) => (
                                <Tag color={riskColor(v)} style={{ fontWeight: 800 }}>
                                  {riskDesc(v)}
                                </Tag>
                              )
                            }
                          ]}
                        />
                      </div>
                    </BaseCard>
                  </Col>
                  <Col span={24}>
                    <BaseCard title="基线 / 最新坐标">
                      <div className="desk-gps-coord">
                        <div className="desk-gps-coord-kv">
                          <div className="desk-gps-coord-title">GPS 坐标</div>
                          <div className="desk-gps-coord-row">
                            <span className="desk-gps-coord-k">基线</span>
                            <span className="desk-gps-coord-v">
                              {baseline ? (
                                <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                  {baseline.baselineLat.toFixed(6)}, {baseline.baselineLng.toFixed(6)}
                                </span>
                              ) : (
                                <span style={{ color: "rgba(148,163,184,0.9)" }}>未建立</span>
                              )}
                            </span>
                          </div>
                          <div className="desk-gps-coord-row">
                            <span className="desk-gps-coord-k">最新</span>
                            <span className="desk-gps-coord-v">
                              {latest ? (
                                <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                  {latest.lat.toFixed(6)}, {latest.lng.toFixed(6)}
                                </span>
                              ) : (
                                <span style={{ color: "rgba(148,163,184,0.9)" }}>--</span>
                              )}
                            </span>
                          </div>
                          <div className="desk-gps-coord-row">
                            <span className="desk-gps-coord-k">风险</span>
                            <span className="desk-gps-coord-v">
                              <Tag color={riskColor(level)} style={{ fontWeight: 800, marginInlineEnd: 0 }}>
                                {riskDesc(level)}
                              </Tag>
                            </span>
                          </div>
                          <div className="desk-gps-coord-tip">提示：地图为示意（散点展示基线点与最新点）。</div>
                        </div>
                        <div className="desk-gps-coord-chart">
                          {loading ? <div className="desk-loading">加载中…</div> : <ReactECharts option={coordOption} style={{ height: 220 }} />}
                        </div>
                      </div>
                    </BaseCard>
                  </Col>
                </Row>
              )
            },
            {
              key: "ceemd",
              label: "CEEMD 分解",
              children: (
                <Row gutter={[12, 12]}>
                  <Col xs={24} lg={16}>
                    <BaseCard title="分解结果">
                      {loading ? (
                        <div className="desk-loading">加载中…</div>
                      ) : (
                        <ReactECharts option={ceemdSeriesOption} style={{ height: 360 }} />
                      )}
                    </BaseCard>
                  </Col>
                  <Col xs={24} lg={8}>
                    <BaseCard title="能量分布">
                      {loading ? <div className="desk-loading">加载中…</div> : <ReactECharts option={ceemdEnergyOption} style={{ height: 360 }} />}
                    </BaseCard>
                  </Col>
                  <Col span={24}>
                    <BaseCard title="CEEMD 分解概览">
                      <Row gutter={[12, 12]}>
                        <Col xs={24} lg={10}>
                          <div className="desk-gps-ceemd-metrics">
                            <div className="desk-gps-ceemd-metric">
                              <div className="desk-gps-ceemd-k">质量评分</div>
                              <div className="desk-gps-ceemd-v">{ceemdMetrics.q}/100</div>
                              <Progress
                                percent={ceemdMetrics.q}
                                showInfo={false}
                                strokeColor={ceemdMetrics.q >= 85 ? "#22c55e" : ceemdMetrics.q >= 70 ? "#f59e0b" : "#ef4444"}
                              />
                            </div>
                            <div className="desk-gps-ceemd-metric">
                              <div className="desk-gps-ceemd-k">重构误差</div>
                              <div className="desk-gps-ceemd-v">{ceemdMetrics.recon}</div>
                              <div className="desk-gps-ceemd-muted">越小越好</div>
                            </div>
                            <div className="desk-gps-ceemd-metric">
                              <div className="desk-gps-ceemd-k">正交性</div>
                              <div className="desk-gps-ceemd-v">{ceemdMetrics.ortho}</div>
                              <div className="desk-gps-ceemd-muted">0~1</div>
                            </div>
                            <div className="desk-gps-ceemd-metric">
                              <div className="desk-gps-ceemd-k">SNR</div>
                              <div className="desk-gps-ceemd-v">{ceemdMetrics.snr} dB</div>
                              <div className="desk-gps-ceemd-muted">信噪比</div>
                            </div>
                          </div>
                        </Col>
                        <Col xs={24} lg={14}>
                          <div className="desk-gps-note">
                            <div className="desk-gps-note-title">分解解释</div>
                            <div className="desk-gps-note-line">- IMF-1/2/3：不同频段的细节成分</div>
                            <div className="desk-gps-note-line">- Residue：长期趋势项</div>
                            <div className="desk-gps-note-line">- 后续对接：dominant frequency / energy distribution / 质量指标</div>
                          </div>
                        </Col>
                      </Row>
                    </BaseCard>
                  </Col>
                  <Col span={24}>
                    <BaseCard title="说明">
                      <div className="desk-gps-note">
                        <div className="desk-gps-note-title">CEEMD 说明</div>
                        <div className="desk-gps-note-line">- 本页为演示：展示分解曲线与能量占比。</div>
                        <div className="desk-gps-note-line">- 后续可对接 v2 后端：CEEMD 分解 / IMF 分量 / 质量指标。</div>
                      </div>
                    </BaseCard>
                  </Col>
                </Row>
              )
            },
            {
              key: "prediction",
              label: "预测分析",
              children: (
                <Row gutter={[12, 12]}>
                  <Col xs={24} lg={16}>
                    <BaseCard title="短期预测">
                      {loading ? <div className="desk-loading">加载中…</div> : <ReactECharts option={predictionOption} style={{ height: 360 }} />}
                    </BaseCard>
                  </Col>
                  <Col xs={24} lg={8}>
                    <BaseCard title="分析摘要">
                      <div className="desk-gps-note">
                        <div className="desk-gps-note-title">建议</div>
                        <div className="desk-gps-note-line">
                          当前风险：
                          <span style={{ color: riskColor(level), fontWeight: 900, marginLeft: 8 }}>{riskDesc(level)}</span>
                        </div>
                        <div className="desk-gps-note-line">
                          置信度：
                          <span style={{ fontWeight: 900, marginLeft: 8 }}>
                            {latest ? `${Math.round(latest.confidence * 100)}%` : "--"}
                          </span>
                        </div>
                        <div className="desk-gps-note-line">
                          基线：
                          <span style={{ fontWeight: 900, marginLeft: 8 }}>{baseline ? "已建立" : "未建立"}</span>
                        </div>
                        <div style={{ height: 10 }} />
                        <div className="desk-gps-note-muted">提示：这里只做 UI/交互与结构对齐，预测/评估后续接入后端。</div>
                      </div>
                    </BaseCard>
                  </Col>
                  <Col xs={24} lg={16}>
                    <BaseCard title="长期预测">
                      {loading ? <div className="desk-loading">加载中…</div> : <ReactECharts option={longTermPredictionOption} style={{ height: 360 }} />}
                    </BaseCard>
                  </Col>
                  <Col xs={24} lg={8}>
                    <BaseCard title="预测指标">
                      <div className="desk-gps-ceemd-metrics">
                        <div className="desk-gps-ceemd-metric">
                          <div className="desk-gps-ceemd-k">预测范围</div>
                          <div className="desk-gps-ceemd-v">未来 14 天</div>
                        </div>
                        <div className="desk-gps-ceemd-metric">
                          <div className="desk-gps-ceemd-k">当前位移</div>
                          <div className="desk-gps-ceemd-v">{latest ? `${latest.displacement.toFixed(2)} mm` : "--"}</div>
                        </div>
                        <div className="desk-gps-ceemd-metric">
                          <div className="desk-gps-ceemd-k">当前风险</div>
                          <div className="desk-gps-ceemd-v" style={{ color: riskColor(level) }}>
                            {riskDesc(level)}
                          </div>
                        </div>
                        <div className="desk-gps-ceemd-metric">
                          <div className="desk-gps-ceemd-k">模型置信度</div>
                          <div className="desk-gps-ceemd-v">{latest ? `${Math.round(latest.confidence * 100)}%` : "--"}</div>
                          <Progress percent={latest ? Math.round(latest.confidence * 100) : 0} showInfo={false} strokeColor="rgba(34,211,238,0.9)" />
                        </div>
                      </div>
                      <div className="desk-gps-note-muted" style={{ marginTop: 8 }}>
                        提示：指标为演示数据，后续对接 v2 后端预测服务。
                      </div>
                    </BaseCard>
                  </Col>
                </Row>
              )
            },
            {
              key: "data",
              label: "数据详情",
              children: (
                <BaseCard title="GPS 数据表" style={{ height: "calc(100vh - 360px)" }}>
                  <div className="desk-dark-table">
                    <Table<GpsChartRow>
                      rowKey="key"
                      size="small"
                      dataSource={chartData}
                      loading={loading}
                      pagination={{ pageSize: 12 }}
                      scroll={{ x: 1200 }}
                      rowClassName={(row) => (row.key === selectedRowKey ? "desk-gps-row-active" : "")}
                      onRow={(row) => ({
                        onClick: () => openRowDetail(row)
                      })}
                      columns={[
                        { title: "时间", dataIndex: "ts", width: 170, render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm:ss") },
                        {
                          title: "风险",
                          dataIndex: "riskLevel",
                          width: 110,
                          render: (v: number) => (
                            <Tag color={riskColor(v)} style={{ fontWeight: 800 }}>
                              {riskDesc(v)}
                            </Tag>
                          )
                        },
                        { title: "位移(mm)", dataIndex: "displacement", width: 110 },
                        { title: "水平(mm)", dataIndex: "horizontal", width: 110 },
                        { title: "垂直(mm)", dataIndex: "vertical", width: 110 },
                        { title: "速度(mm/h)", dataIndex: "velocityMmH", width: 120 },
                        { title: "置信度", dataIndex: "confidence", width: 110, render: (v: number) => v.toFixed(2) },
                        { title: "温度(°C)", dataIndex: "temperature", width: 110 },
                        { title: "湿度(%)", dataIndex: "humidity", width: 100 },
                        { title: "纬度", dataIndex: "lat", width: 120 },
                        { title: "经度", dataIndex: "lng", width: 120 }
                      ]}
                    />
                  </div>
                </BaseCard>
              )
            }
          ]}
        />
      </div>

      <Drawer
        title={selectedRow ? `数据详情 - ${dayjs(selectedRow.ts).format("YYYY-MM-DD HH:mm:ss")}` : "数据详情"}
        placement="right"
        width={560}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        extra={
          <Space>
            <Button
              size="small"
              onClick={() => {
                if (!selectedDeviceId) return;
                navigate(`/app/device-management?tab=status&deviceId=${encodeURIComponent(selectedDeviceId)}`);
              }}
              disabled={!selectedDeviceId}
            >
              设备
            </Button>
            <Button
              size="small"
              onClick={() => {
                navigate(`/app/device-management?tab=baselines`);
              }}
            >
              基线
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                if (!selectedRow) return;
                message.success("已生成数据快照（演示）");
              }}
              disabled={!selectedRow}
            >
              快照
            </Button>
          </Space>
        }
      >
        {selectedRow ? (
          <div className="desk-gps-detail">
            <div className="desk-gps-detail-hero">
              <div>
                <div className="desk-gps-detail-title">风险评估</div>
                <div className="desk-gps-detail-risk" style={{ color: riskColor(selectedRow.riskLevel) }}>
                  {riskDesc(selectedRow.riskLevel)}
                </div>
              </div>
              <div className="desk-gps-detail-meta">
                <div className="k">设备</div>
                <div className="v">{selectedDeviceId || "--"}</div>
              </div>
            </div>

            <div className="desk-gps-detail-card">
              <div className="desk-gps-detail-card-title">形变数据</div>
              <div className="desk-gps-detail-grid">
                <div className="kv">
                  <div className="k">总位移</div>
                  <div className="v">{selectedRow.displacement.toFixed(2)} mm</div>
                </div>
                <div className="kv">
                  <div className="k">速度</div>
                  <div className="v">{selectedRow.velocityMmH.toFixed(2)} mm/h</div>
                </div>
                <div className="kv">
                  <div className="k">水平</div>
                  <div className="v">{selectedRow.horizontal.toFixed(2)} mm</div>
                </div>
                <div className="kv">
                  <div className="k">垂直</div>
                  <div className="v">{selectedRow.vertical.toFixed(2)} mm</div>
                </div>
              </div>
              <div className="desk-gps-detail-note">
                阈值：蓝 {thresholds.blue} / 黄 {thresholds.yellow} / 红 {thresholds.red}（mm）
              </div>
            </div>

            <div className="desk-gps-detail-card">
              <div className="desk-gps-detail-card-title">环境因素</div>
              <div className="desk-gps-detail-grid">
                <div className="kv">
                  <div className="k">温度</div>
                  <div className="v">{selectedRow.temperature.toFixed(1)} °C</div>
                </div>
                <div className="kv">
                  <div className="k">湿度</div>
                  <div className="v">{selectedRow.humidity.toFixed(0)} %</div>
                </div>
                <div className="kv">
                  <div className="k">模型置信度</div>
                  <div className="v">{Math.round(selectedRow.confidence * 100)}%</div>
                </div>
              </div>
            </div>

            <div className="desk-gps-detail-card">
              <div className="desk-gps-detail-card-title">坐标与基线</div>
              <div className="desk-gps-detail-grid">
                <div className="kv">
                  <div className="k">当前坐标</div>
                  <div className="v">
                    <span className="desk-gps-mono">
                      {selectedRow.lat.toFixed(6)}, {selectedRow.lng.toFixed(6)}
                    </span>
                  </div>
                </div>
                <div className="kv">
                  <div className="k">基线</div>
                  <div className="v">
                    {baseline ? (
                      <span className="desk-gps-mono">
                        {baseline.baselineLat.toFixed(6)}, {baseline.baselineLng.toFixed(6)}
                      </span>
                    ) : (
                      <span style={{ color: "rgba(148,163,184,0.9)" }}>未建立</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: "rgba(148,163,184,0.9)" }}>请选择一条数据</div>
        )}
      </Drawer>

      <Modal
        title="监测阈值设置"
        open={showSettings}
        onCancel={() => setShowSettings(false)}
        okText="保存"
        onOk={async () => {
          const values = await form.validateFields();
          if (values.blue >= values.yellow || values.yellow >= values.red) {
            message.error("阈值需要满足：蓝 < 黄 < 红");
            return;
          }
          setThresholds(values);
          setShowSettings(false);
          message.success("已保存（本地）");
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="blue" label="蓝色预警阈值（mm）" rules={[{ required: true }]}>
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="yellow" label="黄色预警阈值（mm）" rules={[{ required: true }]}>
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="red" label="红色预警阈值（mm）" rules={[{ required: true }]}>
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 12 }}>
            仅影响本页展示，后续可从后端配置中心下发。
          </div>
        </Form>
      </Modal>

      <Modal
        title="数据点数设置"
        open={showLimit}
        onCancel={() => setShowLimit(false)}
        okText="保存"
        onOk={async () => {
          const values = await limitForm.validateFields();
          const limit = Math.trunc(values.limit);
          if (!Number.isFinite(limit) || limit < 50 || limit > 2000) {
            message.error("请输入有效的数据点数（50-2000）");
            return;
          }
          setDataLimit(limit);
          localStorage.setItem(DATA_LIMIT_KEY, String(limit));
          setShowLimit(false);
          message.success(`数据点数已更新为 ${limit} 条`);
        }}
      >
        <Form form={limitForm} layout="vertical">
          <Form.Item name="limit" label="数据点数限制" rules={[{ required: true }]}>
            <InputNumber min={50} max={2000} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 12 }}>
            说明：仅影响本页图表与表格的展示条数，不会影响后端数据。
          </div>
        </Form>
      </Modal>
    </div>
  );
}
