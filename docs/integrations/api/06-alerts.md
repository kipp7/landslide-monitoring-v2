# 告警接口（v2：事件化告警 + 版本化规则 + DSL）

本模块与 v2 存储一致：
- 规则：PostgreSQL `alert_rules` + `alert_rule_versions`（版本化）
- 告警：PostgreSQL `alert_events`（事件化事实来源）
- 规则 DSL：见 `docs/integrations/rules/rule-dsl-spec.md`
- DSL 落库/接口映射：见 `docs/integrations/rules/rule-dsl-storage-mapping.md`

## 1. 告警列表（当前活动告警，按 alertId 聚合）

**GET** `/alerts`

权限：`alert:view`

说明：
- “当前告警状态”由事件流聚合得到（不是单表字段）
- `status` 的推荐计算方式：
  - `active`：最新事件为 `ALERT_TRIGGER/ALERT_UPDATE`
  - `acked`：最新事件为 `ALERT_ACK`（且其后没有 RESOLVE）
  - `resolved`：最新事件为 `ALERT_RESOLVE`

查询参数：
- `page`, `pageSize`
- `deviceId`（UUID）
- `stationId`（UUID）
- `severity`（low/medium/high/critical）
- `status`（active/acked/resolved）
- `startTime`, `endTime`（筛选最近事件时间范围）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "alertId": "6eaf2d9a-4c8b-4e0e-9e5f-4f4e3b97b2b0",
        "status": "active",
        "severity": "high",
        "title": "位移趋势异常",
        "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
        "ruleId": "1afdc6d7-8c2f-4b2b-9c9a-69e4d9e4b2fa",
        "ruleVersion": 3,
        "lastEventAt": "2025-12-15T10:00:00Z"
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 },
    "summary": {
      "active": 3,
      "acked": 2,
      "resolved": 10,
      "high": 2,
      "critical": 1
    }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 12. Anomaly assessment（兼容旧系统）

说明：参考区有 `/api/anomaly-assessment` 用于“异常类型聚合 + 国标四级预警展示”。v2 中该能力以 alerts/rule-engine 为数据源提供兼容聚合端点，避免旧前端/运营依赖缺失。

**GET** `/anomaly-assessment?timeWindow=24`

权限：`alert:view`

查询参数：

- `timeWindow`：时间窗口（小时），默认 `24`，最大 `720`。

返回（兼容旧系统字段命名，作为 `data` 字段的 payload）：

- `data[]`：按 `anomaly_type` 聚合
  - `anomaly_type`：聚合键（优先 `title`，否则 `rule_id`，否则 `alert_id`）
  - `count`：窗口内 `ALERT_TRIGGER/ALERT_UPDATE` 次数
  - `severity`：`red/orange/yellow/blue/normal`（从 v2 `critical/high/medium/low` 映射）
  - `latest_time`：最新事件时间（UTC）

示例响应：

