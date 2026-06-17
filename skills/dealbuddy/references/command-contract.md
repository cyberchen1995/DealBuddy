# DealBuddy Web 与 MCP 协议

## Project Root

优先在 DealBuddy 仓库根目录执行命令。需要从其他目录调用时，设置
`DEALBUDDY_PROJECT_ROOT` 指向本地仓库：

```bash
PROJECT_ROOT="${DEALBUDDY_PROJECT_ROOT:-$PWD}"
```

所有命令通过项目环境执行：

```bash
uv run --project "$PROJECT_ROOT" dealbuddy COMMAND
```

## Web Server

启动本地工作台：

```bash
uv run --project "$PROJECT_ROOT" dealbuddy web --port 8765
```

服务只监听 `127.0.0.1`。Web 工作台负责：

- 创建、选择和保存会话
- 接收浏览器扩展投递的商品事实
- 展示商品详情、Markdown 报告和追问记录
- 保存可选 LLM Provider 配置
- 暴露 MCP endpoint 给 agent 使用

浏览器扩展默认投递到：

```text
http://127.0.0.1:8765/api/current/offers
```

## MCP Endpoint

```text
POST http://127.0.0.1:8765/mcp
```

MCP 使用 JSON-RPC 请求。浏览器来源会校验 `Origin`，仅接受本机来源；非浏览器客户端可以
不发送 `Origin`。

列出工具：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

调用工具：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "create_session",
    "arguments": {
      "category": "电视",
      "request": "预算 5000 元以内，65 英寸，主要看电影"
    }
  }
}
```

## Tools

- `create_session`：创建 DealBuddy 购物研究会话并设为当前会话。
- `list_sessions`：列出本地会话和当前会话。
- `show_session`：读取一个会话的完整状态。
- `set_current_session`：切换浏览器扩展投递目标。
- `add_offer`：添加或更新一个结构化商品事实。
- `refine_requirements`：合并结构化需求变更。
- `get_report`：读取会话 Markdown 报告。
- `ask_session`：围绕会话商品、报告和追问记录继续分析。

## Data Rules

- 商品事实来自用户手动采集或用户明确提供的结构化数据。
- 不从终端日志、页面截图或模型猜测中制造商品参数。
- 页面展示价、优惠条件和估算应付都必须保留来源边界。
- `estimated_payable` 只能称为“估算应付”，不代表结算价格。

## Error Handling

- 找不到会话时，先调用 `list_sessions` 或请用户在工作台创建会话。
- 没有商品时，先引导用户用浏览器扩展采集候选商品。
- MCP 工具返回错误时，保留错误文本并说明下一步需要用户做什么。
- LLM 未配置时，继续使用本地规则、排名和报告，不要求用户必须配置外部服务。
