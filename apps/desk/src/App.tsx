import { App as AntApp, ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import "antd/dist/reset.css";
import { useEffect } from "react";
import { HashRouter } from "react-router-dom";

import { ApiProvider } from "./api/ApiProvider";
import { AppRoutes } from "./routes/AppRoutes";
import { useAuthStore } from "./stores/authStore";
import { useSettingsStore } from "./stores/settingsStore";
import { isDeskHost, requestDeskSetTrayBehavior, requestDeskToggleTray } from "./native/deskHost";

export function App() {
  const apiMode = useSettingsStore((s) => s.apiMode);
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const mockDelayMs = useSettingsStore((s) => s.mockDelayMs);
  const mockFailureRate = useSettingsStore((s) => s.mockFailureRate);
  const trayEnabled = useSettingsStore((s) => s.trayEnabled);
  const minimizeToTray = useSettingsStore((s) => s.minimizeToTray);
  const closeToTray = useSettingsStore((s) => s.closeToTray);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!isDeskHost()) return;
    requestDeskToggleTray(trayEnabled);
  }, [trayEnabled]);

  useEffect(() => {
    if (!isDeskHost()) return;
    requestDeskSetTrayBehavior({ minimizeToTray, closeToTray });
  }, [minimizeToTray, closeToTray]);

  useEffect(() => {
    document.documentElement.classList.toggle("desk-reduced-motion", reducedMotion);
  }, [reducedMotion]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: { borderRadius: 10, colorPrimary: "#06b6d4" }
      }}
    >
      <AntApp>
        <ApiProvider config={{ mode: apiMode, baseUrl: apiBaseUrl, token, mockDelayMs, mockFailureRate }}>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </ApiProvider>
      </AntApp>
    </ConfigProvider>
  );
}
