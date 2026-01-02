import {
  ArrowRightOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  PushpinFilled,
  PushpinOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import { App as AntApp, Button, Skeleton, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { DashboardSummary, Device, Station } from "../api/client";
import { useApi } from "../api/ApiProvider";
import { BaseCard } from "../components/BaseCard";
import { RiskTag } from "../components/RiskTag";
import { StatusTag } from "../components/StatusTag";
import "./home.css";

type HomeAnomaly = {
  id: string;
  deviceName: string;
  stationName: string;
  status: "online" | "warning" | "offline";
  time: string;
};

type HomeTodoPriority = "high" | "mid" | "low";

type HomeTodo = {
  id: string;
  title: string;
  desc: string;
  priority: HomeTodoPriority;
  due: string;
  done: boolean;
};

const PINNED_KEY = "desk.home.pinnedStations.v1";
const TODOS_KEY = "desk.home.todos.v1";

function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function loadPinnedStationIds(): string[] {
  const raw = localStorage.getItem(PINNED_KEY);
  if (!raw) return [];
  const parsed = safeJsonParse<{ version: number; stationIds: string[] }>(raw);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.stationIds)) return [];
  return parsed.stationIds.filter((x) => typeof x === "string");
}

function savePinnedStationIds(ids: string[]) {
  localStorage.setItem(PINNED_KEY, JSON.stringify({ version: 1, stationIds: ids }));
}

function defaultTodos(): HomeTodo[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const fmt = (d: number) => new Date(d).toLocaleString("zh-CN");
  return [
    {
      id: "todo-alerts",
      title: "复核今日告警",
      desc: "确认预警级别、影响范围与处置建议（Mock）。",
      priority: "high",
      due: fmt(now + 2 * 60 * 60 * 1000),
      done: false
    },
    {
      id: "todo-offline",
      title: "排查离线设备",
      desc: "查看最近上报时间与信号强度，记录处理结论（Mock）。",
      priority: "high",
      due: fmt(now + 4 * 60 * 60 * 1000),
      done: false
    },
    {
      id: "todo-baseline",
      title: "补齐 GNSS 基线",
      desc: "对未建立基线的站点完成基准点设置或自动建立（Mock）。",
      priority: "mid",
      due: fmt(now + day),
      done: false
    },
    {
      id: "todo-report",
      title: "导出周报与留存",
      desc: "导出本周形变趋势与异常摘要，归档到资料库（Mock）。",
      priority: "mid",
      due: fmt(now + 2 * day),
      done: false
    },
    {
      id: "todo-maint",
      title: "例行巡检与维护",
      desc: "检查电量、通信链路与采样间隔是否符合策略（Mock）。",
      priority: "low",
      due: fmt(now + 3 * day),
      done: false
    }
  ];
}

function loadTodos(): HomeTodo[] {
  const raw = localStorage.getItem(TODOS_KEY);
  if (!raw) return defaultTodos();
  const parsed = safeJsonParse<{ version: number; todos: HomeTodo[] }>(raw);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.todos)) return defaultTodos();
  return parsed.todos.filter((t) => t && typeof t.id === "string" && typeof t.title === "string") as HomeTodo[];
}

function saveTodos(todos: HomeTodo[]) {
  localStorage.setItem(TODOS_KEY, JSON.stringify({ version: 1, todos }));
}

function healthLabel(value: number) {
  if (value >= 90) return { text: "优秀", color: "#22c55e" };
  if (value >= 75) return { text: "良好", color: "#60a5fa" };
  if (value >= 60) return { text: "一般", color: "#f59e0b" };
  return { text: "需关注", color: "#ef4444" };
}

function stationScore(station: Station) {
  const risk = station.risk === "high" ? 30 : station.risk === "mid" ? 18 : 10;
  const status = station.status === "offline" ? 40 : station.status === "warning" ? 24 : 8;
  return risk + status + Math.min(20, Math.max(0, station.deviceCount ?? 0));
}

function priorityTag(priority: HomeTodoPriority) {
  if (priority === "high") return <Tag className="desk-home-tag desk-home-tag-danger">高优先级</Tag>;
  if (priority === "mid") return <Tag className="desk-home-tag desk-home-tag-warn">中优先级</Tag>;
  return <Tag className="desk-home-tag desk-home-tag-info">低优先级</Tag>;
}

