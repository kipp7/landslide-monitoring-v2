# 12) 设备健康专家（Device Health Expert）

权限：
- `GET /devices/{deviceId}/health/expert`：`data:view`
- `GET /devices/{deviceId}/health/expert/history`：`data:view`
- `POST /devices/{deviceId}/health/expert`：`system:config`

说明：
- 默认使用 PostgreSQL 的 `device_health_expert_runs` 做短 TTL 缓存；可通过 `forceRefresh=true` 强制重算。
- 评估基于 `device_state.state.metrics`（PostgreSQL）优先；若缺失则回退 ClickHouse 最新值聚合（与 `/data/state` 的思路一致）。

## 1) API（`/api/v1`）

### 1.1 查询/计算评估

**GET** `/devices/{deviceId}/health/expert`

Query：
- `metric`：`all | health | battery | signal`（默认 `all`）
- `forceRefresh`：`true | false`（默认 `false`）

响应 `data`：
- `deviceId`：UUID
- `metric`：本次请求的 metric
- `runId`：本次（或缓存命中）评估的运行 ID
- `cachedAt`：若命中缓存则返回缓存创建时间
- `result`：评估结果（battery / signal / health 会按 `metric` 返回子集）

### 1.2 历史记录

**GET** `/devices/{deviceId}/health/expert/history`

Query：
- `metric`：可选，筛选某类 metric
- `limit`：可选，默认 50，最大 200

响应 `data`：
- `deviceId`
- `list[]`：`{ runId, metric, createdAt, result }`

### 1.3 专家动作（运维/配置）

**POST** `/devices/{deviceId}/health/expert`

Body：
```json
{
  "action": "recalibrate",
  "parameters": {}
}
```

`action`：
- `recalibrate`：清理/刷新专家缓存（记录动作；实现侧通过 `forceRefresh` 触发重算）
- `reset_baseline`：记录 baseline 重置请求（当前仅记录，不直接修改 GPS baseline）
- `update_config`：将 `parameters` 写入 `devices.metadata.health_expert_config`

## 2) Legacy 兼容路径（`/api`）

为对齐参考区旧前端调用，API service 额外提供：
- `GET /api/device-health-expert?device_id={uuid-or-legacy}&metric=all&force_refresh=false`
- `POST /api/device-health-expert`（body 兼容 `{ deviceId, action, parameters }`）

Legacy 设备 ID 映射策略：
- UUID 直通；否则按 `devices.metadata.legacy_device_id`、`devices.metadata.externalIds.legacy`、`devices.device_name` 依次尝试匹配。

PostgreSQL 未配置时（`pg=null`）：
- `GET/POST /api/device-health-expert` 返回 `200` 并携带 `is_fallback: true`（跳过鉴权以对齐参考区旧前端调用）；`data.metadata.analysisMethod` 为 `fallback_no_pg`。
