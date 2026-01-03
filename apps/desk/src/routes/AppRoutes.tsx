import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "../shell/AppShell";
import { AnalysisPage } from "../views/AnalysisPage";
import { BaselinesPage } from "../views/BaselinesPage";
import { DeviceManagementPage } from "../views/DeviceManagementPage";
import { DevicesPage } from "../views/DevicesPage";
import { GpsMonitoringPage } from "../views/GpsMonitoringPage";
import { GpsPage } from "../views/GpsPage";
import { HomePage } from "../views/HomePage";
import { LoginPage } from "../views/LoginPage";
import { SettingsPage } from "../views/SettingsPage";
import { StationsPage } from "../views/StationsPage";
import { SystemPage } from "../views/SystemPage";
import { HomeRedirect } from "./HomeRedirect";
import { RequireAuth } from "./RequireAuth";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="analysis" element={<AnalysisPage />} />
        <Route path="device-management" element={<DeviceManagementPage />} />
        <Route path="gps-monitoring" element={<GpsMonitoringPage />} />
        <Route path="settings" element={<SettingsPage />} />

        <Route path="dashboard" element={<Navigate to="/app/home" replace />} />
        <Route path="stations" element={<StationsPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="baselines" element={<BaselinesPage />} />
        <Route path="gps" element={<GpsPage />} />
        <Route path="system" element={<SystemPage />} />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
