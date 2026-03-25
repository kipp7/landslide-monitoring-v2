# Delta for Command Notification Policy

## ADDED Requirements

### Requirement: Acked Notifications Are Silent By Default
系统 MUST 默认保持 `COMMAND_ACKED` 静默，即仅更新命令状态与事件流，不自动创建 `device_command_notifications`。

#### Scenario: Acked receipt without opt-in
- **WHEN** 某条设备命令没有显式开启 acked 通知
- **AND** 平台收到该命令的 `COMMAND_ACKED` 回执
- **THEN** `device_commands.status` MUST 更新为 `acked`
- **AND** 平台 MUST 记录 `COMMAND_ACKED` 事件
- **AND** 平台 MUST NOT 创建对应的 `device_command_notifications`

### Requirement: Acked Notifications Support Explicit Opt-In
系统 MUST 支持按命令显式开启 acked 通知；仅在该策略开启时，`COMMAND_ACKED` 才创建命令通知。

#### Scenario: Acked receipt with opt-in enabled
- **WHEN** 某条设备命令显式开启 acked 通知
- **AND** 平台收到该命令的 `COMMAND_ACKED` 回执
- **THEN** 平台 MUST 创建一条 `device_command_notifications`
- **AND** 该通知 MUST 关联对应的 `COMMAND_ACKED` 事件

### Requirement: Acked Notification Behavior Is Queryable
当 acked 通知被开启且已生成时，现有命令通知 API MUST 允许查询、统计、查看详情和标记已读。

#### Scenario: Query acked notification
- **WHEN** 某条命令因 `notifyOnAck=true` 已生成 acked 通知
- **THEN** `/devices/{deviceId}/command-notifications` MUST 返回该通知
- **AND** `/devices/{deviceId}/command-notifications/stats` MUST 将其计入统计
- **AND** `/devices/{deviceId}/command-notifications/{notificationId}` MUST 返回其详情
- **AND** `PUT /devices/{deviceId}/command-notifications/{notificationId}/read` MUST 支持将其标记已读
