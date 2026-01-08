# Desk UI 样式规范（执行版）

适用范围：`apps/desk`（Web UI）以及 `apps/desk-win`（桌面壳中的 Web UI）。

目标：保证深色主题下的标签、按钮、卡片、滚动条等交互控件在全站一致、清晰、可交付。

约束：
- 不使用 emoji。
- 默认以深色主题作为主视觉；浅色主题后续再补。

## 1. 颜色与对比

原则：
- 文本对比优先：深色背景上避免使用过暗的文字色或“黑字+深底”的组合。
- 强调色统一：以青色（Cyan）作为主强调色；预警/风险使用橙/红；正常使用绿。

## 2. 标签（Tag）

全局规则：
- 全站 `Tag` 统一为“胶囊 + 高对比”风格，避免出现灰暗、发脏、边框不清晰的问题。
- 已在 `apps/desk/src/styles.css` 中对 `.ant-tag-*` 进行全局映射（无需每页重复写样式）。

使用建议：
- 使用 Ant 预设色即可：`<Tag color="cyan">`、`<Tag color="orange">`、`<Tag color="red">`、`<Tag color="green">`、`<Tag color="geekblue">` 等。
- 如需更精细的语义色（例如“站点/设备/系统建议”等），优先使用预设色而不是自定义 hex。

可选（需要固定样式时）：
- 使用 `desk-pill-tag`：`<Tag className="desk-pill-tag desk-tone-cyan">系统建议</Tag>`

## 3. 按钮（Button）

全局规则：
- 全站按钮统一为圆角胶囊；默认按钮（default）不使用“黑底”，采用玻璃/半透明底色。
- 主按钮（primary）统一为青色渐变，保证在深色背景下“看得见、像产品”。
- 危险主按钮（dangerous + primary）统一为红色渐变。

已在 `apps/desk/src/styles.css` 中对 `.ant-btn-default` / `.ant-btn-primary` 等进行全局覆盖。

使用建议：
- 页内主要动作：`<Button type="primary" shape="round">`
- 次要动作：`<Button shape="round">`（默认即可）
- 危险动作：`<Button type="primary" danger shape="round">`

## 4. 卡片（Card / BaseCard）

规则：
- 卡片整体使用轻量边框 + 低强度光晕；悬停只允许轻微上浮，不做明显缩放。
- 列表类卡片内容滚动应在卡片内部完成，避免整页滚动导致定位漂移。

## 5. 滚动条（Scrollbar）

规则：
- 统一为更细的现代滚动条，避免“粗大、古老”的观感。
- 不要在全局启用 `scrollbar-gutter: stable`：在部分 Chromium/WebView2 环境会导致右侧出现“预留空位”，表现为页面整体靠左（类似右侧有一条边）。
- 如确实需要避免某个容器因滚动条出现/消失导致抖动，优先对该容器局部处理（例如固定容器宽度/布局），并在 Win11 + WebView2 环境验证通过后再落地。

## 6. 提交前自检清单

- 深色背景上是否存在“黑字/深灰字”导致不可读？
- `Tag` 是否出现灰暗发脏（未套用全局映射）？
- 按钮是否出现“黑底默认按钮”，与整体风格不一致？
- 首页/列表是否出现滚动条突兀或布局抖动？

