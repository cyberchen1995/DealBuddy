---
name: dealbuddy
description: 帮用户用 DealBuddy 购物搭子在淘宝、天猫、京东做本地购物研究。用户手动用浏览器扩展采集商品详情，DealBuddy Web 工作台保存会话、商品事实、报告和追问记录；agent 通过本地 MCP 工具创建会话、补充需求、读取报告和追问分析。不调用购物平台 API、不做浏览器自动化、不导出 Cookie、不下单结算。
---

# DealBuddy

## Overview

DealBuddy 购物搭子是本地优先的购物研究工作台。商品事实来自用户在真实商品详情页手动采集，
Web 服务负责保存会话、接收扩展投递、生成报告，并暴露本地 MCP 工具给 agent 使用。

首次执行前阅读 [命令与 MCP 协议](references/command-contract.md)。

## Workflow

### 1. Ensure Web Server

确认本地 Web 服务可用。需要启动时，在项目根目录运行：

```bash
uv run dealbuddy web --port 8765
```

服务只监听 `127.0.0.1`。Web 工作台地址为 `http://127.0.0.1:8765`，MCP endpoint 为
`POST http://127.0.0.1:8765/mcp`。

### 2. Create Or Select Session

优先通过 MCP 工具操作会话：

- `create_session`：创建购物研究会话并设为当前会话。
- `list_sessions`：查看本地会话和当前会话。
- `show_session`：读取一个会话的商品、报告和追问记录。
- `set_current_session`：切换浏览器扩展投递目标。

已有合适会话时不要重复创建。用户只给出品类和模糊需求时，也可以先创建会话，再用追问补全。

### 3. Guide Manual Capture

引导用户在 Chrome 加载 `extension/dealbuddy-capture/` 扩展，并打开淘宝、天猫或京东商品详情页。
当前会话由 Web 工作台控制，扩展默认投递到：

```text
http://127.0.0.1:8765/api/current/offers
```

agent 不自动浏览商品页，不读取 Cookie，不处理登录态。遇到平台登录、验证码或风控提示时，
由用户在浏览器里自行处理。

### 4. Analyze And Refine

采集商品后，通过 MCP 工具读取和分析：

- `get_report`：读取 Markdown 选品报告。
- `ask_session`：围绕当前商品事实、报告和追问记录继续分析。
- `refine_requirements`：把用户新增偏好合并到会话需求。
- `add_offer`：只有当用户或其他工具已经提供结构化商品事实时使用。

每轮只问 1-3 个高信息量问题。优先补齐预算、用途、硬性规格、品牌排除、安装限制、
售后和可接受的取舍。

### 5. Explain Results

解释结果时按用户目标组织，不机械朗读字段。保留商品链接、SKU、页面展示价、优惠条件、
采集时间、数据可信度和报告中的价格边界说明。

`estimated_payable` 只能称为“估算应付”，不能描述为结算价或最终到手价。

## Guardrails

- 不调用购物平台 API，不做浏览器自动化抓取。
- 不读取或复制用户 Chrome Profile，不导出 Cookie、密码或登录凭据。
- 不破解验证码，不使用代理池、账号池或指纹伪造。
- 不点击购物车、结算、订单或支付入口。
- 不把销量、评价数或平台标签单独当作商品质量结论。
- 页面证据冲突时，以最近一次采集为准，并提示用户需要复核。
