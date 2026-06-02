---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-command-success-notification-policy/design
---

## Context

当前命令通知域已经证明两件事：

1. `COMMAND_ACKED` 默认静默是稳定的当前真值
2. `notifyOnAck=true` 已经能把 `COMMAND_ACKED` 提升成可消费通知

这说明底层能力没有缺口，问题已经从“能不能做”转成“产品应该怎样表达和管理 success-notification”。

## Goals / Non-Goals

- Goals:
  - 把 success-notification 从布尔开关提升为更稳定的产品策略层
  - 保持当前默认静默行为兼容
  - 让 Desk/Web 不需要长期暴露过于底层的布尔语义
- Non-Goals:
  - 不重做失败/超时通知模型
  - 不做复杂订阅中心
  - 不做模板/渠道编排系统

## Decisions

- Decision: 使用三层优先级
  - system default
  - command-type default
  - per-command override
  - Why:
    - 允许对“关键命令类型”设默认成功通知
    - 又不破坏单命令临时 override 的能力

- Decision: 保持当前 `notifyOnAck` 作为兼容输入，不立刻删除
  - Why:
    - 当前后端、proof、Web、Desk 都已经围绕它落了真值
    - 直接移除会造成无谓迁移噪声

- Decision: 新策略层应该优先面向“意图”，而不是面向实现细节
  - Example:
    - `silent`
    - `important_only`
    - `always_notify`

## Risks / Trade-offs

- Risk: 策略层过早复杂化，会让当前命令链路再次膨胀
  - Mitigation:
    - 限定最小枚举
    - 只覆盖 success-notification

- Risk: 与现有 `notifyOnAck` 并存期会带来双语义
  - Mitigation:
    - 提前定义兼容优先级
    - 明确 proof 应该如何读这两层字段

## Migration Plan

1. 先定义 success-notification policy 的策略枚举
2. 规定 `notifyOnAck` 如何映射到新策略层
3. 再决定是否真的需要代码层迁移

## Open Questions

- command-type default 是落在数据库、配置表，还是代码常量
- Desk/Web 是否应该直接展示策略名，而不是裸布尔开关