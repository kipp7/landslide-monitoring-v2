# 规则 DSL 规范（v1，可实现且可扩展）

本 DSL 用于把“告警逻辑”做成数据（存库、版本化、可回放），避免硬编码。目标是：**多规则 + 多传感器组合 + 窗口 + 防抖回差 + 缺失策略 + 可插拔算法/AI**，并且不影响写入链路稳定性。

> 约定：所有时间均为 RFC3339 UTC；所有 ID（deviceId/stationId/ruleId/alertId）均为 UUID 字符串。

机器可读校验：

- JSON Schema（用于校验 DSL JSON 是否结构正确）：`docs/integrations/rules/rule-dsl.schema.json`

---

## 1. 总体结构（RuleVersion）

每次修改规则都创建一个新的 `ruleVersion`（不覆盖旧版本）。一个规则版本（JSON）建议结构如下：

```json
{
  "dslVersion": 1,
  "name": "位移趋势异常",
  "scope": {
    "type": "device",
    "deviceId": "2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c"
  },
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
```

### 字段解释（必须项）

- `dslVersion`：DSL 版本号（v1=1）
- `scope`：适用范围（device/station/global）
- `enabled`：是否启用
- `severity`：告警级别（low/medium/high/critical）
- `when`：条件树（AND/OR/NOT）

### 可选项（强烈建议）

- `window`：窗口（持续时间/点数）
- `hysteresis`：回差（恢复阈值）
- `cooldown`：冷却时间（避免重复触发）
- `missing`：缺失策略（ignore/treat_as_fail/raise_missing_alert）
- `actions`：触发后的动作（至少支持 emit_alert；可扩展推送/写影子/触发命令等）

---

## 2. Scope（规则适用范围）

```json
{ "type": "device", "deviceId": "..." }
{ "type": "station", "stationId": "..." }
{ "type": "global" }
```

语义：
- `device`：仅对单设备生效
- `station`：站点下所有设备生效（后端需要能通过 stationId 找到设备集合）
- `global`：全局生效（谨慎使用）

---

## 3. 时间字段（timeField）

```json
{ "timeField": "received" }
{ "timeField": "event" }
```

语义：
- `received`（默认）：使用服务端接收时间窗口（推荐，抗设备漂移/乱序）
- `event`：使用设备时间窗口（仅在设备时间可靠时启用）

---

## 4. Missing Policy（缺失策略）

```json
{ "missing": { "policy": "ignore" } }
{ "missing": { "policy": "treat_as_fail" } }
{ "missing": { "policy": "raise_missing_alert", "sensorKeys": ["displacement_mm"] } }
```

语义：
- `ignore`：缺失不参与计算（最宽松）
- `treat_as_fail`：缺失视为“不满足条件”（适合严格规则）
- `raise_missing_alert`：缺失触发“传感器缺失/数据中断”类事件

注意：
- 设备可能天然没有某传感器，缺失是否异常应由 `device_sensors`（声明）辅助判断（实现阶段）。

---

## 5. Window（窗口）

窗口用于把规则从“瞬时阈值”提升为“持续/趋势/统计”。

### 5.1 按持续时间

```json
{ "window": { "type": "duration", "minutes": 10, "minPoints": 6 } }
```

- `minutes`：窗口长度
- `minPoints`：最少点数（不足则按 missing policy 处理）

### 5.2 按点数

```json
{ "window": { "type": "points", "points": 30 } }
```

---

## 6. Hysteresis（回差/防抖）

回差用于避免指标在阈值附近抖动导致频繁触发/恢复。

```json
{ "hysteresis": { "recoverBelow": 0.2 } }
{ "hysteresis": { "recoverAbove": 1.2 } }
```

语义：
- 对于 `>= threshold` 触发的规则，通常用 `recoverBelow`
- 对于 `<= threshold` 触发的规则，通常用 `recoverAbove`

