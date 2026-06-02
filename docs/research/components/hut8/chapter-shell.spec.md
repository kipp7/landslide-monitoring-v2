# Hut8 Sticky Chapter Shell Specification

## Overview

- 参考对象：
  - `Power`
  - `Digital Infrastructure`
  - `Compute`
- 当前映射：
  - `前兆感知`
  - `边缘网关`
  - `区域模型`
- 交互模型：
  - 长 rail + sticky shell

## 结构

- 上部：
  - layer label
  - 巨大标题
- 下部左侧：
  - 中文章节标题
  - lead
  - body
  - chips
- 下部右侧：
  - 3 个 detail cards

## 视觉要求

- 标题必须具备“章节牌面”感
- 下部信息块不能抢走标题的舞台
- 画布内容继续留在背景层，文本只是覆盖层

## 当前实现要求

- 三个章节必须复用同一套布局语法
- 只更换：
  - 标题
  - 文案
  - chips
  - detail cards
  - 触发的 `sceneStage`
