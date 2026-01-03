import { Layout, Menu } from "antd";
import {
  BarChartOutlined,
  DesktopOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  MenuUnfoldOutlined,
  SettingOutlined
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import "./hoverSidebar.css";

const { Sider } = Layout;

type MenuKey = "home" | "analysis" | "device-management" | "gps-monitoring" | "settings";

function keyFromPath(pathname: string): MenuKey {
  if (pathname.startsWith("/app/home")) return "home";
  if (pathname.startsWith("/app/analysis")) return "analysis";
  if (pathname.startsWith("/app/device-management")) return "device-management";
  if (pathname.startsWith("/app/gps-monitoring")) return "gps-monitoring";
  if (pathname.startsWith("/app/settings")) return "settings";
  return "home";
}

export function HoverSidebar() {
  const [hovering, setHovering] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = useMemo(() => keyFromPath(location.pathname), [location.pathname]);

  return (
    <div
      className="desk-hover-sidebar"
      onMouseEnter={() => {
        setHovering(true);
      }}
      onMouseLeave={() => {
        setHovering(false);
      }}
    >
      <Sider
        theme="dark"
        collapsible
        collapsed={!hovering}
        trigger={null}
        width={200}
        collapsedWidth={56}
        className="desk-hover-sider"
        style={{
          backgroundColor: "#001529",
          borderRight: "4px solid rgba(0, 255, 255, 0.10)"
        }}
      >
        <div
          className="desk-hover-sider-head"
          style={{
            borderBottom: "4px solid rgba(0, 255, 255, 0.10)"
          }}
        >
          {hovering ? "菜单导航" : <MenuUnfoldOutlined />}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => {
            if (key === "home") navigate("/app/home");
            if (key === "analysis") navigate("/app/analysis");
            if (key === "device-management") navigate("/app/device-management");
            if (key === "gps-monitoring") navigate("/app/gps-monitoring");
            if (key === "settings") navigate("/app/settings");
          }}
          items={[
            { key: "home", icon: <HomeOutlined />, label: "首页" },
            { key: "analysis", icon: <BarChartOutlined />, label: "数据分析" },
            { key: "device-management", icon: <DesktopOutlined />, label: "设备管理" },
            { key: "gps-monitoring", icon: <EnvironmentOutlined />, label: "地质形变监测" },
            { key: "settings", icon: <SettingOutlined />, label: "系统设置" }
          ]}
        />
      </Sider>
    </div>
  );
}
