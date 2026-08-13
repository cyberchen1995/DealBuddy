# DealBuddy 设计 Token 规范

方向:**柔和亲和风**(2026-08 V1 轮选定,见 [direction.md](direction.md))。
本文件是三套 UI(Web 工作台 / 插件 popup / 采集页浮层)的 token 唯一规范。

**值的机器真相(按迭代阶段)**:
- **V2 换肤落地前:本文件即真相**(`index.html` 此时仍是旧 Data-Dense Dashboard 变量,
  无 `--db-*` 块);
- V2 起:`src/dealbuddy/static/index.html` 的 `:root` 块;
- V3 起(0.7.0,现行):`extension/dealbuddy-capture/tokens.css`,工作台手抄同步,
  一致性由 `tests/extension/design-tokens-sync.test.cjs` 断言(含工作台暗色双挂
  两处的一致性)。

变量统一 `--db-` 前缀。亮色定义在 `:root`,暗色覆盖同名变量
(工作台:`@media (prefers-color-scheme: dark)` 与 `[data-theme="dark"]` 双挂;
插件:仅 media query)。

## 色板

| 变量 | 亮色 | 暗色 | 用途 |
|------|------|------|------|
| `--db-bg` | `#faf6f0` | `#211d18` | 页面底色(奶油 / 暖炭,不发蓝) |
| `--db-surface` | `#ffffff` | `#2b2620` | 面板、卡片 |
| `--db-surface-soft` | `#f5efe6` | `#332d26` | 次级底色、输入框、次要按钮 |
| `--db-surface-raised` | `#fffdf9` | `#2f2a23` | 悬浮层、确认卡 |
| `--db-line` | `#ece3d6` | `rgba(228,208,180,0.14)` | 弱分隔线 |
| `--db-line-strong` | `#ddd1bf` | `rgba(228,208,180,0.28)` | 强分隔线 |
| `--db-text` | `#40382e` | `#ede5d8` | 正文 |
| `--db-muted` | `#8f8577` | `#a99c8a` | 弱化文字 |
| `--db-muted-strong` | `#6b6154` | `#c6b8a4` | 次强调文字 |
| `--db-accent` | `#d97757` | `#e08b6d` | 主色(陶土暖橘):主按钮、选中态 |
| `--db-accent-strong` | `#c2603f` | `#ea9c81` | 主色 hover/强调 |
| `--db-accent-soft` | `#f9e9e1` | `rgba(224,139,109,0.18)` | 主色淡底:选中底、光环 |
| `--db-on-accent` | `#fffdf9` | `#241a12` | 主色底上的文字 |
| `--db-link` | `#ad5230` | `#eb9a7c` | 链接 |
| `--db-warn` | `#c99036` | `#e0aa5c` | 琥珀(价格属性) |
| `--db-warn-strong` | `#8a5c14` | `#ecc287` | 蜜色底上的深琥珀字 |
| `--db-warn-soft` | `#f7edd8` | `rgba(224,170,92,0.16)` | 蜜色底:价格贴纸 |
| `--db-danger` | `#c65f5f` | `#d98080` | 危险 |
| `--db-danger-strong` | `#a84848` | `#e39a9a` | 危险强调字 |
| `--db-danger-soft` | `#f7e5e5` | `rgba(217,128,128,0.16)` | 危险淡底 |
| `--db-shadow` | `rgba(94,72,45,0.10)` | `rgba(10,7,4,0.45)` | 常规投影色 |
| `--db-shadow-deep` | `rgba(94,72,45,0.17)` | `rgba(10,7,4,0.60)` | 深投影色 |
| `--db-ring` | `rgba(94,72,45,0)` | `rgba(228,208,180,0.10)` | 暗色下卡片描边(亮色隐形) |
| `--db-glow` | `rgba(217,119,87,0.06)` | `rgba(224,139,109,0.05)` | 页顶暖光渐变 |

语义纪律:

- **价格永远走琥珀族**(`--db-warn*`),与主色橘区分;「估算应付」文案纪律见
  [docs/brand/README.md](../brand/README.md) 文案语气节。
