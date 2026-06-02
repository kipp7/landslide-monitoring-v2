import { useState } from "react";
import { Link } from "react-router-dom";
import { MobileSpaceScene } from "../components/MobileSpaceScene";
import { ChevronIcon, LayersIcon, ShieldIcon, TaskIcon } from "../components/Icons";
import { events, spaceHotspots, spatialSignals, summaryChips } from "../data/mockData";

const hotspotSceneData = spaceHotspots.map(({ id, level }) => ({ id, level }));

function requireFeaturedEvent() {
  const featuredEvent = events[0];
  if (!featuredEvent) {
    throw new Error("Expected at least one featured event for the space page.");
  }
  return featuredEvent;
}

export function SpacePage() {
  const defaultEvent = requireFeaturedEvent();
  const [focusHotspotId, setFocusHotspotId] = useState(spaceHotspots[0]?.id ?? "");
  const focusedHotspot = spaceHotspots.find((spot) => spot.id === focusHotspotId) ?? spaceHotspots[0];
  const featuredEvent = events.find((event) => event.id === focusedHotspot?.eventId) ?? defaultEvent;

  return (
    <div className="page page--space page--space-refined">
      <section className="space-hero">
        <div>
          <p className="eyebrow">Spatial Command Overview</p>
          <h2>把总览和模型舱拆开，首页只做判断与分流。</h2>
          <p>这里不再承载完整 3D 操作，而是负责快速锁定风险焦点、读事件、再跳进专注模型舱。</p>
        </div>
        <div className="space-hero__actions">
          <Link className="ghost-pill" to="/space/model">
            <LayersIcon className="icon" />
            打开 3D 模型舱
          </Link>
          <Link className="ghost-pill" to={`/events/${featuredEvent.id}`}>
            <TaskIcon className="icon" />
            查看红色事件
          </Link>
        </div>
      </section>

      <section className="summary-strip">
        {summaryChips.map((chip) => (
          <article key={chip.label} className={`summary-chip summary-chip--${chip.tone}`}>
            <span>{chip.label}</span>
            <strong>{chip.value}</strong>
          </article>
        ))}
      </section>

      <section className="scene-theater">
        <div className="scene-theater__topbar scene-theater__topbar--overview">
          <div>
            <p className="eyebrow">Spatial Preview</p>
            <h3>南麓一号坡体 / 只读空间总览</h3>
            <p className="scene-theater__summary">预览只负责告诉你哪里值得进入模型舱，不再重复模式切换和回放控制。</p>
          </div>
          <Link className="ghost-pill ghost-pill--wide" to="/space/model">
            <ShieldIcon className="icon" />
            进入沉浸模型页
          </Link>
        </div>

        <div className="scene-theater__viewport scene-theater__viewport--overview">
          <MobileSpaceScene
            className="scene-theater__canvas"
            hotspots={hotspotSceneData}
            mode="model"
            playback={82}
            focusHotspotId={focusHotspotId}
            interactive={false}
          />
          <div className="scene-theater__viewport-veil" />
          <div className="scene-theater__viewport-hud scene-theater__viewport-hud--overview">
            <div className="scene-bearing">
              <LayersIcon className="icon" />
              只读预览 / 当前焦点 {focusedHotspot?.label}
            </div>
            <div className="scene-legend">
              <span>
                <i className="legend-dot legend-dot--critical" />
                红区
              </span>
              <span>
                <i className="legend-dot legend-dot--warning" />
                橙区
              </span>
              <span>
                <i className="legend-dot legend-dot--attention" />
                黄区
              </span>
            </div>
          </div>
          <div className="scene-preview-callout">
            <span className="eyebrow">Escalation Gate</span>
            <strong>{featuredEvent.responseWindow}</strong>
            <p>{featuredEvent.recommendedAction}</p>
            <Link className="inline-link" to="/space/model">
              用 3D 模型继续判断
              <ChevronIcon className="icon" />
            </Link>
          </div>
        </div>

        <div className="space-scene-beacons space-scene-beacons--compact" aria-label="空间焦点">
          {spaceHotspots.map((spot) => (
            <button
              key={spot.id}
              type="button"
              className={`space-scene-beacon space-scene-beacon--${spot.level} ${
                focusHotspotId === spot.id ? "space-scene-beacon--active" : ""
              }`}
              onClick={() => {
                setFocusHotspotId(spot.id);
              }}
            >
              <span>{spot.label}</span>
              <strong>{spot.pulse}</strong>
            </button>
          ))}
        </div>

        <div className="scene-theater__console scene-theater__console--stacked">
          <article className="scene-focus-card">
            <p className="eyebrow">Selected Event</p>
            <h3>{featuredEvent.title}</h3>
            <p>{featuredEvent.summary}</p>
            <div className="floating-metrics">
              <span>{featuredEvent.rainfall}</span>
              <span>{featuredEvent.displacement}</span>
              <span>{featuredEvent.responseWindow}</span>
            </div>
            <Link className="inline-link" to={`/events/${featuredEvent.id}`}>
              查看事件详情
              <ChevronIcon className="icon" />
            </Link>
          </article>

          <div className="scene-console-grid scene-console-grid--overview">
            {spatialSignals.map((signal) => (
              <article key={signal.label} className={`space-signal space-signal--${signal.tone}`}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
                <small>{signal.note}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="space-action-grid">
        <Link className="mission-dock__item mission-dock__item--primary" to={`/events/${featuredEvent.id}`}>
          <span>立即处理</span>
          <strong>红色预警 1 条</strong>
          <small>{featuredEvent.recommendedAction}</small>
        </Link>
        <Link className="mission-dock__item" to="/space/model">
          <span>3D 模型舱</span>
          <strong>进入专注场景</strong>
          <small>拖拽旋转、点选热点、重新居中</small>
        </Link>
        <Link className="mission-dock__item" to="/tasks/TSK-17">
          <span>转入处置</span>
          <strong>现场双确认任务</strong>
          <small>按事件流继续闭环</small>
        </Link>
      </section>
    </div>
  );
}
