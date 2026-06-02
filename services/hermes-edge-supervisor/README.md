---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/services/hermes-edge-supervisor/readme
---

# hermes-edge-supervisor（RK3568 Hermes 式边缘任务托管 sidecar）

本服务是 RK3568 上的 Hermes Plane 最小落地版本。

它负责：

- 读取 `field-link-monitor` 的 `GET /v1/automation`
- 读取 `field-link-monitor` 的 `GET /v1/summary` 作为模型特征源
- 将链路质量任务转成 Hermes 式托管计划
- 加载轻量化随机森林诊断模型，输出 `aiDiagnosis`
- 以 `aiModels[]` 形式暴露模型注册输出，方便后续追加更多边缘模型
- 暴露安全动作接口，供显示屏/自然语言层触发只读复检和报告生成
- 写出本地监督状态文件
- 暴露 localhost HTTP 接口

它明确不负责：

- 串口采集
- MQTT 主链转发
- Wi-Fi / AP 切换
- 自动重启 `field-gateway`
- 修改 gateway health / spool 文件
- 直接执行现场危险动作

## 运行边界

当前架构固定为：

- `field-gateway`：核心采集、spool、MQTT 上行
- `field-link-monitor`：只读链路质量摘要与自动化任务计划
- `hermes-edge-supervisor`：读取任务计划，形成 Hermes 式巡检/诊断/派工视图

如果 `hermes-edge-supervisor` 异常退出，主链路仍应继续运行。

## HTTP

- `GET /healthz`
- `GET /v1/supervision`
- `GET /v1/intent-catalog`
- `GET /v1/actions`
- `POST /v1/actions/recheck`
- `POST /v1/actions/collect_logs`
- `POST /v1/actions/generate_report`

默认监听：

- `127.0.0.1:18082`

## 输出文件

默认输出：

- `/var/lib/lsmv2/hermes-edge-supervisor/status/supervision.json`

关键字段：

- `summary.overallLevel`
- `summary.taskCount`
- `summary.blockedCount`
- `hermesPlan.nextTasks[]`
- `aiDiagnosis.modelType = random_forest_classifier`
- `aiDiagnosis.diagnosisType`
- `aiDiagnosis.confidence`
- `aiDiagnosis.featureVector`
- `hermesPlan.executionPolicy = advisory_first`
- `hermesPlan.protectedCore.gatewayCore = true`
- `aiModels[]`
- `actionInterface.mode = safe_intent_router`

模型当前特征覆盖：

- 链路状态：串口、MQTT、端口状态、发布新鲜度、spool 积压
- 网络状态：STA/以太网/AP fallback、网络错误、中心 Broker 可达性错误特征
- 来源健康：gateway/network 状态文件是否存在、是否报错、是否陈旧
- 节点状态：节点在线/配置/离线数量、遥测数量、命令转发、ACK 发布、最近遥测年龄
- 解析质量：rejected、write failure、interleaving
- Agent 任务：critical/blocked/safe-automatable 任务数量
- 板端资源：CPU load、内存可用率、磁盘可用率、最高温度、资源压力标记

当前模型版本特征数：`64`。

## 轻量 AI 模型

当前模型产物：

- `services/hermes-edge-supervisor/models/edge-diagnosis-rf-v1.json`

该模型由 `scripts/dev/train-hermes-edge-diagnosis-model.py` 训练生成，模型类型为 `RandomForestClassifier`。板端 TypeScript sidecar 直接加载序列化后的森林参数做本地推理，不依赖云端大模型。

训练报告：

- `docs/unified/reports/hermes-edge-diagnosis-model-training-latest.json`

## 显示屏 / 自然语言接入方式

`RandomForestClassifier` 只负责链路诊断，不负责听懂自然语言。后续显示屏或语音/文本 Agent 应先把自然语言意图映射到安全动作，再调用 Hermes sidecar：

```bash
curl -fsS http://127.0.0.1:18082/v1/intent-catalog
curl -fsS -X POST http://127.0.0.1:18082/v1/actions/recheck \
  -H 'Content-Type: application/json' \
  -d '{"intent":"检查一下链路","requestedBy":"local-display"}'
```

动作接口的边界：

- `recheck`：刷新只读来源，重新执行模型诊断
- `collect_logs`：返回建议采集哪些日志，不直接执行危险命令
- `generate_report`：返回当前监督摘要
- 禁止自动重启 `field-gateway`
- 禁止占用 `/dev/ttyS3`
- 禁止接管 MQTT 上行

## RK3568 部署

在 RK3568 仓库根目录执行：

```bash
sudo bash services/hermes-edge-supervisor/deploy/install-rk3568-hermes-edge-supervisor.sh
```

常用检查：

```bash
sudo systemctl status lsmv2-hermes-edge-supervisor --no-pager
cat /var/lib/lsmv2/hermes-edge-supervisor/status/supervision.json
curl -fsS http://127.0.0.1:18082/v1/supervision
bash services/hermes-edge-supervisor/deploy/check-rk3568-hermes-edge-supervisor.sh
```

## 压测

板端压测脚本：

```bash
node scripts/dev/stress-hermes-edge-supervisor.mjs \
  --base-url http://127.0.0.1:18082 \
  --duration-seconds 30 \
  --concurrency 12 \
  --recheck-every 30 \
  --timeout-ms 5000 \
  --label rk3568-hermes-supervisor-30s-c12 \
  --out docs/unified/reports/hermes-edge-supervisor-stress-latest.json
```

最新压测结论：

- 总请求数：`8143`
- 错误率：`0`
- 吞吐：`271.254 rps`
- P95：`72.650 ms`
- P99：`94.818 ms`
- `recheck` 成功数：`271`
- 安全边界：不触碰 gateway core、serial、MQTT
