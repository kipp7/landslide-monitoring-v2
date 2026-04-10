---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-network-bootstrap/design
---

## Context

当前 RK3568 已具备：

- `lsmv2-field-gateway.service` 主链运行
- `routine guard` 生产侧守护闭合
- `STA first, AP fallback` 的 authority 文档结论

但仍缺少一个工程上可执行、可复跑、可观测的“开机网络/bootstrap”层。

## Goals

- 把 `STA first, AP fallback` 从文档基线提升为工程规范
- 保证 RK3568 在重启后能自动进入：
  - 正常联网网关模式
  - 或维护热点模式
- 保持网关主链与网络/bootstrap 逻辑解耦
- 为未来 `OpenClaw` 数据链质量监控 sidecar 和软件端 `RK3568` 群组状态监控预留稳定接入边界

## Non-Goals

- 不改现有 MQTT / telemetry / command 契约
- 不把显示/UI/model sidecar 并入主网关进程
- 不要求当前阶段做复杂本地 Web 配网界面
- 不在本轮实现本地模型推理、质量评分算法或软件侧群组页面

## Decisions

### Decision: Separate network/bootstrap management from gateway core

网络/bootstrap 逻辑与 `field-gateway` 主进程分离。

原因：

- 网关主链职责应继续聚焦 `serial -> validate/reconstruct -> spool -> MQTT`
- 网络失败恢复、热点回退、配置切换属于设备管理，不应污染主链代码

### Decision: `STA first, AP fallback` is the only accepted startup policy

默认启动顺序固定为：

1. 基础 systemd / local prerequisites
2. Wi-Fi STA 自动连接窗口
3. 成功则进入正常网关模式
4. 失败则进入 AP fallback

### Decision: AP fallback is maintenance-only

热点固定名：

- `rk3568-1`

热点角色仅为：

- SSH 维护入口
- 配网入口
- 故障恢复入口

不作为正式业务承载网络。

### Decision: sidecars must never own southbound serial or block gateway startup

显示/UI/model sidecar 必须：

- 依赖 bootstrap 和 gateway 健康后再启动
- 不能占有 `/dev/ttyS3`
- 不能阻塞 `lsmv2-field-gateway.service`

### Decision: OpenClaw quality monitoring must be a read-only sidecar on first introduction

未来若在 RK3568 上部署 `OpenClaw` 做数据链质量监控，第一版必须满足：

- 只读取 gateway/runtime/bootstrap 的本地健康与统计结果
- 不直接接管 southbound serial
- 不直接改写 MQTT 主上行
- 不直接成为命令主入口

这保证后续可以先做“监控/评分/建议”，再决定是否进入闭环控制。

### Decision: software-side RK3568 group monitoring must consume stable board/runtime facts

未来软件端若增加 `RK3568` 群组状态监控，第一版应只消费稳定的板端事实，例如：

- 当前网络模式：`STA` / `AP fallback`
- gateway 进程是否健康
- 最近 publish activity
- `spoolPending`
- `rejectedWriteFailures`
- southbound node status summary

而不是直接依赖临时调试日志或板端私有实现细节。

## Risks / Trade-offs

- 若板端 Wi-Fi 管理工具差异较大，第一版实现需要显式限定支持环境
- AP fallback 会增加系统复杂度，因此必须保持为最小实现，不做业务承载
- 网络/bootstrap latest 报告应串行刷新，避免与现有 `latest.json` 冲突
- 若未来 sidecar 边界不先冻结，`OpenClaw` 或软件群组监控很容易反向侵入主链，导致网关职责再次膨胀

## Migration Plan

1. 先冻结 spec
2. 再增加 deploy assets 与 installer
3. 最后补 runtime proof 与 runbook/operator line
