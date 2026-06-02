---
title: softcom-original-long-form-work-intro
type: note
tags:
- reference
- competition
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/softcom-original-long-form-work-intro
---

# Reference: softcom-original-long-form-work-intro

## Purpose

Preserve the original user-provided long-form SoftCom competition work intro verbatim so later sessions can restore it or derive shorter variants without losing the baseline wording.

## Files

- `docs/competition/2026-softcom-application-master-draft.md` - derived competition draft variants
- `docs/competition/2026-softcom-work-positioning-draft.md` - derived positioning and submission variants
- `memory/decisions/lock-softcom-competition-naming-and-ai-expression-strategy.md` - naming and AI expression strategy decision

## Notes

- This note stores the original long-form intro exactly as provided by the user.
- Do not normalize wording here; treat it as the long-form source text for future comparison and restoration.

## Canonical Text

```text
本作品面向人工智能+地质灾害防治场景，聚焦山体滑坡监测预警中事件样本稀缺、数据源分散且标签不足，不同区域诱因机制与演化特征差异显著导致模型与阈值难迁移复用，多源监测数据难形成统一判据，以及位移趋势与风险等级难以前置识别、现场链路稳定性与数据可信度难持续保障等痛点，依托 TX-SMART-R 与 OpenHarmony/SwanLinkOS，构建集边缘侧感知节点、边缘网关、云端分析平台、桌面/Web可视化于一体的山体滑坡智能防灾系统。作品以位移监测、位移预测和风险预警为核心，在团队既有地质形变监测、多传感采集、MQTT 上报、边云协同处理和可视化架构基础上，进一步引入位移预测模型、预警判别模型、YOLO视觉辅助识别模型和轻量化数据链健康模型，形成灾害体监测 +数据链监测双对象协同的多模型智能体系。其中，边缘协同层面向 RK3568 构建自托管边缘网关（self-hosted gateway）与智能体原生协同运行机制（agent-native runtime），具备多节点任务路由、状态记忆、健康摘要生成与本地快速响应能力，并在其上部署面向数据链健康监测的轻量化边缘智检机制；；位移预测模型用于识别位移变化趋势与异常加速度，预警判别模型用于输出风险等级与预警建议，YOLO 模型用于提供裂缝、坡表异常和落石风险等视觉证据，数据链健康模型则用于对传感器状态、上传延迟、丢包、异常波动和链路退化进行实时智检与快速响应；同时系统融合不同地区公开数据源、现场监测数据和系统运行数据，构建区域数据库 + 数据治理 + 区域模型库 + 模型 匹配 + 持续训练的智能演进闭环，实现按区域自适应训练、按场景智能匹配、按链路实时智检、按反馈持续优化。作品目标是推动滑 坡监测系统从传统规则告警升级为具备区域迁移能力、多模态融合能力、边缘智能能力和持续学习能力的面向人工智能+地质灾害防治的新一代AI主动预测预警平台。
```
