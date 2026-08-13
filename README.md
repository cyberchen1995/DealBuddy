<p align="center">
  <img src="docs/brand/dealbuddy-logo.svg" alt="DealBuddy 购物搭子" width="460">
</p>

# DealBuddy 购物搭子

你在淘宝、天猫、京东打开商品详情页，DealBuddy 把页面上的标题、价格、SKU、规格文字和优惠条件采集到本地工作台。排序和报告在本机完成。追问可以接入你选择的外部 LLM。

## 做什么

- 从商品详情页采集标题、价格、SKU、店铺名、规格文字、优惠条件和采集时间
- 在浏览器本地用 PP-OCR 识别详情长图中的规格文字
- 按你设定的品类和需求对已采集商品排序
- 生成 Markdown 选品报告，包含最符合需求、最低预算、综合性价比、值得加预算、不推荐项五个章节
- 追问区围绕已采集商品继续分析（需配置外部 LLM Provider）

适合选电视、扫地机器人、家电、数码配件等参数密集型商品。

## 不做什么

- 不调用电商平台 API
- 不读取或导出购物平台 Cookie
- 不做验证码识别
- 不进入购物车、结算、订单或支付页面
- 不自动打开页面或翻页

采集只在用户当前浏览的详情页上工作。

## 快速开始

环境要求：Python >=3.12、`uv`、本机 Chrome 或 Chromium。

**让 Agent 帮你装**：把下面这段话发给能执行命令的 Agent（Claude Code、Codex 等），加载扩展的浏览器操作仍需你手动完成：

```text
帮我安装并启动 DealBuddy 购物搭子（https://github.com/cyberchen1995/DealBuddy）：
clone 仓库后 uv sync，用 uv run dealbuddy web --port 8765 启动本地工作台并保持运行；
从 https://github.com/cyberchen1995/DealBuddy/releases/latest 下载 dealbuddy-capture zip 并解压，
告诉我解压路径，我自己在 chrome://extensions 里加载；完成后提醒我访问 http://127.0.0.1:8765。
```

装好后 Agent 可通过 `skills/dealbuddy` 的 Agent Skill 直接操作工作台（建会话、读报告、追问分析，走本地 MCP）。

**手动安装**：

```bash
uv sync
uv run dealbuddy web --port 8765
```

浏览器访问 `http://127.0.0.1:8765`，在工作台新建一个购物研究会话。会话数据保存在 `~/.dealbuddy/sessions`，配置保存在 `~/.dealbuddy/config.json`。临时运行或测试时设置 `DEALBUDDY_HOME` 环境变量可以指向其他目录。

扩展加载方式：

1. 打开 Chrome 扩展管理页（`chrome://extensions`）。
2. 开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，指向 `extension/dealbuddy-capture/` 目录。

扩展默认投递到 `http://127.0.0.1:8765/api/current/offers`。工作台控制当前会话指针，扩展不需要手动填写 session id。

## Chrome 采集扩展

`extension/dealbuddy-capture/` 是 Chrome MV3 扩展，是商品事实的主要来源（已有结构化商品事实时，也可通过 MCP 的 `add_offer` 写入）。

扩展从你当前打开的淘宝、天猫、京东商品详情页读取标题、价格、SKU、店铺名和规格文字。采集分两次投递：第一次把页面可读字段发到工作台，几秒内商品列表就能看到这条商品；第二次在浏览器的隐藏 iframe 中用 PP-OCR 识别详情长图中的文字，完成后按同一链接覆盖更新。图片在浏览器内处理，只有识别出的文字随商品数据发到工作台。

点击扩展弹窗中的「整理当前商品信息」触发手动采集。勾选「启用自动采集」后，打开商品详情页时自动触发，只作用于当前页。投递失败时可在弹窗点击「复制 JSON」。

## 本地 Web 工作台

`dealbuddy web` 启动一个绑定 `127.0.0.1` 的本地服务，包含：

- **会话管理**：创建、选择和查看不同购买任务
- **商品列表**：标题、平台、店铺、页面展示价、SKU、采集时间、数据可信度
- **选品报告**：基于已采集商品和你设定的需求生成 Markdown 报告
- **追问区**：保留对话历史，由你配置的外部 LLM 回答，每轮回答后给出三个可点选的追问建议
- **LLM Provider 设置**：点击顶栏「LLM」状态胶囊打开弹窗，填写 Provider 名称、Chat Completions URL、模型名称和 API Key
- **界面主题**：自动（跟随系统）、浅色、深色，选择存在浏览器 localStorage 中

扩展采集入库后工作台在 4 秒内自动同步。从其他标签切回工作台时立即刷新，不需要手动操作。

## Agent Skill（MCP）

工作台在同一端口暴露本地 MCP endpoint：

```text
POST http://127.0.0.1:8765/mcp
```

提供 8 个工具：

- `create_session`
- `list_sessions`
- `show_session`
- `set_current_session`
- `add_offer`
- `refine_requirements`
- `get_report`
- `ask_session`

请求校验 `Origin`，只接受 localhost/127.0.0.1 来源。`skills/dealbuddy` 提供 Agent Skill 集成材料，用于把 DealBuddy 作为本地购物研究能力接入支持 MCP 的 agent。

