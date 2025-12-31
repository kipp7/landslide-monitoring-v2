import { App as AntApp, Button, Form, Input, InputNumber, Modal, Radio, Space, Switch, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useApi } from "../api/ApiProvider";
import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";
import { BaseCard } from "../components/BaseCard";
import {
  isDeskHost,
  requestDeskNotify,
  requestDeskOpenLogsDir,
  requestDeskQuit,
  requestDeskToggleTray
} from "../native/deskHost";

export function SettingsPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const apiMode = useSettingsStore((s) => s.apiMode);
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const mockDelayMs = useSettingsStore((s) => s.mockDelayMs);
  const terrainQuality = useSettingsStore((s) => s.terrainQuality);
  const trayEnabled = useSettingsStore((s) => s.trayEnabled);
  const setApiMode = useSettingsStore((s) => s.setApiMode);
  const setApiBaseUrl = useSettingsStore((s) => s.setApiBaseUrl);
  const setMockDelayMs = useSettingsStore((s) => s.setMockDelayMs);
  const setTerrainQuality = useSettingsStore((s) => s.setTerrainQuality);
  const setTrayEnabled = useSettingsStore((s) => s.setTrayEnabled);
  const reset = useSettingsStore((s) => s.reset);
  const clearAuth = useAuthStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);
  const runningInDeskHost = isDeskHost();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);

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
                </Space>
              ) : (
                <Typography.Text type="secondary">浏览器模式无法使用托盘/通知。</Typography.Text>
              )}
            </Space>
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
