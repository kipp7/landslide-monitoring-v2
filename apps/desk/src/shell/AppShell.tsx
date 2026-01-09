import { App as AntApp, Button, Space, Tag, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useApi } from "../api/ApiProvider";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { HoverSidebar } from "../components/HoverSidebar";
import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";
import "./shell.css";

export function AppShell() {
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const { message, modal } = AntApp.useApp();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const isAnalysis = location.pathname.startsWith("/app/analysis");
  const showTopRight = !isAnalysis;

  const logout = async () => {
    modal.confirm({
      title: "确认退出登录",
      content: "退出后将回到登录页；登录状态会被清空。",
      okText: "退出",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.auth.logout();
        } catch (err) {
          message.error((err as Error).message);
        } finally {
          clearAuth();
          navigate("/login");
        }
      }
    });
  };

  return (
    <div className="desk-app">
      {isAnalysis ? null : <HoverSidebar />}
      {showTopRight ? (
        <div className="desk-topright">
          <Space size={8}>
            <Typography.Text type="secondary">{user?.name ?? "未登录"}</Typography.Text>
            <Button
              size="small"
              onClick={() => {
                void logout();
              }}
            >
              退出
            </Button>
          </Space>
        </div>
      ) : null}
      <ErrorBoundary key={location.pathname}>
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}
