import { Link } from "react-router-dom";
import { PageSection } from "../components/Page";
import { ArrowLeftIcon, ClockIcon, RadarIcon, ShieldIcon, SignalIcon } from "../components/Icons";

const stateCards = [
  {
    key: "loading",
    eyebrow: "LOADING",
    title: "空间回放准备中",
    subtitle: "拉取最近 30 分钟场景切片、热点和风险时间轨，保持用户知道系统正在做什么。",
    tone: "loading",
    meta: ["场景切片", "热点聚合", "回放轨"]
  },
  {
    key: "empty",
    eyebrow: "EMPTY",
    title: "当前时窗没有新增升级事件",
    subtitle: "不是空白页，而是明确告诉值守：此刻没有新增高风险升级，但空间页与历史回放仍然可用。",
    tone: "empty",
    meta: ["最近 30 分钟", "无升级", "可切时间窗"]
  },
  {
    key: "error",
    eyebrow: "ERROR",
    title: "中心聚合没有按预期返回",
    subtitle: "错误要给出来源、最近一次成功时间和下一步动作，而不是只丢一个红色提示。",
    tone: "error",
    meta: ["聚合接口", "19:36 最近成功", "可重试"]
  },
  {
    key: "offline",
    eyebrow: "OFFLINE",
    title: "已切到离线缓存模式",
    subtitle: "弱网或断网时继续保留事件、任务和最近回放的只读能力，并把同步边界讲清楚。",
    tone: "offline",
    meta: ["缓存 6 小时", "只读", "等待恢复"]
  }
] as const;

const usageRules = [
  {
    title: "Loading 必须解释正在等待什么",
    description: "不能只出现一个转圈，至少要告诉用户正在准备的是场景、事件还是任务数据。"
  },
  {
    title: "Empty 不是失败",
    description: "空状态应强调当前没有新增风险，同时保留切换时间窗、返回空间页或查看历史的动作。"
  },
  {
    title: "Error 必须有下一步",
    description: "错误状态至少提供重试、查看最近成功时间和回退到上一个可信结果三种信息中的两种。"
  },
  {
    title: "Offline 要明确只读边界",
    description: "离线状态必须说明哪些内容仍可看、哪些动作暂不可提交，以及最后一次同步时间。"
  }
] as const;

export function StateGalleryPage() {
  return (
    <div className="page">
      <Link className="back-link" to="/me">
        <ArrowLeftIcon className="icon" />
        返回我的
      </Link>

      <section className="state-atlas-hero">
        <div className="state-atlas-hero__copy">
          <p className="eyebrow">State Atlas</p>
          <h2>移动端状态基线</h2>
          <p>
            给 `loading / empty / error / offline` 一套统一的空间指挥语言，后续无论是 Web 原型还是 HarmonyOS 原生页，都按这里对齐。
          </p>
        </div>
        <div className="state-atlas-hero__chips">
          <span className="sync-pill sync-pill--live">
            <RadarIcon className="icon" />
            场景级状态
          </span>
          <span className="sync-pill">
            <ShieldIcon className="icon" />
            证据链可见
          </span>
          <span className="sync-pill">
            <ClockIcon className="icon" />
            离线边界明确
          </span>
        </div>
      </section>

      <section className="state-gallery">
        {stateCards.map((card) => (
          <article key={card.key} className={`state-card state-card--${card.tone}`}>
            <div className="state-card__header">
              <div>
                <p className="eyebrow">{card.eyebrow}</p>
                <h3>{card.title}</h3>
              </div>
              <span className={`state-pill state-pill--${resolveTone(card.tone)}`}>{card.eyebrow}</span>
            </div>
            <p>{card.subtitle}</p>
            <div className="state-card__meta">
              {card.meta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="state-card__body">{renderStateBody(card.key)}</div>
            <div className="state-card__actions">
              <button className="secondary-button" type="button">
                查看规则
              </button>
              <button className="primary-button" type="button">
                {resolveAction(card.key)}
              </button>
            </div>
          </article>
        ))}
      </section>

      <PageSection title="使用规则" subtitle="后续每个业务页都应从这四类状态里继承，而不是各写一套。">
        <div className="state-rules">
          {usageRules.map((rule) => (
            <article key={rule.title} className="state-rule">
              <strong>{rule.title}</strong>
              <p>{rule.description}</p>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection title="接入建议" subtitle="空间、事件、任务三条主线都应该明确落点。">
        <div className="state-mapping">
          <article className="state-mapping__item">
            <div className="state-mapping__icon">
              <RadarIcon className="icon" />
            </div>
            <div>
              <strong>空间页</strong>
              <p>优先接 `loading` 和 `offline`，因为空间回放和场景切片是最容易等待与降级的区域。</p>
            </div>
          </article>
          <article className="state-mapping__item">
            <div className="state-mapping__icon">
              <SignalIcon className="icon" />
            </div>
            <div>
              <strong>事件页</strong>
              <p>优先接 `empty` 和 `error`，因为事件流最需要明确“当前没有新增”和“聚合失败”的区别。</p>
            </div>
          </article>
          <article className="state-mapping__item">
            <div className="state-mapping__icon">
              <ShieldIcon className="icon" />
            </div>
            <div>
              <strong>任务页</strong>
              <p>优先接 `offline`，因为任务回传在弱网下最容易进入只读缓存或排队提交状态。</p>
            </div>
          </article>
        </div>
      </PageSection>
    </div>
  );
}

function resolveTone(key: (typeof stateCards)[number]["tone"]) {
  switch (key) {
    case "error":
      return "critical";
    case "offline":
      return "warning";
    default:
      return "attention";
  }
}

function resolveAction(key: (typeof stateCards)[number]["key"]) {
  switch (key) {
    case "loading":
      return "保持等待";
    case "empty":
      return "切换时间窗";
    case "error":
      return "重试同步";
    default:
      return "查看缓存";
  }
}

function renderStateBody(key: (typeof stateCards)[number]["key"]) {
  switch (key) {
    case "loading":
      return (
        <div className="state-loading">
          <div className="state-loading__pulse" />
          <div className="state-skeleton">
            <span />
            <span />
            <span />
          </div>
        </div>
      );
    case "empty":
      return (
        <div className="state-empty">
          <div className="state-empty__ring" />
          <div>
            <strong>无新增升级</strong>
            <p>最近 30 分钟事件等级没有继续抬升，可回到空间页查看整体趋势。</p>
          </div>
        </div>
      );
    case "error":
      return (
        <div className="state-error">
          <article>
            <span>错误来源</span>
            <strong>事件聚合服务</strong>
          </article>
          <article>
            <span>最近成功</span>
            <strong>19:36</strong>
          </article>
          <article>
            <span>建议动作</span>
            <strong>使用上一次可信结果并重试</strong>
          </article>
        </div>
      );
    default:
      return (
        <div className="state-offline">
          <article>
            <span>可读内容</span>
            <strong>最近 6 小时事件 / 任务 / 空间回放快照</strong>
          </article>
          <article>
            <span>暂缓动作</span>
            <strong>ACK、回传、同步提交排队中</strong>
          </article>
        </div>
      );
  }
}
