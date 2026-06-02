import { Link } from "react-router-dom";
import { PageSection } from "../components/Page";

export function ProfilePage() {
  return (
    <div className="page">
      <section className="profile-hero">
        <div className="profile-hero__identity">
          <div className="profile-avatar">LC</div>
          <div>
            <p className="eyebrow">值班总控</p>
            <h2>李晨</h2>
            <span>权限：事件确认 / 任务分派 / 站点查看</span>
          </div>
        </div>
      </section>

      <section className="profile-command-band">
        <article className="profile-command-chip">
          <span>当前班次</span>
          <strong>夜间值守</strong>
          <small>19:00 - 07:00</small>
        </article>
        <article className="profile-command-chip">
          <span>默认入口</span>
          <strong>空间战情</strong>
          <small>Push 直达事件详情</small>
        </article>
        <article className="profile-command-chip">
          <span>离线缓存</span>
          <strong>6 小时</strong>
          <small>最近事件与任务已保留</small>
        </article>
      </section>

      <PageSection title="通知与入口" subtitle="预留 HarmonyOS Push、Linking 与离线状态的接入位置。">
        <div className="settings-list">
          <article className="settings-row">
            <div>
              <strong>高风险推送</strong>
              <p>红色事件直接拉起到事件详情页</p>
            </div>
            <span className="toggle toggle--on" />
          </article>
          <article className="settings-row">
            <div>
              <strong>巡检到场提醒</strong>
              <p>结合位置能力提示接近目标站点</p>
            </div>
            <span className="toggle toggle--on" />
          </article>
          <article className="settings-row">
            <div>
              <strong>离线缓存状态</strong>
              <p>最近一次同步：19:41，保留最近 6 小时事件</p>
            </div>
            <span className="sync-pill">已就绪</span>
          </article>
        </div>
      </PageSection>

      <PageSection title="环境与可信状态" subtitle="后续迁入 HarmonyOS 原生能力时，对应接线点不再改信息结构。">
        <div className="settings-list">
          <article className="settings-row">
            <div>
              <strong>当前环境</strong>
              <p>现场联动环境 / 中心 API-only / 风险空间原型</p>
            </div>
            <span className="sync-pill">现场</span>
          </article>
          <article className="settings-row">
            <div>
              <strong>证据链状态</strong>
              <p>事件回执、人工备注、模型版本均预留可信记录位</p>
            </div>
            <span className="sync-pill">预留</span>
          </article>
        </div>
      </PageSection>

      <PageSection title="状态基线" subtitle="把 loading、empty、error、offline 收成一套统一语言。">
        <div className="settings-list">
          <article className="settings-row">
            <div>
              <strong>状态页预览</strong>
              <p>继续用于事件流、空间回放和离线缓存的统一状态设计。</p>
            </div>
            <Link className="ghost-pill" to="/me/states">
              打开预览
            </Link>
          </article>
        </div>
      </PageSection>

      <button className="secondary-button secondary-button--wide" type="button">
        退出当前原型会话
      </button>
    </div>
  );
}
