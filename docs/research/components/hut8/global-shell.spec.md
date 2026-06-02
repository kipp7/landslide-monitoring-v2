# Hut8 Global Shell Specification

## Overview

- 目标：定义当前 promo-demo 需要优先复刻的全局壳子，而不是所有内容细节
- 目标文件：
  - `apps/promo-demo/src/App.vue`
  - `apps/promo-demo/src/style.css`
- 交互模型：
  - 顶部固定
  - 菜单按钮展开
  - 页面滚动驱动章节切换

## 结构语法

- 固定顶栏
  - 左侧品牌
  - 中部状态 pill
  - 右侧菜单按钮
- 固定背景舞台
  - canvas / video / scene layer
- 页面主体
  - hero rail
  - trilogy rails
  - narrative rails
  - proof rail
  - business
  - footer

## 视觉特征

- 背景：
  - 深黑
  - 少量绿色与暖白光晕
- 标题：
  - condensed
  - 大写
  - 超大字号
- 卡片：
  - 半透明深色
  - 细边框
  - 大圆角

## 响应式要求

- 桌面端优先
- 平板与移动端允许：
  - 单列化
  - 隐藏中部状态 pill
  - 菜单抽屉保留

## 当前实现建议

- 先保证壳子节奏正确
- 再继续细化动效和媒体堆栈
