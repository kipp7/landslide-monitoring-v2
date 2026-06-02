import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { MobileSpaceScene } from "../components/MobileSpaceScene";
import { ArrowLeftIcon, LayersIcon, ShieldIcon, TaskIcon } from "../components/Icons";
import { events, spaceHotspots, timelineMarks } from "../data/mockData";
import type { MobileSpaceSceneMode } from "../lib/createMobileSpaceScene";

gsap.registerPlugin(useGSAP);

const modelModes: { key: MobileSpaceSceneMode; label: string }[] = [
  { key: "model", label: "Terrain" },
  { key: "hydrology", label: "Hydrology" },
  { key: "evacuation", label: "Evacuation" }
];

const hotspotSceneData = spaceHotspots.map(({ id, level }) => ({ id, level }));

export function SpaceModelPage() {
  const shellRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<MobileSpaceSceneMode>("model");
  const [playback, setPlayback] = useState(82);
  const [focusHotspotId, setFocusHotspotId] = useState(spaceHotspots[0]?.id ?? "");
  const [resetSignal, setResetSignal] = useState(0);

  const focusedHotspot = spaceHotspots.find((spot) => spot.id === focusHotspotId) ?? spaceHotspots[0];
  const selectedEvent = events.find((event) => event.id === focusedHotspot?.eventId) ?? events[0];

  useGSAP(
    () => {
      const timeline = gsap.timeline({
        defaults: { ease: "expo.out" }
      });

      timeline
        .from(".js-model-shell", { autoAlpha: 0, y: 24, duration: 0.9 })
        .from(".js-model-overlay", { autoAlpha: 0, y: 18, stagger: 0.08, duration: 0.64 }, "-=0.48")
        .from(".js-model-strip > *", { autoAlpha: 0, y: 18, stagger: 0.06, duration: 0.5 }, "-=0.42");
    },
    { scope: shellRef }
  );

  useGSAP(
    () => {
      gsap.fromTo(
        ".js-focus-brief",
        { autoAlpha: 0.55, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.54, ease: "expo.out", clearProps: "transform" }
      );
    },
    {
      scope: shellRef,
      dependencies: [focusHotspotId, mode],
      revertOnUpdate: true
    }
  );

  if (!selectedEvent || !focusedHotspot) {
    throw new Error("Expected hotspot and event data for the model page.");
  }

  return (
    <div ref={shellRef} className="page page--space-model page--space-model-focus">
      <Link className="back-link back-link--scene js-model-overlay" to="/space">
        <ArrowLeftIcon className="icon" />
        返回空间总览
      </Link>

      <section className="model-hangar model-hangar--webgl model-hangar--focus">
        <div className="space-scene-shell space-scene-shell--model js-model-shell">
          <MobileSpaceScene
            className="space-scene-shell__canvas"
            hotspots={hotspotSceneData}
            mode={mode}
            playback={playback}
            focusHotspotId={focusHotspotId}
            interactive
            resetSignal={resetSignal}
            onFocusHotspotIdChange={setFocusHotspotId}
          />

          <div className="space-scene-shell__veil" />

          <div className="space-scene-overlay space-scene-overlay--focus">
            <div className="space-scene-topbar space-scene-topbar--focus js-model-overlay">
              <div className="space-scene-topbar__copy">
                <p className="eyebrow">Terrain Hangar</p>
                <h2>把视口还给 3D 模型。</h2>
                <p>拖拽旋转，点选热点锁定，HUD 只留边缘控制。</p>
              </div>

              <div className="space-scene-modebar" aria-label="模型模式">
                {modelModes.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`state-pill ${mode === entry.key ? "state-pill--attention" : "state-pill--ghost"}`}
                    onClick={() => {
                      setMode(entry.key);
                    }}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-scene-focus-pill js-model-overlay">
              <span className="eyebrow">Focused Beacon</span>
              <strong>{focusedHotspot.label}</strong>
              <small>{focusedHotspot.pulse}</small>
            </div>

            <div className="space-scene-gesture-tip js-model-overlay">
              <span>拖拽旋转</span>
              <span>点热点锁定</span>
              <button
                className="ghost-pill ghost-pill--compact"
                type="button"
                onClick={() => {
                  setResetSignal((value) => value + 1);
                }}
              >
                <ShieldIcon className="icon" />
                重置视角
              </button>
            </div>

            <div className="space-scene-scrubber space-scene-scrubber--floating js-model-overlay">
              <div className="space-scene-scrubber__head">
                <span>风险回放</span>
                <strong>{playback}%</strong>
              </div>

              <input
                aria-label="调整模型回放进度"
                type="range"
                min={0}
                max={100}
                value={playback}
                onChange={(event) => {
                  setPlayback(Number(event.target.value));
                }}
              />

              <div className="timeline-marks">
                {timelineMarks.map((mark) => (
                  <span key={mark}>{mark}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <article className="space-model-brief js-focus-brief">
          <div className="space-model-brief__copy">
            <p className="eyebrow">Focused Event</p>
            <h3>{selectedEvent.title}</h3>
            <p>{selectedEvent.summary}</p>
          </div>

          <div className="space-model-brief__metrics">
            <span>{selectedEvent.rainfall}</span>
            <span>{selectedEvent.displacement}</span>
            <span>{selectedEvent.responseWindow}</span>
          </div>

          <div className="space-model-brief__actions">
            <Link className="ghost-pill" to={`/events/${selectedEvent.id}`}>
              <LayersIcon className="icon" />
              进入事件
            </Link>
            <Link className="ghost-pill" to="/tasks/TSK-17">
              <TaskIcon className="icon" />
              转入处置
            </Link>
          </div>
        </article>

        <div className="space-scene-beacons space-scene-beacons--model js-model-strip" aria-label="热点焦点">
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

        <div className="space-action-grid space-action-grid--model js-model-strip">
          <Link className="mission-dock__item mission-dock__item--primary" to={`/events/${selectedEvent.id}`}>
            <span>立即进入</span>
            <strong>{selectedEvent.id}</strong>
            <small>{selectedEvent.responseWindow}</small>
          </Link>
          <Link className="mission-dock__item" to="/tasks/TSK-17">
            <span>启动处置</span>
            <strong>现场双确认任务</strong>
            <small>从模型页直接继续闭环</small>
          </Link>
          <Link className="mission-dock__item" to="/space">
            <span>回到总览</span>
            <strong>切回操作分流页</strong>
            <small>退出专注模式</small>
          </Link>
        </div>
      </section>
    </div>
  );
}