```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "data": [
      {
        "anomaly_type": "rule: gps displacement threshold",
        "count": 3,
        "severity": "orange",
        "priority": 2,
        "latest_time": "2025-12-15T10:00:00Z",
        "color": "#ea580c",
        "display_name": "rule: gps displacement threshold",
        "recommended_action": "启动二级应急响应"
      }
    ],
    "stats": { "total": 3, "red": 0, "orange": 3, "yellow": 0, "blue": 0 },
    "time_window": 24,
    "processed_at": "2025-12-15T10:00:00Z",
    "source": "v2_alerts_compat"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 2. 告警事件流（某个 alertId 的所有事件）

**GET** `/alerts/{alertId}/events`

权限：`alert:view`

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "alertId": "6eaf2d9a-4c8b-4e0e-9e5f-4f4e3b97b2b0",
    "events": [
      {
        "eventId": "f7e7b9c0-2f1a-4b7e-9c5f-8b22d8d9a7a1",
        "eventType": "ALERT_TRIGGER",
        "severity": "high",
        "createdAt": "2025-12-15T10:00:00Z",
        "ruleId": "1afdc6d7-8c2f-4b2b-9c9a-69e4d9e4b2fa",
        "ruleVersion": 3,
        "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
        "evidence": {
          "timeField": "received",
          "sensorKey": "displacement_velocity_mm_h",
          "value": 0.32,
          "threshold": 0.3,
          "receivedTs": "2025-12-15T10:00:00.123Z",
          "seq": 12345,
          "window": { "minutes": 10, "minPoints": 6, "points": 12 }
        }
      }
    ]
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 3. 确认告警（ACK）

**POST** `/alerts/{alertId}/ack`

权限：`alert:handle`

请求：
```json
{ "notes": "已派人现场查看" }
```

说明：
- 会写入 `ALERT_ACK` 事件（不删除历史）

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "alertId": "6eaf2d9a-4c8b-4e0e-9e5f-4f4e3b97b2b0",
    "eventId": "d1d2d3d4-1111-2222-3333-444455556666",
    "eventType": "ALERT_ACK",
    "createdAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 4. 解决/关闭告警（RESOLVE）

**POST** `/alerts/{alertId}/resolve`

权限：`alert:handle`

请求：
```json
{ "notes": "已处理，恢复正常" }
```

说明：
- 会写入 `ALERT_RESOLVE` 事件

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "alertId": "6eaf2d9a-4c8b-4e0e-9e5f-4f4e3b97b2b0",
    "eventId": "e1e2e3e4-1111-2222-3333-444455556666",
    "eventType": "ALERT_RESOLVE",
    "createdAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 5. 规则列表（规则容器）

**GET** `/alert-rules`

权限：`alert:config`

查询参数：
- `isActive`
- `scope`（device/station/global）
- `deviceId`
- `stationId`

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "ruleId": "1afdc6d7-8c2f-4b2b-9c9a-69e4d9e4b2fa",
        "ruleName": "位移趋势异常",
        "scope": "device",
        "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
        "isActive": true,
        "currentVersion": 3,
        "updatedAt": "2025-12-15T10:00:00Z"
      }
    ]
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 6. 获取规则详情（含当前版本摘要）

**GET** `/alert-rules/{ruleId}`

权限：`alert:config`

说明：
- 详情应返回当前版本的 `dsl`（完整 JSON）或 `dslSummary`（摘要），由实现阶段决定

响应（推荐：返回完整 dsl，便于前端直接渲染与回显）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "rule": {
      "ruleId": "1afdc6d7-8c2f-4b2b-9c9a-69e4d9e4b2fa",
      "ruleName": "位移趋势异常",
      "description": "位移速率持续超过阈值触发",
      "scope": { "type": "device", "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c" },
      "isActive": true,
      "currentVersion": 3,
      "updatedAt": "2025-12-15T10:00:00Z"
    },
    "currentVersion": {
      "version": 3,
      "createdAt": "2025-12-15T10:00:00Z",
      "dsl": {
        "dslVersion": 1,
        "enabled": true,
        "severity": "high",
        "cooldown": { "minutes": 30 },
        "timeField": "received",
        "missing": { "policy": "ignore" },
        "when": {
          "op": "AND",
          "items": [{ "sensorKey": "displacement_velocity_mm_h", "operator": ">=", "value": 0.3 }]
        },
        "window": { "type": "duration", "minutes": 10, "minPoints": 6 },
        "hysteresis": { "recoverBelow": 0.2 },
        "actions": [{ "type": "emit_alert", "titleTemplate": "位移趋势异常" }]
      }
    }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 7. 创建规则（容器 + v1 版本）

**POST** `/alert-rules`

权限：`alert:config`

请求（推荐格式：rule + dsl，避免遗漏字段）：
```json
{
  "rule": {
    "ruleName": "位移速率异常",
    "description": "位移速率持续超过阈值触发",
    "scope": { "type": "device", "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c" },
    "isActive": true
  },
  "dsl": {
    "dslVersion": 1,
    "enabled": true,
    "severity": "high",
    "cooldown": { "minutes": 30 },
    "timeField": "received",
    "missing": { "policy": "ignore" },
    "when": {
      "op": "AND",
      "items": [
        { "sensorKey": "displacement_velocity_mm_h", "operator": ">=", "value": 0.3 }
      ]
    },
    "window": { "type": "duration", "minutes": 10, "minPoints": 6 },
    "hysteresis": { "recoverBelow": 0.2 },
    "actions": [
      { "type": "emit_alert", "titleTemplate": "位移速率异常", "messageTemplate": "速率={{value}}mm/h" }
    ]
  }
}
```

规范要求：
- 服务端必须把 `rule.scope` 与 `dsl.scope` 统一（允许 dsl 中省略 scope/name，最终落库时由服务端补齐）
- 服务端必须把完整 DSL 保存到 `alert_rule_versions.dsl_json`
- 可选：从 dsl 中抽取 `conditions/window/hysteresis/severity/enabled` 做冗余列（便于筛选/索引）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "ruleId": "1afdc6d7-8c2f-4b2b-9c9a-69e4d9e4b2fa",
    "ruleVersion": 1
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 8. 发布新版本（不覆盖旧版本）

**POST** `/alert-rules/{ruleId}/versions`

权限：`alert:config`

请求（只提交版本内容）：
```json
{
  "dsl": {
    "dslVersion": 1,
    "enabled": true,
    "severity": "high",
    "when": {
      "op": "AND",
      "items": [
        { "sensorKey": "displacement_velocity_mm_h", "operator": ">=", "value": 0.35 }
      ]
    },
    "window": { "type": "duration", "minutes": 15, "minPoints": 6 },
    "hysteresis": { "recoverBelow": 0.25 }
  }
}
```

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "ruleId": "1afdc6d7-8c2f-4b2b-9c9a-69e4d9e4b2fa",
    "ruleVersion": 4
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 9. 启用/停用规则容器

**PUT** `/alert-rules/{ruleId}`

权限：`alert:config`

请求：
```json
{ "isActive": false }
```

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "ruleId": "1afdc6d7-8c2f-4b2b-9c9a-69e4d9e4b2fa",
    "isActive": false,
    "updatedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 10. 获取规则版本列表/详情

### 10.1 获取规则版本列表

**GET** `/alert-rules/{ruleId}/versions`

权限：`alert:config`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "ruleId": "1afdc6d7-8c2f-4b2b-9c9a-69e4d9e4b2fa",
    "list": [
      { "version": 3, "createdAt": "2025-12-15T10:00:00Z", "createdBy": "a1b2c3d4-1111-2222-3333-444455556666" },
      { "version": 2, "createdAt": "2025-12-01T10:00:00Z", "createdBy": "a1b2c3d4-1111-2222-3333-444455556666" }
    ]
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

### 10.2 获取规则版本详情

**GET** `/alert-rules/{ruleId}/versions/{version}`

权限：`alert:config`

响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "ruleId": "1afdc6d7-8c2f-4b2b-9c9a-69e4d9e4b2fa",
    "version": 3,
    "createdAt": "2025-12-15T10:00:00Z",
    "dsl": {
      "dslVersion": 1,
      "enabled": true,
      "severity": "high",
      "when": {
        "op": "AND",
        "items": [{ "sensorKey": "displacement_velocity_mm_h", "operator": ">=", "value": 0.3 }]
      },
      "window": { "type": "duration", "minutes": 10, "minPoints": 6 },
      "missing": { "policy": "ignore" },
      "actions": [{ "type": "emit_alert", "titleTemplate": "位移趋势异常" }]
    }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 11. 规则回放/回测（dry-run replay）

用途：
- 用于复盘“某个规则在某段时间内会不会触发/何时触发”
- 用于容量评估（点数/事件数/窗口策略影响）
- **不会写入** `alert_events`（纯 dry-run 输出 explain/evidence）

**POST** `/alert-rules/{ruleId}/versions/{version}/replay`

权限：`alert:config`

请求：
```json
{
  "startTime": "2025-12-15T00:00:00Z",
  "endTime": "2025-12-15T01:00:00Z",
  "deviceIds": ["2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c"]
}
```

说明：
- 查询数据源为 ClickHouse（按规则 `timeField` 选择 `received_ts`/`event_ts`）
- `deviceIds` 可选：
  - scope=device：可省略（默认用 rule.deviceId）
  - scope=station：可省略（默认取该站点所有 devices）
  - scope=global：必须显式提供（避免意外全量回放）

响应（示例）：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "ruleId": "1afdc6d7-8c2f-4b2b-9c9a-69e4d9e4b2fa",
    "version": 3,
    "startTime": "2025-12-15T00:00:00Z",
    "endTime": "2025-12-15T01:00:00Z",
    "sensorKeys": ["displacement_velocity_mm_h"],
    "devices": [
      {
        "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c",
        "points": 123,
        "events": [
          { "eventType": "ALERT_TRIGGER", "ts": "2025-12-15T00:10:00Z", "evidence": {}, "explain": "rule triggered" }
        ]
      }
    ],
    "totals": { "rows": 456, "points": 123, "events": 1 }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```
