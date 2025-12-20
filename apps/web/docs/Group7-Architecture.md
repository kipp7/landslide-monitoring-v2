# Group 7 系统架构图（Mermaid）

> 可在支持 Mermaid 的工具中导出为 PNG/PDF；或使用浏览器扩展/VSCode 插件截图。

```mermaid
flowchart TB
  %% Client Layer
  subgraph C[Client 前端]
    B[Web 浏览器]
    UI[Next.js 前端 UI\nApp Router 页面/组件\n地图/图表组件]
  end

  %% Server Layer
  subgraph S[Server 服务器侧]
    API[Next.js API Routes (/api/*)]
    SVC[业务服务模块\n设备管理 / GPS监测 / 基线 / 分析 / 系统监控]
  end

  %% Data Layer
  subgraph D[Data 数据层]
    DB[(PostgreSQL / Supabase)]
    RT[(Realtime / WebSocket)]
  end

  %% IoT Layer
  subgraph I[IoT 物联侧]
    DEV[传感器 / 边端设备]
    IOT[IoT 服务与设备影子\n数据接入/清洗/映射]
  end

  %% Edges
  B --> UI
  UI <--> API
  API --> SVC
  SVC <--> DB
  SVC <--> RT

  DEV --> IOT --> DB
  RT -- 推送更新 --> UI

  %% Notes
  classDef note fill:#f7f7f7,stroke:#aaa,color:#333,font-size:12px;
  N1["前端：统一的视觉语言与交互流程；\n模块：设备管理、GPS监测、基线、分析、系统监控"]:::note
  N2["服务：API 路由协调业务模块，\n读写数据库并通过 Realtime 向前端推送"]:::note
  N3["IoT：设备数据经接入与映射入库；\n前端可订阅实时通道获取最新状态"]:::note

  UI --- N1
  SVC --- N2
  IOT --- N3
```

## 关键说明
- 前端以 Next.js App Router 组织页面；地图/图表组件承载数据可视与交互。
- API Routes 协同业务服务模块，统一对外的读写/计算入口。
- 数据层使用 PostgreSQL（Supabase）存储结构化数据；Realtime 为前端提供订阅/推送。
- 物联设备数据通过 IoT 服务接入，完成清洗、映射与入库；异常/状态变化通过 Realtime 通知前端。





