# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本。

## [0.3.0] - 2026-07-14

### Fixed

- LLM Provider 保存设置 / 采集入库不再被同步 LLM 调用阻塞（最坏 30s → 实测 4ms）：
  商品短评移到后台线程，修复配置 provider 后偶发的 `TypeError: Failed to fetch`。
- 会话并发写入丢失：后台摘要线程会用陈旧快照覆盖同期采集的商品。改为进程内写锁 +
  LLM 调用移出锁外 + 回写前重载最新会话、按 URL 只合并短评（新增并发回归测试）。
- `_llm_endpoint` 归一化破坏带 query（Azure `?api-version=`）或自建网关路径的地址：
  改为只改 path、保留 query、无法识别的自定义路径逐字保留。

### Security

- `POST /api/settings/llm/test` 增加本机来源校验（与 `/mcp` 同标准）：挡住电商详情页
  脚本借该端点做跨站 SSRF——外泄已存 API Key 或探测本机/内网端口。

### Added

- LLM Provider 设置区「测试连接」按钮 + 服务端 `POST /api/settings/llm/test` 连通性
  诊断（连接被拒绝 / 超时 / HTTP 401 / 域名解析失败…），把裸报错换成可行动的结论。
- Release GitHub Action：推送 `v*` tag 后跑全量测试门禁，把 Chrome 扩展打包成
  `dealbuddy-capture-<version>.zip` 并自动创建 GitHub Release（release note 基于
  commit 自动生成）。

### Changed

- 界面主题由绿色改为 **Data-Dense Dashboard**（蓝 `#1E40AF` + 琥珀 `#D97706` 价格高亮，
  明/暗两套），价格与数字统一 `tabular-nums`，阴影收敛为 dashboard 气质。
- 采集改为**两阶段投递**：先把商品送达工作台（几秒可见），本地 OCR 完成后再按 URL
  覆盖更新——显著降低体感等待；OCR 失败也不再丢失已采集商品。
- OCR **跳过动图（`.gif`）**：动图无规格表、只能读到第 0 帧，减少识别张数、加快本地 OCR。
- Chrome 商店截图更新为新主题（1280×800，深色，真实会话数据）。
- `docs/THIRD_PARTY_ASSETS.md` 完成一轮真实核实：onnxruntime-web 1.22.0（MIT）、
  PP-OCRv4 模型与字典（Apache-2.0）确认干净；同时如实记录了三个提取自原第三方扩展、
  暂无可核实许可证的 JS bundle（`api-CHoCPO3e.js` / `esearch-ocr` / 比价 UI 部分），
  公开发布前需替换——详见该文档 Public Release Gate 一节。

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
