---
title: Continuum Gallery — Google Photos 瀑布流展示
source_url: https://uuuuytgg.github.io/continuum-gallery/
captured_at: 2026-06-29
tags: [gallery, google-photos, design-system, css, canvas, waterfall-layout, frontend]
site_name: GitHub Pages
language: zh-CN
---

# Continuum Gallery

> 一个基于 Google Photos Picker API 的精美图片展示应用，支持三种沉浸式浏览模式。

## 项目概览

Continuum Gallery 是一个单页应用 (SPA)，通过 **Google Photos Picker API** 导入用户照片，并以三种视觉模式展示。页面不需要后端服务器，纯前端实现，部署在 GitHub Pages 上。

**仓库**: [uuuuytgg/continuum-gallery](https://github.com/uuuuytgg/continuum-gallery)

---

## 展示模式

### 1. 瀑布流 (Waterfall) — 默认模式
- Masonry 布局，图片卡片以瀑布流排列
- 悬停时卡片上移 4px 并提亮
- 支持滚动浏览
- 带渐变遮罩的文字说明

### 2. 滑动 (Orbit)
- 图片以圆形/轨道方式排列，可拖拽旋转
- 圆形卡片 + 径向渐变光晕
- 图片去饱和度 + 对比度增强
- 触屏手势支持

### 3. 粒子 (Sphere)
- 图片像粒子云一样悬浮在 3D 空间中
- 圆形卡片 + 多重辉光 + 屏幕混合模式
- 图片转灰度 + 高对比度
- Canvas 粒子系统增强沉浸感

---

## 设计系统

### 色彩体系

| Token | 日间模式 | 夜间模式 |
|-------|---------|---------|
| `--bg` | `#f4efe6` 暖米白 | `#020516` 深蓝黑 |
| `--ink` | `#17130f` 深棕 | `#f1fbff` 冷白 |
| `--muted` | `rgba(23,19,15,0.62)` | `rgba(207,229,236,0.7)` |
| `--panel` | `rgba(255,250,240,0.74)` | `rgba(5,17,42,0.68)` |
| `--amber` | `#d8c59e` | `#f1f6df` |
| `--coral` | `#082b83` | `#5a7dff` |
| `--teal` | `#78c5d6` | `#b7efe4` |
| `--violet` | `#5868c9` | `#b9a7dc` |
| `--blue` | `#082b83` | `#002fa7` |
| `--blue-deep` | `#06153f` | `#06153f` |
| `--paper` | `#fffaf0` | `rgba(241,251,255,0.94)` |

### 字体
- **主字体**: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI`
- **中文字体**: `Microsoft YaHei`
- **字重**: Regular (400) / Bold (680/720/760/800)

### 背景系统
多层背景叠加构成丰富质感：
- **网格点阵**: `linear-gradient` 微细 96px 网格线（透明度仅 3-4%）
- **渐变光照**: 120° 方向蓝色调渐变
- **径向过渡**: 从上到下的暖色到冷色渐变
- **叠加层**: `::before` 伪元素实现纸纹纹理 + 渐变蒙版
- **染色层**: `::after` 伪元素实现 `multiply` 混合模式的蓝色调

### 夜间模式背景
- 多层径向渐变模拟星空/极光效果
- 四个不同颜色的径向光晕（蓝、青、紫、暖黄）
- 斜线纹理 (`repeating-linear-gradient`)
- `mix-blend-mode: screen` 实现发光效果

### UI 组件样式

**品牌栏 (Topbar)**
- 毛玻璃效果: `backdrop-filter: blur(22px) saturate(1.08)`
- 边框: 1px 半透明线条
- 阴影: `0 18px 54px rgba(23,19,15,0.08)` + `inset 0 1px 0 white`
- 品牌标识: 锥形渐变圆形 (`conic-gradient`)

**图片卡片**
- 圆角 6px（瀑布流）/ 圆角 50%（轨道和粒子模式）
- 多层阴影 + 内发光
- `contain: layout paint style` 性能优化
- `will-change: transform, width, height, opacity, border-radius`
- 动画: `transition: transform 720ms cubic-bezier(0.2,0.82,0.18,1)`

**沉浸式按钮**
- 深蓝背景 + 白色文字
- 夜间模式: 渐变亮蓝背景 + 深色文字

**单图查看器 (Viewer)**
- 全屏黑色半透明遮罩
- 缩放/平移控制
- 底部半透明信息栏
- 飞行克隆动画（切换时的过渡动画）

### Canvas 层
- **粒子 Canvas** (`particle-canvas`): 粒子系统，不同模式下透明度不同
- **颗粒 Canvas** (`grain-canvas`): 胶片颗粒纹理，mix-blend-mode 混合

---

## 技术架构

### 依赖
- **Google Identity Services** (`accounts.google.com/gsi/client`): OAuth 登录
- **Google Photos Picker API**: 照片选择和数据获取
- **Vanilla JS**: 无框架，纯原生 JavaScript
- **Canvas API**: 粒子系统和颗粒效果

### 关键特性
- **Desktop Zoom Lock**: 通过 CSS `var(--desktop-zoom-lock-scale)` 和 `transform` 实现高 DPI 下的像素级缩放锁定
- **手势识别**: 通过摄像头 (`gesture-video`) 实现手势控制
- **主题切换**: 通过 `data-theme` 属性切换日间/夜间模式
- **模式切换**: 通过 `data-mode` 属性切换三种展示模式
- **响应式**: 通过 `html.is-mobile-ua` 类适配移动端
- **无障碍**: `aria-label`, `aria-pressed`, `aria-hidden` 等属性

### 性能优化
- `contain: layout paint style` 限制重排重绘范围
- `will-change` 提示浏览器提前优化
- `backface-visibility: hidden` 避免闪烁
- `prefers-reduced-motion` 媒体查询尊重用户减少动效偏好

---

## 如何使用

1. 点击右上角 **G Photos** 按钮打开配置面板
2. 填入 **Client ID**（来自 Google Cloud Console）
3. 配置 OAuth 同意屏幕和授权来源
4. 点击 **选择照片** 连接 Google Photos
5. 导入后在三种模式间切换浏览

---

## 设计亮点

- **无框架** 实现复杂 UI，性能极佳
- 多层 CSS 背景叠加创造纸张/胶片质感
- 三种模式各有独立的视觉语言（卡片形状、滤镜、光照、阴影）
- 夜间模式不是简单反色，而是重新设计的深空主题色彩体系
- 品牌标识的锥形渐变与整体蓝色调呼应
- 微交互动效（悬停上移、点击反馈、模式切换过渡）
- 颗粒和粒子 Canvas 层增强沉浸感
