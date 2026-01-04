# ESP32-CAM 集成说明

## 🎥 功能概述

ESP32-CAM已成功集成到滑坡监测系统的前端界面中，提供实时视频监控功能。

## 📍 访问位置

在主监控界面（`/analysis`页面）中：
1. 找到"监测点分布"区域
2. 点击右上角的地图切换按钮
3. 选择"📹 视频"模式
4. 即可看到ESP32-CAM实时画面

## 🎛️ 控制功能

### 基本控制
- **播放/暂停**: 开始或停止视频流
- **刷新**: 重新连接视频流
- **拍照**: 保存当前画面为JPG文件
- **全屏**: 全屏显示视频画面

### 状态显示
- **连接状态**: 显示与ESP32-CAM的连接状态
- **实时FPS**: 显示当前帧率
- **分辨率**: 显示当前分辨率（VGA 640×480）
- **观看者数量**: 显示同时观看的用户数

## ⚙️ 配置说明

### 环境变量配置
在 `.env.local` 文件中配置：

```env
# ESP32-CAM代理服务器地址
NEXT_PUBLIC_CAMERA_PROXY_URL=http://localhost:8082

# ESP32-CAM直连配置（备用）
NEXT_PUBLIC_CAMERA_IP=192.168.43.55
NEXT_PUBLIC_CAMERA_PORT=80
```

### 代理服务器配置
ESP32-CAM通过代理服务器提供视频流：
- **代理服务器端口**: 8082
- **视频流地址**: `http://localhost:8082/stream`
- **拍照地址**: `http://localhost:8082/capture`
- **统计信息**: `http://localhost:8082/stats`

## 🚀 启动步骤

### 1. 启动ESP32-CAM代理服务器
```bash
cd landslide-monitor/camera
npm install
npm start
```

### 2. 启动前端应用
```bash
cd landslide-monitor/frontend
npm run dev
```

### 3. 访问监控界面
1. 打开浏览器访问 `http://localhost:3000`
2. 进入"数据分析"页面
3. 切换到"视频"模式
4. 点击播放按钮开始观看

## 📊 技术架构

```
ESP32-CAM (192.168.43.55:80)
    ↓
代理服务器 (localhost:8082)
    ↓
前端应用 (localhost:3000)
    ↓
用户浏览器
```

### 组件结构
- **ESP32CameraView.tsx**: 主要视频组件
- **camera.ts**: 配置文件
- **LazyComponents.tsx**: 懒加载配置
- **analysis/page.tsx**: 集成页面

## 🔧 自定义配置

### 修改代理服务器地址
编辑 `app/config/camera.ts`:
```typescript
export const CAMERA_CONFIG = {
  PROXY_URL: 'http://your-server:8082',
  // ...其他配置
};
```

### 修改显示设置
```typescript
DISPLAY_CONFIG: {
  showControls: true,         // 显示控制面板
  showStats: true,            // 显示统计信息
  controlsTimeout: 3000,      // 控制面板自动隐藏时间
  fullscreenEnabled: true,    // 启用全屏功能
}
```

### 修改功能开关
```typescript
FEATURES: {
  capture: true,              // 启用拍照功能
  recording: false,           // 启用录制功能（未实现）
  zoom: false,                // 启用缩放功能（未实现）
  pan: false,                 // 启用平移功能（未实现）
}
```

## 🚨 故障排除

### 常见问题

1. **视频无法显示**
   - 检查ESP32-CAM代理服务器是否运行
   - 确认ESP32-CAM设备在线
   - 检查网络连接

2. **连接失败**
   - 验证代理服务器地址配置
   - 检查防火墙设置
   - 确认端口8082未被占用

3. **画面卡顿**
   - 检查网络带宽
   - 减少同时观看的用户数
   - 重启代理服务器

### 调试方法

1. **检查代理服务器状态**
   ```bash
   curl http://localhost:8082/health
   ```

2. **检查视频流**
   ```bash
   curl -I http://localhost:8082/stream
   ```

3. **查看浏览器控制台**
   - 按F12打开开发者工具
   - 查看Console和Network标签页

## 📈 性能优化

### 当前配置
- **分辨率**: VGA (640×480)
- **目标帧率**: 60fps
- **实际帧率**: 40-50fps
- **画质**: 中等（优先流畅度）
- **延迟**: < 200ms

### 优化建议
1. **网络优化**: 使用有线网络或5GHz WiFi
2. **服务器优化**: 部署到性能更好的服务器
3. **客户端优化**: 关闭不必要的浏览器标签页

## 🔄 更新说明

### v1.0.0 功能
- ✅ 实时视频流显示
- ✅ 播放/暂停控制
- ✅ 拍照功能
- ✅ 全屏显示
- ✅ 连接状态监控
- ✅ 性能统计显示

### 计划功能
- 🔄 视频录制
- 🔄 画面缩放
- 🔄 多摄像头支持
- 🔄 移动端优化

## 📞 技术支持

如遇问题请：
1. 查看本文档的故障排除部分
2. 检查代理服务器日志
3. 联系开发团队

---

**ESP32-CAM集成完成，享受实时监控体验！** 🎉
