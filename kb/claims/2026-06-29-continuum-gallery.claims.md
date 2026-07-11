# Claims: Continuum Gallery

## Metadata

source: [[kb/sources/2026-06-29-continuum-gallery]]
source_path: kb/sources/2026-06-29-continuum-gallery.md
status: active
updated_at: 2026-06-30

## Claims

- [definition] Continuum Gallery 是一个基于 Google Photos Picker API 的单页应用，提供三种图片浏览模式。
- [mechanism] 使用 Vanilla JS 无框架实现复杂 UI，部署在 GitHub Pages，无需后端服务器。
- [definition] 设计系统使用 CSS 自定义属性（Custom Properties）实现日间/夜间双主题切换。
- [mechanism] 多层 CSS 背景叠加（网格点阵、渐变光照、径向过渡、纸纹纹理）创造纸张/胶片质感。
- [mechanism] 夜间模式不是简单反色，而是重新设计的深空主题色彩体系。
- [mechanism] 使用 contain 和 will-change CSS 属性进行性能优化，限制重排重绘范围。
- [procedure] 使用流程：配置 Google Cloud Client ID → OAuth 授权 → 选择照片 → 三种模式切换浏览。
