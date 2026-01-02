import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const APP_NAME = "山体滑坡监测预警平台";

function titleFromPath(pathname: string) {
  if (pathname === "/login") return `登录 - ${APP_NAME}`;
  if (pathname.startsWith("/app/home")) return `首页 - ${APP_NAME}`;
  if (pathname.startsWith("/app/analysis")) return `数据分析 - ${APP_NAME}`;
  if (pathname.startsWith("/app/device-management")) return `设备管理 - ${APP_NAME}`;
  if (pathname.startsWith("/app/gps-monitoring")) return `地质形变监测 - ${APP_NAME}`;
  if (pathname.startsWith("/app/settings")) return `系统设置 - ${APP_NAME}`;
  return APP_NAME;
}

export function TitleSync() {
  const location = useLocation();

  useEffect(() => {
    document.title = titleFromPath(location.pathname);
  }, [location.pathname]);

  return null;
}

