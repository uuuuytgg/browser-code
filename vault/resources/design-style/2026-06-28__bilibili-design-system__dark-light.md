---
title: "Bilibili Design System — 云控特调视频页样式参考"
source_url: "https://www.bilibili.com/video/BV1Vy7H6eEyh"
date: "2026-06-28"
tags:
  - design-style
  - bilibili
  - color-system
  - design-tokens
  - css-variables
  - ui-patterns
platform: bilibili
theme: light
---

# Bilibili Design System — Video Page

从 Bilibili 视频页面提取的完整设计 token 体系。基于 Bilibili 新一代 CSS 变量设计系统（`--Ga`, `--*0`~`--*10` 色阶体系）。

## 字体栈 (Font Stack)

```css
/* 主字体 */
font-family: PingFang SC, HarmonyOS_Regular, Helvetica Neue, Microsoft YaHei, sans-serif;

/* Retina 降级（1x 屏幕） */
font-family: -apple-system, BlinkMacSystemFont, Helvetica Neue, Helvetica, Arial,
             PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif;

/* 按钮/正文 */
PingFangSC-Regular   /* 14px 常规 */

/* 标题/弹窗标题 */
PingFangSC-Semibold  /* 16px 半粗 */
```

## 颜色系统 (13 Hue × 11-Step Scale)

每个色相有 11 阶（0=最浅, 10=最深），同时提供 `_rgb` 形式用于 rgba()：

| 色相 | 缩写 | 品牌色 (5阶) | 说明 |
|------|------|-------------|------|
| Gray | `--Ga` | `--Ga5: #9499A0` | 中性灰阶，核心 |
| White | `--Wh` | `--Wh0: #FFFFFF` | 纯白 |
| Black | `--Ba` | `--Ba0: #000000` | 纯黑 |
| Pink | `--Pi` | `--Pi5: #FF6699` | **品牌粉** |
| Magenta | `--Ma` | `--Ma5: #EE5DDB` | 品红 |
| Red | `--Re` | `--Re5: #F85A54` | **强调红** |
| Orange | `--Or` | `--Or5: #FF7F24` | **操作橙** |
| Yellow | `--Ye` | `--Ye5: #FFB027` | **支付黄** |
| Lime | `--Ly` | `--Ly5: #FFCC00` | 柠檬黄 |
| LightGreen | `--Lg` | `--Lg5: #88CC24` | 浅绿 |
| Green | `--Gr` | `--Gr5: #2AC864` | **成功绿** |
| Cyan | `--Cy` | `--Cy5: #14C4BF` | 青 |
| LightBlue | `--Lb` | `--Lb5: #00AEEC` | **品牌蓝** |
| Blue | `--Bl` | `--Bl5: #6188FF` | 蓝 |
| Purple | `--Pu` | `--Pu5: #AC6DFF` | 紫 |
| Brown | `--Br` | `--Br5: #C19D84` | 棕 |
| Silver | `--Si` | `--Si5: #AFC0D5` | 银灰 |

`light_u` 变体 `--Ga0_u` 等用于明度微调场景。

## 语义 Token 映射 (map.css)

从色阶系统到业务语义的完整映射：

### 背景 (Background)

| Token | 值 | 用途 |
|-------|-----|------|
| `--bg1` | `--Wh0: #FFFFFF` | 主背景 |
| `--bg2` | `--Ga0: #F6F7F8` | 次要背景 |
| `--bg3` | `--Ga1: #F1F2F3` | 三级背景 |
| `--bg1_float` | `--Ga11: #FFFFFF` | 浮动层背景 |
| `--graph_bg_thin` | `--Ga0_s: #F6F7F8` | 图表/分割区域浅色 |

### 文字 (Text)

| Token | 值 | 用途 |
|-------|-----|------|
| `--text1` | `--Ga10: #18191C` | 主文字，高度可读 |
| `--text2` | `--Ga7: #61666D` | 次要文字 |
| `--text3` | `--Ga5: #9499A0` | 辅助/占位文字 |
| `--text4` | `--Ga3: #C9CCD0` | 最弱文字 |
| `--text_link` | `--Lb7: #00699D` | 链接色 |
| `--text_notice` | `--Ye6: #FA9600` | 通知色 |

### 线条 (Line)

| Token | 值 |
|-------|-----|
| `--line_light` | `--Ga1_s: #F1F2F3` |
| `--line_regular` | `--Ga2: #E3E5E7` |
| `--line_bold` | `--Ga3: #C9CCD0` |

### 图表/图形 (Graph)

| Token | 值 |
|-------|-----|
| `--graph_bg_thin` | `--Ga0_s: #F6F7F8` |
| `--graph_bg_regular` | `--Ga1_s: #F1F2F3` |
| `--graph_bg_thick` | `--Ga2: #E3E5E7` |
| `--graph_weak` | `--Ga3: #C9CCD0` |
| `--graph_medium` | `--Ga5: #9499A0` |
| `--graph_bold` | `--Ga7: #61666D` |
| `--graph_icon` | `--Ga7: #61666D` |

