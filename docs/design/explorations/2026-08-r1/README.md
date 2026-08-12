# 视觉方向探索 · 2026-08 第 1 轮

前端持续迭代 goal 的 V1 轮产物:6 个差异化方向的工作台 mockup,供选定统一视觉方向。

**结论:选定方向 2 柔和亲和风**,定义见 [../../direction.md](../../direction.md),
token 规范见 [../../tokens.md](../../tokens.md)。

## 文件

- [index.html](index.html) — 对比索引页
- direction-1 ~ direction-6 — 六个方向,每个都是自包含 HTML:
  页内右上角可切换亮/暗;底部附「组件状态样张」(按钮四态/消息分级/危险确认/空状态)。

## 说明

- 骨架的主界面区块(头部/三栏/商品卡/报告/对话/表单)与线上工作台
  (`src/dealbuddy/static/index.html`)的 class 一一对应,内容为自拟仿真数据
  (降噪耳机会话),不含真实采集数据。**例外**:左栏 LLM 设置表单在 mockup 中简化为
  一条摘要,其完整表单类(`toggle-row` / `field-grid` / `provider-grid` / `wide`)
  未在 mockup CSS 中覆盖——该区域已决定在 X8 轮重做为独立弹窗,V2 换肤时先给这些类
  从简的过渡样式。
- 每稿覆盖统一验收清单:三栏全区块、含「估算应付」的商品卡、报告排版、对话气泡、
  按钮四态、消息提示分级、删除确认、空状态。
- mockup 中的动效仅文字标注,未实现;`prefers-reduced-motion` 与两档窄幅断点已含。
- 这些文件是决策证据存档,不随后续迭代维护。
