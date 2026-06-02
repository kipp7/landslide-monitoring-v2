# Hut 8 首页页面拓扑

## 页面骨架结论

- 首页不是普通 section 线性排版，而是：
  - 固定顶栏
  - 固定/粘性 hero
  - 多段长滚动 rail
  - rail 内部重复使用全屏 sticky 舞台
  - 后段再切到 proof / business / footer
- 视觉阅读顺序由滚动驱动，但真正固定在视口里的是：
  - 顶部导航
  - 画布/媒体舞台
  - 当前 sticky 章节内容

## 实际章节顺序

1. 顶部导航 / 菜单按钮
2. Landing manifesto
3. `Power`
4. `Digital Infrastructure`
5. `Compute`
6. `Unlocking Human Potential`
7. `Integrated Energy Infrastructure`
8. `Powering the Future`
9. `Our Businesses`
10. `Featured News & Insights` + footer

## 对应到当前产品的翻译

1. Landing manifesto
   - 数字山体宣言 / 第一印象开场
2. `Power`
   - 前兆感知层
3. `Digital Infrastructure`
   - 边缘网关与现场链路层
4. `Compute`
   - 区域模型 / 平台总控层
5. `Unlocking Human Potential`
   - 可信闭环 / 风险协同层
6. `Integrated Energy Infrastructure`
   - 数据剧场 / 回放证明层
7. `Powering the Future`
   - 部署证明与正式交付层
8. `Our Businesses`
   - 解决方案包装 / 场景入口
9. Footer
   - 联合演示 CTA / 正式品牌站收束

## 关键容器语法

- `.landing`
  - 固定 landing 舞台
- `.energy`
  - 第一段 sticky chapter rail
- `.infrastructure`
  - 第二段 sticky chapter rail
- `.compute`
  - 第三段 sticky chapter rail
- `.driven`
  - narrative rail
- `.sites`
  - narrative rail / 过渡 rail
- `.powering`
  - proof rail
- `.business`
  - regular document section
- `.footer`
  - regular footer section

## 最小可复刻壳子

为了让 `apps/promo-demo` 尽快摆脱旧 HUD 形态，最小可复刻壳子应该固定为：

1. 顶部固定导航
   - 左侧品牌
   - 中部状态 pill
   - 右侧菜单按钮
2. 固定 3D 背景舞台
   - 暂时复用当前 `PromoScene`
3. Landing rail
   - 大标题 + 右侧 summary card
4. 三段重复 sticky chapter shell
   - 标题语法一致
   - 只换内容与 active stage
5. 一个 proof rail
   - 用于承接 3D 爆点 / 数据剧场
6. business + footer
   - 回到常规信息层，承接可信感

## 当前实现建议

- 第一轮实现不要急着一比一复刻全部动画
- 先对齐：
  - 页面骨架
  - sticky 节奏
  - 顶栏与菜单语法
  - 大标题与右侧辅助卡片关系
- 3D scene 先作为固定背景层
- 等壳子站稳后，再继续做：
  - 章节切换动效
  - 更准确的菜单展开层
  - proof 章节镜头脚本
