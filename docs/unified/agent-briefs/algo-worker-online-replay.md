# 任务简报：algo-worker-online-replay

## 当前状态

- 第四轮任务
- 当前状态：`ready`

## 当前目标

- 将 replay 样例从离线校验推进到在线 worker / 链路级验证

## 重点任务

- 基于现有 replay 样例与桥接脚本
- 尝试把样例送入 worker 或相关链路
- 记录：
  - 在线执行入口
  - 真实输出
  - 与预期断言的差异

## 立即执行

- 先更新：`docs/unified/reports/algo-worker-online-replay.md`
- 再补一条 `docs/journal/2026-03.md` checkpoint
- 没有这两项落盘，不算完成

## 边界

- 不扩展成大规模模型训练或算法重写
- 先做“样例能不能在线跑通”

## 输出物

- 在线回放方案
- 在线验证结论
- `docs/unified/reports/algo-inventory.md`
