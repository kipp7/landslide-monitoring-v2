## MODIFIED Requirements

### Requirement: 单页沉浸式叙事

系统 SHALL 提供一版基于参考站结构复刻的单页沉浸式宣传体验，并允许该体验以“固定背景舞台 + 长滚动 sticky 章节”的方式组织叙事。

#### Scenario: 用户访问首页 demo

- **WHEN** 用户打开宣传官网 demo
- **THEN** 系统 MUST 先呈现一个固定舞台式 landing hero
- **AND** 后续章节 MUST 以长滚动 rail 驱动的 sticky chapter 方式展开
- **AND** 叙事中 MUST 仍然覆盖山体风险、感知网络、平台链路和预警指挥的核心表达

### Requirement: 技术可信章节

系统 SHALL 在宣传体验中保留一段技术可信层，并在后段继续通过 proof / business / footer 的收束顺序表达部署能力与真实落地面。

#### Scenario: 用户进入首页后半段

- **WHEN** 用户浏览完主叙事章节
- **THEN** 系统 MUST 提供至少一个 proof chapter 用于承接技术可信表达
- **AND** 系统 MUST 提供 business 或 deployment 段落，用于表达解决方案和落地路径
- **AND** 页尾 MUST 提供明确的 CTA 或正式品牌入口

## ADDED Requirements

### Requirement: 参考站复刻基座

系统 SHALL 允许 `apps/promo-demo` 以选定参考站的结构语法作为首页基座进行重建，而不是仅以抽象灵感做自由发挥。

#### Scenario: 用户要求按参考站重建 promo-demo

- **WHEN** 用户明确要求先复刻优秀参考站再替换内容
- **THEN** 系统 MUST 允许基于参考站的页面拓扑、固定壳子和章节语法重建首页
- **AND** 当前产品内容 MUST 在该结构中完成语义替换
- **AND** 系统 MUST 保留后续逐章继续复刻和细化的空间

### Requirement: 固定舞台与滚动轨道

系统 SHALL 使用固定背景舞台与滚动轨道协同组织首页内容。

#### Scenario: 用户滚动浏览首页

- **WHEN** 用户滚动浏览首页
- **THEN** 顶部导航 MUST 保持固定可见
- **AND** 主视觉舞台 MUST 允许作为固定背景持续存在
- **AND** 章节内容 MUST 通过长滚动 rail 与 sticky shell 驱动切换

### Requirement: 重复章节壳体

系统 SHALL 为首页核心能力章节提供可重复的 sticky chapter 壳体，而不是为每一段都使用完全不同的布局。

#### Scenario: 用户浏览核心能力三部曲

- **WHEN** 用户依次进入前兆感知、边缘网关、区域模型等章节
- **THEN** 系统 MUST 使用一致的 sticky chapter 布局语法
- **AND** 不同章节 SHOULD 只替换标题、文案、指标与场景 stage
- **AND** 重复壳体 MUST 形成稳定的技术官网节奏感
