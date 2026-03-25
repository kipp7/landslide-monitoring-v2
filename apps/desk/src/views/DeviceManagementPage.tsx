import type { MenuProps } from "antd";
import { ExportOutlined, ReloadOutlined, SettingOutlined, ToolOutlined } from "@ant-design/icons";
import { App as AntApp, Alert, Button, Dropdown, Modal, Progress, Select, Space, Switch, Tag, Typography } from "antd";
import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type {
  Baseline,
  Device,
  DeviceCommand,
  DeviceHealthExpertResult,
  OnlineStatus,
  Station,
  SuccessNotificationPolicy
} from "../api/client";
import { useApi } from "../api/ApiProvider";
import { BaseCard } from "../components/BaseCard";
import { StatusTag } from "../components/StatusTag";
import { buildBaselinesExport, buildDeviceDetailText, buildDevicesExport, buildSensorExport, copyTextContent, triggerPreparedExport } from "./deviceManagementExport";
import { BaselinesPanel } from "./BaselinesPanel";
import { StationManagementPanel } from "./StationManagementPanel";
import "./deviceManagement.css";

type TabKey = "status" | "management" | "baselines";

type SensorRow = {
  id: string;
  time: string;
  temperature: number;
  humidity: number;
  dispMm: number;
  rainMm: number;
};

type ControlLogRow = {
  id: string;
  time: string;
  action: string;
  result: "success" | "pending" | "failed";
};

function stablePercent(seed: string, min: number, max: number) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const t = (h >>> 0) / 4294967295;
  return Math.round(min + t * (max - min));
}

function statusDotColor(status: OnlineStatus) {
  if (status === "online") return "#4ade80";
  if (status === "warning") return "#fbbf24";
  return "#94a3b8";
}

function progressColor(value: number) {
  if (value >= 70) return "#22c55e";
  if (value >= 40) return "#f59e0b";
  return "#ef4444";
}

function mapCommandStatus(status: DeviceCommand["status"]): ControlLogRow["result"] {
  if (status === "queued" || status === "sent") return "pending";
  if (status === "acked") return "success";
  return "failed";
}

function successNotificationPolicyLabel(policy: SuccessNotificationPolicy): string {
  if (policy === "always_notify") return "始终通知";
  if (policy === "silent") return "静默";
  return "继承默认";
}

function deviceTypeLabel(device: Device) {
  if (device.type === "gnss") return "GNSS";
  if (device.type === "rain") return "雨量";
  if (device.type === "tilt") return "倾角";
  if (device.type === "temp_hum") return "温湿度";
  return "摄像头";
}

