# 任务简报：desk-http-live-validation

## 当前状态

- 第三轮任务
- 当前状态：`ready`

## 当前目标

- 在 Desk API adapter 已实现并通过本地 HTTP 烟测后
- 对真实 API 做首轮联调验证

## 重点任务

- 使用真实 `api-service` 或已启动基础设施环境
- 验证：
  - 登录
  - dashboard
  - stations
  - devices
  - baselines
  - gps deformations
  - system status
- 记录哪些能通、哪些字段不一致、哪些接口仍缺契约

## 边界

- 先做联调验证
- 不要在本轮顺手大改页面
- 不要把真实联调问题直接混成新架构任务

## 输出物

- 真实联调结论
- 接口问题清单
- `docs/unified/reports/desk-api-align.md`
