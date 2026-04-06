---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/testing/readme
---

# guides/testing/

本目录用于“可执行验收”的测试与验证文档，目标是让重构过程具备闭环：

- 你知道“现在是否可用”
- 你知道“出了问题去哪找证据”
- 你知道“怎么复现、怎么回滚”

## 1) 快速入口

- 单机基础设施冒烟测试：`docs/guides/testing/single-host-smoke-test.md`
- Web 本地登录联调：`docs/guides/testing/web-local-dev.md`
- 正式命令入口稳定线路：`docs/guides/testing/command-entry-stable-route.md`
- 正式命令入口统一总检：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-command-entry-stable-route.ps1`
- Desk `notifyOnAck` 客户端回归：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-command-notify-on-ack.ps1`
- Web `notifyOnAck` 客户端回归：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-web-command-notify-on-ack.ps1`
- 命令 success-notification command-type default proof：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-success-notification-type-default-proof.ps1`
- 命令 success-notification 配置管理 proof：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-success-notification-policy-config-proof.ps1`
- 命令 success-notification 自定义类型 proof：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-command-success-notification-policy-custom-type-proof.ps1`
- API/鉴权/数据格式快速测试：`docs/guides/testing/api-tools.md`
- 现场链路软件优先联调（A 路线）：`docs/guides/testing/field-software-rehearsal.md`
- 现场链路宿主机路径异常排查：`docs/guides/testing/field-host-path-troubleshooting.md`
- 现场链路宿主机路径修复计划：`docs/unified/reports/field-host-remediation-plan-latest.md`
- 现场链路当前阶段总结：`docs/unified/reports/field-rehearsal-phase-summary-latest.md`
- 端到端冒烟测试（MQTT→Kafka→ClickHouse→API）：`docs/guides/testing/e2e-smoke-test.md`
- Telemetry 负载测试（单机）：`docs/guides/testing/telemetry-load-test.md`
- 问题排查与证据收集：`docs/guides/testing/troubleshooting-and-evidence.md`

## 2) 测试哲学（项目约束）

- 单机优先：先保证可恢复、可观测、可验证，再谈性能上限。
- 契约优先：测试用例尽量复用 `docs/integrations/*/examples` 作为输入。
- 不写死：测试必须验证“新增传感器/字段不改表/不改前端映射”的方向。

## 3) notifyOnAck 消费侧入口

当前 `notifyOnAck` 的消费侧回归分成两条：

- Desk HTTP client：
  - 脚本：`scripts/dev/check-desk-command-notify-on-ack.ps1`
  - 报告：`docs/unified/reports/desk-command-notify-on-ack-proof-latest.json`
- Web API module：
  - 脚本：`scripts/dev/check-web-command-notify-on-ack.ps1`
  - 报告：`docs/unified/reports/web-command-notify-on-ack-proof-latest.json`

这两条脚本都会优先使用本地 `8081` API；若本地 API 未启动，会先自动调用 `scripts/dev/restart-local-api-service.ps1 -SkipBuild`。

当前两条 proof 不只检查 `notifyOnAck`，也会同时检查：

- `successNotificationPolicy`
- `effectiveSuccessNotificationPolicy`

如果你只想看当前 Desk + Web 的统一总表：

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/render-command-notify-on-ack-consumer-summary.ps1`

对应统一报告：

- `docs/unified/reports/command-notify-on-ack-consumer-summary-latest.json`

## 4) success-notification 策略 proof

如果你要确认 success-notification 已经不只停留在 `notifyOnAck` 单命令布尔，而是支持 `inherit -> command-type default -> system default` 的最小后端策略：

- 脚本：`scripts/dev/check-field-command-success-notification-type-default-proof.ps1`
- 报告：`docs/unified/reports/field-command-success-notification-type-default-proof-latest.json`

这条 proof 会创建一条未显式传入 `notifyOnAck` / `successNotificationPolicy` 的命令，并验证该命令因命中 command type default 而解析为 `effectiveSuccessNotificationPolicy=always_notify`，最终产生命令通知。

当前这条 proof 还会临时 upsert：

- `command.success_notification.system_default`
- `command.success_notification.command_type_defaults`

并在结束后恢复原值，不污染 `system_configs` 当前真值。

如果你要确认命令成功通知默认表不只是“能读”，而且通过正式系统 API 修改后会真实改变运行时行为：

- 脚本：`scripts/dev/check-field-command-success-notification-policy-config-proof.ps1`
- 报告：`docs/unified/reports/field-command-success-notification-policy-config-proof-latest.json`

这条 proof 会通过 `/api/v1/system/command-success-notification-policy` 把 `set_config` 默认策略临时改成 `silent`，然后验证一条未显式 override 的 `set_config` 命令会读回 `effectiveSuccessNotificationPolicy=silent`，并且 `COMMAND_ACKED` 不再生成命令通知；脚本结束后会自动恢复原配置。

如果你要确认默认表里新增一个全新的 `commandType` 条目后，运行时也会立刻按新默认策略执行：

- 脚本：`scripts/dev/check-field-command-success-notification-policy-custom-type-proof.ps1`
- 报告：`docs/unified/reports/field-command-success-notification-policy-custom-type-proof-latest.json`

这条 proof 会通过正式管理 API 临时新增 `custom_success_policy_proof -> always_notify`，然后验证一条未显式 override 的同名命令会读回 `effectiveSuccessNotificationPolicy=always_notify`，并真实生成 `COMMAND_ACKED` 通知；脚本结束后会自动恢复原配置。
