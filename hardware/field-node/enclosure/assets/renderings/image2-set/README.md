# Image 2 Engineering Reference Set

状态：`IMAGE2-R0.2 / 已验收沟通图；内部板结构对应 MECH-R0.2-DRAFT 历史`

本目录只接收使用 `gpt-image-2` 生成并通过项目结构检查的 4K 图片。工程尺寸仍以同级目录的确定性 SVG/PNG 工程图为准。

| 序号 | Image 2 原图 | 工程标注版 | 工程用途 | 验收状态 |
| --- | --- | --- | --- | --- |
| 01 | `01-integrated-exterior-image2-4k.png` | `01-integrated-exterior-image2-annotated-4k.png` | 一体式太阳能板、防水箱、共背架和 GNSS 固定侧翼外观 | 通过 |
| 02 | `02-open-enclosure-image2-4k.png` | `02-open-enclosure-image2-annotated-4k.png` | 箱内模块分区、独立倾角小基准板、电池/充电/保险区域 | 通过 |
| 03 | `03-exploded-mounting-image2-4k.png` | `03-exploded-mounting-image2-annotated-4k.png` | FR4 主板、PCB、电池托盘、四点支撑和局部 304 小板爆炸层级 | 通过 |

`overlays/` 保存三张工程标注的可编辑 SVG 图层。标注版用于评审时快速区分“已确认结构关系”和“待实测输入”；原图保持不变，便于追溯 Image 2 输出。

## 验收边界

- 外部图必须只有一块太阳能板、一个防水箱、一根共背架和一个 BT-760/BT-M87SF 侧翼平台。
- 内部图必须体现一个 RK2206 载板系统、一个 SC16IS752、两路隔离 RS485、一个倾角传感器、一个电池区域和一个充电保护区域，不得加入 RK3568 或告警终端。
- 爆炸图中的 `120 x 85 mm` 304 小板只能是旧 `265 x 185 mm` FR4 上的局部基准板，不得画成整块金属底板；该内部板外形已被 `MECH-R0.3-DRAFT` 的 `272 x 193 mm` 矩形试配方向替代。
- 所有图片均为工程沟通与装配评审参考，不能从模型生成细节反推孔位、公差或材料牌号。

## 已拒绝输出

- 第一版内部图：虚构多块模块并改变载板结构。
- 第一版爆炸图：把局部 304 小板放大成接近整块底板。

## 下一轮增补

`BT-760 / BT-M87SF` 侧翼平台局部 Image 2 图因中转上游临时不可用尚未生成。该接口当前以 `../../06-gnss-side-platform-detail.svg` 和对应 PNG 作为工程真值。
