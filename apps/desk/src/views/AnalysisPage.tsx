import { Alert, Button, Spin, Switch, Tag } from "antd";
import ReactECharts from "echarts-for-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Device, Station } from "../api/client";
import { useApi } from "../api/ApiProvider";
import { BaseCard } from "../components/BaseCard";
import { MapSwitchPanel, type MapType } from "../components/MapSwitchPanel";
import { StatusTag } from "../components/StatusTag";
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
      grid: { left: 54, right: 18, top: 22, bottom: 30, containLabel: true },
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
    return {
      ...chartBase,
      grid: { left: 54, right: 54, top: 22, bottom: 30, containLabel: true },
      legend: {
        top: 6,
        right: 10,
        textStyle: { color: "rgba(226, 232, 240, 0.82)" },
        itemWidth: 10,
        itemHeight: 10
      },
      xAxis: { ...chartBase.xAxis, data: Array.from({ length: 12 }, (_, i) => `${String(i + 1)}时`) },
      yAxis: [
        { type: "value", name: "°C", ...darkAxis(), axisLabel: { ...darkAxis().axisLabel, margin: 8 } },
        { type: "value", name: "%", ...darkAxis(), axisLabel: { ...darkAxis().axisLabel, margin: 8 } }
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
    return {
      ...chartBase,
      grid: { left: 54, right: 54, top: 22, bottom: 30, containLabel: true },
      legend: {
        top: 6,
        right: 10,
        textStyle: { color: "rgba(226, 232, 240, 0.82)" },
        itemWidth: 10,
        itemHeight: 10
      },
      xAxis: { ...chartBase.xAxis, data: Array.from({ length: 12 }, (_, i) => `${String(i + 1)}时`) },
      yAxis: [
        { type: "value", name: "mg", ...darkAxis(), axisLabel: { ...darkAxis().axisLabel, margin: 8 } },
        { type: "value", name: "°/s", ...darkAxis(), axisLabel: { ...darkAxis().axisLabel, margin: 8 } }
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
      grid: { left: 54, right: 18, top: 18, bottom: 32, containLabel: true },
      tooltip: { trigger: "axis", ...darkTooltip() },
      xAxis: { type: "category", data: labels, ...darkAxis() },
      yAxis: { type: "value", name: is24h ? "mm/h" : "mm", ...darkAxis(), axisLabel: { ...darkAxis().axisLabel, margin: 8 } },
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
    const centerX = "38%";
    const centerY = "55%";

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: { trigger: "item", ...darkTooltip() },
      legend: {
        top: 6,
        right: 10,
        orient: "vertical",
        textStyle: { color: "rgba(226, 232, 240, 0.82)" }
      },
      series: [
        {
          type: "pie",
          radius: ["52%", "78%"],
          center: [centerX, centerY],
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
      grid: { left: 42, right: 14, top: 34, bottom: 28 },
      legend: {
        top: 6,
        left: 10,
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

  const mapOption = useMemo(() => {
    const points = stations.map((s) => ({
      name: s.name,
      value: [s.lng, s.lat, s.risk]
    }));

    const riskColor = (risk: Station["risk"]) => {
      if (risk === "high") return "#ef4444";
      if (risk === "mid") return "#f59e0b";
      return "#22c55e";
    };

    const lngs = stations.map((s) => s.lng);
    const lats = stations.map((s) => s.lat);
    const minX = lngs.length ? Math.min(...lngs) - 0.02 : 0;
    const maxX = lngs.length ? Math.max(...lngs) + 0.02 : 1;
    const minY = lats.length ? Math.min(...lats) - 0.02 : 0;
    const maxY = lats.length ? Math.max(...lats) + 0.02 : 1;

    const zones = stations
      .filter((s) => s.risk !== "low")
      .slice(0, 4)
      .map((s) => {
        const pad = s.risk === "high" ? 0.012 : 0.009;
        return [
          { coord: [s.lng - pad, s.lat - pad] },
          { coord: [s.lng + pad, s.lat + pad] }
        ];
      });

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: {
        trigger: "item",
        ...darkTooltip(),
        formatter: (p: { name: string; value?: [number, number, Station["risk"]] }) => {
          const risk = p.value?.[2];
          const riskText = risk === "high" ? "高风险" : risk === "mid" ? "中风险" : "低风险";
          return `${p.name}<br/>${riskText}`;
        }
      },
      grid: { left: 16, right: 16, top: 10, bottom: 16 },
      xAxis: {
        type: "value",
        min: minX,
        max: maxX,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: "value",
        min: minY,
        max: maxY,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { show: false }
      },
      series: [
        {
          type: "scatter",
          symbolSize: 16,
          data: points.map((p) => ({ name: p.name, value: p.value })),
          itemStyle: {
            color: (params: { data: { value: [number, number, Station["risk"]] } }) => riskColor(params.data.value[2]),
            shadowBlur: 12,
            shadowColor: "rgba(0,255,255,0.18)"
          },
          markArea: zones.length
            ? {
                silent: true,
                itemStyle: { color: "rgba(245, 158, 11, 0.06)", borderColor: "rgba(245, 158, 11, 0.22)", borderWidth: 1 },
                data: zones
              }
            : undefined
        },
        {
          type: "effectScatter",
          symbolSize: 18,
          data: points.filter((p) => p.value[2] === "high").map((p) => ({ name: p.name, value: p.value })),
          rippleEffect: { scale: 2.2, brushType: "stroke" },
          itemStyle: { color: "#ef4444" },
          zlevel: 3
        }
      ]
    };
  }, [stations]);

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

      {hasCritical ? (
        <div className="desk-analysis-alert">
          <Alert
            type="error"
            showIcon
            message="存在离线设备"
            description="当前有设备离线，请检查网络/供电/采集链路。"
          />
        </div>
      ) : hasWarn ? (
        <div className="desk-analysis-alert">
          <Alert
            type="warning"
            showIcon
            message="存在预警设备"
            description="当前有设备触发预警，请关注形变、雨量等指标。"
          />
        </div>
      ) : null}

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
            <BaseCard title="环境趋势（温度/湿度）">
              <ReactECharts option={tempHumOption} style={{ height: "100%" }} />
            </BaseCard>
            <BaseCard title="振动趋势（加速度/陀螺仪）">
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
                  <MapSwitchPanel selected={mapType} onSelect={setMapType} />
                </div>
              }
            >
              <div className="desk-analysis-mapstack">
                <div className="desk-analysis-maptop">
                  {mapType === "视频" ? (
                    <div className="desk-video-mock">视频流（接入后展示）</div>
                  ) : mapType === "3D" ? (
                    <div className="desk-video-mock">3D 地图（接入后展示）</div>
                  ) : (
                    <ReactECharts option={mapOption} style={{ height: "100%" }} />
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
                title={rainRange === "24h" ? "降雨强度（24 小时）" : "累计雨量（7 天）"}
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
                        tooltip: { trigger: "item" },
                        series: [
                          {
                            type: "pie",
                            radius: ["55%", "80%"],
                            label: { show: false },
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
