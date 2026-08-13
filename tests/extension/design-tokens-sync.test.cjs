"use strict";

// --db-* token 一致性:工作台(src/dealbuddy/static/index.html)与插件
// (extension/dealbuddy-capture/tokens.css)手工同步,漏改任何一处此测试失败,
// 并随全量测试进入 release 门禁。工作台暗色是双挂结构(media 块 + data-theme 块),
// 先断言两处一致,再与 tokens.css 比对。规范见 docs/design/tokens.md。

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const workbench = fs.readFileSync(
  path.join(ROOT, "src", "dealbuddy", "static", "index.html"),
  "utf8",
);
const tokensCss = fs.readFileSync(
  path.join(ROOT, "extension", "dealbuddy-capture", "tokens.css"),
  "utf8",
);

function extractVars(source, selectorMarker) {
  const start = source.indexOf(selectorMarker);
  assert.notStrictEqual(start, -1, `找不到块:${selectorMarker}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  const block = source.slice(open + 1, close);
  const vars = {};
  for (const match of block.matchAll(/(--db-[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[match[1]] = match[2].replace(/\s+/g, " ").trim();
  }
  assert.ok(Object.keys(vars).length > 0, `块内无变量:${selectorMarker}`);
  return vars;
}

const workbenchLight = extractVars(workbench, ":root {");
const workbenchDarkMedia = extractVars(
  workbench,
  ':root:not([data-theme="light"]) {',
);
const workbenchDarkManual = extractVars(workbench, ':root[data-theme="dark"] {');
const tokensLight = extractVars(tokensCss, ":root,\n.dealbuddy-reading-overlay {");
const tokensDark = extractVars(
  tokensCss.slice(tokensCss.indexOf("@media (prefers-color-scheme: dark)")),
  ":root,\n  .dealbuddy-reading-overlay {",
);

test("工作台暗色双挂(media 与 data-theme)逐值一致", () => {
  assert.deepStrictEqual(workbenchDarkManual, workbenchDarkMedia);
});

test("亮色 token:工作台与插件 tokens.css 逐值一致", () => {
  assert.deepStrictEqual(tokensLight, workbenchLight);
});

test("暗色 token:工作台与插件 tokens.css 逐值一致", () => {
  assert.deepStrictEqual(tokensDark, workbenchDarkMedia);
});
