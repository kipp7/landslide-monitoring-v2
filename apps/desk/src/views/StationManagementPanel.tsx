import {
  App as AntApp,
  Button,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography
} from "antd";
import {
  CaretDownOutlined,
  CaretRightOutlined,
  EditOutlined,
  EyeOutlined,
  RadarChartOutlined,
  ReloadOutlined,
  SettingOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";

import type { Device, DeviceType, OnlineStatus, RiskLevel, Station } from "../api/client";
import { useApi } from "../api/ApiProvider";
import { BaseCard } from "../components/BaseCard";
import { RiskTag } from "../components/RiskTag";
import { StatusTag } from "../components/StatusTag";
import "./stationManagement.css";

type ViewMode = "list" | "hierarchy";

type MonitoringStation = {
  stationId: string;
  stationName: string;
  locationName: string;
  description: string;
  chartLegendName: string;
  riskLevel: RiskLevel;
  status: OnlineStatus;
  lat: number;
  lng: number;
  deviceCount: number;
  sensorTypes: DeviceType[];
  lastDataTime: string;
};

type EditState =
  | { open: false }
  | { open: true; stationId: string };

type LegendState =
  | { open: false }
  | { open: true; draft: Record<string, string> };

const STORAGE_KEY = "desk.station-management.v1";

function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function saveStations(stations: MonitoringStation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, stations }));
}

function loadStations(): MonitoringStation[] | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = safeJsonParse<{ version: number; stations: MonitoringStation[] }>(raw);
  if (!parsed || parsed.version !== 1) return null;
  if (!Array.isArray(parsed.stations)) return null;
  return parsed.stations;
}

function deviceTypeLabel(type: DeviceType) {
  if (type === "gnss") return "GNSS";
  if (type === "rain") return "雨量";
  if (type === "tilt") return "倾角";
  if (type === "temp_hum") return "温湿度";
  return "摄像头";
}

function mergeFromApi(existing: MonitoringStation[], fromApi: Station[], devices: Device[]): MonitoringStation[] {
  const prevById = new Map(existing.map((s) => [s.stationId, s] as const));
  const devicesByStation = new Map<string, Device[]>();
  for (const d of devices) {
    const list = devicesByStation.get(d.stationId) ?? [];
    list.push(d);
    devicesByStation.set(d.stationId, list);
  }

  const next: MonitoringStation[] = [];
  for (const st of fromApi) {
    const prev = prevById.get(st.id);
    const ds = devicesByStation.get(st.id) ?? [];
    const sensorTypes = Array.from(new Set(ds.map((d) => d.type))).sort();
    const lastDataTime = ds.map((d) => d.lastSeenAt).sort().at(-1) ?? dayjs().subtract(10, "minute").toISOString();

    next.push({
      stationId: st.id,
      stationName: prev?.stationName ?? st.name,
      locationName: prev?.locationName ?? st.area,
      description: prev?.description ?? "用于统一管理监测站配置、图表图例和传感器设置（Mock）",
      chartLegendName: prev?.chartLegendName ?? st.name,
      riskLevel: prev?.riskLevel ?? st.risk,
      status: prev?.status ?? st.status,
      lat: st.lat,
      lng: st.lng,
      deviceCount: st.deviceCount,
      sensorTypes: prev?.sensorTypes?.length ? prev.sensorTypes : sensorTypes,
      lastDataTime: prev?.lastDataTime ?? lastDataTime
    });
  }

  const apiIds = new Set(fromApi.map((s) => s.id));
  const extras = existing.filter((s) => !apiIds.has(s.stationId));
  return [...extras, ...next];
}

