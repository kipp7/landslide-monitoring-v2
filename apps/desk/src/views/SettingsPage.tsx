import { App as AntApp, Button, Form, Input, InputNumber, Modal, Radio, Space, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useApi } from "../api/ApiProvider";
import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";
import { BaseCard } from "../components/BaseCard";

export function SettingsPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const apiMode = useSettingsStore((s) => s.apiMode);
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const mockDelayMs = useSettingsStore((s) => s.mockDelayMs);
  const setApiMode = useSettingsStore((s) => s.setApiMode);
  const setApiBaseUrl = useSettingsStore((s) => s.setApiBaseUrl);
  const setMockDelayMs = useSettingsStore((s) => s.setMockDelayMs);
  const reset = useSettingsStore((s) => s.reset);
  const clearAuth = useAuthStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);

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
    </div>
  );
}
