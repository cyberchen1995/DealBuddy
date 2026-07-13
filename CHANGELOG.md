# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本。

## [0.2.0] - 2026-07-13

### Added

- Web 工作台（`dealbuddy web`）：会话管理、商品列表、Markdown 报告、追问区（SSE 流式）、
  LLM Provider 设置，仅监听 `127.0.0.1`。
- 本地 MCP endpoint（`POST /mcp`）：`create_session` / `list_sessions` / `show_session` /
  `set_current_session` / `add_offer` / `refine_requirements` / `get_report` / `ask_session`。
- 工作台**实时同步**：扩展采集入库后 4s 内自动刷新；切回工作台标签立即同步，无需手动刷新。
- 扩展采集结果**自动投递**到 `http://127.0.0.1:8765/api/current/offers`（popup 可配置）。
- OCR 结果 **IndexedDB 缓存**（按图片 URL）+ 图片下载预取管道 + 采集开始时模型**预热**，
  重复采集近乎即时，首次采集初始化与等图并行。
- 开源材料：MIT LICENSE、CONTRIBUTING.md、SECURITY.md、THIRD_PARTY_ASSETS.md。

### Changed

- 架构从「Playwright 浏览器自动化」全面切换为「用户手动采集（扩展）+ 本地接收处理」。
- 详情图懒加载等待收敛策略：图片数稳定 2 拍 + 最短 3.6s / 上限 12s；滚动只在
  未发现图片或图片数仍在增长（京东分块渲染）时继续，**结束后还原用户滚动位置**。
- 详情图地址优先取 `data-src` 等懒加载属性并过滤占位图（修复天猫仅采到 1-2 张图）。
- 移除「本店推荐/看了又看」标题边界裁剪（天猫该文案位于详情区顶部 tab，误裁整个详情）。

### Removed

- Playwright 依赖与 `browser.py`/`platforms/` 适配器、`research`/`resume`/`login` 浏览器命令。
- 慢慢买等第三方比价 API 方案（服务已停用）。

## [0.1.0] - 2026-06-16

- 初始版本：CLI 会话状态机、采集插件原型（DOM 提取 + 本地 PP-OCR）、单会话 intake 服务。
