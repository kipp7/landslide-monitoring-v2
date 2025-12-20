# Group 7 交互流程（Mermaid，可直接打印为 PDF）

> 用于第七组“数字媒体设计”提交。建议浏览器打印为 PDF：A4、窄边距、纵向；需要可选“背景图形”。

## 1. 站点地图（总览）
```mermaid
flowchart TD
  A[登录 /login] --> B[首页 /]
  B --> C[设备管理 /device-management]
  B --> D[地质形变监测 /gps-monitoring]
  B --> E[基线管理 /baseline-management]
  B --> F[数据分析 /analysis]
  B --> G[系统监控 /system-monitor]
```

## 2. 模块一 · 设备管理（状态→监测站→基准点）
```mermaid
flowchart LR
  C1[设备状态监控] -->|筛选/搜索| C2[查看设备概览]
  C2 -->|详情| C3[设备详情\n健康/电池/信号/今日数据/最后活跃]
  C3 -->|快捷操作| C4[刷新数据/设备诊断/详细信息]
  C2 --> C5[监测站管理]
  C5 -->|台账/在线率/故障| C6[新增/编辑站点\n名称/类型/位置/备注]
  C5 -->|一键跳转| C7[对应设备详情]
  C5 --> C8[基准点管理]
  C8 -->|一键建立/重建| C9[质量评估\n拟合度/残差分布/可信区间]
  C9 -->|参数微调/时间窗切换/结果回看| C10[保存为长期对照基线]
  C9 -->|往返| D[地质形变监测]
```

## 3. 模块二 · 地质形变监测（核心）
```mermaid
flowchart TB
  D0[设备/时间选择器\n自动刷新开关] --> D1[顶部卡片\n国标预警等级]
  D1 --> D2[数据质量面板\n置信度/评分]
  D2 --> D3{四大分栏}
  D3 --> D3A[实时监测]
  D3A --> D3A1[位移趋势\n总/水平/垂直\n智能刻度/高亮]
  D3A --> D3A2[形变速度\nmm/h 平滑/智能范围]
  D3A --> D3A3[环境因素关联\n温度/湿度双轴]
  D3 --> D3B[CEEMD 分解]
  D3B --> D3B1[IMF 分量时域图]
  D3B --> D3B2[IMF 主频谱]
  D3B --> D3B3[长期趋势(残差)]
  D3B --> D3B4[能量分布(占比)]
  D3B --> D3B5[分量数/信号长度/分解质量]
  D3 --> D3C[预测分析]
  D3C --> D3C1[短期预测(24h)\n历史窗口: 自适应/固定/智能]
  D3C --> D3C2[长期趋势(7d)\n平滑过渡可切换]
  D3C --> D3C3[预测误差评估 1h→7d\nMAE/R²/置信度→时间衰减]
  D3C --> D3C4[风险预警分析\n等级+关键因子(JSON保留)]
  D3 --> D3D[数据详情]
  D3D --> D3D1[统计概览\n数据量/最大/平均/跨度]
  D3D --> D3D2[位移分布直方图\n动态分组]
  D3D --> D3D3[明细表\n分页/排序]
  D3D --> D3D4[导出分析/综合报告\n强制刷新]
  D0 --> D4[设置/数据点数限制\n推荐 100–500 条]
  D3C --> E[基准点管理\n参数校准后回看预测]
```

## 4. 模块四 · 分析与系统监控（联动）
```mermaid
flowchart LR
  F1[数据分析] --> F2[异常类型分布\n四级预警统计/24h窗口]
  F2 --> F3[实时异常表+地图同屏\n按时间顺序定位]
  F3 --> G1[系统监控]
  G1 --> G2[缓存命中率趋势]
  G1 --> G3[实时消息流量/连接状态]
  G1 --> G4[客户端统计]
  G1 --> G5[清空/预热缓存\n刷新聚合数据]
  G1 --> G6[自动/手动刷新+间隔]
```

## 5. 端到端时序（IoT→数据层→前端）
```mermaid
sequenceDiagram
  participant Sensor as 传感器/边端设备
  participant IOT as IoT 接入
  participant DB as 数据库(PostgreSQL)
  participant RT as Realtime/WebSocket
  participant API as Next.js API Routes
  participant UI as 前端 UI

  Sensor->>IOT: 数据上传/清洗/映射
  IOT->>DB: 写入数据
  UI->>API: 读取分析/聚合/导出
  API->>DB: 查询/分析数据
  DB-->>API: 结果
  IOT-->>RT: 推送通道
  RT-->>UI: 实时更新(告警/曲线)
```

## 6. PDF 导出建议
- 浏览器打印：Ctrl/Cmd+P → 目标选“保存为 PDF” → A4、纵向、窄边距。
- 含代码渲染：若本地不支持 Mermaid 预览，可用 VSCode 插件 “Markdown Preview Mermaid Support” 预览后打印。
- 页眉题注：建议在第一页添加作品名“山稳数境 | Mountain Insight”。
