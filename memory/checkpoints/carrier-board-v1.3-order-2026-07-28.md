---
title: carrier-board-v1.3-order-2026-07-28
type: note
tags:
  - checkpoint
  - hardware
  - pcb
  - fabrication
status: active
---

# Checkpoint: carrier-board-v1.3-order-2026-07-28

## Objective

保存现场节点载板 V1.3 从设计修改、Gerber 核对、元件采购到 5 片样板下单的可恢复状态，供生产稿确认、来料检查和 EVT 使用。

## Last Confirmed State

- 订单 Gerber 生成于 2026-07-28 17:56:28，SHA-256 为 `967402A2F04DEEC3FD298FA6D385FE747A5DA8E5400408861A87E9B182015A53`。
- 17:56 包与已深度检查的 17:16 包飞针网表完全相同；差异仅为时间戳和等效光圈定义/编号。
- 只有 `U5.7: NET_53 -> GND` 与 `U8.7: NET_54 -> GND` 两个实际器件网络发生预期变化；其余 176 个实际引脚保持一致。
- `U5.7 -> D1.3`、`U8.7 -> D2.3` 的 1.1 mm 地线已进入系统地；非 GND 网络连续，未发现跨网络铜短路。
- 板框为 170 x 115 mm；235 个过孔、350 个含过孔的 PTH 坐标、10 个 NPTH 坐标；GPS 两个固定孔和所有 3.2 mm NPTH 保留。
- V1.3 新增并确认的单板器件为：2 x SM712、1 x BAT54S、2 x MF-MSMF020-2、100k/27k/1k 各 1、100nF 0603 1 个。R2/R3 仍为已有 4.7k 0805。
- 5 片 PCB 订单已经提交；生产参数和归档文件记录在 `hardware/carrier-board/production/v1.3/README.md`。

## In Progress

- 等待嘉立创生产稿和制造。
- 普通顶层丝印 GTO 未确认包含 Logo；彩色丝印数据存在，但最后报告使用普通白板黑字工艺。
- 最终可编辑工程、原理图和最终 DRC 日志尚未重导出；现有 14:45/14:38 文件早于最后补地。

## Next Actions

- 检查生产稿中的 Logo、版本文字、端子标识、板框和 10 个 NPTH 孔；发现缺失时在厂家确认阶段拦截。
- 从最终 EasyEDA 工程重新导出 `.epro2`、原理图 PDF、BOM 和 DRC 日志，并与订单包飞针网表逐项对照。
- 来料后核对板厚、铜厚、阻焊/字符颜色、孔径、端子孔距、GPS 固定孔和 U5/U8 半孔焊盘。
- 首板只装保护与电池采样小器件，先做电阻/短路/电压检查，再安装模块。
- 完成 VBAT 标定、CH1/CH2 短路恢复、双路 RS485 并发、72 小时稳定性和温升测试。

## Risks

- 共地方案旁路隔离模块的电气隔离，室外地环路和浪涌风险尚未通过 EVT/DVT。
- 普通丝印订单可能不打印仅存在于彩色丝印载荷中的 Logo。
- 可编辑源文件落后于制造 Gerber，若不立即重导出会形成不可维护的设计分叉。
- 当前版本没有 DL-XLS1 独立负载开关、SHIELD/PE、一级防雷和独立测试点。

## Resume Prompt

继续 V1.3 样板交付：先读取 `hardware/carrier-board/production/v1.3/README.md`、`memory/decisions/2026-07-28-carrier-board-v1.3-order-baseline.md` 和本检查点；确认厂家生产稿与最终源文件状态，再执行来料检查和 EVT，禁止把已下单等同于已通过制造发布。
