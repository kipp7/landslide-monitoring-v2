import { NavLink, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import { BellIcon, MountainIcon, RadarIcon, TaskIcon, UserIcon } from "./Icons";

const tabs = [
  { to: "/space", label: "空间", icon: MountainIcon },
  { to: "/events", label: "事件", icon: RadarIcon },
  { to: "/tasks", label: "任务", icon: TaskIcon },
  { to: "/me", label: "我的", icon: UserIcon }
] as const;

function resolveSectionMeta(pathname: string) {
  if (pathname === "/space/model") {
    return {
      label: "模型舱",
      description: "拖拽旋转、点按热点、锁定空间焦点。",
      status: "SCENE LIVE"
    };
  }

  if (pathname.startsWith("/space")) {
    return {
      label: "空间",
      description: "地形、雨量、位移和告警被压进同一张操作面。",
      status: "LIVE 19:42"
    };
  }

  if (pathname.startsWith("/events")) {
    return {
      label: "事件",
      description: "按事件而不是设备表组织确认、解释与转派。",
      status: "6 ACTIVE"
    };
  }

  if (pathname.startsWith("/tasks")) {
    return {
      label: "任务",
      description: "把到场、扫描、回传和闭环收进一条现场任务流。",
      status: "3 OPEN"
    };
  }

  if (pathname.startsWith("/assets")) {
    return {
      label: "资产",
      description: "站点与节点只保留必要上下文，不抢主叙事。",
      status: "18 ONLINE"
    };
  }

  if (pathname.startsWith("/me")) {
    return {
      label: "我的",
      description: "通知、环境和可信状态从这里收束。",
      status: "OPS READY"
    };
  }

  return {
    label: "空间",
    description: "地形、雨量、位移和告警被压进同一张操作面。",
    status: "LIVE 19:42"
  };
}

export function AppShell() {
  const location = useLocation();
  const currentSection = resolveSectionMeta(location.pathname);
  const isSceneFocusMode = location.pathname === "/space/model";

  return (
    <div className={clsx("prototype-stage", isSceneFocusMode && "prototype-stage--focus")}>
      <div className="prototype-backdrop prototype-backdrop--left" />
      <div className="prototype-backdrop prototype-backdrop--right" />
      <div className={clsx("device-shell", isSceneFocusMode && "device-shell--focus")}>
        <div className="device-shell__hardware" />
        <header className={clsx("topbar", isSceneFocusMode && "topbar--focus")}>
          <div className="topbar__cluster">
            <p className="eyebrow">HarmonyOS Spatial Risk</p>
            <div className="topbar__headline">
              <h1>{currentSection.label}</h1>
              <span className="topbar__status">{currentSection.status}</span>
            </div>
            <p className="topbar__summary">{currentSection.description}</p>
          </div>
          <div className="topbar__actions">
            <span className="sync-pill sync-pill--live">边缘 18/21</span>
            <button className="ghost-icon-button" type="button" aria-label="通知">
              <BellIcon className="icon" />
            </button>
          </div>
        </header>
        <main className={clsx("viewport", isSceneFocusMode && "viewport--focus")}>
          <Outlet />
        </main>
        {!isSceneFocusMode ? (
          <nav className="bottom-nav" aria-label="主导航">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    clsx("bottom-nav__item", isActive && "bottom-nav__item--active")
                  }
                >
                  <Icon className="icon" />
                  <span>{tab.label}</span>
                </NavLink>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
