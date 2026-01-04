# GPS形变监测系统使用指南

## 🎯 功能概述

GPS形变监测系统是一个综合性的地质形变分析平台，集成了：
- **基准点管理** - 设置和管理GPS基准坐标
- **实时形变监测** - 基于真实GPS数据的形变计算
- **权威算法分析** - CEEMD分解、DTW模式匹配、统计分析
- **风险评估** - 多维度风险等级评估
- **数据可视化** - 交互式图表和趋势分析

## 🚀 快速开始

### 1. 启动服务

```bash
# 启动前端服务
cd landslide-monitor/frontend
npm run dev

# 启动后端服务（另一个终端）
cd landslide-monitor/backend/iot-service
node iot-server.js
```

### 2. 访问页面

打开浏览器访问：`http://localhost:3000/gps-deformation`

### 3. 准备数据

确保数据库中有：
- ✅ GPS基准点数据（`gps_baselines`表）
- ✅ GPS监测数据（`iot_data`表）

可以使用以下脚本生成测试数据：
```bash
# 在Supabase SQL编辑器中执行
simple-mock-data.sql
```

## 📊 页面功能详解

### 左侧面板

#### 基准点信息
- 显示当前设备的基准点坐标
- 基准点建立时间和建立人
- 基准点置信度信息

#### 实时形变状态
- **最大位移** - 相对基准点的最大偏移距离
- **平均位移** - 统计期间的平均位移
- **趋势方向** - 形变趋势（增长/稳定）
- **风险等级** - 0-4级风险评估
- **数据质量** - 数据质量评分

### 右侧面板

#### 形变趋势图
- 总位移、水平位移、垂直位移的时间序列
- 交互式图表，支持缩放和详情查看

#### 数据质量图
- 数据置信度的散点图
- 帮助识别数据质量问题

#### 数据表格
- 最近50条GPS数据的详细信息
- 包含时间、位移、置信度、风险等级

## 🔧 操作指南

### 设备选择
1. 在页面顶部选择要分析的设备
2. 系统会自动加载该设备的基准点和GPS数据

### 基准点管理

#### 手动设置基准点
1. 点击"设置基准点"按钮
2. 输入精确的纬度和经度坐标
3. 填写建立人和备注信息
4. 点击"设置基准点"保存

#### 自动建立基准点
1. 点击"自动建立基准点"按钮
2. 系统会基于最近20个GPS数据点计算平均坐标
3. 自动评估位置精度
4. 生成基准点并保存

### 数据刷新
- 点击"刷新数据"按钮获取最新的GPS数据
- 系统会重新执行形变分析算法

### 报告导出
- 点击"导出报告"按钮（功能开发中）
- 将生成包含分析结果的PDF报告

## 🎯 算法说明

### 核心算法
1. **CEEMD分解** - Complete Ensemble Empirical Mode Decomposition
   - 基于Torres et al. (2011)的理论
   - 用于时间序列信号分解

2. **DTW模式匹配** - Dynamic Time Warping
   - 基于Salvador & Chan (2007)的方法
   - 用于形变模式识别

3. **统计特征提取**
   - 基础统计量（均值、标准差、偏度、峰度）
   - 时域特征（波动率、自相关）

### 风险评估
- **0级** - 安全（绿色）
- **1级** - 注意（蓝色）
- **2级** - 警告（橙色）
- **3级** - 危险（红色）
- **4级** - 危急（红色）

## 🔍 故障排除

### 常见问题

#### 1. 页面显示"暂无分析数据"
**原因**：设备没有足够的GPS数据或基准点
**解决**：
- 检查设备是否有基准点设置
- 确认数据库中有该设备的GPS数据
- 尝试自动建立基准点

#### 2. 图表不显示
**原因**：数据格式问题或图表库加载失败
**解决**：
- 刷新页面
- 检查浏览器控制台错误信息
- 确认GPS数据格式正确

#### 3. API调用失败
**原因**：后端服务未启动或数据库连接问题
**解决**：
- 检查后端服务状态
- 验证数据库连接
- 查看后端日志

### 测试工具

运行API连接测试：
```bash
cd landslide-monitor/frontend
node test-gps-deformation.js
```

## 📈 数据要求

### GPS数据格式
```sql
-- iot_data表必需字段
latitude DOUBLE PRECISION NOT NULL
longitude DOUBLE PRECISION NOT NULL
deformation_distance_3d DOUBLE PRECISION
deformation_horizontal DOUBLE PRECISION
deformation_vertical DOUBLE PRECISION
deformation_confidence DOUBLE PRECISION
event_time TIMESTAMP WITH TIME ZONE
```

### 基准点格式
```sql
-- gps_baselines表必需字段
device_id TEXT NOT NULL
baseline_latitude DOUBLE PRECISION NOT NULL
baseline_longitude DOUBLE PRECISION NOT NULL
established_time TIMESTAMP WITH TIME ZONE
status TEXT DEFAULT 'active'
```

## 🔄 更新日志

### v1.0.0 (2025-07-26)
- ✅ 完整的GPS形变监测页面
- ✅ 基准点管理功能
- ✅ 权威算法集成
- ✅ 实时数据可视化
- ✅ 风险评估系统

## 📞 技术支持

如有问题，请检查：
1. 后端算法服务是否正常运行
2. 数据库连接是否正常
3. GPS数据是否完整
4. 基准点是否正确设置

系统基于权威的GPS形变分析算法，确保分析结果的科学性和准确性。
