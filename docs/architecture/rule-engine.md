# 规则引擎设计（v2）

目标：把“报警逻辑”从硬编码变成可配置、可回放、可解释，并能逐步引入 AI/预测模块；同时保证写入链路稳定（不因规则/算法阻塞设备上报）。

## 1. 核心理念

- 规则是数据（存库、版本化），不是代码。
- 规则输出是事件（`alert_events`），不是“直接改状态”。
- 算法/AI 是插件（可失败、可降级），不能阻塞主链路。

## 2. 规则引擎在整体架构的位置

- 输入：Kafka `telemetry.raw.v1`（标准化 TelemetryEnvelope）
- 可选输入：ClickHouse（窗口回放/聚合查询）
- 输出：
  - PostgreSQL：`alert_events`（事件化告警）
  - Kafka：`alerts.events.v1`（通知/实时推送消费）

## 3. 必须支持的能力（v1 范围）

- 组合条件：AND / OR / NOT
- 比较算子：`> >= < <= == != between`
- 窗口：
  - 持续 X 分钟触发
  - 连续 N 个点触发
- 防抖/回差（hysteresis）：触发阈值与恢复阈值不同，避免抖动
- 缺失策略：
  - ignore（缺失不参与）
  - treat_as_fail（缺失视为不满足）
  - raise_missing_alert（缺失触发“数据缺失/传感器故障”类事件）
- 冷却（cooldown）：触发后一段时间内不重复触发同类告警

## 4. 告警事件模型（统一输出）

规则引擎输出统一事件：

- `ALERT_TRIGGER`：触发
- `ALERT_UPDATE`：持续期间更新（可选）
- `ALERT_RESOLVE`：恢复
- `ALERT_ACK`：人工确认（来自 API）

事件关键字段（参考 `docs/integrations/storage/postgres/tables/08-alerts.sql`）：

- `alert_id`：同一告警生命周期标识（触发/更新/恢复/确认共享）
- `rule_id`、`rule_version`
- `device_id`、`station_id`（可选）
- `severity`
- `evidence`：证据（触发时的值/窗口统计/算法输出）
- `explain`：可选的人类可读解释

## 5. 规则 DSL（JSON）

规则版本内容建议用 JSON DSL 存储（便于前端编辑与后端执行），并携带 `dslVersion`。

DSL v1 的完整、可实现规范见：

- `docs/integrations/rules/rule-dsl-spec.md`

## 6. 算法/AI 插件接口（预留）

把 AI/预测当作 Provider：

- 输入：`device_id`、`sensor_key`、时间序列片段、上下文（站点/雨量等）
- 输出：`prediction`（未来值/趋势）、`confidence`、`features`（解释字段）

降级要求：

- 算法不可用/超时：规则继续运行，但算法相关条件为“未知/不触发”，并在 evidence 中记录不可用原因。

## 7. 回放与回测（必须写进计划）

- 支持对任意时间段回放（读 ClickHouse 数据，按规则版本重算输出事件）
- 回放必须幂等（避免重复写入/重复告警）
- 回放结果用于：
  - 规则调参
  - 模型对比
  - 上线前验证
