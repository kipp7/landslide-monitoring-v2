---
title: hermes-edge-supervisor-stress-latest
type: report
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/hermes-edge-supervisor-stress-latest
---

# RK3568 Hermes 边缘智能监督压测报告

## 测试对象

- 设备：RK3568 边缘网关
- 主机：`192.168.124.179`
- 服务：`lsmv2-hermes-edge-supervisor.service`
- 接口：
  - `GET /v1/supervision`
  - `POST /v1/actions/recheck`
- 模型：`RandomForestClassifier`
- 模型任务：`edge_link_diagnosis`
- 模型特征数：`64`

## 测试方法

- 脚本：`scripts/dev/stress-hermes-edge-supervisor.mjs`
- 运行位置：RK3568 板端本机
- 压测目标：`http://127.0.0.1:18082`
- 持续时间：`30s`
- 并发数：`12`
- 动作混合：每 `30` 个请求触发一次 `POST /v1/actions/recheck`
- 超时阈值：`5000ms`

## 核心结果

| 指标 | 结果 |
| --- | ---: |
| 总请求数 | `8143` |
| 成功请求数 | `8143` |
| 无效/失败请求数 | `0` |
| 错误率 | `0` |
| 吞吐 | `271.254 rps` |
| 平均时延 | `43.602 ms` |
| P50 时延 | `37.785 ms` |
| P90 时延 | `63.434 ms` |
| P95 时延 | `72.650 ms` |
| P99 时延 | `94.818 ms` |
| 最大时延 | `329.502 ms` |

## 分接口结果

| 接口 | 请求数 | 成功数 | 错误数 | 平均时延 | P95 | P99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `GET /v1/supervision` | `7872` | `7872` | `0` | `42.333 ms` | `67.308 ms` | `82.998 ms` |
| `POST /v1/actions/recheck` | `271` | `271` | `0` | `80.462 ms` | `111.040 ms` | `138.808 ms` |

## AI 与安全边界验证

- `aiDiagnosis.modelLoaded=true`
- `aiDiagnosis.diagnosisType=center_mqtt_route_unreachable`
- `aiDiagnosis.confidence=0.992188`
- `aiDiagnosis.featureVector` 实际输出 `64` 个特征
- `aiModels[]` 注册输出存在，当前模型数 `1`
- `actionInterface.naturalLanguageReady=true`
- `recheck` 动作返回：
  - `safetyGatewayCoreTouched=false`
  - `safetySerialTouched=false`
  - `safetyMqttTouched=false`

## 可写入材料的表述

系统在 RK3568 边缘网关上部署 Hermes 式边缘智能监督 sidecar，并在板端执行 30 秒并发压测。测试同时覆盖状态读取与安全复检动作，累计完成 `8143` 次请求，错误率为 `0`，整体吞吐达到 `271.254 rps`，P95 时延为 `72.650 ms`。压测期间，64 特征随机森林链路诊断模型持续加载并返回稳定诊断结果，安全动作接口明确不触碰串口、MQTT 上行和 `field-gateway` 主链路。

## 注意边界

- 该压测证明的是 RK3568 Hermes 边缘监督 sidecar 的接口承载能力和安全动作边界。
- 当前模型是边缘链路诊断模型，不是滑坡位移预测模型。
- 当前压测不是全平台端到端吞吐，也不代表中心数据库、桌面端或 MQTT Broker 的整体容量上限。

## 原始报告

- JSON：`docs/unified/reports/hermes-edge-supervisor-stress-latest.json`