### 品牌/状态色

| Token | 色值 | 类型 |
|-------|------|------|
| `--brand_pink` | `--Pi5: #FF6699` | 品牌主色（粉） |
| `--brand_blue` | `--Lb5: #00AEEC` | 品牌辅色（蓝） |
| `--stress_red` | `--Re5: #F85A54` | 强调/警告 |
| `--success_green` | `--Gr5: #2AC864` | 成功 |
| `--operate_orange` | `--Or5: #FF7F24` | 操作提示 |
| `--pay_yellow` | `--Ye5: #FFB027` | 支付/金币 |

## 圆角 (Border Radius)

| 值 | 使用场景 |
|-----|---------|
| `2px` | 按钮、输入框、对话框、Toast |
| `3px` | 滚动条滑块 |
| `4px` | 卡片、弹窗、用户卡片、工具提示、Popover、下拉菜单 |
| `50%` | 头像、圆形按钮、开关滑块 |

## 阴影 (Box Shadow)

```css
/* 导航栏 */
box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.08);

/* 用户卡片 */
box-shadow: 0 2px 4px rgba(0,0,0,.16);

/* Popover / 下拉 */
box-shadow: 0 2px 12px 0 rgba(0,0,0,.1);

/* Message / 通知 */
box-shadow: 0 4px 12px rgba(0,0,0,.15);

/* Toast */
box-shadow: 0 4px 8px 0 rgba(0,0,0,.2);
```

## Z-Index 层级

| 层级 | 用途 |
|------|------|
| 2 | 输入框文字 |
| 3 | 表情选择按钮 |
| 10 | Toast/Message 容器 |
| 20 | "稍后再看"按钮、App 打开按钮 |
| 1002 | 顶栏 header |
| 1010 | Message 通知 |
| 2000 | 模态弹窗 overlay |
| 2021 | Toast (local) |
| 2022 | Common Toast |
| 10002 | 用户悬浮卡片 |
| 99999 | 图片预览 (van-album) |

## 栅格 & 间距

- **Header**: 固定定位, `height: 64px`, `padding: 0 24px`
- **Mini header**: `height: 56px`
- **页面主体**: `max-width: 2560px`, `width: 100%`
- **内容区域**: 通过 flex 弹性布局, 常用 `gap: 20px`
- **横向间距**: 常用 `margin-right: 20px` / `40px`

## 动画 & 过渡

```css
/* 默认过渡 */
transition: all .3s;

/* 链接 hover */
transition: color .2s;

/* 消息淡入淡出 */
transition: opacity .3s, transform .3s;

/* 开关切换（右侧滑入动画） */
transition: right .3s;

/* 弹窗入场/出场 */
@keyframes popup-bounce-in {
  0%   { transform: translateY(-50%) scale(0); }
  50%  { transform: translateY(-50%) scale(1.2); }
  100% { transform: translateY(-50%) scale(1); }
}

/* 开关检查动画 */
@keyframes bounce-in {
  0%   { transform: scale(0); }
  50%  { transform: scale(1.1); }
  100% { transform: scale(1); }
}

/* Toast 上滑 */
@keyframes fade-enter {
  opacity: 0;
  transform: translate(-50%, -20px);
}

/* 旋转加载 */
@keyframes rotateAuto {
  0%   { transform: translate(-50%,-50%) rotate(0deg); }
  100% { transform: translate(-50%,-50%) rotate(1turn); }
}
```

## 交互模式

- **链接/可点击项**: `cursor: pointer`, hover 时颜色变亮 (`color: #00a1d6`)
- **Disabled 状态**: `cursor: not-allowed`, `color: #9499a0`, `background-color: #e3e5e7`
- **Select 禁用**: `user-select: none`
- **Toast/Message**: fixed 居中或 top:100px 定位，auto-hide
- **弹窗**: overlay `rgba(0,0,0,.3)` / `rgba(0,0,0,.8)` + 居中卡片，bounce-in 动画

## 设计要点总结

1. **11 阶色阶体系**：每个色相从 0 (最浅) 到 10 (最深)，0-4 为浅色阶，5 为品牌/标准色，6-10 为深色阶。`_s`/`_t`/`_e` 后缀表示相同色值的不同明度微调版本。
2. **语义层与表现层分离**：`map.css` 将原始色阶 (`--Pi5`) 映射为业务语义 (`--brand_pink`)，业务代码只引用语义 Token。
3. **RGB 双轨制**：每个色值同时提供 Hex 和 RGB 版本（`--Pi5_rgb`），便于 `rgba()` 使用。
4. **轻量阴影层级**：只使用 3-4 种阴影深度，分别对应导航、卡片、浮层、Toast。
5. **极小圆角**：整体使用 2px/4px 小圆角，风格硬朗利落。
6. **最小动画时长**：统一 .2s / .3s，节奏快，不拖沓。
