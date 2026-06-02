import { Link, useParams } from "react-router-dom";
import { PageSection } from "../components/Page";
import { events } from "../data/mockData";
import { ArrowLeftIcon, ClockIcon, LayersIcon, ShieldIcon } from "../components/Icons";

function requireEvent(eventId: string | undefined) {
  const event = events.find((item) => item.id === eventId) ?? events[0];
  if (!event) {
    throw new Error("Expected at least one event in the prototype.");
  }
  return event;
}

export function EventDetailPage() {
  const params = useParams<{ eventId: string }>();
  const event = requireEvent(params.eventId);

  return (
    <div className="page">
      <Link className="back-link" to="/events">
        <ArrowLeftIcon className="icon" />
        返回事件流
      </Link>

      <section className={`hero-card hero-card--${event.level}`}>
        <div className="hero-card__eyebrow-row">
          <div className="hero-card__eyebrow">{event.station}</div>
          <span className={`state-pill state-pill--${event.level}`}>{levelLabel(event.level)}</span>
        </div>
        <h2>{event.title}</h2>
        <p>{event.summary}</p>
        <div className="hero-card__metrics">
          <div>
            <span>雨量</span>
            <strong>{event.rainfall}</strong>
          </div>
          <div>
            <span>位移</span>
            <strong>{event.displacement}</strong>
          </div>
          <div>
            <span>状态</span>
            <strong>{statusLabel(event.status)}</strong>
          </div>
          <div>
            <span>置信度</span>
            <strong>{event.confidence}</strong>
          </div>
        </div>
        <div className="hero-card__context">
          <span>
            <LayersIcon className="icon" />
            {event.zone}
          </span>
          <span>
            <ClockIcon className="icon" />
            {event.responseWindow}
          </span>
          <span>
            <ShieldIcon className="icon" />
            {event.credibility}
          </span>
        </div>
      </section>

      <PageSection title="空间证据面" subtitle="先判断证据链，再决定是否升级动作。">
        <div className="evidence-grid">
          {event.evidence.map((item) => (
            <article key={item.label} className="evidence-panel">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection title="事件回放" subtitle="给值守一个可复盘的时间切面，而不是只看当前颜色。">
        <div className="replay-track">
          {event.replay.map((step) => (
            <article key={`${step.time}-${step.label}`} className={`replay-step replay-step--${step.tone}`}>
              <span className="replay-step__time">{step.time}</span>
              <strong>{step.label}</strong>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection title="风险解释" subtitle="让颜色有因果，而不是只有颜色。">
        <div className="cause-list">
          {event.cause.map((item) => (
            <article key={item} className="cause-item">
              <span className="cause-item__dot" />
              <p>{item}</p>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection title="建议动作" subtitle="把判断和动作放在同一层，而不是切到别的模块再思考。">
        <article className="recommendation-panel">
          <strong>{event.recommendedAction}</strong>
          <p>当前详情页已经为 ACK、转派、设备快览和现场回传预留直接入口。</p>
        </article>
      </PageSection>

      <PageSection title="处置闭环" subtitle="从 ACK 到 RESOLVE 放进一条连续任务流。">
        <div className="closure-track">
          <div className="closure-step closure-step--done">
            <span>1</span>
            <div>
              <strong>系统识别</strong>
              <p>边缘链路与主站数据均可信</p>
            </div>
          </div>
          <div className="closure-step closure-step--active">
            <span>2</span>
            <div>
              <strong>等待 ACK / 转派</strong>
              <p>建议由现场值守与总控双人确认</p>
            </div>
          </div>
          <div className="closure-step">
            <span>3</span>
            <div>
              <strong>现场回传</strong>
              <p>到场后补充影像、人工判断和交通状态</p>
            </div>
          </div>
        </div>
        <Link className="inline-link" to="/assets">
          查看关联站点与设备
        </Link>
      </PageSection>

      <div className="action-bar">
        <button className="secondary-button" type="button">
          ACK 事件
        </button>
        <Link className="primary-button" to="/tasks/TSK-17">
          转入任务
        </Link>
      </div>
    </div>
  );
}

function levelLabel(level: (typeof events)[number]["level"]): string {
  switch (level) {
    case "critical":
      return "红色";
    case "warning":
      return "橙色";
    case "attention":
      return "黄色";
    default:
      return "正常";
  }
}

function statusLabel(status: (typeof events)[number]["status"]): string {
  switch (status) {
    case "new":
      return "待确认";
    case "acknowledged":
      return "已 ACK";
    case "in_progress":
      return "处理中";
    default:
      return "已闭环";
  }
}