export function HomePage() {
  const api = useApi();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [pinnedStationIds, setPinnedStationIds] = useState<string[]>(() => loadPinnedStationIds());
  const [todos, setTodos] = useState<HomeTodo[]>(() => loadTodos());

  const load = async (silent?: boolean) => {
    if (!silent) setLoading(true);
    try {
      const [s, d, st] = await Promise.all([api.dashboard.getSummary(), api.devices.list(), api.stations.list()]);
      setSummary(s);
      setDevices(d);
      setStations(st);
      setUpdatedAt(new Date().toLocaleString("zh-CN"));
      if (silent) message.success("已刷新");
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [api]);

  const anomalies = useMemo<HomeAnomaly[]>(() => {
    const list = devices
      .filter((d) => d.status !== "online")
      .map((d) => ({
        id: d.id,
        deviceName: d.name,
        stationName: d.stationName,
        status: d.status,
        time: new Date(d.lastSeenAt).toLocaleString("zh-CN")
      }))
      .sort((a, b) => b.time.localeCompare(a.time));
    return list.slice(0, 5);
  }, [devices]);

  const health = healthLabel(summary?.systemHealthPercent ?? 0);

  const pinnedSet = useMemo(() => new Set(pinnedStationIds), [pinnedStationIds]);

  const keyStations = useMemo(() => {
    const byId = new Map(stations.map((s) => [s.id, s] as const));
    const pinned = pinnedStationIds.map((id) => byId.get(id)).filter(Boolean) as Station[];
    if (pinned.length) return pinned;
    return stations.slice().sort((a, b) => stationScore(b) - stationScore(a)).slice(0, 6);
  }, [pinnedStationIds, stations]);

  const todoStats = useMemo(() => {
    const total = todos.length;
    const done = todos.filter((t) => t.done).length;
    return { total, done, pending: Math.max(0, total - done) };
  }, [todos]);

  const togglePin = (stationId: string) => {
    setPinnedStationIds((prev) => {
      const set = new Set(prev);
      if (set.has(stationId)) set.delete(stationId);
      else set.add(stationId);
      const next = Array.from(set);
      savePinnedStationIds(next);
      return next;
    });
  };

  const toggleTodo = (todoId: string) => {
    setTodos((prev) => {
      const next = prev.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t));
      saveTodos(next);
      return next;
    });
  };

  const resetTodos = () => {
    const next = defaultTodos();
    setTodos(next);
    saveTodos(next);
    message.success("已重置待办列表");
  };

  const openGpsForStation = (stationId: string) => {
    const gnss = devices.find((d) => d.stationId === stationId && d.type === "gnss");
    if (gnss) {
      navigate(`/app/gps-monitoring?deviceId=${encodeURIComponent(gnss.id)}&range=7d`);
      return;
    }
    navigate("/app/gps-monitoring");
  };

  return (
    <div className="desk-page">
      <div className="desk-page-head">
        <div>
          <Typography.Title level={3} style={{ margin: 0, color: "rgba(226,232,240,0.96)" }}>
            首页
          </Typography.Title>
          <Typography.Text type="secondary">系统概览与快捷入口（Mock 优先）</Typography.Text>
        </div>
        <Space size={8}>
          <Typography.Text type="secondary">{updatedAt ? `更新：${updatedAt}` : "加载中…"}</Typography.Text>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void load(true);
            }}
          >
            刷新
          </Button>
        </Space>
      </div>

      <div className="desk-home-grid">
        <div style={{ display: "grid", gridTemplateRows: "220px 1fr 280px", gap: 12, minHeight: 0 }}>
          <BaseCard title="关键指标" extra={summary ? <span style={{ color: health.color, fontWeight: 900 }}>健康：{health.text}</span> : null}>
            {loading ? (
              <div style={{ padding: 10 }}>
                <Skeleton active paragraph={{ rows: 3 }} />
              </div>
            ) : (
              <div className="desk-home-metrics">
                <div className="desk-home-metric">
                  <div className="desk-home-metric-label">监测点</div>
                  <div className="desk-home-metric-value">{String(summary?.stationCount ?? 0)}</div>
                  <div className="desk-home-metric-sub">覆盖区域：3（Mock）</div>
                </div>
                <div className="desk-home-metric">
                  <div className="desk-home-metric-label">在线设备</div>
                  <div className="desk-home-metric-value">{String(summary?.deviceOnlineCount ?? 0)}</div>
                  <div className="desk-home-metric-sub">采集链路：正常（Mock）</div>
                </div>
                <div className="desk-home-metric">
                  <div className="desk-home-metric-label">今日预警</div>
                  <div className="desk-home-metric-value">{String(summary?.alertCountToday ?? 0)}</div>
                  <div className="desk-home-metric-sub">规则：默认策略（Mock）</div>
                </div>
                <div className="desk-home-metric">
                  <div className="desk-home-metric-label">系统健康度</div>
                  <div className="desk-home-metric-value">{String(summary?.systemHealthPercent ?? 0)}%</div>
                  <div className="desk-home-metric-sub">状态：{health.text}</div>
                </div>
              </div>
            )}
          </BaseCard>

          <BaseCard title="快捷入口">
            <div className="desk-home-shortcuts">
              <div className="desk-home-shortcut">
                <div className="desk-home-shortcut-title">数据分析大屏</div>
                <div className="desk-home-shortcut-desc">总览、实时异常、趋势图与 AI 提示（Mock）。</div>
                <div style={{ marginTop: "auto" }}>
                  <Button
                    type="primary"
                    icon={<ArrowRightOutlined />}
                    onClick={() => {
                      navigate("/app/analysis");
                    }}
                  >
                    进入
                  </Button>
                </div>
              </div>

              <div className="desk-home-shortcut">
                <div className="desk-home-shortcut-title">设备管理中心</div>
                <div className="desk-home-shortcut-desc">设备状态监控、站点管理、基线管理与控制面板。</div>
                <div style={{ marginTop: "auto" }}>
                  <Button
                    type="primary"
                    icon={<ArrowRightOutlined />}
                    onClick={() => {
                      navigate("/app/device-management");
                    }}
                  >
                    进入
                  </Button>
                </div>
              </div>

              <div className="desk-home-shortcut">
                <div className="desk-home-shortcut-title">GPS 形变监测</div>
                <div className="desk-home-shortcut-desc">位移曲线、阈值配置、预测趋势与导出入口（Mock）。</div>
                <div style={{ marginTop: "auto" }}>
                  <Button
                    type="primary"
                    icon={<ArrowRightOutlined />}
                    onClick={() => {
                      navigate("/app/gps-monitoring");
                    }}
                  >
                    进入
                  </Button>
                </div>
              </div>

              <div className="desk-home-shortcut">
                <div className="desk-home-shortcut-title">系统设置</div>
                <div className="desk-home-shortcut-desc">Mock / HTTP 切换、调试参数与退出登录。</div>
                <div style={{ marginTop: "auto" }}>
                  <Button
                    type="primary"
                    icon={<ArrowRightOutlined />}
                    onClick={() => {
                      navigate("/app/settings");
                    }}
                  >
                    进入
                  </Button>
                </div>
              </div>
            </div>
          </BaseCard>

          <BaseCard
            title="重点站点（Mock）"
            extra={
              <Space size={8}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {pinnedStationIds.length ? `已固定 ${pinnedStationIds.length} 个` : "按风险与状态自动排序"}
                </Typography.Text>
                <Button
                  size="small"
                  onClick={() => {
                    navigate("/app/device-management?tab=management");
                  }}
                >
                  站点管理
                </Button>
              </Space>
            }
          >
            <div className="desk-home-list">
              {loading ? (
                <Skeleton active paragraph={{ rows: 5 }} />
              ) : keyStations.length ? (
                keyStations.map((s) => (
                  <div key={s.id} className="desk-home-station-row">
                    <div className="desk-home-station-left">
                      <div className="desk-home-station-name">{s.name}</div>
                      <div className="desk-home-station-meta">
                        {s.area} · 设备 {s.deviceCount} 台
                      </div>
                    </div>
                    <div className="desk-home-station-tags">
                      <RiskTag value={s.risk} />
                      <StatusTag value={s.status} />
                    </div>
                    <div className="desk-home-station-actions">
                      <Button
                        size="small"
                        onClick={() => {
                          togglePin(s.id);
                        }}
                        icon={pinnedSet.has(s.id) ? <PushpinFilled /> : <PushpinOutlined />}
                      >
                        {pinnedSet.has(s.id) ? "已固定" : "固定"}
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => {
                          openGpsForStation(s.id);
                        }}
                      >
                        查看
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <Typography.Text type="secondary">暂无站点数据</Typography.Text>
              )}
            </div>
          </BaseCard>
        </div>

        <div style={{ display: "grid", gridTemplateRows: "1fr 280px 220px", gap: 12, minHeight: 0 }}>
          <BaseCard
            title="最新异常设备（Mock）"
            extra={
              <Button
                size="small"
                onClick={() => {
                  navigate("/app/analysis");
                }}
              >
                查看更多
              </Button>
            }
          >
            <div className="desk-home-anomaly">
              {loading ? (
                <Skeleton active paragraph={{ rows: 6 }} />
              ) : anomalies.length ? (
                anomalies.map((r) => (
                  <div className="desk-home-anomaly-row" key={r.id}>
                    <div className="desk-home-anomaly-left">
                      <div className="desk-home-anomaly-name">{r.deviceName}</div>
                      <div className="desk-home-anomaly-meta">
                        {r.stationName} · {r.time}
                      </div>
                    </div>
                    <StatusTag value={r.status} />
                  </div>
                ))
              ) : (
                <Typography.Text type="secondary">当前无异常（Mock）</Typography.Text>
              )}
            </div>
          </BaseCard>

          <BaseCard
            title="待处理事项（Mock）"
            extra={
              <Space size={8}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {todoStats.pending} 待处理 / {todoStats.total} 总计
                </Typography.Text>
                <Button size="small" onClick={resetTodos}>
                  重置
                </Button>
              </Space>
            }
          >
            <div className="desk-home-list">
              {todos.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`desk-home-todo-row ${t.done ? "done" : ""}`}
                  onClick={() => toggleTodo(t.id)}
                >
                  <span className="desk-home-todo-ico" aria-hidden="true">
                    {t.done ? <CheckCircleFilled /> : <ClockCircleOutlined />}
                  </span>
                  <span className="desk-home-todo-main">
                    <span className="desk-home-todo-title">{t.title}</span>
                    <span className="desk-home-todo-desc">{t.desc}</span>
                    <span className="desk-home-todo-meta">截止：{t.due}</span>
                  </span>
                  <span className="desk-home-todo-tag">{priorityTag(t.priority)}</span>
                </button>
              ))}
            </div>
          </BaseCard>

          <BaseCard
            title="系统公告（Mock）"
            extra={
              <Button
                size="small"
                onClick={() => {
                  navigate("/app/settings");
                }}
              >
                查看设置
              </Button>
            }
          >
            <div className="desk-home-ann">
              <div className="desk-home-ann-item">
                <div className="t">桌面端体验优化</div>
                <div className="d">已支持托盘、真全屏、诊断导出与缓存清理；后续将补齐通知、自启与安装包。</div>
                <div className="m">更新：{new Date().toLocaleDateString("zh-CN")}</div>
              </div>
              <div className="desk-home-ann-item">
                <div className="t">Mock 优先联调策略</div>
                <div className="d">当前以 Mock 数据保障 UI 可用；后续逐步切换到 v2 后端并修复 API 缺口。</div>
                <div className="m">说明：可在系统设置中切换数据源</div>
              </div>
              <div className="desk-home-ann-item">
                <div className="t">快捷键提示</div>
                <div className="d">桌面端支持 F11 切换全屏，ESC 退出全屏；托盘菜单可快速打开设置与日志目录。</div>
                <div className="m">建议：低配置环境可开启低性能模式</div>
              </div>
            </div>
          </BaseCard>
        </div>
      </div>
    </div>
  );
}
