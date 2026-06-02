import { Link, useParams } from "react-router-dom";
import { PageSection } from "../components/Page";
import { tasks } from "../data/mockData";
import { ArrowLeftIcon, ScanIcon } from "../components/Icons";

function requireTask(taskId: string | undefined) {
  const task = tasks.find((item) => item.id === taskId) ?? tasks[0];
  if (!task) {
    throw new Error("Expected at least one task in the prototype.");
  }
  return task;
}

export function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const task = requireTask(params.taskId);

  return (
    <div className="page">
      <Link className="back-link" to="/tasks">
        <ArrowLeftIcon className="icon" />
        返回任务中心
      </Link>

      <section className="hero-card hero-card--task">
        <div className="hero-card__eyebrow">{task.site}</div>
        <h2>{task.title}</h2>
        <p>{task.nextAction}</p>
        <div className="hero-card__metrics">
          <div>
            <span>责任人</span>
            <strong>{task.assignee}</strong>
          </div>
          <div>
            <span>时限</span>
            <strong>{task.dueLabel}</strong>
          </div>
          <div>
            <span>当前状态</span>
            <strong>{task.progressLabel}</strong>
          </div>
          <div>
            <span>到场预估</span>
            <strong>{task.arrivalLabel}</strong>
          </div>
        </div>
      </section>

      <PageSection title="到场上下文" subtitle="先确认进入方式、时限和扫描入口，再开始现场动作。">
        <div className="context-grid">
          <article className="mini-panel">
            <span>进入方式</span>
            <strong>{task.modeLabel}</strong>
          </article>
          <article className="mini-panel">
            <span>时限</span>
            <strong>{task.dueLabel}</strong>
          </article>
          <article className="mini-panel">
            <span>责任人</span>
            <strong>{task.assignee}</strong>
          </article>
        </div>
      </PageSection>

      <PageSection title="现场动作" subtitle="把到场、扫描、备注、回传压进一条操作流。">
        <div className="checklist">
          <label className="checklist-item">
            <input type="checkbox" defaultChecked />
            <span>到达站点警戒线并完成安全确认</span>
          </label>
          <label className="checklist-item">
            <input type="checkbox" />
            <span>扫码目标设备或站点铭牌</span>
          </label>
          <label className="checklist-item">
            <input type="checkbox" />
            <span>补充影像、口述结论与现场风险级别</span>
          </label>
        </div>
        <button className="ghost-pill ghost-pill--wide" type="button">
          <ScanIcon className="icon" />
          扫码进入设备 / 站点
        </button>
      </PageSection>

      <div className="action-bar">
        <button className="secondary-button" type="button">
          记录到场
        </button>
        <button className="primary-button" type="button">
          提交回传
        </button>
      </div>
    </div>
  );
}
