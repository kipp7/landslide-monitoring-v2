# 🏔️ 山体滑坡监测系统

一个基于 Next.js + Supabase 的实时山体滑坡监测大屏系统。

## 🏗️ 系统架构

```
RK2206单片机 → 华为云IoT → 后端IoT服务 → Supabase → Next.js前端
```

## 📁 项目结构

```
Landslide_monitor/
├── web/
│   ├── frontend/         # Next.js前端应用
│   └── backend/          # 后端服务集合
│       ├── iot-service/  # IoT数据接收服务
│       ├── api-service/  # 其他API服务（预留）
│       └── shared/       # 共享代码（预留）
└── README.md
```

## ✨ 主要特性

- 🔄 **实时数据监控** - 使用 Supabase 实时订阅替代轮询
- 📊 **多维度数据展示** - 温度、湿度、加速度、陀螺仪数据
- 🗺️ **多种地图模式** - 支持卫星图、地形图、3D地图
- 🤖 **AI 预测分析** - 智能滑坡风险评估
- ⚡ **性能优化** - 懒加载、代码分割、实时性能监控
- 📱 **响应式设计** - 适配不同屏幕尺寸

## 🚀 性能优化

### 数据层优化
- ✅ 使用 Supabase 实时订阅替代频繁轮询
- ✅ 统一数据源管理，避免重复请求
- ✅ Zustand 状态管理，减少不必要的重渲染

### 组件层优化
- ✅ 懒加载重型组件（ECharts、Cesium、OpenLayers）
- ✅ 使用 React.Suspense 优化加载体验
- ✅ 动态导入，按需加载

### 构建优化
- ✅ Next.js 15 + Turbopack 快速开发
- ✅ 代码分割和 Bundle 优化
- ✅ 图片优化和压缩

## 🛠️ 技术栈

- **前端框架**: Next.js 15
- **UI 组件**: Ant Design + Ant Design Pro
- **状态管理**: Zustand
- **数据库**: Supabase (PostgreSQL + 实时订阅)
- **图表库**: ECharts
- **地图**: Cesium (3D) + OpenLayers (2D) + 高德地图
- **样式**: Tailwind CSS
- **类型检查**: TypeScript

## 📦 快速开始

### 环境要求
- Node.js 18+
- npm 或 yarn

### 安装依赖
```bash
npm install
```

### 环境配置
复制环境变量文件并配置：
```bash
cp .env.example .env.local
```

### 开发环境
```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

### 生产构建
```bash
npm run build
npm start
```

## 🔧 性能优化建议

### 1. 实时数据优化
- 使用 Supabase 实时订阅替代轮询
- 统一数据源，避免重复请求
- 合理设置数据更新频率

### 2. 组件优化
- 懒加载重型组件
- 使用 React.memo 优化渲染
- 避免不必要的重渲染

### 3. 部署优化
- 使用 CDN 加速静态资源
- 启用 Gzip 压缩
- 配置合理的缓存策略

## 📊 性能监控

系统内置性能监控功能：
- FPS 监控
- 内存使用监控
- 页面加载时间
- 实时性能警告

## 🐛 常见问题

### Q: 页面卡顿怎么办？
A:
1. 检查性能监控面板
2. 减少同时显示的组件数量
3. 优化数据更新频率
4. 使用生产环境构建

### Q: 数据不实时更新？
A:
1. 检查 Supabase 连接
2. 确认实时订阅配置
3. 查看浏览器控制台错误

## 📝 部署到自己的服务器

### Docker 部署
```bash
# 构建镜像
docker build -t landslide-monitor .

# 运行容器
docker run -p 3000:3000 --env-file .env.local landslide-monitor
```

### 传统部署
```bash
# 构建
npm run build

# 启动
npm start
```

## 📄 许可证

MIT License
