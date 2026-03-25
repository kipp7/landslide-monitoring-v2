## Why

当前命令通知域已经形成稳定真值：

- `COMMAND_TIMEOUT` / `COMMAND_FAILED` 默认通知
- `COMMAND_ACKED` 默认静默
- `notifyOnAck=true` 时，`COMMAND_ACKED` 可进入可消费通知链路

这意味着底层能力已经具备，但产品策略仍然偏“单命令布尔开关”。如果后续要把成功通知真正交给运营或产品使用，单一 `notifyOnAck` 很快会不够表达：

- 哪些命令类型默认应该通知成功
- 哪些命令仍然应该静默
- 是否允许前端用更高层策略名而不是裸布尔值

因此下一步最合理的是把“broader success-notification policy”收成独立 proposal，而不是继续在当前代码上零散补字段。

## What Changes

- 为设备命令定义更高层的 success-notification policy，而不再只依赖裸 `notifyOnAck`
- 明确推荐策略层级为：
  - system default
  - command-type default
  - per-command override
- 定义成功通知策略的最小枚举和优先级规则
- 定义 Desk/Web 消费面应如何展示和透传这类策略
- 为 field / desk proof 增加“策略级”留证，而不再只验证单个布尔开关

## Non-Goals

- 不修改当前 `COMMAND_FAILED` / `COMMAND_TIMEOUT` 默认通知行为
- 不在本变更中引入用户订阅中心或角色级通知编排
- 不在本变更中设计完整的通知模板系统

## Impact

- Affected specs:
  - `command-notification-policy`
- Affected code:
  - `services/api/src/routes/devices.ts`
  - `services/command-notify-worker/src/index.ts`
  - `apps/web/lib/api/devices.ts`
  - `apps/desk/src/api/client.ts`
  - `apps/web/app/device-management/DeviceManagementV2Page.tsx`
  - `apps/desk/src/views/DeviceManagementPage.tsx`
