## 1. Policy Design
- [x] 1.1 定义 success-notification policy 的最小枚举与优先级
- [x] 1.2 明确 system default / command-type default / per-command override 三层关系
- [x] 1.3 明确与现有 `notifyOnAck` 的兼容/迁移策略

## 2. Contract And Runtime
- [x] 2.1 定义 API 契约如何暴露 success-notification policy
- [x] 2.2 定义 worker 在不同策略下的 `COMMAND_ACKED` 通知行为
- [x] 2.3 定义 Desk/Web 的最小消费方式

## 3. Proof And Rollout
- [x] 3.1 定义策略级 proof（而不是单一布尔值 proof）
- [x] 3.2 定义现有 `notifyOnAck` proof 如何迁移或保留
- [x] 3.3 更新文档与阶段总表入口
