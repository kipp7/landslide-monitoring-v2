---
title: field-node-hardware-repository-sync-2026-07-24
type: note
tags:
  - checkpoint
  - hardware
  - repository
status: complete
---

# Checkpoint: field-node-hardware-repository-sync-2026-07-24

## Objective

把现场节点外壳、内安装结构、倾角基准、太阳能供电、PCB 改版输入和采购建议整理为可审查、可追溯的仓库资料，并同步到独立远端分支，避免污染本地主工作区。

## Last Confirmed State

- 硬件入口统一为 `hardware/README.md`，现场节点资料位于 `hardware/field-node/`。
- 当前集成版本为 `FIELD-NODE-HW-EVT0.1`，外壳、供电和采购均未放行制造。
- 比赛版继续使用 `320 x 240 x 145 mm` 防水箱、异形 3 mm FR4/G10 主安装板和 `120 x 85 x 3 mm` 304 倾角小基准板。
- 已记录生产 Gerber 的真实 PCB 外形为 `170 x 115 mm`，并标明现有原理图、BOM 与模块版实物不一致。
- 持久任务和结构决策分别记录在 `memory/tasks/2026-07-23-hardware-productization.md` 与 `memory/decisions/2026-07-24-field-node-competition-enclosure.md`。
- 本次公开资料不包含聊天截图、第三方手册、临时 Gerber 解压目录、PDF 页面渲染或本机运行状态。
- 仓库同步分支为 `docs/hardware-field-node-evt0-1`；提交和推送完成后，以远端分支状态为准。

## In Progress

- 硬件产品化任务仍处于尺寸采集和样机验证阶段，并非制造冻结。
- FR4 最终异形轮廓、箱体支撑孔坐标、倾角小板到 FR4 的四点支撑孔、电池尺寸和线缆直径尚未实测冻结。
- `CN3791` 3S 12.6 V 成品充电模块仍是样机采购候选，需要台架验证后才能确定。

## Next Actions

- 用 PET/PP 模板转印箱体内轮廓，测量支撑孔坐标、直径、深度和是否贯通。
- 补齐电池外形、BMS、线缆外径和太阳能板边框孔位。
- 生成 FR4 主板和倾角基准板 DXF，并在首件装配后回写实际版本。
- 完成充电模块的终止电压、夜间反灌、温升和 24 小时功耗测试。
- 从 V1.2 实物重建模块版原理图和完整 BOM，再启动 R1.3 PCB 设计。

## Risks

- 商家给出的箱体轮廓尺寸不能代替实物孔位，直接下单矩形 FR4 可能无法装入。
- 箱内倾角方案用于比赛一致性，但箱体与外部支架未验证前不能视为长期现场测量基准。
- 候选太阳能充电模块的商品页参数不一致，必须按实物测试放行。
- 现有 carrier-board 资料内部不一致，禁止直接复投生产。

## Resume Prompt

继续现场节点硬件产品化：先读取 `memory/tasks/2026-07-23-hardware-productization.md`、`memory/decisions/2026-07-24-field-node-competition-enclosure.md` 和 `hardware/field-node/REVISION.md`，核对远端 `docs/hardware-field-node-evt0-1` 分支状态，再从箱体与电池实测尺寸开始推进，不把 EVT0.1 概念资料当作制造图。
