# 现场节点约束渲染提示词

状态：`REFERENCE RENDER ONLY / 非制造依据`

这些提示词只用于把已审查的工程图转换成便于沟通的外观示例。模型生成图不得反向定义尺寸、孔位、模块型号或装配方法。

## 外部整机工作状态

```text
Use case: product-mockup
Asset type: engineering product visualization for the landslide monitoring field node
Input images: Image 1 is the authoritative external arrangement drawing; Image 2 is the authoritative GNSS side-platform detail. Preserve their component relationships.
Primary request: Create a realistic 4K three-quarter front engineering product render of the competition field-node assembly.
Scene/backdrop: neutral light gray studio floor and background, no landscape, no people.
Subject: one integrated assembly consisting of exactly one SWM-10W solar panel, one light-gray waterproof enclosure, one rigid dark-gray common rear spine/back-frame, and one BT-760 GNSS antenna on a fixed side outrigger using a BT-M87SF-style flange base.
Composition/framing: show the entire assembly, front and right side visible, enough margin around all parts.
Materials/textures: real anodized aluminum or stainless brackets, matte PC/ABS enclosure, blue-black monocrystalline panel, clean black outdoor cable.
Constraints: solar panel and enclosure are independently supported by the common back-frame; solar panel is above the enclosure and does not load the plastic lid; GNSS antenna is offset to the side and its top is above the panel obstruction line; keep a visible service gap between panel and enclosure; one-piece competition assembly; believable fasteners and cable strain relief; preserve the major proportions 290 x 240 panel versus 320 x 240 x 145 enclosure.
Avoid: no extra pole separate from the assembly, no screen, no fan, no camera, no warning light, no second enclosure, no invented labels, no floating parts, no solar panel covering the GNSS antenna, no antenna mounted on the flexible enclosure lid, no decorative sci-fi styling, no watermark, no text.
```

## 开箱内部装配状态

结果：`REJECTED / 不纳入设计资产`。Image 2 输出擅自增加模块并改变载板结构；保留提示词只用于复盘，箱内设计以确定性工程图为准。

## IMAGE2-R0.1 通过条件

`renderings/image2-set/` 的三张图以工程 SVG/PNG 为参考：外观图锁定共背架和侧翼天线；开箱图锁定一个载板、两路隔离 RS485、局部倾角钢板与电池/充电区域；爆炸图锁定 `265 x 185 mm` FR4 和仅 `120 x 85 mm` 的局部 304 小板。所有没有通过这些关系检查的输出都不得进入该目录。

```text
Use case: product-mockup
Asset type: engineering product visualization for enclosure assembly review
Input images: Image 1 is the authoritative internal packing study; Image 2 is the authoritative exploded mounting view; Image 3 is the power and signal architecture reference. Preserve the listed modules and separation.
Primary request: Create a realistic 4K top-down oblique product render of the opened 320 x 240 x 145 mm field-node waterproof enclosure.
Scene/backdrop: neutral engineering workbench, clean and evenly lit.
Subject: the open enclosure contains an irregular 3 mm FR4/G10 removable main plate, one 170 x 115 mm carrier PCB, RK2206 plug-in board, DL-XLS1 radio, UM220-IV NK GNSS receiver, one SC16IS752 module, exactly two isolated RS485 modules, a 3S 11.1 V 5000 mAh battery in a rigid flame-retardant tray with two straps, one complete CN3791 3S 12.6 V solar charging module, fuse and XT30 service disconnect, covered wiring duct, and one 90 x 58 x 36 mm tilt sensor mounted on a local 120 x 85 x 3 mm stainless reference plate with four-point support.
Composition/framing: show all internal areas and the lower cable-entry side; do not crop the enclosure.
Materials/textures: green PCB and modules, amber tilt sensor, dark battery pack, blue FR4 plate, brushed stainless local subplate, labeled but text-free wire colors and ferrules.
Constraints: no full-size steel bottom plate; PCB and electronics are mechanically fixed to FR4; tilt sensor alone uses the local stainless subplate; power, signal, and RF areas are visually separated; terminal directions face the lower cable-entry side; cable loops are short and serviceable; unknown battery and CN3791 dimensions should look provisional and must not imply exact hole positions.
Avoid: no RK3568 board, no EC200A, no alarm terminal, no display, no fan, no loose battery, no adhesive-only mounting, no duplicated modules, no invented external connectors, no text, no watermark.
```
