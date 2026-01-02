import { Tag } from "antd";

import type { OnlineStatus } from "../api/client";

export function StatusTag(props: { value: OnlineStatus }) {
  if (props.value === "online") return <Tag className="desk-tag desk-tag-online">在线</Tag>;
  if (props.value === "warning") return <Tag className="desk-tag desk-tag-warning">预警</Tag>;
  return <Tag className="desk-tag desk-tag-offline">离线</Tag>;
}
