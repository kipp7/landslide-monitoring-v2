---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/services/field-link-monitor/readme
---

# field-link-monitor（RK3568 本地链路质量 sidecar v1）

本服务是 RK3568 的第一版本地只读 sidecar。

它当前只负责：

- 读取 `field-gateway` 本地 `runtime-health.json`
- 读取 `network bootstrap` 本地 `runtime-status.json`
- 生成一份本地链路质量摘要
- 生成一份 OpenClaw/Hermes 可消费的只读自动化监督计划
- 暴露 localhost HTTP 只读接口

它明确不负责：

- southbound 串口采集
- MQTT 主链转发
- Wi-Fi / 热点切换执行
- 命令下发
- OpenClaw 推理
- 自动重启 `field-gateway` 或接管主链路

也就是说，它是边缘质量观察层，不是 gateway core。

## 环境变量

参考：`services/field-link-monitor/.env.example`

- `SERVICE_NAME`：默认 `field-link-monitor`
- `GATEWAY_HEALTH_FILE_PATH`：默认 `/var/lib/lsmv2/field-gateway/health/runtime-health.json`
- `NETWORK_STATUS_FILE_PATH`：默认 `/var/lib/lsmv2/network-bootstrap/status/runtime-status.json`
- `SUMMARY_FILE_PATH`：本地摘要输出文件
- `HTTP_HOST`：默认 `127.0.0.1`
- `HTTP_PORT`：默认 `18081`
- `POLL_INTERVAL_MS`：轮询本地状态文件周期
- `PUBLISH_FRESHNESS_MS`：本地上行 freshness 预算
- `SOURCE_STALE_AFTER_MS`：源状态文件过旧预算

## 本地输出

默认输出：

- 摘要文件：
  - `./data/field-link-monitor/status/summary.json`
- HTTP：
  - `GET /healthz`
  - `GET /v1/summary`
  - `GET /v1/automation`

摘要结构当前固定为：

- `summary.overallLevel`
- `summary.score`
- `summary.networkMode`
- `summary.serialOpen`
- `summary.mqttConnected`
- `summary.portStatus`
- `summary.interleavingSuspected`
- `dimensions[]`
- `sources.gatewayHealth`
- `sources.networkStatus`
- `automation`
  - `mode = rk3568-edge-supervision-plan`
  - `tasks[]`
  - `governance.openClawHermesBoundary = consume-read-only-plan`
  - `governance.gatewayCoreProtected = true`

共享口相关信号当前分两层输出：

- `dimensions.parser_noise`
  - 读取 `schemaRejected / rejectedMessages / rejectedWriteFailures`
- `dimensions.source_interleaving`
  - 读取 `interleavingSuspected / interleavingWithMultipleSchemas / interleavingWithMultipleDeviceIds`

## 当前运行口径

- `accepted = true` 表示：
  - sidecar 自己能读到两份本地源文件
  - sidecar 已经完成本地摘要生成
- 真正链路质量以：
  - `summary.overallLevel`
  - `dimensions[]`
  为准
- 这意味着：
  - sidecar 自己健康
  - 不等于 field uplink 主链绝对绿色
- `/v1/automation` 表示：
  - 面向 OpenClaw/Hermes/本地屏幕的“监督计划”
  - 默认只读和建议优先
  - `southbound_serial`、`northbound_publish` 等主链路问题只生成告警/取证/人工动作，不允许 sidecar 自动接管串口采集或重启网关

## OpenClaw / Hermes 接入边界

OpenClaw/Hermes 只能作为 RK3568 Layer 4 sidecar 消费本服务输出：

- 推荐入口：`GET http://127.0.0.1:18081/v1/automation`
- 备选入口：`GET http://127.0.0.1:18081/v1/summary`

允许做：

- 展示链路等级、节点状态、共享口噪声、上行新鲜度
- 将 `automation.tasks[]` 转换为本地屏幕提示、运维派工、日志取证清单
- 对自身 sidecar 组件做安全重启或日志采集

禁止做：

- 直接读取或抢占 `/dev/ttyS3`
- 替代 `field-gateway` 发布 MQTT
- 自动重启 `lsmv2-field-gateway.service`
- 自动切换 Wi-Fi / AP 模式
- 修改 `field-gateway` 的 spool 或 health 文件

## 本地运行

1. 安装依赖：

- `npm install`

2. 构建：

- `npm run build --workspace @lsmv2/field-link-monitor`

3. 进入服务目录并准备环境：

- `cd services/field-link-monitor`
- 复制 `.env.example` 为 `.env`

4. 启动：

- `node dist/index.js`

## RK3568 常驻部署

部署件：

- `services/field-link-monitor/deploy/field-link-monitor.service.template`
- `services/field-link-monitor/deploy/field-link-monitor.env.rk3568.example`
- `services/field-link-monitor/deploy/install-rk3568-field-link-monitor.sh`
- `services/field-link-monitor/deploy/check-rk3568-field-link-monitor.sh`

在 RK3568 仓库根目录执行：

```bash
sudo bash services/field-link-monitor/deploy/install-rk3568-field-link-monitor.sh
```

常用检查：

```bash
sudo systemctl status lsmv2-field-link-monitor --no-pager
sudo journalctl -u lsmv2-field-link-monitor -n 100 --no-pager
cat /var/lib/lsmv2/field-link-monitor/status/summary.json
curl -fsS http://127.0.0.1:18081/v1/summary
curl -fsS http://127.0.0.1:18081/v1/automation
bash services/field-link-monitor/deploy/check-rk3568-field-link-monitor.sh
```

Windows 主机当前推荐入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\install-rk3568-field-link-monitor.ps1 -Password linaro
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-link-monitor.ps1 -Password linaro
```

## 当前非目标

第一版 sidecar 仍然不负责：

- 告警派发
- 图形界面
- 长期历史存储
- OpenClaw 模型加载与推理
- 把本地质量状态反向写回 gateway

后续如果接入显示屏或 OpenClaw，只允许先读取这份 sidecar 摘要，不允许直接侵入 `field-gateway` 主链。
