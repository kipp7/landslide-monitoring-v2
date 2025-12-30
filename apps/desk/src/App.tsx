import { App as AntApp, ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import "antd/dist/reset.css";
import { HashRouter } from "react-router-dom";

import { ApiProvider } from "./api/ApiProvider";
import { AppRoutes } from "./routes/AppRoutes";
import { useAuthStore } from "./stores/authStore";
import { useSettingsStore } from "./stores/settingsStore";

export function App() {
  const apiMode = useSettingsStore((s) => s.apiMode);
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const mockDelayMs = useSettingsStore((s) => s.mockDelayMs);
  const token = useAuthStore((s) => s.token);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: { borderRadius: 10, colorPrimary: "#06b6d4" }
      }}
    >
      <AntApp>
        <ApiProvider config={{ mode: apiMode, baseUrl: apiBaseUrl, token, mockDelayMs }}>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </ApiProvider>
      </AntApp>
    </ConfigProvider>
  );
}
