# Group 7 截图计划与命名规范

## 命名规范
- 规则：`g7_[route]_[state]_[index].png`
- 示例：
  - `g7_login_default_01.png`
  - `g7_device-management_list_01.png`
  - `g7_gps-monitoring_prediction_02.png`
  - `g7_baseline-management_assess_01.png`
- 建议分辨率：1920×1080 或更高；统一浅色/深色主题；关闭浏览器书签栏与调试面板。

## 必拍页面与状态
1. `/login`
   - default（空表单）
   - error 或 loading（二选一）
2. `/`（首页/总览，若存在卡片/导航）
   - overview（主要入口或总览卡）
3. `/device-management`
   - list（全量列表）
   - filter（筛选/搜索态）
   - detail（设备详情/侧栏/弹层）
   - export（导出入口或导出成功提示）
4. `/gps-monitoring`
   - charts（基础曲线）
   - prediction（增强预测曲线，如有）
   - anomaly-mark（异常标记/阈值高亮）
   - time-range（时间范围切换）
5. `/baseline-management`
   - establish（基线建立）
   - assess（质量评估/反馈）
6. `/analysis`
   - anomaly-type（异常类型分布）
   - risk-indicator（风险指标/趋势）
7. `/system-monitor`
   - status（实时状态/设备健康）
   - alerts（告警/异常概览）
8. 可选：`/optimized-demo`
   - highlight（关键优化点演示）

## 数量建议
- 基础：12–18 张
- 原则：每个页面至少 1 张默认态 + 1 张关键交互/状态

## 版式建议
- 统一窗口宽度，隐藏地址栏干扰元素
- 关键处加红框/标注（如需），但保持简洁
- 若含大屏场景，额外导出 2560×1440 版本





