import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MountainIcon, PulseIcon, SignalIcon } from "../components/Icons";

const previewRoutes: Record<string, string> = {
  space: "/space",
  model: "/space/model",
  events: "/events",
  "event-detail": "/events/EVT-2401",
  tasks: "/tasks",
  states: "/me/states"
};

export function LoginPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const previewTarget = new URLSearchParams(window.location.search).get("preview");
    if (!previewTarget) {
      return;
    }

    const nextPath = previewRoutes[previewTarget];
    if (!nextPath) {
      return;
    }

    navigate(nextPath, { replace: true });
  }, [navigate]);

  return (
    <div className="login-page">
      <div className="login-ambient login-ambient--one" />
      <div className="login-ambient login-ambient--two" />
      <div className="login-page__panel">
        <div className="brand-lockup">
          <div className="brand-lockup__badge">
            <MountainIcon className="icon" />
          </div>
          <div>
            <p className="eyebrow">HarmonyOS Spatial Mission</p>
            <h1>Slope Atlas</h1>
          </div>
        </div>

        <div className="login-hero-copy">
          <h2>把山体风险，变成一眼可判断的空间事件。</h2>
          <p>
            进入空间总览、事件中心与巡检任务流。第一版原型以应急指挥与现场闭环为中心，不做普通后台表单。
          </p>
        </div>

        <div className="signal-strip">
          <div className="signal-pill">
            <PulseIcon className="icon" />
            <span>位移脉冲</span>
          </div>
          <div className="signal-pill">
            <SignalIcon className="icon" />
            <span>链路可信</span>
          </div>
          <div className="signal-pill">
            <MountainIcon className="icon" />
            <span>空间回放</span>
          </div>
        </div>

        <form className="login-form">
          <label className="field">
            <span>账号</span>
            <input defaultValue="ops.commander" placeholder="输入账号" />
          </label>
          <label className="field">
            <span>口令</span>
            <input defaultValue="••••••••" type="password" placeholder="输入口令" />
          </label>
          <label className="field">
            <span>场景环境</span>
            <select defaultValue="field">
              <option value="field">现场联动环境</option>
              <option value="replay">回放演练环境</option>
              <option value="demo">路演演示环境</option>
            </select>
          </label>
          <button
            className="primary-button primary-button--wide"
            type="button"
            onClick={() => {
              navigate("/space");
            }}
          >
            进入空间总览
          </button>
        </form>

        <div className="login-footer-copy">
          <span>今日关键区域 2 处</span>
          <span>待处理事件 6 条</span>
          <Link to="/space">跳过登录查看原型</Link>
        </div>
      </div>
    </div>
  );
}
