<p align="center">
  <img src="docs/brand/dealbuddy-logo.svg" alt="DealBuddy 购物搭子" width="460">
</p>

# DealBuddy 购物搭子

本地购物研究工具，本地优先、证据优先。Local shopping research with manual browser capture, private-by-default analysis, optional LLM help, and MCP integration.

DealBuddy 购物搭子帮你把淘宝、天猫、京东商品详情整理成可比较的事实：页面展示价、SKU、店铺、规格、OCR 详情图文字、优惠条件和采集时间。你负责打开真实商品页，它负责把信息收进本地工作台，生成报告，并围绕候选商品继续追问。

它不是抢券工具，也不是自动化爬虫。DealBuddy 不接入购物平台 API，不导出 Cookie，不绕过验证码，不进入购物车、结算、订单或支付页面。它的核心目标是让一次购买决策有证据、有上下文、有边界。

## 适合做什么

- 选电视、扫地机器人、家电、数码配件等参数密集型商品
- 比较不同平台、店铺、SKU、价格条件和页面证据
- 把详情长图里的规格文字用本地 OCR 补进商品资料
- 生成带采集时间和价格说明的 Markdown 决策报告
- 在本地工作台里继续追问：哪款更稳、哪款便宜但有妥协、哪些信息还缺

## 快速开始

环境要求：

- Python 3.12
- `uv`
- 本机 Chrome 或 Chromium

```bash
uv sync
uv run dealbuddy web --port 8765
```

打开 `http://127.0.0.1:8765`，在工作台创建一个购物研究会话。会话数据默认保存在 `~/.dealbuddy/sessions`，本机配置保存在 `~/.dealbuddy/config.json`。测试或临时运行可以用 `DEALBUDDY_HOME` 指向另一个目录。

## 工作流

1. 在 Web 工作台输入品类和原始需求，例如“预算 5000 内，65 英寸，主要看电影”。
2. 在 Chrome 加载 `extension/dealbuddy-capture/` 扩展。
3. 打开淘宝、天猫或京东商品详情页。
4. 点击扩展弹窗里的“整理当前商品信息”，或开启自动采集。
5. 回到工作台查看商品列表、报告和追问区。

扩展默认提交到 `http://127.0.0.1:8765/api/current/offers`。当前会话由工作台控制，不需要在扩展里手填 session id。

## Web 工作台

`dealbuddy web` 启动一个只监听 `127.0.0.1` 的本地服务，包含：

- 会话：创建、选择、查看不同购买任务
- 商品表：标题、平台、店铺、页面展示价、SKU、采集时间、可信度
- 报告：基于已采集商品生成 Markdown 选品报告
- 追问：保存对话历史，用本地规则或可选 LLM 继续分析
- 设置：配置 LLM Provider，查看脱敏后的密钥状态
- MCP：给 agent 和 skill 使用的本地工具接口

默认分析只使用本地规则、排名和报告逻辑。只有你在设置里启用 LLM Provider 后，追问区才会调用外部模型，并显示当前 provider 和数据发送提示。

## 浏览器扩展

`extension/dealbuddy-capture/` 是 Chrome MV3 扩展，是商品事实的主要来源。

加载方式：

1. 打开 Chrome 扩展管理页。
2. 启用“开发者模式”。
3. 选择“加载已解压的扩展程序”并指向 `extension/dealbuddy-capture/`。

扩展会等待详情图加载，并在本地隐藏 iframe 中运行 OCR 来补全图片里的规格文本。OCR 在浏览器本地执行，图片不会上传到 DealBuddy 服务之外。

## 可选 LLM Provider

在工作台的 LLM Provider 设置中填写：

- Provider 名称
- Chat Completions URL
- 模型名称
- API Key

配置写入 `DEALBUDDY_HOME/config.json`。API Key 不会出现在 API 响应、日志或仓库文件中，界面只显示脱敏状态。配置不完整或未启用时，追问区使用本地规则回答。

## MCP 和命令行

本地 MCP endpoint：

```text
POST http://127.0.0.1:8765/mcp
```

可用工具：

- `create_session`
- `list_sessions`
- `show_session`
- `set_current_session`
- `add_offer`
- `refine_requirements`
- `get_report`
- `ask_session`

MCP 请求会校验 `Origin`，只接受 localhost/127.0.0.1 来源。`skills/dealbuddy` 提供 Agent Skill 集成材料，适合把 DealBuddy 作为本地购物研究能力接入 Codex 或其他支持 MCP 的 agent。

命令行接口适合脚本和自动化测试：

```bash
uv run dealbuddy start --category 电视 --request '预算 5000 元以内，65 英寸，主要看电影'
uv run dealbuddy intake SESSION_ID --port 8765
uv run dealbuddy search SESSION_ID
uv run dealbuddy questions SESSION_ID
uv run dealbuddy refine SESSION_ID --changes '{"preferences":{"panel_type":"Mini LED"}}'
uv run dealbuddy report SESSION_ID
```

## 价格定义

- `listed_price`：划线价或标价
- `visible_price`：详情页展示价
- `coupon`：页面明确显示的优惠
- `estimated_payable`：仅根据可直接解析的页面优惠估算
- `conditions`：会员、地区、满减、国补或活动期限
- `verified_at`：采集时间

`estimated_payable` 永远不会被描述为结算价格。

## 测试

```bash
uv run pytest
node --test "tests/extension/**/*.test.cjs"
uv run ruff check .
```

Python 测试只使用本地数据，不访问真实购物网站，也不启动浏览器。扩展测试使用 Node 内置测试运行器。

## 开源材料

- 许可证：MIT
- 贡献指南：`CONTRIBUTING.md`
- 安全政策：`SECURITY.md`
- 第三方资产说明：`docs/THIRD_PARTY_ASSETS.md`

`参考/` 目录只用于本地设计参考，不属于公开发布内容。
