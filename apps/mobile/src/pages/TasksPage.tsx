import { Link } from "react-router-dom";
import { PageSection } from "../components/Page";
import { taskOverview, tasks } from "../data/mockData";

export function TasksPage() {
  return (
    <div className="page">
      <section className="task-command-band">
        {taskOverview.map((item) => (
          <article key={item.label} className="task-overview">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </section>

      <PageSection
        title="任务中心"
        subtitle="巡检、复核、响应，不再散落在多个子页。"
        aside={<span className="sync-pill">现场联动</span>}
      >
        <div className="tasks-kpi-row">
          <article className="mini-panel">
            <span>待出发</span>
            <strong>2</strong>
          </article>
          <article className="mini-panel">
            <span>执行中</span>
            <strong>1</strong>
          </article>
          <article className="mini-panel">
            <span>超时风险</span>
            <strong>1</strong>
          </article>
        </div>
        <div className="task-list">
          {tasks.map((task) => (
            <Link key={task.id} to={`/tasks/${task.id}`} className={`task-card task-card--${task.priority}`}>
              <div className="task-card__head">
                <div>
                  <span className="eyebrow">{task.site}</span>
                  <h3>{task.title}</h3>
                </div>
                <span className={`task-badge task-badge--${task.priority}`}>{typeLabel(task.type)}</span>
              </div>
              <p>{task.nextAction}</p>
              <div className="task-route">
                <span>{task.modeLabel}</span>
                <span>{task.arrivalLabel}</span>
              </div>
              <div className="task-meta">
                <span>{task.assignee}</span>
                <span>{task.dueLabel}</span>
                <span>{task.progressLabel}</span>
              </div>
            </Link>
          ))}
        </div>
      </PageSection>
    </div>
  );
}

function typeLabel(type: (typeof tasks)[number]["type"]): string {
  switch (type) {
    case "response":
      return "响应";
    case "verification":
      return "复核";
    default:
      return "巡检";
  }
}
