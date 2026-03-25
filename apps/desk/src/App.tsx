import { App as AntApp, ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import "antd/dist/reset.css";
import { useEffect } from "react";
import { HashRouter } from "react-router-dom";

import { ApiProvider } from "./api/ApiProvider";
import { AppRoutes } from "./routes/AppRoutes";
import { TitleSync } from "./routes/TitleSync";
import { useAuthStore } from "./stores/authStore";
import { useSettingsStore } from "./stores/settingsStore";
import { isDeskHost, requestDeskToggleTray } from "./native/deskHost";

export function App() {
  const apiMode = useSettingsStore((s) => s.apiMode);
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const mockDelayMs = useSettingsStore((s) => s.mockDelayMs);
  const mockFailureRate = useSettingsStore((s) => s.mockFailureRate);
  const trayEnabled = useSettingsStore((s) => s.trayEnabled);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const token = useAuthStore((s) => s.token);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const setTokens = useAuthStore((s) => s.setTokens);
  const clearAuth = useAuthStore((s) => s.clear);

  useEffect(() => {
    if (!isDeskHost()) return;
    requestDeskToggleTray(trayEnabled);
  }, [trayEnabled]);

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
        <ApiProvider
          config={{
            mode: apiMode,
            baseUrl: apiBaseUrl,
            token,
            refreshToken,
            onAuthTokens: ({ token: nextToken, refreshToken: nextRefreshToken }) => {
              setTokens(nextRefreshToken === undefined ? { token: nextToken } : { token: nextToken, refreshToken: nextRefreshToken });
            },
            onAuthFailure: () => {
              clearAuth();
            },
            mockDelayMs,
            mockFailureRate
          }}
        >
          <HashRouter>
            <TitleSync />
            <AppRoutes />
          </HashRouter>
        </ApiProvider>
      </AntApp>
    </ConfigProvider>
  );
}
