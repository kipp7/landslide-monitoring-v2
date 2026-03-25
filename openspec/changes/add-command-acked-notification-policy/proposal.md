## Why

当前命令回执链路已经拿到三条真值：

- `COMMAND_TIMEOUT` 会生成可消费通知
- `COMMAND_FAILED` 会生成可消费通知
- `COMMAND_ACKED` 会更新命令状态并写出事件，但当前不会生成通知

这说明“acked 是否应该通知”已经不再是链路问题，而是明确的产品策略问题。继续直接写代码会把当前默认静默策略变成隐式变更，不利于后续 Desk/Web/Field 一致消费。

## What Changes

- 为设备命令新增 `acked` 成功通知策略，并明确当前推荐实现为“默认静默、按命令显式开启”
- 为命令创建/查询契约补充 `notifyOnAck`（或等价字段）的行为定义
- 为 `command-notify-worker` 增加 `COMMAND_ACKED` 的条件通知规则
- 为命令通知 API 明确 `COMMAND_ACKED` 被开启时的查询/统计/已读行为
- 为 field rehearsal 增加两类 proof：
  - 默认静默：acked 回执不产生通知
  - 显式开启：acked 回执产生可消费通知

## Non-Goals

- 不引入新的用户订阅模型
- 不改变 `COMMAND_FAILED` / `COMMAND_TIMEOUT` 的既有通知策略
- 不在本变更中设计“按用户/按角色/按设备批量配置 acked 通知”

## Impact

- Affected specs:
  - `command-notification-policy`（新增 capability）
- Affected code:
  - `services/api/src/routes/devices.ts`
  - `services/command-notify-worker/src/index.ts`
  - `docs/integrations/api/03-devices.md`
  - `docs/integrations/storage/postgres/tables/13-device-commands.sql`
  - `scripts/dev/check-field-command-acked-mqtt-receipt-proof.ps1`
