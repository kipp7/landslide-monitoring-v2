import { Alert, Spin } from "antd";
import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Device, Station } from "../api/client";
import { useApi } from "../api/ApiProvider";
import { BaseCard } from "../components/BaseCard";
import { MapSwitchPanel, type MapType } from "../components/MapSwitchPanel";
import { StatusTag } from "../components/StatusTag";

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

export function AnalysisPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [mapType, setMapType] = useState<MapType>("卫星图");
  const [loading, setLoading] = useState(true);
  const [stations, setStations] = useState<Station[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [alertOn, setAlertOn] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    const run = async () => {
      try {
        const [s, d] = await Promise.all([api.stations.list(), api.devices.list()]);
        if (abort.signal.aborted) return;
        setStations(s);
        setDevices(d);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => {
      abort.abort();
    };
  }, [api]);

  const stats = useMemo(() => {
    const online = devices.filter((d) => d.status === "online").length;
    const warn = devices.filter((d) => d.status === "warning").length;
    const offline = devices.filter((d) => d.status === "offline").length;
    return {
      stations: stations.length,
      devices: devices.length,
      online,
      warn,
      offline,
      lastUpdate: new Date().toLocaleString("zh-CN")
    };
  }, [devices, stations.length]);

  useEffect(() => {
    const shouldAlert = stats.offline > 0 || stats.warn > 0;
    setAlertOn(shouldAlert);
  }, [stats.offline, stats.warn]);

  const leftLineBase = useMemo(() => {
    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      grid: { left: 42, right: 14, top: 18, bottom: 32 },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: Array.from({ length: 12 }, (_, i) => String(i + 1)),
        ...darkAxis()
      },
      yAxis: { type: "value", ...darkAxis() }
    };
  }, []);

  const temperatureOption = useMemo(() => {
    return {
      ...leftLineBase,
      yAxis: { ...leftLineBase.yAxis, name: "°C" },
      series: [
        {
          name: "温度",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: [14, 14.3, 14.1, 14.8, 15.2, 15.9, 16.1, 16.2, 16.5, 16.8, 16.4, 16.0],
          lineStyle: { width: 2, color: "#22d3ee" },
          areaStyle: { color: "rgba(34, 211, 238, 0.18)" }
        }
      ]
    };
  }, [leftLineBase]);

  const humidityOption = useMemo(() => {
    return {
      ...leftLineBase,
      yAxis: { ...leftLineBase.yAxis, name: "%" },
      series: [
        {
          name: "湿度",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: [82, 83, 84, 85, 86, 87, 86, 85, 84, 83, 83, 82],
          lineStyle: { width: 2, color: "#60a5fa" },
          areaStyle: { color: "rgba(96, 165, 250, 0.14)" }
        }
      ]
    };
  }, [leftLineBase]);

  const accelOption = useMemo(() => {
    return {
      ...leftLineBase,
      yAxis: { ...leftLineBase.yAxis, name: "mg" },
      series: [
        {
          name: "加速度",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: [2, 3, 2, 4, 5, 6, 5, 7, 6, 8, 6, 5],
          lineStyle: { width: 2, color: "#34d399" },
          areaStyle: { color: "rgba(52, 211, 153, 0.14)" }
        }
      ]
    };
  }, [leftLineBase]);

  const gyroOption = useMemo(() => {
    return {
      ...leftLineBase,
      yAxis: { ...leftLineBase.yAxis, name: "°/s" },
      series: [
        {
          name: "陀螺仪",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: [0.2, 0.4, 0.3, 0.6, 0.8, 1.1, 0.9, 1.3, 1.1, 1.6, 1.2, 1.0],
          lineStyle: { width: 2, color: "#fbbf24" },
          areaStyle: { color: "rgba(251, 191, 36, 0.12)" }
        }
      ]
    };
  }, [leftLineBase]);

  const rainfallOption = useMemo(() => {
    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      grid: { left: 42, right: 14, top: 18, bottom: 32 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"], ...darkAxis() },
      yAxis: { type: "value", ...darkAxis() },
      series: [
        {
          name: "雨量",
          type: "bar",
          data: [12, 8, 15, 6, 9, 18, 11],
          itemStyle: { color: "rgba(34, 211, 238, 0.85)" },
          barWidth: 14
        }
      ]
    };
  }, []);

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

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: {
        trigger: "item",
        formatter: (p: { name: string }) => p.name
      },
      grid: { left: 16, right: 16, top: 10, bottom: 16 },
      xAxis: {
        type: "value",
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: "value",
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
          }
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
            <BaseCard title="温度趋势（°C）">
              <ReactECharts option={temperatureOption} style={{ height: "100%" }} />
            </BaseCard>
            <BaseCard title="湿度趋势（%）">
              <ReactECharts option={humidityOption} style={{ height: "100%" }} />
            </BaseCard>
            <BaseCard title="加速度趋势（mg）">
              <ReactECharts option={accelOption} style={{ height: "100%" }} />
            </BaseCard>
            <BaseCard title="陀螺仪趋势（°/s）">
              <ReactECharts option={gyroOption} style={{ height: "100%" }} />
            </BaseCard>
          </div>

          <div className="desk-analysis-mapcol">
            <BaseCard
              title={`滑坡监测地图与预警（最新 ${stats.lastUpdate}）`}
              extra={<MapSwitchPanel selected={mapType} onSelect={setMapType} />}
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
              <BaseCard title="雨量图（mm）">
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
