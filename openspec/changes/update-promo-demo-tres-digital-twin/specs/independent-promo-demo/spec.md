## MODIFIED Requirements

### Requirement: 单页沉浸式叙事

系统 SHALL 提供一版单页沉浸式宣传体验，并允许该体验演进为“单屏数字孪生场景 + 模式切换”的结构，而不是强制固定为章节滚动页。

#### Scenario: 用户访问高保真单页 demo

- **WHEN** 用户打开宣传官网 demo
- **THEN** 系统 MUST 允许以单屏三维主场景作为主要表达面
- **AND** 系统 MUST 允许通过模式切换而不是章节滚动来展开叙事
- **AND** 叙事中 MUST 仍然包含山体风险、感知网络、平台链路和预警指挥的核心表达

### Requirement: 场景化视觉表达

系统 SHALL 使用具备空间感、工程可信感和环境层次的视觉层表达山体、节点、网络和风险信号。

#### Scenario: 用户查看主场景

- **WHEN** 用户进入三维主场景
- **THEN** 系统 MUST 呈现地形、站点、链路、风险区和现场环境的整体表达
- **AND** 场景 MUST 强调可理解的数字孪生语义，而不是抽象无指向的中心母体
- **AND** 视觉表达 MUST 服务山体监测、风险识别与预警联动叙事

## ADDED Requirements

### Requirement: Tres 场景架构

系统 SHALL 使用 `three-vue-tres` / `@tresjs/core` 风格的场景宿主承载 promo-demo 的主三维场景。

#### Scenario: 开发者维护 promo-demo 场景

- **WHEN** 开发者扩展 promo-demo 的场景层
- **THEN** 系统 MUST 提供基于 Vue 组件的场景宿主与层级拆分方式
- **AND** 场景层 MUST 可以按 terrain、environment、infrastructure、hazard 等职责拆分
- **AND** 系统 MAY 继续使用底层 `three` 能力实现几何、材质与动画细节

### Requirement: 高保真数字孪生基线

系统 SHALL 将 promo-demo 的主场景提升到高保真数字孪生基线，而不是停留在低模科技 demo 表达。

#### Scenario: 用户观察地图场景

- **WHEN** 用户浏览总览态、站点态或监测态
- **THEN** 系统 MUST 呈现地形色带、坡面层次、环境前后景和部署场景细节
- **AND** 村落、道路、站点与地貌之间 MUST 形成明确的空间关系
- **AND** 高保真表达 MUST 主要来自材质、构筑物和环境层，而不是泛滥的高亮特效

### Requirement: 现场构筑物细节

系统 SHALL 在主场景中表达现场部署可信度所需的基础设施与坡脚细节。

#### Scenario: 用户观察现场部署面

- **WHEN** 用户查看主场景近景
- **THEN** 系统 MUST 包含护栏、电杆、坡脚或类似现场构筑物细节
- **AND** 这些细节 MUST 与道路、站点或风险坡面形成真实部署关系
- **AND** 这些细节 MUST 增强工程可信感，而不是成为无意义装饰