命令行入口 `uv run dealbuddy` 同样可用于会话管理和报告生成，详见 `uv run dealbuddy --help`。

## 报告

报告在商品入库时自动生成，包含五个章节：

1. 最符合需求
2. 最低预算
3. 综合性价比
4. 值得加预算
5. 不推荐项

每个章节的商品记录包含：商品标题与链接、平台、店铺、匹配分、SKU、页面展示价、估算应付、可见优惠、优惠条件、优劣短评、复核时间、数据可信度。有过追问对话后，重新生成报告会在末尾并入「追问记录」章节。

## 价格口径

DealBuddy 区分以下价格和数据字段：

| 字段 | 模型属性 | 含义 |
|---|---|---|
| 标价 | `listed_price` | 划线价或标签价格 |
| 页面展示价 | `visible_price` | 商品详情页当前展示的价格 |
| 可见优惠 | `coupon` | 页面上明确显示的优惠信息 |
| 估算应付 | `estimated_payable` | 根据页面可直接解析的优惠估算的金额 |
| 优惠条件 | `conditions` | 适用前提，如会员、地区、满减、国补或活动期限 |
| 复核时间 | `verified_at` | 扩展采集该商品信息的时间 |
| 数据可信度 | `confidence` | 提取数据完整性评估，值为 high、medium 或 low |

`estimated_payable` 在所有输出中标注为「估算应付」，不描述为结算价格或到手价。

报告顶部固定免责句：

> 价格来自页面可见信息。估算应付只计算页面明确展示且可直接解析的优惠，不代表结算价格。

## 追问与 LLM

追问功能需要你在工作台配置外部 LLM Provider。入口：点击顶栏「LLM」状态胶囊，在弹窗中填写：

- Provider 名称
- Chat Completions URL
- 模型名称
- API Key

配置写入 `~/.dealbuddy/config.json`（设置了 `DEALBUDDY_HOME` 时为 `$DEALBUDDY_HOME/config.json`）。API Key 不出现在接口响应、日志或仓库文件中，界面用掩码显示。

配置完成后：

- 追问区可用，输入问题后由你配置的 LLM 回答
- 等待首字时显示「思考中...」指示
- 每轮回答后给出三个可点选的追问建议（参数或规格差异、价格或优惠条件、使用场景取舍各一条）
- 商品入库后自动生成优劣短评，重新生成报告时也会调用 Provider（会话需求与商品数据随请求发出）
- 工作台隐私提示变为「外部分析已启用，商品数据可能发送到 {provider_name}。」

未配置或未启用时：

- 追问区显示引导条「追问需要外部 LLM。采集与报告仍在本地完成。」
- 追问输入框 placeholder 为「配置外部 LLM 后可追问」
- 采集、排序、报告不受任何影响

## 数据边界

- 工作台服务绑定 `127.0.0.1`，外部网络无法访问
- 无账号体系
- 会话文件在 `~/.dealbuddy/sessions/`，配置在 `~/.dealbuddy/config.json`
- 详情图在浏览器扩展的隐藏 iframe 中做 OCR，图片不经过工作台传输
- 外部请求只在配置并启用 LLM 后发生：追问、商品优劣短评、报告再生成会把会话需求与商品数据发给你配置的 Provider；未配置时没有任何外部请求
- API Key 写入 `config.json` 后不出现在接口响应或日志中
- 扩展不读取购物平台的 Cookie
- MCP 请求校验 `Origin`，拒绝非 localhost 来源

## 开发

### 测试

```bash
uv run pytest                                     # Python 测试
node --test "tests/extension/**/*.test.cjs"        # 扩展测试
uv run ruff check .                                # lint
```

Python 测试在本地运行，不访问购物网站，不启动浏览器。通过 `DEALBUDDY_HOME` 环境变量隔离测试数据，避免污染 `~/.dealbuddy`。扩展测试使用 Node 内置测试运行器（`node:test`）。

### 结构概览

```text
src/dealbuddy/                    Python 包
  web.py                          FastAPI 工作台 + MCP（中枢）
  cli.py                          CLI 入口
  session.py                      会话状态机
  models.py                       数据模型（VerifiedOffer 等）
  reporting.py                    Markdown 选品报告生成
  ranking.py                      商品排序
  matching.py                     需求匹配
  config.py                       配置管理（DEALBUDDY_HOME）
  static/index.html               工作台单文件 UI

extension/dealbuddy-capture/      Chrome MV3 采集扩展
  content-script.js               页面采集
  popup.html / popup.js           扩展弹窗
  ocr-frame.html / ocr-frame.js   本地 PP-OCR iframe
  settings-utils.js               设置管理
  auto-capture-utils.js           自动采集与懒加载等待

skills/dealbuddy/                 Agent Skill 集成材料
```

## 开源材料

- 更新日志：`CHANGELOG.md`
- 许可证：MIT
- 贡献指南：`CONTRIBUTING.md`
- 安全政策：`SECURITY.md`
- 第三方资产说明：`docs/THIRD_PARTY_ASSETS.md`（已知问题：扩展内三个提取自第三方扩展的 OCR 运行时 bundle 暂无可核实许可证，上架 Chrome 商店前需替换，详见该文档）
