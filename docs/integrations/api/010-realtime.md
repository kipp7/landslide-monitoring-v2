# 10) Realtime（SSE）

权限：
- `GET /realtime/stream`：`data:view`
- `POST /realtime/stream`：`system:config`（用于广播/运维调试）

## 1) API（/api/v1）

### 1.1 SSE：订阅实时流

**GET** `/realtime/stream`

Query：
- `device_id`：`all` 或设备 UUID（默认 `all`）
- `poll_ms`：轮询周期（ms，默认 `5000`；`all` 时仅心跳，轮询不会推送设备数据）
- `heartbeat_ms`：心跳周期（ms，默认 `30000`）

响应：
- `Content-Type: text/event-stream`
- 每条消息为一行 `data: <json>\n\n`

消息类型（`data` 内 JSON）：
- `connection`：连接确认（含 `clientId`）
- `initial_data`：初始快照（当 `device_id` 为单设备 UUID 时）
- `device_data`：设备快照更新（当启用轮询，且快照有更新时）
- `heartbeat`：保持连接（含 `connectedClients`）
- `error`：非致命错误提示

示例（Web：用 `fetch` 流式读取，支持 Bearer Token）：

```ts
const resp = await fetch('/api/v1/realtime/stream?device_id=all', {
  headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
})
```

### 1.2 广播（可选）

**POST** `/realtime/stream`

Body：
- `action`：`broadcast_device_data | broadcast_anomaly | broadcast_system_status | get_client_stats | cleanup_inactive_clients`
- `deviceId`：当 action 为 `broadcast_device_data`/`broadcast_anomaly` 时必填（UUID）
- `data`：任意 JSON

说明：
- 这是“参考区 `/api/realtime-stream`” 的最小可用对齐实现（v2 侧默认以权限保护）。

## 3. Legacy 兼容路径

为对齐参考区旧前端调用，API service 额外提供：
- `GET /api/realtime-stream`（SSE）
- `POST /api/realtime-stream`（广播/统计）

说明：
- 当 PostgreSQL 未配置或不可用时，`GET /api/realtime-stream` 仍允许建立 SSE 连接（不要求 RBAC），并持续发送 `heartbeat`；若 `device_id` 不是 UUID，则仅作为订阅 key 使用（不会触发快照轮询）。
- 当 PostgreSQL 未配置或不可用时，`POST /api/realtime-stream` 返回 200 disabled payload（避免 legacy UI/调试页出现 401/503）。