function hierarchyData(stations: MonitoringStation[]) {
  const onlineCount = stations.filter((s) => s.status === "online").length;
  const mainRegion = {
    region_name: "挂傍山监测区域",
    region_code: "GBS",
    network_count: 1,
    station_count: stations.length,
    online_stations: onlineCount,
    region_coverage_area: 0.785
  };

  const mainNetwork = {
    network_name: "挂傍山立体监测网络",
    network_code: "GBS-N001",
    network_type: "立体监测网络",
    configured_station_count: 3,
    actual_station_count: stations.length,
    online_stations: onlineCount
  };

  const additionalRegions = [
    {
      region_name: "玉林师范学院东校区",
      region_code: "YLNU",
      network_count: 1,
      station_count: 2,
      online_stations: 1,
      region_coverage_area: 0.45
    },
    {
      region_name: "南流江流域监测区",
      region_code: "NLJ",
      network_count: 2,
      station_count: 6,
      online_stations: 5,
      region_coverage_area: 2.15
    }
  ];

  return { mainRegion, mainNetwork, additionalRegions, allRegions: [mainRegion, ...additionalRegions] };
}

export function StationManagementPanel(props: { className?: string; style?: React.CSSProperties }) {
  const api = useApi();
  const { message } = AntApp.useApp();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>("");
  const [stations, setStations] = useState<MonitoringStation[]>(() => loadStations() ?? []);

  const [edit, setEdit] = useState<EditState>({ open: false });
  const [legend, setLegend] = useState<LegendState>({ open: false });
  const [detailStationId, setDetailStationId] = useState<string | null>(null);

  const [form] = Form.useForm<{
    stationId: string;
    stationName: string;
    chartLegendName: string;
    locationName: string;
    description: string;
    riskLevel: RiskLevel;
    status: OnlineStatus;
    sensorTypes: DeviceType[];
  }>();

  const refresh = async (showToast = true) => {
    setLoading(true);
    setError(null);
    try {
      const [stationList, deviceList] = await Promise.all([api.stations.list(), api.devices.list()]);
      const next = mergeFromApi(stations, stationList, deviceList);
      setStations(next);
      saveStations(next);
      const t = new Date().toLocaleTimeString("zh-CN");
      setLastUpdateTime(t);
      if (showToast) message.success("已刷新（Mock）");
    } catch (err) {
      setError((err as Error).message);
      if (showToast) message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (stations.length) {
      setLoading(false);
      return;
    }
    void refresh(false);
  }, [api]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      void refresh(false);
    }, 30_000);
    return () => clearInterval(t);
  }, [autoRefresh, api, stations]);

  const counts = useMemo(() => {
    const total = stations.length;
    const online = stations.filter((s) => s.status === "online").length;
    const offline = stations.filter((s) => s.status === "offline").length;
    const highRisk = stations.filter((s) => s.riskLevel === "high").length;
    return { total, online, offline, highRisk };
  }, [stations]);

  const { allRegions, mainNetwork } = useMemo(() => hierarchyData(stations), [stations]);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set(["GBS"]));
  const [expandedNetworks, setExpandedNetworks] = useState<Set<string>>(new Set(["GBS-N001"]));

  const toggleRegionExpanded = (regionCode: string) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionCode)) next.delete(regionCode);
      else next.add(regionCode);
      return next;
    });
  };

  const toggleNetworkExpanded = (networkCode: string) => {
    setExpandedNetworks((prev) => {
      const next = new Set(prev);
      if (next.has(networkCode)) next.delete(networkCode);
      else next.add(networkCode);
      return next;
    });
  };

  const toggleAllExpanded = () => {
    const allRegionCodes = allRegions.map((r) => r.region_code);
    const isAllExpanded = allRegionCodes.every((c) => expandedRegions.has(c)) && expandedNetworks.has("GBS-N001");
    if (isAllExpanded) {
      setExpandedRegions(new Set());
      setExpandedNetworks(new Set());
      return;
    }
    setExpandedRegions(new Set(allRegionCodes));
    setExpandedNetworks(new Set(["GBS-N001"]));
  };

  const openEdit = (stationId: string) => {
    const st = stations.find((s) => s.stationId === stationId);
    if (!st) return;
    setEdit({ open: true, stationId });
    form.resetFields();
    form.setFieldsValue({
      stationId: st.stationId,
      stationName: st.stationName,
      chartLegendName: st.chartLegendName,
      locationName: st.locationName,
      description: st.description,
      riskLevel: st.riskLevel,
      status: st.status,
      sensorTypes: st.sensorTypes
    });
  };

  const saveEdit = async () => {
    const values = await form.validateFields();
    setStations((prev) => {
      const next = prev.map((s) => {
        if (s.stationId !== values.stationId) return s;
        return {
          ...s,
          stationName: values.stationName,
          chartLegendName: values.chartLegendName,
          locationName: values.locationName,
          description: values.description,
          riskLevel: values.riskLevel,
          status: values.status,
          sensorTypes: values.sensorTypes
        };
      });
      saveStations(next);
      return next;
    });
    message.success("已保存（本地 Mock）");
    setEdit({ open: false });
  };

  const openLegendConfig = () => {
    const draft: Record<string, string> = {};
    for (const st of stations) draft[st.stationId] = st.chartLegendName;
    setLegend({ open: true, draft });
  };

  const saveLegendConfig = () => {
    if (!legend.open) return;
    setStations((prev) => {
      const next = prev.map((s) => ({ ...s, chartLegendName: legend.draft[s.stationId] ?? s.chartLegendName }));
      saveStations(next);
      return next;
    });
    message.success("已更新图例名称（本地 Mock）");
    setLegend({ open: false });
  };

  const detailStation = useMemo(
    () => (detailStationId ? stations.find((s) => s.stationId === detailStationId) ?? null : null),
    [detailStationId, stations]
  );

  const columns: Parameters<typeof Table<MonitoringStation>>[0]["columns"] = [
    {
      title: "监测站",
      key: "station",
      render: (_: unknown, row) => (
        <div style={{ minWidth: 220 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontWeight: 900, color: "rgba(226,232,240,0.96)" }}>{row.stationName}</div>
            <StatusTag value={row.status} />
            <RiskTag value={row.riskLevel} />
          </div>
          <div style={{ fontSize: 12, color: "rgba(148,163,184,0.9)" }}>{row.stationId}</div>
        </div>
      )
    },
    { title: "位置", dataIndex: "locationName", key: "locationName", ellipsis: true },
    {
      title: "传感器",
      key: "sensors",
      render: (_: unknown, row) => (
        <Space size={6} wrap>
          {row.sensorTypes.length ? (
            row.sensorTypes.map((t) => (
              <Tag key={t} className="desk-pill-tag">
                {deviceTypeLabel(t)}
              </Tag>
            ))
          ) : (
            <span style={{ color: "rgba(148,163,184,0.9)" }}>-</span>
          )}
        </Space>
      )
    },
    { title: "设备数", dataIndex: "deviceCount", key: "deviceCount", width: 90 },
    {
      title: "坐标",
      key: "coord",
      width: 180,
      render: (_: unknown, row) => (
        <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
          {row.lat.toFixed(5)}, {row.lng.toFixed(5)}
        </span>
      )
    },
    { title: "最后数据", dataIndex: "lastDataTime", key: "lastDataTime", width: 170, render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm") },
    { title: "图例名称", dataIndex: "chartLegendName", key: "chartLegendName", ellipsis: true },
    {
      title: "操作",
      key: "actions",
      width: 120,
      render: (_: unknown, row) => (
        <Space>
          <Tooltip title="编辑监测站">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row.stationId)} />
          </Tooltip>
          <Tooltip title="查看详情">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setDetailStationId(row.stationId);
              }}
            />
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <BaseCard
      className={props.className}
      style={props.style}
      title={
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <RadarChartOutlined style={{ color: "rgba(34,211,238,0.95)" }} />
          <span>挂傍山监测站管理</span>
        </span>
      }
      extra={
        <Space size={8} wrap>
          <div className="desk-sm-toggle">
            <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>
              列表视图
            </button>
            <button type="button" className={viewMode === "hierarchy" ? "active" : ""} onClick={() => setViewMode("hierarchy")}>
              分层视图
            </button>
          </div>

          {viewMode === "hierarchy" ? (
            <Button size="small" onClick={toggleAllExpanded} icon={expandedRegions.size ? <CaretDownOutlined /> : <CaretRightOutlined />}>
              {expandedRegions.size ? "全部收缩" : "全部展开"}
            </Button>
          ) : null}

          <Button size="small" icon={<SettingOutlined />} onClick={openLegendConfig}>
            图例配置
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined spin={loading} />}
            loading={loading}
            onClick={() => {
              void refresh(true);
            }}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <div className="desk-sm-body">
        <div className="desk-sm-subtitle">统一管理监测站配置、图表图例和传感器设置（Mock）</div>

        <div className="desk-sm-stats">
          <div className="desk-sm-stat">
            <div className="desk-sm-dot blue" />
            <div>
              <div className="desk-sm-stat-label">总监测站</div>
              <div className="desk-sm-stat-value">{counts.total}</div>
            </div>
          </div>
          <div className="desk-sm-stat">
            <div className="desk-sm-dot green" />
            <div>
              <div className="desk-sm-stat-label">在线</div>
              <div className="desk-sm-stat-value" style={{ color: "#22c55e" }}>
                {counts.online}
              </div>
            </div>
          </div>
          <div className="desk-sm-stat">
            <div className="desk-sm-dot red" />
            <div>
              <div className="desk-sm-stat-label">离线</div>
              <div className="desk-sm-stat-value" style={{ color: "#ef4444" }}>
                {counts.offline}
              </div>
            </div>
          </div>
          <div className="desk-sm-stat">
            <div className="desk-sm-dot yellow" />
            <div>
              <div className="desk-sm-stat-label">高风险</div>
              <div className="desk-sm-stat-value" style={{ color: "#f59e0b" }}>
                {counts.highRisk}
              </div>
            </div>
          </div>
          <div className="desk-sm-stat-meta">
            <div className="desk-sm-meta-row">
              <span className="desk-sm-meta-k">自动刷新</span>
              <Button size="small" type={autoRefresh ? "primary" : "default"} onClick={() => setAutoRefresh((v) => !v)}>
                {autoRefresh ? "开启" : "关闭"}
              </Button>
            </div>
            <div className="desk-sm-meta-row">
              <span className="desk-sm-meta-k">更新时间</span>
              <span className="desk-sm-meta-v">{lastUpdateTime || "--"}</span>
            </div>
          </div>
        </div>

        {viewMode === "list" ? (
          <div className="desk-dark-table">
            <Table<MonitoringStation>
              rowKey="stationId"
              size="small"
              dataSource={stations}
              loading={loading}
              pagination={false}
              scroll={{ x: 1200, y: 420 }}
              columns={columns}
            />
          </div>
        ) : (
          <div className="desk-sm-hierarchy">
            {loading ? <div className="desk-sm-loading">加载分层数据…</div> : null}
            {allRegions.map((region, idx) => (
              <div key={region.region_code} className="desk-sm-region">
                <div className="desk-sm-region-head" onClick={() => toggleRegionExpanded(region.region_code)}>
                  <div className="desk-sm-region-left">
                    <span className="desk-sm-caret">{expandedRegions.has(region.region_code) ? <CaretDownOutlined /> : <CaretRightOutlined />}</span>
                    <div>
                      <div className="desk-sm-region-title">{region.region_name}</div>
                      <div className="desk-sm-region-sub">
                        {region.region_code} · 覆盖面积 {region.region_coverage_area} km²
                      </div>
                    </div>
                  </div>
                  <div className="desk-sm-region-metrics">
                    <div className="desk-sm-region-metric">
                      <div className="v">{region.network_count}</div>
                      <div className="k">网络</div>
                    </div>
                    <div className="desk-sm-region-metric">
                      <div className="v">{region.station_count}</div>
                      <div className="k">站点</div>
                    </div>
                    <div className="desk-sm-region-metric">
                      <div className="v" style={{ color: "#22c55e" }}>
                        {region.online_stations}
                      </div>
                      <div className="k">在线</div>
                    </div>
                  </div>
                </div>

                {expandedRegions.has(region.region_code) ? (
                  <div className="desk-sm-region-body">
                    {idx === 0 ? (
                      <div className="desk-sm-network">
                        <div className="desk-sm-network-head" onClick={() => toggleNetworkExpanded(mainNetwork.network_code)}>
                          <div className="desk-sm-region-left">
                            <span className="desk-sm-caret">
                              {expandedNetworks.has(mainNetwork.network_code) ? <CaretDownOutlined /> : <CaretRightOutlined />}
                            </span>
                            <div>
                              <div className="desk-sm-network-title">{mainNetwork.network_name}</div>
                              <div className="desk-sm-region-sub">
                                {mainNetwork.network_code} · {mainNetwork.network_type}
                              </div>
                            </div>
                          </div>
                          <div className="desk-sm-network-metrics">
                            <span>
                              配置 <span className="v blue">{mainNetwork.configured_station_count}</span>
                            </span>
                            <span>
                              实际 <span className="v green">{mainNetwork.actual_station_count}</span>
                            </span>
                            <span>
                              在线 <span className="v green">{mainNetwork.online_stations}</span>
                            </span>
                          </div>
                        </div>

                        {expandedNetworks.has(mainNetwork.network_code) ? (
                          <div className="desk-sm-station-grid">
                            {stations.map((st) => (
                              <div key={st.stationId} className="desk-sm-station-card">
                                <div className="desk-sm-station-top">
                                  <div className="desk-sm-station-name">{st.stationName}</div>
                                  <div className="desk-sm-station-tags">
                                    <StatusTag value={st.status} />
                                    <RiskTag value={st.riskLevel} />
                                  </div>
                                </div>
                                <div className="desk-sm-station-sub">{st.stationId}</div>
                                <div className="desk-sm-station-sub">{st.locationName}</div>
                                <div className="desk-sm-station-actions">
                                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(st.stationId)}>
                                    编辑
                                  </Button>
                                  <Button
                                    size="small"
                                    icon={<EyeOutlined />}
                                    onClick={() => {
                                      setDetailStationId(st.stationId);
                                    }}
                                  >
                                    详情
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="desk-sm-placeholder">
                        <Typography.Text type="secondary">{region.region_name} 详细数据开发中…</Typography.Text>
                        <div className="desk-sm-placeholder-sub">
                          此区域包含 {region.network_count} 个网络，{region.station_count} 个站点
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {error ? (
          <div className="desk-sm-error">
            <div style={{ color: "rgba(248,113,113,0.95)", fontWeight: 900 }}>加载失败</div>
            <div style={{ color: "rgba(226,232,240,0.9)", marginTop: 6 }}>{error}</div>
            <Button
              size="small"
              style={{ marginTop: 10 }}
              onClick={() => {
                void refresh(true);
              }}
            >
              重试
            </Button>
          </div>
        ) : null}
      </div>

      <Modal
        title={edit.open ? `编辑监测站 - ${stations.find((s) => s.stationId === edit.stationId)?.stationName ?? ""}` : "编辑监测站"}
        open={edit.open}
        onCancel={() => {
          setEdit({ open: false });
        }}
        onOk={() => {
          void saveEdit();
        }}
        okText="保存"
        cancelText="取消"
        width={640}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="stationId" label="站点 ID">
            <Input disabled />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="stationName" label="监测站名称" rules={[{ required: true }]}>
                <Input placeholder="例如：挂傍山中心监测站" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="chartLegendName" label="图例显示名称" rules={[{ required: true }]}>
                <Input placeholder="例如：中心监测站" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="locationName" label="位置描述" rules={[{ required: true }]}>
            <Input placeholder="例如：玉林师范学院东校区挂傍山中心点" />
          </Form.Item>
          <Form.Item name="description" label="详细描述">
            <Input.TextArea rows={3} placeholder="监测站的详细描述信息（Mock）" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="riskLevel" label="风险等级" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: "低风险", value: "low" },
                    { label: "中风险", value: "mid" },
                    { label: "高风险", value: "high" }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="设备状态" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: "在线", value: "online" },
                    { label: "预警", value: "warning" },
                    { label: "离线", value: "offline" }
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="sensorTypes" label="传感器类型" rules={[{ required: true, message: "请选择传感器类型" }]}>
            <Select
              mode="multiple"
              placeholder="选择传感器类型"
              options={[
                { label: "GNSS", value: "gnss" },
                { label: "雨量", value: "rain" },
                { label: "倾角", value: "tilt" },
                { label: "温湿度", value: "temp_hum" },
                { label: "摄像头", value: "camera" }
              ]}
            />
          </Form.Item>
          <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 12 }}>
            提示：该页面为 UI Mock，编辑结果保存在本地浏览器缓存，用于先把前端交互与样式对齐参考区。
          </div>
        </Form>
      </Modal>

      <Modal
        title="图例配置（Mock）"
        open={legend.open}
        onCancel={() => setLegend({ open: false })}
        onOk={saveLegendConfig}
        okText="保存"
        cancelText="取消"
        width={720}
      >
        {legend.open ? (
          <div className="desk-sm-legend-list">
            {stations.map((st) => (
              <div key={st.stationId} className="desk-sm-legend-row">
                <div className="desk-sm-legend-left">
                  <div className="desk-sm-legend-title">{st.stationName}</div>
                  <div className="desk-sm-legend-sub">{st.stationId}</div>
                </div>
                <Input
                  value={legend.draft[st.stationId] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLegend((prev) => {
                      if (!prev.open) return prev;
                      return { open: true, draft: { ...prev.draft, [st.stationId]: v } };
                    });
                  }}
                  placeholder="图例显示名称"
                />
              </div>
            ))}
            <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 12, marginTop: 10 }}>
              提示：图例名称用于 GPS/分析页曲线图的 legend 显示（后续可统一从后端配置中心下发）。
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title="监测站详情（Mock）"
        open={!!detailStationId}
        onCancel={() => setDetailStationId(null)}
        footer={
          <Button
            type="primary"
            onClick={() => {
              setDetailStationId(null);
            }}
          >
            关闭
          </Button>
        }
        width={760}
      >
        {detailStation ? (
          <div className="desk-sm-detail">
            <div className="desk-sm-detail-grid">
              <div className="desk-sm-detail-card">
                <div className="desk-sm-detail-title">基本信息</div>
                <div className="desk-sm-detail-item">
                  <span className="k">监测站名称</span>
                  <span className="v">{detailStation.stationName}</span>
                </div>
                <div className="desk-sm-detail-item">
                  <span className="k">站点 ID</span>
                  <span className="v">{detailStation.stationId}</span>
                </div>
                <div className="desk-sm-detail-item">
                  <span className="k">位置</span>
                  <span className="v">{detailStation.locationName}</span>
                </div>
              </div>

              <div className="desk-sm-detail-card">
                <div className="desk-sm-detail-title">状态与风险</div>
                <div className="desk-sm-detail-item">
                  <span className="k">状态</span>
                  <span className="v">
                    <StatusTag value={detailStation.status} />
                  </span>
                </div>
                <div className="desk-sm-detail-item">
                  <span className="k">风险</span>
                  <span className="v">
                    <RiskTag value={detailStation.riskLevel} />
                  </span>
                </div>
                <div className="desk-sm-detail-item">
                  <span className="k">设备数</span>
                  <span className="v">{detailStation.deviceCount}</span>
                </div>
                <div className="desk-sm-detail-item">
                  <span className="k">最后数据</span>
                  <span className="v">{dayjs(detailStation.lastDataTime).format("YYYY-MM-DD HH:mm:ss")}</span>
                </div>
              </div>
            </div>

            <div className="desk-sm-detail-card" style={{ marginTop: 12 }}>
              <div className="desk-sm-detail-title">传感器与图例</div>
              <div className="desk-sm-detail-item">
                <span className="k">传感器类型</span>
                <span className="v">
                  <Space size={6} wrap>
                    {detailStation.sensorTypes.map((t) => (
                      <Tag key={t} className="desk-pill-tag">
                        {deviceTypeLabel(t)}
                      </Tag>
                    ))}
                  </Space>
                </span>
              </div>
              <div className="desk-sm-detail-item">
                <span className="k">图例名称</span>
                <span className="v">{detailStation.chartLegendName}</span>
              </div>
              <div className="desk-sm-detail-item">
                <span className="k">描述</span>
                <span className="v">{detailStation.description}</span>
              </div>
              <div className="desk-sm-detail-item">
                <span className="k">坐标</span>
                <span className="v" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                  {detailStation.lat.toFixed(6)}, {detailStation.lng.toFixed(6)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: "rgba(148,163,184,0.9)" }}>-</div>
        )}
      </Modal>
    </BaseCard>
  );
}