export function DeviceManagementPage() {
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const { message, modal } = AntApp.useApp();
  const [activeTab, setActiveTab] = useState<TabKey>("status");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [lastUpdateTime, setLastUpdateTime] = useState<string>("");
  const [nowTime, setNowTime] = useState<string>(new Date().toLocaleTimeString("zh-CN"));
  const [detailOpen, setDetailOpen] = useState(false);
  const [motorRunning, setMotorRunning] = useState(false);
  const [buzzerOn, setBuzzerOn] = useState(false);
  const [successNotificationPolicy, setSuccessNotificationPolicy] = useState<SuccessNotificationPolicy>("inherit");
  const [samplingInterval, setSamplingInterval] = useState<number>(10);
  const [controlLogs, setControlLogs] = useState<ControlLogRow[]>([]);
  const [sensorRows, setSensorRows] = useState<SensorRow[]>([]);
  const [deviceExpert, setDeviceExpert] = useState<DeviceHealthExpertResult | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab === "status" || tab === "management" || tab === "baselines") setActiveTab(tab);

    const qDeviceId = params.get("deviceId");
    if (qDeviceId) setSelectedDeviceId(qDeviceId);
  }, [location.search]);

  const setTab = (tab: TabKey) => {
    setActiveTab(tab);
    const params = new URLSearchParams(location.search);
    params.set("tab", tab);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(new Date().toLocaleTimeString("zh-CN"));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const queryStationId = useMemo(() => new URLSearchParams(location.search).get("stationId"), [location.search]);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setLoadError(null);
    const run = async () => {
      try {
        const [s, d, b] = await Promise.all([api.stations.list(), api.devices.list(), api.baselines.list()]);
        if (abort.signal.aborted) return;
        setStations(s);
        setDevices(d);
        setBaselines(b);
        setSelectedDeviceId((prev) => {
          if (prev && d.some((x) => x.id === prev)) return prev;
          const preferred = d.find((x) => x.status === "online") ?? d.find((x) => x.status === "warning") ?? d[0];
          return preferred?.id || "";
        });
        setLastUpdateTime(new Date().toLocaleTimeString("zh-CN"));
      } catch (err) {
        if (abort.signal.aborted) return;
        const msg = (err as Error).message;
        setLoadError(msg);
        message.error(`设备管理加载失败：${msg}（可在系统设置切换数据源）`);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => abort.abort();
  }, [api]);

  const areas = useMemo(() => {
    const set = new Set(stations.map((s) => s.area));
    return Array.from(set).sort();
  }, [stations]);

  const stationsById = useMemo(() => new Map(stations.map((s) => [s.id, s] as const)), [stations]);
  const baselineByDeviceId = useMemo(() => new Map(baselines.map((b) => [b.deviceId, b] as const)), [baselines]);

  const filteredDevices = useMemo(() => {
    if (selectedRegion === "all") return devices;
    const stationIdsInRegion = new Set(stations.filter((s) => s.area === selectedRegion).map((s) => s.id));
    return devices.filter((d) => stationIdsInRegion.has(d.stationId));
  }, [devices, selectedRegion, stations]);

  useEffect(() => {
    if (!selectedDeviceId) return;
    if (filteredDevices.some((d) => d.id === selectedDeviceId)) return;
    const preferred = filteredDevices.find((d) => d.status === "online") ?? filteredDevices.find((d) => d.status === "warning") ?? filteredDevices[0];
    setSelectedDeviceId(preferred?.id ?? "");
  }, [filteredDevices, selectedDeviceId]);

  const selectedDevice = useMemo(() => devices.find((d) => d.id === selectedDeviceId) ?? null, [devices, selectedDeviceId]);
  const selectedStation = useMemo(
    () => (selectedDevice ? stationsById.get(selectedDevice.stationId) ?? null : null),
    [selectedDevice, stationsById]
  );

  const deviceMetrics = useMemo(() => {
    if (!selectedDevice) {
      return {
        health: 0,
        battery: 0,
        signal: 0,
        todayCount: 0,
        baselineEstablished: false
      };
    }
    const seed = selectedDevice.id;
    const fallbackTodayCount = stablePercent(`${seed}-count`, 120, 520);
    const health = deviceExpert?.result.health?.score ?? 0;
    const battery = deviceExpert?.result.battery?.soc ?? 0;
    const signal = deviceExpert?.result.signal?.strength ?? 0;
    const todayCount = sensorRows.length > 0 ? sensorRows.length : fallbackTodayCount;
    const baselineEstablished = !!baselineByDeviceId.get(selectedDevice.id);
    return { health, battery, signal, todayCount, baselineEstablished };
  }, [baselineByDeviceId, deviceExpert, selectedDevice, sensorRows.length]);

  const mapOption = useMemo(() => {
    const riskColor = (risk: Station["risk"]) => {
      if (risk === "high") return "#ef4444";
      if (risk === "mid") return "#f59e0b";
      return "#22c55e";
    };

    const points = stations.map((s) => ({
      stationId: s.id,
      name: s.name,
      value: [s.lng, s.lat] as [number, number],
      risk: s.risk,
      status: s.status,
      symbolSize: selectedStation?.id && s.id === selectedStation.id ? 20 : 14,
      itemStyle: { color: riskColor(s.risk), shadowBlur: 16, shadowColor: "rgba(0,255,255,0.22)" }
    }));
    const focusStationId = selectedStation?.id;

    return {
      backgroundColor: "transparent",
      textStyle: { color: "rgba(226, 232, 240, 0.9)" },
      tooltip: {
        trigger: "item",
        formatter: (p: { data: { name: string; risk?: Station["risk"]; status?: Station["status"] } }) => {
          const risk = p.data.risk ?? "low";
          const status = p.data.status ?? "offline";
          const riskLabel = risk === "high" ? "高" : risk === "mid" ? "中" : "低";
          const statusLabel = status === "online" ? "在线" : status === "warning" ? "预警" : "离线";
          return `${p.data.name}<br/>风险：${riskLabel}<br/>状态：${statusLabel}`;
        }
      },
      grid: { left: 12, right: 12, top: 12, bottom: 12 },
      xAxis: { show: false, type: "value" },
      yAxis: { show: false, type: "value" },
      series: [
        {
          type: "scatter",
          data: points,
          symbolSize: 14,
          // Use per-point itemStyle/symbolSize to avoid callback runtime errors.
          emphasis: { scale: true }
        }
      ]
    };
  }, [selectedStation?.id, stations]);

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [d, b] = await Promise.all([api.devices.list(), api.baselines.list()]);
      setDevices(d);
      setBaselines(b);
      setLastUpdateTime(new Date().toLocaleTimeString("zh-CN"));
      message.success("已刷新");
    } catch (err) {
      const msg = (err as Error).message;
      setLoadError(msg);
      message.error(`刷新失败：${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshCommandLogs = async (deviceId: string) => {
    try {
      const commands = await api.devices.listCommands({ deviceId });
      setControlLogs(
        commands.slice(0, 12).map((command) => ({
          id: command.commandId,
          time: new Date(command.createdAt).toLocaleTimeString("zh-CN"),
          action: command.commandType,
          result: mapCommandStatus(command.status)
        }))
      );
    } catch {
      // keep current logs on failure
    }
  };

  const pushControlLog = (action: string, result: ControlLogRow["result"] = "success") => {
    const now = new Date();
    const row: ControlLogRow = {
      id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
      time: now.toLocaleTimeString("zh-CN"),
      action,
      result
    };
    setControlLogs((prev) => [row, ...prev].slice(0, 12));
  };

  const issueSelectedCommand = async (
    action: string,
    commandType: string,
    payload: Record<string, unknown> = {},
    overrideSuccessNotificationPolicy?: SuccessNotificationPolicy
  ) => {
    if (!selectedDevice) {
      message.info("请先选择设备");
      return;
    }
    try {
      const issued = await api.devices.issueCommand({
        deviceId: selectedDevice.id,
        commandType,
        payload,
        successNotificationPolicy: overrideSuccessNotificationPolicy ?? successNotificationPolicy
      });
      message.success(`${action} 已下发（${successNotificationPolicyLabel(issued.effectiveSuccessNotificationPolicy)}）`);
      pushControlLog(`${action}（${issued.commandId.slice(0, 8)}）`, issued.status === "queued" ? "pending" : "success");
      await refreshCommandLogs(selectedDevice.id);
    } catch (err) {
      message.error((err as Error).message);
      pushControlLog(action, "failed");
    }
  };

  useEffect(() => {
    if (!selectedDeviceId) {
      setControlLogs([]);
      return;
    }
    void refreshCommandLogs(selectedDeviceId);
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!selectedDevice) {
      setDeviceExpert(null);
      return;
    }
    const abort = new AbortController();
    const run = async () => {
      try {
        const expert = await api.devices.getHealthExpert({ deviceId: selectedDevice.id, metric: "all" });
        if (!abort.signal.aborted) setDeviceExpert(expert);
      } catch {
        if (!abort.signal.aborted) setDeviceExpert(null);
      }
    };
    void run();
    return () => abort.abort();
  }, [api, selectedDevice]);

  useEffect(() => {
    if (!selectedDevice) {
      setSensorRows([]);
      return;
    }
    const abort = new AbortController();
    const run = async () => {
      try {
        const endTime = new Date().toISOString();
        const start = new Date();
        start.setHours(start.getHours() - 24);
        const startTime = start.toISOString();

        const [temperature, humidity, rain, gps] = await Promise.all([
          api.telemetry.getSeries({ deviceId: selectedDevice.id, sensorKey: "temperature_c", startTime, endTime, interval: "1h" }),
          api.telemetry.getSeries({ deviceId: selectedDevice.id, sensorKey: "humidity_pct", startTime, endTime, interval: "1h" }),
          api.telemetry.getSeries({ deviceId: selectedDevice.id, sensorKey: "rainfall_mm", startTime, endTime, interval: "1h" }),
          baselineByDeviceId.get(selectedDevice.id)
            ? api.gps.getSeries({ deviceId: selectedDevice.id, days: 7 })
            : Promise.resolve(null)
        ]);
        if (abort.signal.aborted) return;

        const rows = new Map<string, SensorRow>();
        const upsert = (ts: string) => {
          const existing = rows.get(ts);
          if (existing) return existing;
          const created: SensorRow = {
            id: ts,
            time: new Date(ts).toLocaleTimeString("zh-CN"),
            temperature: 0,
            humidity: 0,
            dispMm: 0,
            rainMm: 0
          };
          rows.set(ts, created);
          return created;
        };

        for (const point of temperature) {
          upsert(point.ts).temperature = Number(point.value.toFixed(1));
        }
        for (const point of humidity) {
          upsert(point.ts).humidity = Number(point.value.toFixed(0));
        }
        for (const point of rain) {
          upsert(point.ts).rainMm = Number(point.value.toFixed(0));
        }
        for (const point of gps?.points ?? []) {
          upsert(point.ts).dispMm = Number(point.dispMm.toFixed(2));
        }

        const ordered = Array.from(rows.values())
          .sort((a, b) => new Date(a.id).getTime() - new Date(b.id).getTime())
          .slice(-10);
        setSensorRows(ordered);
      } catch {
        if (!abort.signal.aborted) setSensorRows([]);
      }
    };
    void run();
    return () => abort.abort();
  }, [api, baselineByDeviceId, selectedDevice]);

  const showDiagnostics = () => {
    if (!selectedDevice) {
      message.info("请先选择设备");
      return;
    }

    void api.devices
      .getHealthExpert({ deviceId: selectedDevice.id, metric: "all" })
      .then((expert) => {
        const health = expert.result.health;
        const battery = expert.result.battery;
        const signal = expert.result.signal;
        const overallLevel = health?.level ?? "bad";
        const overallLabel = overallLevel === "good" ? "健康" : overallLevel === "warn" ? "需要关注" : "异常";
        const overallColor = overallLevel === "good" ? "#22c55e" : overallLevel === "warn" ? "#f59e0b" : "#ef4444";

        modal.info({
          title: (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ToolOutlined style={{ color: "rgba(34,211,238,0.95)" }} />
              <span>设备诊断结果 - {selectedDevice.name}</span>
            </div>
          ),
          width: 640,
          okText: "确定",
          content: (
            <div style={{ marginTop: 12, color: "rgba(226,232,240,0.92)" }}>
              <div
                style={{
                  border: "1px solid rgba(148,163,184,0.18)",
                  background: "rgba(2,6,23,0.28)",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <span style={{ color: "rgba(148,163,184,0.9)" }}>整体状态</span>
                <span style={{ color: overallColor, fontWeight: 800 }}>{overallLabel}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(148,163,184,0.9)" }}>健康评分</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{health?.score ?? 0}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(148,163,184,0.9)" }}>基线状态</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: deviceMetrics.baselineEstablished ? "#22c55e" : "#f59e0b" }}>
                    {deviceMetrics.baselineEstablished ? "已建立" : "待建立"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(148,163,184,0.9)" }}>电池电量</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{battery?.soc ?? 0}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(148,163,184,0.9)" }}>信号强度</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{signal?.strength ?? 0}%</div>
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: 12, color: "rgba(148,163,184,0.9)" }}>
                诊断时间：{new Date(expert.result.metadata.calculationTime).toLocaleString("zh-CN")}
              </div>
            </div>
          )
        });
      })
      .catch((err: unknown) => {
        message.error((err as Error).message);
      });
  };

  const exportItems: MenuProps["items"] = [
    { key: "devices", label: "导出设备列表" },
    { key: "sensor", label: "导出传感器数据" },
    { key: "baselines", label: "导出基线信息" }
  ];

  const onExportClick: MenuProps["onClick"] = ({ key }) => {
    try {
      if (key === "devices") {
        triggerPreparedExport(buildDevicesExport(filteredDevices));
        message.success("已导出设备列表");
      }
      if (key === "sensor") {
        triggerPreparedExport(buildSensorExport(sensorRows));
        message.success("已导出传感器数据");
      }
      if (key === "baselines") {
        triggerPreparedExport(buildBaselinesExport(baselines));
        message.success("已导出基线信息");
      }
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  return (
    <div className="desk-page desk-dm-page">
      <div className="desk-dm-head">
        <div className="desk-dm-head-left">
          <div className="desk-dm-titleblock">
            <div className="desk-dm-title">设备管理中心</div>
            <div className="desk-dm-subtitle">Device Management Center</div>
          </div>

          <div className="desk-dm-nav">
            <button type="button" className="desk-dm-navbtn" onClick={() => navigate("/app/analysis")}>
              数据分析
            </button>
            <button type="button" className="desk-dm-navbtn active">
              设备管理
            </button>
            <button type="button" className="desk-dm-navbtn" onClick={() => navigate("/app/gps-monitoring")}>
              地质形变监测
            </button>
            <button type="button" className="desk-dm-navbtn" onClick={() => navigate("/app/settings")}>
              系统设置
            </button>
          </div>
        </div>

        <div className="desk-dm-head-right">
          <div className="desk-dm-time">{nowTime}</div>
          {lastUpdateTime ? <div className="desk-dm-updated">数据更新: {lastUpdateTime}</div> : null}
          <div className="desk-dm-actions">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => {
                void refresh();
              }}
            >
              刷新
            </Button>
            <Dropdown menu={{ items: exportItems, onClick: onExportClick }}>
              <Button size="small" icon={<ExportOutlined />}>
                导出
              </Button>
            </Dropdown>
            <Button
              size="small"
              icon={<SettingOutlined />}
              onClick={() => {
                navigate("/app/settings");
              }}
            >
              设置
            </Button>
          </div>
        </div>
      </div>

      <div className="desk-dm-tabs">
        <button
          type="button"
          className={`desk-dm-tabbtn ${activeTab === "status" ? "active" : ""}`}
          onClick={() => setTab("status")}
        >
          设备状态监控
        </button>
        <button
          type="button"
          className={`desk-dm-tabbtn ${activeTab === "management" ? "active" : ""}`}
          onClick={() => setTab("management")}
        >
          监测站管理
        </button>
        <button
          type="button"
          className={`desk-dm-tabbtn ${activeTab === "baselines" ? "active" : ""}`}
          onClick={() => setTab("baselines")}
        >
          基线管理
        </button>
      </div>

      {loadError ? (
        <div style={{ marginBottom: 12 }}>
          <Alert
            type="error"
            showIcon
            message="页面数据加载失败"
            description={
              <div style={{ color: "rgba(226,232,240,0.9)" }}>
                <div style={{ marginBottom: 6 }}>{loadError}</div>
                <div style={{ color: "rgba(148,163,184,0.9)" }}>可在「系统设置」切换数据源（演示/在线接口）。</div>
              </div>
            }
          />
        </div>
      ) : null}

      {activeTab === "status" ? (
        <div className="desk-dm-content">
          <div className="desk-dm-grid-top">
            <BaseCard title="设备选择" className="desk-dm-panel">
              <div className="desk-dm-muted">
                总计: {devices.length} 台 | 在线: {devices.filter((d) => d.status === "online").length} 台
              </div>
              <div style={{ height: 10 }} />
              <div className="desk-dm-field">
                <div className="desk-dm-label">监测区域</div>
                <Select
                  size="small"
                  value={selectedRegion}
                  style={{ width: "100%" }}
                  onChange={(v) => setSelectedRegion(v)}
                  options={[
                    { label: `全部区域`, value: "all" },
                    ...areas.map((a) => ({ label: `${a}（${stations.filter((s) => s.area === a).length}）`, value: a }))
                  ]}
                />
              </div>

              <div className="desk-dm-field">
                <div className="desk-dm-label">监测设备</div>
                <div className="desk-dm-devlist">
                  {filteredDevices.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`desk-dm-devitem ${d.id === selectedDeviceId ? "active" : ""}`}
                      onClick={() => setSelectedDeviceId(d.id)}
                    >
                      <span className="desk-dm-dot" style={{ backgroundColor: statusDotColor(d.status) }} />
                      <span className="desk-dm-devmeta">
                        <span className="desk-dm-devname">{d.name}</span>
                        <span className="desk-dm-devsub">
                          {deviceTypeLabel(d)} · {d.stationName}
                        </span>
                      </span>
                      <span className="desk-dm-devstatus">
                        <StatusTag value={d.status} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </BaseCard>

            <BaseCard title="设备状态概览" className="desk-dm-panel desk-dm-panel-overview">
              {selectedDevice ? (
                <>
                  <div className="desk-dm-overview-head">
                    <div>
                      <div className="desk-dm-overview-title">{selectedDevice.name}</div>
                      <div className="desk-dm-muted">
                        {deviceTypeLabel(selectedDevice)} · {selectedDevice.stationName}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Tag className="desk-pill-tag">{deviceTypeLabel(selectedDevice)}</Tag>
                      <StatusTag value={selectedDevice.status} />
                    </div>
                  </div>

                  <div className="desk-dm-overview-grid">
                    <div className="desk-dm-metric">
                      <div className="desk-dm-metric-label">在线状态</div>
                      <div className="desk-dm-metric-value">{selectedDevice.status === "online" ? "在线" : selectedDevice.status === "warning" ? "预警" : "离线"}</div>
                    </div>
                    <div className="desk-dm-metric">
                      <div className="desk-dm-metric-label">基线状态</div>
                      <div className="desk-dm-metric-value" style={{ color: deviceMetrics.baselineEstablished ? "#22c55e" : "#f59e0b" }}>
                        {deviceMetrics.baselineEstablished ? "已建立" : "待建立"}
                      </div>
                    </div>
                    <div className="desk-dm-metric">
                      <div className="desk-dm-metric-label">今日数据</div>
                      <div className="desk-dm-metric-value">{deviceMetrics.todayCount} 条</div>
                    </div>
                    <div className="desk-dm-metric">
                      <div className="desk-dm-metric-label">最后上报</div>
                      <div className="desk-dm-metric-value" style={{ fontSize: 12, fontWeight: 600 }}>
                        {new Date(selectedDevice.lastSeenAt).toLocaleString("zh-CN")}
                      </div>
                    </div>
                  </div>

                  <div className="desk-dm-bars">
                    <div className="desk-dm-bar">
                      <div className="desk-dm-bar-label">健康度</div>
                      <Progress percent={deviceMetrics.health} showInfo={false} strokeColor={progressColor(deviceMetrics.health)} />
                      <div className="desk-dm-bar-value">{deviceMetrics.health}%</div>
                    </div>
                    <div className="desk-dm-bar">
                      <div className="desk-dm-bar-label">电池电量</div>
                      <Progress percent={deviceMetrics.battery} showInfo={false} strokeColor={progressColor(deviceMetrics.battery)} />
                      <div className="desk-dm-bar-value">{deviceMetrics.battery}%</div>
                    </div>
                    <div className="desk-dm-bar">
                      <div className="desk-dm-bar-label">信号强度</div>
                      <Progress percent={deviceMetrics.signal} showInfo={false} strokeColor={progressColor(deviceMetrics.signal)} />
                      <div className="desk-dm-bar-value">{deviceMetrics.signal}%</div>
                    </div>
                  </div>

                  <div className="desk-dm-muted" style={{ marginTop: 8 }}>
                    站点风险: {selectedStation ? <Tag color={selectedStation.risk === "high" ? "red" : selectedStation.risk === "mid" ? "orange" : "green"}>{selectedStation.risk}</Tag> : "--"}
                  </div>
                </>
              ) : (
                <div className="desk-dm-empty">请选择设备</div>
              )}
            </BaseCard>

            <BaseCard title="快速操作" className="desk-dm-panel">
              <Space direction="vertical" style={{ width: "100%" }} size={10}>
                <Button
                  type="primary"
                  block
                  loading={loading}
                  onClick={() => {
                    void refresh();
                  }}
                >
                  刷新数据
                </Button>
                <Button
                  block
                  onClick={() => {
                    showDiagnostics();
                  }}
                >
                  设备诊断
                </Button>
                <Button
                  block
                  onClick={() => {
                    setDetailOpen(true);
                  }}
                >
                  详细信息
                </Button>
                <Button
                  block
                  onClick={() => {
                    void issueSelectedCommand("远程重启", "restart_device", { source: "desk-device-management" });
                  }}
                >
                  远程重启
                </Button>
                <Button
                  danger
                  block
                  onClick={() => {
                    void issueSelectedCommand("下线设备", "deactivate_device", { source: "desk-device-management" });
                  }}
                >
                  下线设备
                </Button>
                <div className="desk-dm-muted">提示：先做 UI/交互，后续切换到 HTTP 模式对接 v2 后端。</div>
              </Space>
            </BaseCard>
          </div>

          <div className="desk-dm-grid-bottom">
            <div className="desk-dm-stack">
              <div className="desk-dm-stack-item">
                <BaseCard title={`设备控制 - ${selectedDevice ? selectedDevice.id : "--"}`}>
                  <div className="desk-dm-ctrl">
                    <div className="desk-dm-ctrl-section">
                      <div className="desk-dm-ctrl-title">电机控制</div>
                      <div className="desk-dm-ctrl-row">
                        <Button
                          size="small"
                          type="primary"
                          disabled={!selectedDevice}
                          onClick={() => {
                            setMotorRunning(true);
                            void issueSelectedCommand("启动电机", "motor_start", { source: "desk-device-management" });
                          }}
                        >
                          启动
                        </Button>
                        <Button
                          size="small"
                          danger
                          disabled={!selectedDevice}
                          onClick={() => {
                            setMotorRunning(false);
                            void issueSelectedCommand("停止电机", "motor_stop", { source: "desk-device-management" });
                          }}
                        >
                          停止
                        </Button>
                        <Tag color={motorRunning ? "green" : "default"}>{motorRunning ? "运行中" : "已停止"}</Tag>
                      </div>
                    </div>

                    <div className="desk-dm-ctrl-section">
                      <div className="desk-dm-ctrl-title">蜂鸣器</div>
                      <div className="desk-dm-ctrl-row">
                        <Switch
                          checked={buzzerOn}
                          disabled={!selectedDevice}
                          onChange={(v) => {
                            setBuzzerOn(v);
                            void issueSelectedCommand(v ? "开启蜂鸣器" : "关闭蜂鸣器", v ? "buzzer_on" : "buzzer_off", {
                              source: "desk-device-management"
                            });
                          }}
                        />
                        <span className="desk-dm-muted">{buzzerOn ? "已开启" : "已关闭"}</span>
                      </div>
                    </div>

                    <div className="desk-dm-ctrl-section">
                      <div className="desk-dm-ctrl-title">采样间隔</div>
                      <div className="desk-dm-ctrl-row">
                        <Select
                          size="small"
                          value={samplingInterval}
                          style={{ width: 140 }}
                          disabled={!selectedDevice}
                          onChange={(v) => {
                            setSamplingInterval(v);
                            void issueSelectedCommand(`设置采样间隔 ${v}s`, "set_sampling_interval", {
                              source: "desk-device-management",
                              intervalSeconds: v
                            });
                          }}
                          options={[
                            { label: "1s", value: 1 },
                            { label: "5s", value: 5 },
                            { label: "10s", value: 10 },
                            { label: "30s", value: 30 },
                            { label: "60s", value: 60 }
                          ]}
                        />
                        <Button
                          size="small"
                          disabled={!selectedDevice}
                          onClick={() => {
                            void issueSelectedCommand("手动采集一次", "manual_collect", { source: "desk-device-management" });
                          }}
                        >
                          手动采集
                        </Button>
                      </div>
                    </div>

                    <div className="desk-dm-ctrl-section">
                      <div className="desk-dm-ctrl-title">成功回执通知</div>
                      <div className="desk-dm-ctrl-row">
                        <Select
                          size="small"
                          value={successNotificationPolicy}
                          style={{ width: 160 }}
                          onChange={(value) => setSuccessNotificationPolicy(value)}
                          options={[
                            { label: "继承默认", value: "inherit" },
                            { label: "静默", value: "silent" },
                            { label: "始终通知", value: "always_notify" }
                          ]}
                        />
                        <span className="desk-dm-muted">{successNotificationPolicyLabel(successNotificationPolicy)}</span>
                      </div>
                    </div>

                    <div className="desk-dm-ctrl-section" style={{ minHeight: 0 }}>
                      <div className="desk-dm-ctrl-title">控制历史</div>
                      <div className="desk-dark-table" style={{ maxHeight: 160, overflow: "auto" }}>
                        <table className="desk-table">
                          <thead>
                            <tr>
                              <th style={{ width: 92 }}>时间</th>
                              <th>动作</th>
                              <th style={{ width: 90 }}>结果</th>
                            </tr>
                          </thead>
                          <tbody>
                            {controlLogs.length ? (
                              controlLogs.map((row) => (
                                <tr key={row.id}>
                                  <td>{row.time}</td>
                                  <td>{row.action}</td>
                                  <td>
                                    <Tag
                                      color={row.result === "success" ? "green" : row.result === "pending" ? "gold" : "red"}
                                      style={{ marginInlineEnd: 0 }}
                                    >
                                      {row.result === "success" ? "成功" : row.result === "pending" ? "执行中" : "失败"}
                                    </Tag>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={3} style={{ color: "rgba(148,163,184,0.9)" }}>
                                  暂无控制记录
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </BaseCard>
              </div>

              <div className="desk-dm-stack-item">
                <BaseCard title="实时传感器数据">
                  <div className="desk-dark-table" style={{ height: "100%", overflow: "auto" }}>
                    <table className="desk-table">
                      <thead>
                        <tr>
                          <th>时间</th>
                          <th>温度（°C）</th>
                          <th>湿度（%）</th>
                          <th>位移（mm）</th>
                          <th>雨量（mm）</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sensorRows.map((r) => (
                          <tr key={r.id}>
                            <td>{r.time}</td>
                            <td>{r.temperature}</td>
                            <td>{r.humidity}</td>
                            <td>{r.dispMm}</td>
                            <td>{r.rainMm}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </BaseCard>
              </div>
            </div>

            <BaseCard title="设备位置地图">
              <div style={{ height: "100%" }}>
                <ReactECharts option={mapOption} style={{ height: "100%" }} />
              </div>
            </BaseCard>
          </div>
        </div>
      ) : null}

      {activeTab === "management" ? (
        <div className="desk-dm-content">
          <StationManagementPanel style={{ height: "calc(100vh - 216px)" }} initialStationId={queryStationId} />
        </div>
      ) : null}

      {activeTab === "baselines" ? (
        <div className="desk-dm-content">
          <BaselinesPanel style={{ height: "calc(100vh - 216px)" }} />
        </div>
      ) : null}

      {loading ? (
        <div className="desk-dm-loading">
          <Typography.Text type="secondary">加载中…</Typography.Text>
        </div>
      ) : null}

      <Modal
        title="设备详细信息"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={
          <Space>
            <Button
              onClick={() => {
                setDetailOpen(false);
              }}
            >
              关闭
            </Button>
            <Button
              type="primary"
              onClick={() => {
                if (!selectedDevice) return;
                void copyTextContent(
                  buildDeviceDetailText({
                    device: selectedDevice,
                    station: selectedStation,
                    metrics: deviceMetrics
                  })
                )
                  .then(() => {
                    message.success("已复制设备信息");
                  })
                  .catch((err: unknown) => {
                    message.error((err as Error).message);
                  });
              }}
            >
              复制信息
            </Button>
          </Space>
        }
        width={860}
      >
        {selectedDevice ? (
          <div className="desk-dm-detail">
            <div className="desk-dm-detail-grid">
              <div className="desk-dm-detail-card">
                <div className="desk-dm-detail-title">基本信息</div>
                <div className="desk-dm-detail-item">
                  <span className="desk-dm-detail-k">设备名称</span>
                  <span className="desk-dm-detail-v">{selectedDevice.name}</span>
                </div>
                <div className="desk-dm-detail-item">
                  <span className="desk-dm-detail-k">设备类型</span>
                  <span className="desk-dm-detail-v">{deviceTypeLabel(selectedDevice)}</span>
                </div>
                <div className="desk-dm-detail-item">
                  <span className="desk-dm-detail-k">所属站点</span>
                  <span className="desk-dm-detail-v">{selectedDevice.stationName}</span>
                </div>
                <div className="desk-dm-detail-item">
                  <span className="desk-dm-detail-k">最后上报</span>
                  <span className="desk-dm-detail-v">{new Date(selectedDevice.lastSeenAt).toLocaleString("zh-CN")}</span>
                </div>
              </div>

              <div className="desk-dm-detail-card">
                <div className="desk-dm-detail-title">运行指标</div>
                <div className="desk-dm-detail-item">
                  <span className="desk-dm-detail-k">健康度</span>
                  <span className="desk-dm-detail-v">{deviceMetrics.health}%</span>
                </div>
                <div className="desk-dm-detail-item">
                  <span className="desk-dm-detail-k">电池电量</span>
                  <span className="desk-dm-detail-v">{deviceMetrics.battery}%</span>
                </div>
                <div className="desk-dm-detail-item">
                  <span className="desk-dm-detail-k">信号强度</span>
                  <span className="desk-dm-detail-v">{deviceMetrics.signal}%</span>
                </div>
                <div className="desk-dm-detail-item">
                  <span className="desk-dm-detail-k">基线状态</span>
                  <span className="desk-dm-detail-v">{deviceMetrics.baselineEstablished ? "已建立" : "待建立"}</span>
                </div>
              </div>
            </div>

            <div className="desk-dm-detail-card" style={{ marginTop: 12 }}>
              <div className="desk-dm-detail-title">站点信息</div>
              <div className="desk-dm-detail-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <div className="desk-dm-detail-item">
                  <span className="desk-dm-detail-k">区域</span>
                  <span className="desk-dm-detail-v">{selectedStation?.area ?? "-"}</span>
                </div>
                <div className="desk-dm-detail-item">
                  <span className="desk-dm-detail-k">风险</span>
                  <span className="desk-dm-detail-v">{selectedStation ? <Tag color={selectedStation.risk === "high" ? "red" : selectedStation.risk === "mid" ? "orange" : "green"}>{selectedStation.risk}</Tag> : "-"}</span>
                </div>
                <div className="desk-dm-detail-item">
                  <span className="desk-dm-detail-k">坐标</span>
                  <span className="desk-dm-detail-v" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                    {selectedStation ? `${selectedStation.lat.toFixed(6)}, ${selectedStation.lng.toFixed(6)}` : "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="desk-dm-empty">请选择设备</div>
        )}
      </Modal>
    </div>
  );
}
