## ADDED Requirements

### Requirement: 独立宣传官网 Demo 工作区

系统 SHALL 提供一个与当前后台 Web 和桌面端解耦的独立宣传官网 demo 工作区。

#### Scenario: 启动独立 demo

- **WHEN** 开发者需要运行宣传官网 demo
- **THEN** 系统 MUST 允许从独立工作区启动 demo
- **AND** 该 demo MUST 不依赖当前 `apps/web` 的后台壳、登录流或导航结构
- **AND** 该 demo MUST 不依赖当前 `apps/desk` 或 `apps/desk-win`

### Requirement: 单页沉浸式叙事

系统 SHALL 提供一版单页沉浸式宣传体验，而不是首轮就扩展为完整多页官网。

#### Scenario: 访问 demo 首屏

- **WHEN** 用户打开宣传官网 demo
- **THEN** 系统 MUST 呈现高冲击 Hero
- **AND** 后续内容 MUST 以章节化叙事推进
- **AND** 叙事中 MUST 包含山体风险、感知网络、平台链路和预警指挥的核心表达

### Requirement: 场景化视觉表达

系统 SHALL 使用具备空间感和科技感的视觉层表达山体、节点、网络和风险信号。

#### Scenario: 用户滚动浏览场景章节

- **WHEN** 用户进入场景章节
- **THEN** 系统 MUST 呈现山体/节点/风险网络的视觉表达
- **AND** 视觉层 SHOULD 体现空间分层、动态光效、连线或脉冲等未来感元素
- **AND** 视觉表达 MUST 服务叙事，而不是成为无关装饰

### Requirement: 技术可信章节

系统 SHALL 在宣传体验中保留一段技术可信层，用于表达系统链路与工程落地能力。

#### Scenario: 用户查看技术可信部分

- **WHEN** 用户进入技术可信章节
- **THEN** 系统 MUST 展示从感知节点到网关、平台、预警中心的链路表达
- **AND** 该章节 MUST 明确这是一个真实系统而非纯概念包装

### Requirement: Mock-Only Runtime

系统 SHALL 允许宣传官网 demo 在完全 mock 的条件下独立运行。

#### Scenario: 本地离线演示

- **WHEN** 开发者或演示人员在本地启动 demo
- **THEN** 系统 MUST 仅依赖本地静态资源和 mock 内容即可运行
- **AND** 系统 MUST NOT 要求 API、数据库或鉴权先准备完成

### Requirement: 降级与可访问性保护

系统 SHALL 为移动端、低性能设备和 reduced-motion 用户提供可接受的降级体验。

#### Scenario: 用户设备不适合重动效

- **WHEN** 用户设备性能有限、屏幕较小，或启用了 `prefers-reduced-motion`
- **THEN** 系统 MUST 提供简化后的视觉和动效策略
- **AND** 核心文案、章节顺序和 CTA MUST 仍然可读、可访问
