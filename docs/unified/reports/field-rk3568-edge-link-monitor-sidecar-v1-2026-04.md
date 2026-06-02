---
title: field-rk3568-edge-link-monitor-sidecar-v1-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-edge-link-monitor-sidecar-v1-2026-04
---

# RK3568 边缘链路质量 Sidecar V1

## 目标

把 RK3568 的本地链路质量观察层从“Windows 主机侧 latest 报告”推进到“板端常驻只读 sidecar”，为后续：

- 显示屏
- OpenClaw
- 本地运维页

提供统一输入，而不侵入 `field-gateway` 主链。

## 当前实现

- 服务：
  - `services/field-link-monitor`
- 输入：
  - `/var/lib/lsmv2/field-gateway/health/runtime-health.json`
  - `/var/lib/lsmv2/network-bootstrap/status/runtime-status.json`
- 输出：
  - `/var/lib/lsmv2/field-link-monitor/status/summary.json`
  - `http://127.0.0.1:18081/healthz`
  - `http://127.0.0.1:18081/v1/summary`

## 当前边界

它当前只负责：

- 读取本地状态文件
- 归一化成本地质量摘要
- 暴露 localhost 只读接口

它当前不负责：

- southbound 串口接入
- MQTT 发布或命令转发
- 自动修复
- 告警派发
- OpenClaw 推理

## 当前摘要口径

当前 sidecar 摘要固定暴露：

- `gateway_health_source`
- `network_status_source`
- `network_bootstrap`
- `southbound_serial`
- `northbound_publish`
- `parser_noise`
- `node_a`
- `node_b`
- `node_c`

当前摘要字段固定包含：

- `summary.overallLevel`
- `summary.score`
- `summary.networkMode`
- `summary.serialOpen`
- `summary.mqttConnected`
- `summary.portStatus`
- `summary.spoolPending`
- `summary.rejectedWriteFailures`
- `summary.lastPublishedAgeSeconds`

## 当前运维语义

- `accepted = true`
  - 表示 sidecar 自己能读到本地输入并输出摘要
  - 不表示 field uplink 主链自动 green
- 真实边缘质量以：
  - `summary.overallLevel`
  - `dimensions[]`
  为准

## 当前部署件

- `services/field-link-monitor/deploy/field-link-monitor.service.template`
- `services/field-link-monitor/deploy/field-link-monitor.env.rk3568.example`
- `services/field-link-monitor/deploy/install-rk3568-field-link-monitor.sh`
- `services/field-link-monitor/deploy/check-rk3568-field-link-monitor.sh`

## 下一步

- 把这个 sidecar 接成 RK3568 本地状态页的统一输入
- 保持 `OpenClaw` 只读消费它的摘要，不直接读取主链运行目录
- 如需后续告警或提示，优先挂在 sidecar 上，不反向修改 `field-gateway`
