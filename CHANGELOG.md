# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本。

## [0.7.0] - 2026-08-13

### Changed

- **扩展 popup 换肤为柔和亲和风**,并首次支持深色模式(跟随系统)。设计 token 抽为
  `extension/dealbuddy-capture/tokens.css`(popup 引用),与工作台同一套色板;
  popup 的动效补齐 `prefers-reduced-motion` 降级。
- 新增 token 一致性测试:工作台与插件 tokens.css 的明暗两套变量逐值比对
  (含工作台暗色双挂两处),漏同步任何一处发版门禁直接失败。

## [0.6.1] - 2026-08-13

### Fixed

- 实时同步重绘不再打断正在看的内容:商品卡展开状态按链接还原,商品列表/报告滚动
  位置保持,回看追问历史时不再被拽到底部(贴底时仍跟随新消息),列表内焦点尽量归还。

## [0.6.0] - 2026-08-13

### Changed

- 全局提示改为右上角 **toast**:自动消失（错误停留更久）、悬停暂停、点击关闭、可堆叠；
  不再固定在左栏底部常驻，操作反馈出现在视线附近。
- 接口报错在页面上只显示可读的错误说明，完整原始响应转入浏览器控制台，方便排查
  又不再刷屏。

## [0.5.1] - 2026-08-13

### Changed

- README 面向新用户完全重写:做什么/不做什么开篇、快速开始新增「让 Agent 帮你装」
  提示词、三件套分述、价格口径表(含模型属性列)、追问与 LLM 的 0.5.0 语义、
  数据边界与开发章节。
- Agent Skill(`skills/dealbuddy`)新增 First-Time Setup:首次安装链路
  (clone / uv sync / 下载 Releases latest 扩展)与服务健康检测;明确浏览器加载
  扩展由用户手动完成。
- 落地页(website 分支)同步重做,下载入口改指 Releases latest。

## [0.5.0] - 2026-08-13

### Added

- **追问建议**:每次回答完成后自动生成 3 个互不重复的追问(参数差异 / 价格与优惠条件 /
  场景取舍各一),以可点击的气泡显示在对话下方,点击即发送;生成失败静默,不影响主对话。
- 等待 LLM 首字期间,回复气泡显示「思考中…」动态指示,不再是空白。

### Changed

- **追问改为必须配置外部 LLM**(行为变更):未配置时追问区禁用,显示引导条一键打开
  设置弹窗;直接调用接口(REST 与 MCP `ask_session`)返回明确错误;「本地规则回答」
  从追问下线。采集、报告等本地功能不受影响。
- LLM 调用失败时不再回落到本地规则回答,改为在对话中说明失败原因与检查入口。
- 设置弹窗与追问区的说明文案按新语义更新:「采集与报告只在本地完成；追问需要配置
  外部 LLM。」

## [0.4.0] - 2026-08-12

### Changed

- 工作台整体换肤为「**柔和亲和风**」(0.3.1 选定的方向落地):奶油底、大圆角、陶土橘
  主按钮、蜜色价格贴纸、对话气泡有了方向感;暗色改为不发蓝的暖炭调。全部颜色收敛到
  `--db-*` design token(明暗两套,规范见 `docs/design/tokens.md`),非颜色 token
  (圆角/字重/动效时长)同步落地,字重收敛为 400/600 两档。

### Added

- 顶栏新增界面主题切换:**自动(跟随系统)/ 浅色 / 深色** 三态,选择记在浏览器本地
  (localStorage),刷新不闪屏。
- **LLM Provider 设置改为独立弹窗**:点顶栏「LLM」状态胶囊打开,不再挤在左栏折叠区;
  支持 Esc / 点遮罩 / 关闭按钮退出,键盘 Tab 焦点圈在弹窗内,关闭后焦点回到入口。
- 报告区增加高度上限(超长报告内部滚动,追问区不再被推远);滚动容器统一细滚动条;
  空的全局消息位不再占位。界面结构与交互逻辑无变化。
- LLM 设置区:输入框在米色容器内改为白底(修复与容器同色融合导致的"无边框"观感);
  已保存的 API Key 占位提示改为掩码圆点,不再以明文展示脱敏预览。

## [0.3.1] - 2026-08-12

### Added

- 选定统一视觉方向「**柔和亲和风**」并沉淀设计规范（本版仅文档与设计资产，界面代码未动，
  换肤在后续版本落地）：
  - `docs/design/tokens.md`：三套 UI（工作台 / 扩展 popup / 采集浮层）共用的 `--db-*`
    design token 规范——色板明暗两套、圆角、间距梯度、字号字重、阴影三级、动效与 z-index。
  - `docs/design/direction.md`：方向定义、do/don't、六个候选方向的落选理由。
  - `docs/design/explorations/2026-08-r1/`：六个方向的可交互 mockup 存档（亮/暗可切换，
    含组件状态样张），作为决策证据与后续换肤底稿。

### Changed

- `docs/brand/README.md` 色彩节拆分为「品牌标识色」与「产品界面色板」：界面色以
  `docs/design/tokens.md` 为唯一来源，终结品牌文档 / CHANGELOG / 工作台 / popup 四处
  色值互不一致的状态。

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
