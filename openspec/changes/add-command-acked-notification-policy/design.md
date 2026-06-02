---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-command-acked-notification-policy/design
---

## Context

当前命令通知域已经形成稳定真值：

- `COMMAND_TIMEOUT` / `COMMAND_FAILED` 属于异常路径，必须通知
- `COMMAND_ACKED` 属于成功路径，当前只更新状态与事件，不创建通知

如果直接让 `COMMAND_ACKED` 也默认发通知，会立刻改变当前已落盘的 proof 与运维噪声模型，因此需要一个兼容当前默认行为的新策略。

## Goals / Non-Goals

- Goals:
  - 保持现有 `acked` 默认静默行为不变
  - 允许调用方按命令显式开启 acked 通知
  - 让 `COMMAND_ACKED` 在开启时仍复用现有命令通知 API
- Non-Goals:
  - 不设计复杂的订阅中心或用户级通知编排
  - 不让所有 acked 回执默认都发通知

## Decisions

- Decision: 使用按命令的显式开关，而不是全局默认开启
  - Why:
    - 与当前 proof 真值兼容
    - 可以避免日常高频成功命令带来的通知噪声
    - 对少量关键命令（如 reboot、关键配置变更）仍可开启成功通知

- Decision: 将策略持久化到 `device_commands`
  - Why:
    - `command-notify-worker` 处理 `COMMAND_ACKED` 时需要知道该命令是否允许通知
    - 策略应与命令实例一起固化，避免运行时推断漂移

- Decision: API 层使用简单布尔字段 `notifyOnAck`
  - Why:
    - 当前命令创建契约很小，布尔字段足够表达最小策略
    - 比起引入新的复杂 policy object，更容易让 Desk/Web/Field 保持一致

## Risks / Trade-offs

- Risk: 后续如果又出现 `notifyOnFailed`、`notifyOnTimeout` 等扩展，单布尔字段会变得分散
  - Mitigation:
    - 本变更先只解决 `acked` 这一个新策略
    - 若未来策略继续增多，再统一升级成结构化 policy object

- Risk: 已有 proof 需要同时维护“默认静默”和“显式开启”两类基线
  - Mitigation:
    - 保留当前 proof 作为默认行为回归
    - 新增单独 positive proof，避免混淆

## Migration Plan

1. 为 `device_commands` 增加 `notify_on_acked` 字段，默认 `false`
2. 扩展命令创建/查询 API 契约
3. 更新 `command-notify-worker` 的 `COMMAND_ACKED` 处理逻辑
4. 新增 `acked enabled` proof，并保留现有 `acked silent` proof

## Open Questions

- `notifyOnAck` 是否应同时暴露到 legacy `/huawei/*` 命令兼容层
- Desk/Web 在 UI 上是否需要把“命令成功通知”作为显式开关展示给操作员