import { Link } from "react-router-dom";
import { PageSection } from "../components/Page";
import { eventOverview, events } from "../data/mockData";
import { ClockIcon, ShieldIcon } from "../components/Icons";

export function EventsPage() {
  return (
    <div className="page">
      <section className="event-command-band">
        {eventOverview.map((item) => (
          <article key={item.label} className={`event-overview event-overview--${item.tone}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </section>

      <PageSection
        title="事件流"
        subtitle="事件优先，而不是设备表优先。"
        aside={<span className="sync-pill sync-pill--live">回放已同步</span>}
      >
        <div className="filter-row">
          <button className="filter-chip filter-chip--active" type="button">
            全部
          </button>
          <button className="filter-chip" type="button">
            红色预警
          </button>
          <button className="filter-chip" type="button">
            已 ACK
          </button>
          <button className="filter-chip" type="button">
            巡检中
          </button>
        </div>
        <div className="event-feed">
          {events.map((event) => (
            <Link key={event.id} to={`/events/${event.id}`} className={`event-card event-card--${event.level}`}>
              <span className={`event-card__accent event-card__accent--${event.level}`} />
              <div className="event-card__head">
                <div>
                  <span className="eyebrow">{event.zone}</span>
                  <h3>{event.title}</h3>
                </div>
                <div className="event-card__corner">
                  <div className="event-card__time">{event.occurredAt}</div>
                  <div className="event-card__confidence">{event.confidence}</div>
                </div>
              </div>
              <p>{event.summary}</p>
              <div className="event-signal-grid">
                <article className="signal-panel">
                  <span>雨量</span>
                  <strong>{event.rainfall}</strong>
                </article>
                <article className="signal-panel">
                  <span>位移</span>
                  <strong>{event.displacement}</strong>
                </article>
              </div>
              <div className="event-meta">
                <span>{event.slope}</span>
                <span>{event.station}</span>
              </div>
              <div className="event-tags">
                <span className={`state-pill state-pill--${event.level}`}>{levelLabel(event.level)}</span>
                <span className="state-pill state-pill--ghost">{statusLabel(event.status)}</span>
              </div>
              <div className="event-footer">
                <span>
                  <ShieldIcon className="icon" />
                  {event.credibility}
                </span>
                <span>
                  <ClockIcon className="icon" />
                  {event.responseWindow}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </PageSection>
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
