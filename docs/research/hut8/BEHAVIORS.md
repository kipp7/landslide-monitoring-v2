# Hut 8 首页行为记录

## 顶部导航

- 始终固定在视口顶端
- 左侧品牌和右侧菜单按钮始终可见
- 中部不是传统完整导航条，而是偏状态化的导航壳

## 菜单

- 菜单入口是右上角 toggle button
- 打开后出现覆盖层式导航面板
- 菜单内容分成两组：
  - 顶层页面
  - 业务条目

## Hero / Landing

- landing 本身不是普通首屏卡片
- 它像一个固定舞台：
  - 当前标题固定在视口里
  - 下方滚动只是在推动状态变化
- 大标题占据很大视觉比重
- 画布与视频层在标题后方持续存在

## 三大 sticky 章节

- `Power`
- `Digital Infrastructure`
- `Compute`

共同规律：

- 外层 rail 很长
- 内部 `sticky` 占满一屏
- sticky 内是同一种内容语法：
  - 上部 layer label
  - 超大标题
  - 下部 copy block
  - 另一侧辅助信息

## Narrative / Proof 章节

- `Unlocking Human Potential` 和 `Integrated Energy Infrastructure`
  - 仍然是 sticky 思路
  - 但信息量更克制，更像过渡叙事
- `Powering the Future`
  - 更像 proof chapter
  - 用来把前面章节聚合成一个更完整的技术和业务说明

## 字体与视觉基线

- 主字体：
  - `"ITC Franklin Gothic Std", sans-serif`
- 主标题观感：
  - condensed
  - 工业感
  - 无衬线
  - 大写/大尺度
- 主要颜色：
  - 背景接近 `#080808`
  - 正文亮灰接近 `#e8e8e8`
  - 次级文字偏灰绿 `#bcbfb0`
  - 强调色偏酸绿 `#b3ff00`

## 可以直接借用到当前 demo 的行为

1. 顶栏固定
2. 菜单抽屉式展开
3. 长滚动 rail + sticky 舞台
4. 三段重复章节语法
5. 后段切到 proof / business / footer

## 暂不必一比一追的行为

1. 原站完整媒体堆栈
2. 每一段更细的滚动动画差值
3. investor/news 后半段的信息密度
4. 精确同构的所有 hover 和 reveal 细节

## 当前产品的行为映射建议

- 背景舞台
  - 继续由当前 `PromoScene` 承担
- sticky 章节 active 状态
  - 用 `IntersectionObserver` 驱动 scene stage
- 菜单展开
  - 保持 overlay / drawer 结构
- proof 章节
  - 作为后续 `three-vue-tres` 深化的主要接口