实现要求：
- 规则引擎需要维护每个 `alert_id` 的当前状态（active/acked/resolved）与恢复条件。

---

## 7. Conditions（条件树）

### 7.1 逻辑节点

```json
{ "op": "AND", "items": [ ... ] }
{ "op": "OR", "items": [ ... ] }
{ "op": "NOT", "item": { ... } }
```

### 7.2 叶子节点：比较（sensor）

```json
{
  "sensorKey": "displacement_mm",
  "operator": ">=",
  "value": 1.5
}
```

operator 支持：
- `> >= < <= == !=`
- `between`：`{ "operator":"between", "min": 1.0, "max": 2.0 }`

类型规则：
- `float/int/bool/string` 均可（以 `sensors.data_type` 为准）
- `==`/`!=` 可用于字符串状态（如 `relay_state == "ON"`），但不建议高频字符串参与复杂聚合

---

## 8. 统计/派生条件（聚合与趋势）

为了支持“窗口内均值/斜率/变化量”等组合规则，提供 `metric` 节点：

### 8.1 聚合函数

```json
{
  "metric": {
    "sensorKey": "displacement_mm",
    "agg": "avg",
    "window": { "type": "duration", "minutes": 10 }
  },
  "operator": ">=",
  "value": 1.5
}
```

agg 支持（v1 建议实现最小集）：
- `last`（窗口最后一个值）
- `min` / `max` / `avg`
- `delta`（last - first）
- `slope`（简单线性趋势斜率，按分钟/小时归一化）

说明：
- `metric.window` 可省略，默认使用规则 `window`
- 聚合只对数值型 sensor 生效；字符串/bool 只支持 `last`

---

## 9. Algorithm/AI 输出作为条件（可选）

将 AI 预测做成异步 provider，规则通过引用预测结果参与判断。

```json
{
  "algo": {
    "provider": "predict_displacement",
    "sensorKey": "displacement_mm",
    "horizon": "6h"
  },
  "operator": ">=",
  "value": 2.0
}
```

要求：
- algo 结果必须包含 `prediction` 与 `confidence`
- 若 algo 不可用/超时：按规则策略降级（默认“不触发”，并在 evidence 中记录 `algo_unavailable=true`）

---

## 10. Cooldown（冷却）

```json
{ "cooldown": { "minutes": 30 } }
```

语义：
- 同一规则在同一 `scope` 内，触发后在 cooldown 时间内不重复触发（但允许 UPDATE）

---

## 11. Actions（动作）

v1 最小动作：

```json
{ "type": "emit_alert", "titleTemplate": "xxx", "messageTemplate": "yyy" }
```

扩展动作（预留）：
- `notify`：推送策略（App/SMS/Email）——建议由规则元数据决定，而不是硬编码
- `write_device_state`：更新影子（谨慎）
- `send_device_command`：下发控制命令（需要权限与幂等）

模板变量建议（实现阶段）：
- `{{deviceId}}`、`{{stationId}}`、`{{sensorKey}}`、`{{value}}`、`{{ts}}`、`{{window.avg}}`、`{{window.max}}` 等

---

## 12. 与数据库表的映射（v2）

建议存储方式：
- `alert_rules`：规则容器（scope + enabled + created_by）
- `alert_rule_versions`：版本内容（将整个 DSL JSON 存到 `conditions/window/hysteresis/...` 或新增一个 `dsl_json` 字段）

告警输出：
- 写入 `alert_events`（事件化），并推送 Kafka `alerts.events.v1`

---

## 13. 校验清单（避免遗漏）

创建/更新规则时必须校验：

- dslVersion 是否支持
- scope 是否有效（deviceId/stationId 存在）
- when 语法是否正确（AND/OR/NOT、叶子节点字段完整）
- sensorKey 是否存在于 `sensors` 字典（允许先注册字典再用）
- dataType 与 operator/value 是否匹配
- window/hysteresis/cooldown 参数范围是否合理（非负、上限保护）