- 危险操作(删除)走 `--db-danger*`,默认淡底,hover 才加深。
- 暗色是「深夜暖灯书房」:任何新暗色值不得偏冷(禁蓝灰)。

已知对比度例外(2026-08-12 用户决策:气质优先,维持现状;A1 无障碍专项轮复审):

- 亮色主按钮:`--db-on-accent #fffdf9` on `--db-accent #d97757` ≈ 3.07:1
  (hover ≈ 4.10:1),按「按钮等大字重组件 ≥3:1」线通过,不满足正文 4.5:1。
- 亮色 `--db-muted #8f8577` on 白面板 ≈ 3.6:1,用于 13px 次要文字时低于 4.5:1
  (曾评估加深至 `#7a7060` ≈ 4.8:1,未采纳)。
- 亮色危险按钮 hover:`--db-on-accent #fffdf9` on `--db-danger #c65f5f` ≈ 3.97:1,
  与主按钮同属「按钮等大字重组件 ≥3:1」线内、正文线外。
- 暗色套与价格贴纸(`--db-warn-strong` on `--db-warn-soft` ≈ 5.0:1)均达标,无例外。

## 圆角

| 变量 | 值 | 用途 |
|------|-----|------|
| `--db-radius-s` | `12px` | 输入框、小组件 |
| `--db-radius-m` | `20px` | 面板、卡片 |
| `--db-radius-l` | `28px` | 大容器 |
| (胶囊) | `999px` | 按钮、chip、pill |

## 间距

4/8 栅格,梯度:`4 / 8 / 12 / 16 / 20 / 24 / 32`。
经验值:面板内边距 20–24px,区块间 gap 16–20px,行内小间距 8–12px。
(V1 mockup 存在 7/9/10/14/18px 等自由值,V2 落地时向梯度收敛。)

## 字体

| 变量 | 值 |
|------|-----|
| `--db-font-body` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif` |
| `--db-font-mono` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace`(会话 id、代码块) |

字号/行高/字重:

- 正文 `14.5px / 1.65 / 400`;弱化文字 13px。
- 标题:h1 `24px`、h2 `16px`、h3 `14px`、h4 `13px`,一律 `600` 重、行高 1.35。
- **字重只允许 400 / 600 两档**(历史实现的 650/750/800 淘汰)。
- 价格与数字:`font-variant-numeric: tabular-nums`。

## 阴影

投影颜色一律走 `--db-shadow` / `--db-shadow-deep`,配方三级:

| 层级 | 配方 | 用途 |
|------|------|------|
| 低 | `0 2px 8px var(--db-shadow), 0 0 0 1px var(--db-ring)` | chip、小元件 |
| 中 | `0 4px 12px var(--db-shadow)`(hover:`0 8px 18px var(--db-shadow-deep)`) | 按钮、卡片 |
| 高 | `0 10px 30px var(--db-shadow), 0 0 0 1px var(--db-ring)` | 面板、悬浮层 |

无 1px 硬边框思维:分层靠底色差 + 柔影(暗色下加 `--db-ring` 描边补偿)。

## 动效

- 时长 `200ms`,缓动 `ease`;属性限 background-color / color / border-color / box-shadow / transform。
- hover 允许 `translateY(-1px)` 轻浮起,active 归位。
- 焦点环:`box-shadow: 0 0 0 4px var(--db-accent-soft)`(输入框 3px)。
- `prefers-reduced-motion: reduce` 下所有过渡/动画压至 1ms 内,浮起取消。

## z-index 层级

| 层 | 值 | 用途 |
|----|-----|------|
| base | `0` | 常规内容 |
| sticky | `10` | 吸顶头部 |
| overlay | `100` | 确认层、遮罩(X3 轮启用) |
| toast | `200` | 全局提示(X1 轮启用) |

## 三处同步步骤(V3 起)

1. 改 `extension/dealbuddy-capture/tokens.css`(机器真相);
2. 手抄同步 `src/dealbuddy/static/index.html` 的 `:root` / 暗色块;
3. 跑 `node --test "tests/extension/**/*.test.cjs"`,`design-tokens-sync` 断言两处名值一致;
4. 本文件只在**增删变量或改语义**时更新,纯调值不用动(值以代码为真相)。
