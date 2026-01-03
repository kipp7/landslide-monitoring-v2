import { App as AntApp, Button, Form, Input, InputNumber, Modal, Radio, Space, Switch, Typography } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useApi } from "../api/ApiProvider";
import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";
import { BaseCard } from "../components/BaseCard";
import {
  getDeskHostInfo,
  isDeskHost,
  requestDeskNotify,
  requestDeskOpenLogsDir,
  requestDeskQuit,
  requestDeskReload,
  requestDeskToggleFullscreen,
  requestDeskToggleTray
} from "../native/deskHost";

export function SettingsPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const apiMode = useSettingsStore((s) => s.apiMode);
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const mockDelayMs = useSettingsStore((s) => s.mockDelayMs);
  const mockFailureRate = useSettingsStore((s) => s.mockFailureRate);
  const terrainQuality = useSettingsStore((s) => s.terrainQuality);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const trayEnabled = useSettingsStore((s) => s.trayEnabled);
  const setApiMode = useSettingsStore((s) => s.setApiMode);
  const setApiBaseUrl = useSettingsStore((s) => s.setApiBaseUrl);
  const setMockDelayMs = useSettingsStore((s) => s.setMockDelayMs);
  const setMockFailureRate = useSettingsStore((s) => s.setMockFailureRate);
  const setTerrainQuality = useSettingsStore((s) => s.setTerrainQuality);
  const setReducedMotion = useSettingsStore((s) => s.setReducedMotion);
  const setTrayEnabled = useSettingsStore((s) => s.setTrayEnabled);
  const reset = useSettingsStore((s) => s.reset);
  const clearAuth = useAuthStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);
  const runningInDeskHost = isDeskHost();
  const hostInfo = getDeskHostInfo();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);

  const runtimeInfo = useMemo(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "-";
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 0;
    let webgl = "-";
    try {
      const canvas = document.createElement("canvas");
      const gl = (canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      if (gl) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info") as
          | { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number }
          | null;
        if (dbg) {
          const vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
          const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
          webgl = `${String(vendor)} / ${String(renderer)}`;
        } else {
          webgl = String(gl.getParameter(gl.RENDERER));
        }
      }
    } catch {
      webgl = "-";
    }

    return { ua, dpr, cores, webgl };
  }, []);

  const doLogout = async () => {
    setLogoutSubmitting(true);
    try {
      await api.auth.logout();
      message.success("已退出登录");
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      clearAuth();
      setLogoutSubmitting(false);
      setLogoutOpen(false);
      navigate("/login", { replace: true });
    }
  };

  const doQuitApp = () => {
    const ok = requestDeskQuit();
    if (!ok) {
      message.error("当前运行环境不支持退出软件");
    }
    setQuitOpen(false);
  };

  const applyTrayEnabled = (enabled: boolean) => {
    setTrayEnabled(enabled);
    const ok = requestDeskToggleTray(enabled);
    if (!ok) {
      message.error("当前运行环境不支持托盘设置");
    }
  };

  const sendTestNotification = () => {
    const ok = requestDeskNotify({
      title: "系统通知",
      message: `测试通知：${new Date().toLocaleString("zh-CN")}`,
      route: "/app/analysis",
      level: "info",
      timeoutMs: 2600
    });
    if (!ok) {
      message.error("当前运行环境不支持通知");
    }
  };

  const openLogsDir = () => {
    const ok = requestDeskOpenLogsDir();
    if (!ok) {
      message.error("当前运行环境不支持打开日志目录");
    }
  };

  const toggleFullscreen = () => {
    const ok = requestDeskToggleFullscreen();
    if (!ok) {
      message.error("当前运行环境不支持全屏切换");
    }
  };

  const reloadApp = () => {
    const ok = requestDeskReload();
    if (!ok) {
      message.error("当前运行环境不支持重载");
    }
  };

  return (
    <div className="desk-page">
      <div className="desk-page-head">
        <div>
          <Typography.Title level={3} style={{ margin: 0, color: "rgba(226,232,240,0.96)" }}>
            系统设置
          </Typography.Title>
          <Typography.Text type="secondary">桌面端 Mock / HTTP 切换（预留）</Typography.Text>
        </div>
        <Space>
          <Button
            onClick={() => {
              reset();
            }}
          >
            恢复默认
          </Button>
          <Button
            danger
            onClick={() => {
              setLogoutOpen(true);
            }}
          >
            退出登录
          </Button>
          {runningInDeskHost && (
            <Button
              type="primary"
              danger
              onClick={() => {
                setQuitOpen(true);
              }}
            >
              退出软件
            </Button>
          )}
        </Space>
      </div>

      <BaseCard title="数据源" style={{ maxWidth: 820 }}>
        <Form layout="vertical">
          <Form.Item label="API 模式">
            <Radio.Group
              value={apiMode}
              onChange={(e) => {
                const v: unknown = e.target.value;
                if (v === "mock" || v === "http") setApiMode(v);
              }}
              options={[
                { label: "Mock（推荐）", value: "mock" },
                { label: "HTTP（后续对接）", value: "http" }
              ]}
            />
          </Form.Item>
          <Form.Item label="HTTP Base URL（仅 HTTP 模式）">
            <Input
              value={apiBaseUrl}
              disabled={apiMode !== "http"}
              placeholder="http://127.0.0.1:3000"
              onChange={(e) => {
                setApiBaseUrl(e.target.value);
              }}
            />
          </Form.Item>
          <Form.Item label="Mock 延迟（ms）">
            <InputNumber
              min={0}
              max={5000}
              step={50}
              value={mockDelayMs}
              onChange={(v) => {
                setMockDelayMs(typeof v === "number" ? v : 0);
              }}
            />
          </Form.Item>
          <Form.Item label="Mock 故障注入（%）">
            <InputNumber
              min={0}
              max={100}
              step={5}
              value={Math.round(mockFailureRate * 100)}
              onChange={(v) => {
                const n = typeof v === "number" ? v : 0;
                setMockFailureRate(Math.max(0, Math.min(1, n / 100)));
              }}
            />
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8 }}>
              说明：用于演示“加载失败/重试”等交互；默认 0%，建议不要长期开启。
            </Typography.Paragraph>
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            说明：现在以 Mock 完成 UI；后续再逐步把 HTTP 对接到 v2 后端（当前不阻塞 UI）。
          </Typography.Paragraph>
        </Form>
      </BaseCard>

      <BaseCard title="界面与性能" style={{ maxWidth: 820, marginTop: 14 }}>
        <Form layout="vertical">
          <Form.Item label="登录页 3D 地形质量">
            <Radio.Group
              value={terrainQuality}
              onChange={(e) => {
                const v: unknown = e.target.value;
                if (v === "auto" || v === "high" || v === "medium" || v === "low") {
                  setTerrainQuality(v);
                }
              }}
              options={[
                { label: "自动（推荐）", value: "auto" },
                { label: "高（更精细）", value: "high" },
                { label: "中", value: "medium" },
                { label: "低（更流畅）", value: "low" }
              ]}
            />
          </Form.Item>

          <Form.Item label="低性能模式（减少动效）">
            <Space wrap>
              <Switch
                checked={reducedMotion}
                checkedChildren="已启用"
                unCheckedChildren="已禁用"
                onChange={(checked) => {
                  setReducedMotion(checked);
                }}
              />
              <Typography.Text type="secondary">开启后会减少动效与过渡，提升流畅度。</Typography.Text>
            </Space>
          </Form.Item>

          <Form.Item label="运行环境（诊断）">
            <div style={{ lineHeight: 1.6 }}>
              <Typography.Text type="secondary">
                DPR：{String(runtimeInfo.dpr)}；核心：{String(runtimeInfo.cores)}；WebGL：{runtimeInfo.webgl}
              </Typography.Text>
              <div style={{ marginTop: 6 }}>
                <Typography.Text type="secondary">UA：{runtimeInfo.ua}</Typography.Text>
              </div>
            </div>
          </Form.Item>

          <Form.Item label="系统托盘（仅桌面端）">
            <Space wrap>
              <Switch
                checked={trayEnabled}
                disabled={!runningInDeskHost}
                checkedChildren="已启用"
                unCheckedChildren="已禁用"
                onChange={(checked) => {
                  applyTrayEnabled(checked);
                }}
              />
              {runningInDeskHost ? (
                <Space size={8} wrap>
                  <Button
                    onClick={() => {
                      openLogsDir();
                    }}
                  >
                    打开日志目录
                  </Button>
                  <Button
                    onClick={() => {
                      sendTestNotification();
                    }}
                  >
                    发送测试通知
                  </Button>
                  <Button
                    onClick={() => {
                      toggleFullscreen();
                    }}
                  >
                    切换全屏
                  </Button>
                  <Button
                    onClick={() => {
                      reloadApp();
                    }}
                  >
                    重载页面
                  </Button>
                </Space>
              ) : (
                <Typography.Text type="secondary">浏览器模式无法使用托盘/通知。</Typography.Text>
              )}
            </Space>
            {runningInDeskHost ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                桌面端壳版本：{hostInfo?.app?.version ?? "-"}；WebView2：{hostInfo?.webview2?.browserVersion ?? "-"}
              </Typography.Paragraph>
            ) : null}
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8 }}>
              说明：启用托盘时，最小化/关闭窗口默认进入托盘；禁用托盘时，关闭窗口将直接退出软件。
            </Typography.Paragraph>
          </Form.Item>
        </Form>
      </BaseCard>

      <Modal
        title="确认退出登录"
        open={logoutOpen}
        confirmLoading={logoutSubmitting}
        okButtonProps={{ danger: true }}
        okText="退出"
        cancelText="取消"
        onOk={() => {
          void doLogout();
        }}
        onCancel={() => {
          if (!logoutSubmitting) setLogoutOpen(false);
        }}
      >
        <Typography.Paragraph style={{ marginBottom: 8, color: "rgba(226,232,240,0.9)" }}>
          当前账号：{user?.name ?? "未知用户"}
        </Typography.Paragraph>
        <Typography.Text type="secondary">退出后将回到登录页；登录状态会被清空。</Typography.Text>
      </Modal>

      <Modal
        title="确认退出软件"
        open={quitOpen}
        okButtonProps={{ danger: true }}
        okText="退出"
        cancelText="取消"
        onOk={() => {
          doQuitApp();
        }}
        onCancel={() => {
          setQuitOpen(false);
        }}
      >
        <Typography.Paragraph style={{ marginBottom: 8, color: "rgba(226,232,240,0.9)" }}>
          当前账号：{user?.name ?? "未知用户"}
        </Typography.Paragraph>
        <Typography.Text type="secondary">确认退出桌面端软件？</Typography.Text>
      </Modal>
    </div>
  );
}
