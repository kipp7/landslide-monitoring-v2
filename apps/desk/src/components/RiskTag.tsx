import { Tag } from "antd";

import type { RiskLevel } from "../api/client";

export function RiskTag(props: { value: RiskLevel }) {
  if (props.value === "high") return <Tag className="desk-tag desk-tag-risk-high">高</Tag>;
  if (props.value === "mid") return <Tag className="desk-tag desk-tag-risk-mid">中</Tag>;
  return <Tag className="desk-tag desk-tag-risk-low">低</Tag>;
}
