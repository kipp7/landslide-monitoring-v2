# Delta for Command Notification Policy

## ADDED Requirements

### Requirement: Success Notification Policy Supports Layered Defaults
系统 MUST 支持 success-notification policy 的分层决策，至少包括 system default、command-type default 和 per-command override。

#### Scenario: Resolve effective policy
- **WHEN** 平台需要决定某条命令的 `COMMAND_ACKED` 是否应通知
- **THEN** 系统 MUST 按既定优先级解析有效 success-notification policy

### Requirement: Current Acked Behavior Remains Backward Compatible
系统 MUST 保持当前 `acked` 默认静默行为兼容；未显式提升策略时，`COMMAND_ACKED` 仍不得自动通知。

#### Scenario: Existing command flow without upgraded policy
- **WHEN** 某条命令没有显式提升 success-notification policy
- **THEN** `COMMAND_ACKED` MUST 继续保持静默

### Requirement: Success Notification Policy Is Consumer-Oriented
系统 SHOULD 允许 Desk/Web 使用更高层的 success-notification policy 概念，而不是长期暴露单一布尔开关。

#### Scenario: Frontend renders command form
- **WHEN** Desk 或 Web 展示命令下发表单
- **THEN** 前端 SHOULD 能使用产品策略层表达 success-notification，而不仅是裸 `notifyOnAck`
