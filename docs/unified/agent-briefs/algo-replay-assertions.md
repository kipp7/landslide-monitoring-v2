# 任务简报：algo-replay-assertions

## 当前状态

- 第三轮任务
- 当前状态：`ready`

## 当前目标

- 基于已有 replay 样例
- 为关键算法补断言与执行脚本建议

## 重点任务

- 选择最关键的 replay 样例
- 为每个 replay 样例明确：
  - 期待输出
  - 核心断言
  - 执行入口
- 如可行，补最小执行脚本设计

## 边界

- 不做大规模算法重写
- 不扩成模型优化任务
- 重点是让 replay 样例真正可执行、可判定

## 输出物

- replay 断言清单
- 执行脚本建议或最小脚本
- `docs/unified/reports/algo-inventory.md`
