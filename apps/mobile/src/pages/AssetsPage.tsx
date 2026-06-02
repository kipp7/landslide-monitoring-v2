import { Link } from "react-router-dom";
import { PageSection } from "../components/Page";
import { assets } from "../data/mockData";

export function AssetsPage() {
  return (
    <div className="page">
      <PageSection title="资产快览" subtitle="设备和站点只保留必要上下文，不抢主叙事。">
        <div className="asset-grid">
          {assets.map((asset) => (
            <article key={asset.id} className="asset-card">
              <div className="asset-card__head">
                <div>
                  <span className="eyebrow">{asset.id}</span>
                  <h3>{asset.name}</h3>
                </div>
                <span className="task-badge">{asset.type}</span>
              </div>
              <p>{asset.location}</p>
              <div className="task-meta">
                <span>{asset.health}</span>
                <span>{asset.lastSignal}</span>
              </div>
              {asset.linkedEventId ? (
                <Link className="inline-link" to={`/events/${asset.linkedEventId}`}>
                  关联事件
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
