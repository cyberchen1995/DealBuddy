const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const contentScriptPath = path.join(
  __dirname,
  "../../extension/dealbuddy-capture/content-script.js"
);

function readContentScript() {
  return fs.readFileSync(contentScriptPath, "utf8");
}

test("popup-driven capture combines extraction and OCR in one message flow", () => {
  const source = readContentScript();
  const runCaptureBody = source.match(
    /async function runCapture\([^)]*\) \{[\s\S]*?\n  \}/
  )?.[0];

  assert.ok(runCaptureBody);
  assert.match(runCaptureBody, /ocrPayload/);
  assert.match(runCaptureBody, /showReadingOverlay/);
  assert.doesNotMatch(source, /dealbuddy-ocr-button/);
});

test("capture posts extracted payload to the configured intake service", () => {
  const source = readContentScript();
  const runCaptureBody = source.match(
    /async function runCapture\([^)]*\) \{[\s\S]*?\n  \}/
  )?.[0];

  assert.ok(runCaptureBody);
  assert.match(source, /intakeUrl/);
  assert.match(source, /async function postCapturePayload\(payload, intakeUrl\)/);
  assert.match(source, /fetch\(intakeUrl/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /body: JSON\.stringify\(payload\)/);
  assert.match(runCaptureBody, /postCapturePayload\(\s*mergedPayload,\s*[\s\S]*intakeUrl/);
});

test("auto capture shows reading overlay and waits for lazy detail images", () => {
  const source = readContentScript();
  const waitForLazyLoadedDetailImagesBody = source.match(
    /async function waitForLazyLoadedDetailImages\([^)]*\) \{[\s\S]*?\n  \}/
  )?.[0];

  assert.ok(waitForLazyLoadedDetailImagesBody);
  assert.match(source, /DealBuddy 购物搭子正在整理商品信息/);
  assert.match(source, /showReadingOverlay/);
  assert.match(source, /waitForLazyLoadedDetailImages/);
  assert.doesNotMatch(
    waitForLazyLoadedDetailImagesBody,
    /window\.scrollTo\(\{ top: documentScrollHeight\(\)/
  );
  assert.doesNotMatch(source, /比价搭子|原型/);
});

test("reading overlay can minimize into a bottom-right progress view", () => {
  const source = readContentScript();

  assert.match(source, /READING_OVERLAY_MINI_STATUS_ID/);
  assert.match(source, /dealbuddy-reading-minimize/);
  assert.match(source, /dealbuddy-reading-mini/);
  assert.match(source, /dealbuddy-reading-overlay--minimized/);
  assert.match(source, /最小化/);
  assert.match(source, /展开采集进度/);
});

test("capture progress text is concise and does not expose internal stability", () => {
  const source = readContentScript();

  assert.doesNotMatch(source, /待加载/);
  assert.doesNotMatch(source, /稳定 \$?\{/);
  assert.doesNotMatch(source, /stableTicks/);
});

test("content script no longer creates page capture buttons or result panel", () => {
  const source = readContentScript();

  assert.doesNotMatch(source, /CAPTURE_BUTTON_ID/);
  assert.doesNotMatch(source, /AUTO_CAPTURE_BUTTON_ID/);
  assert.doesNotMatch(source, /mountCaptureButton/);
  assert.doesNotMatch(source, /showResultPanel/);
  assert.doesNotMatch(source, /dealbuddy-capture-panel/);
  assert.doesNotMatch(source, /dealbuddy-capture-button/);
  assert.doesNotMatch(source, /dealbuddy-capture-json/);
  assert.doesNotMatch(source, /JSON\.stringify\(payload, null, 2\)[\s\S]*pre\.textContent/);
});

test("content script exposes popup message controls and status", () => {
  const source = readContentScript();

  assert.match(source, /chrome\.runtime\.onMessage\.addListener/);
  assert.match(source, /getStatus/);
  assert.match(source, /runCapture/);
  assert.match(source, /copyLastPayload/);
  assert.match(source, /lastCapturePayload/);
  assert.match(source, /JSON\.stringify\(lastCapturePayload, null, 2\)/);
});

test("content script reads popup settings for capture behavior", () => {
  const source = readContentScript();

  assert.match(source, /DealBuddySettingsUtils/);
  assert.match(source, /autoCaptureEnabled/);
  assert.match(source, /detailLoadTimeoutMs/);
  assert.match(source, /intakeUrl/);
});

test("content script default intake URL targets the web current-session endpoint", () => {
  const source = readContentScript();

  assert.match(source, /http:\/\/127\.0\.0\.1:8765\/api\/current\/offers/);
  assert.doesNotMatch(source, /http:\/\/127\.0\.0\.1:8765\/offers/);
});

test("content script captures current sku id and supports modern sku selectors", () => {
  const source = readContentScript();

  assert.match(source, /sku_id/);
  assert.match(source, /cleanProductUrl/);
  assert.match(source, /skuIdFromUrl/);
  assert.match(source, /selectedSkuFromSkuBase/);
  assert.match(source, /\.page-right-spec \.specification-group/);
  assert.match(source, /\.specification-item-sku/);
  assert.match(source, /\.specification-series-item/);
});

test("detail image collection prefers real lazy URLs and drops the recommendation boundary", () => {
  const source = readContentScript();

  // 占位图（g.alicdn.com/s.gif 等）优先回退到真实 data-src，避免被当占位图丢弃
  assert.match(source, /IMAGE_PLACEHOLDER_PATTERN/);
  assert.match(source, /data-src/);
  // 详情图选择器限定在图文详情容器内
  assert.match(source, /\.descV8-container img/);
  // 不再按"本店推荐/看了又看"标题做边界裁剪（会把详情长图误丢）
  assert.doesNotMatch(source, /recommendationBoundary/);
  assert.doesNotMatch(source, /本店推荐|看了又看/);
});

test("detail image extraction collects from the description container without boundary filtering", () => {
  const source = readContentScript();

  assert.match(source, /collectDetailImageUrls/);
  assert.doesNotMatch(source, /isBeforeRecommendationBoundary/);
  assert.doesNotMatch(source, /filterDetailElementsBeforeRecommendation/);
});

test("capture restores the user's scroll position and warms up OCR in parallel", () => {
  const source = readContentScript();

  // 采集会滚动页面触发懒渲染，结束后必须还原用户初始位置
  assert.match(source, /initialScrollTop/);
  assert.match(source, /top: initialScrollTop, behavior: "auto"/);
  // 图片数稳定后停止下滚，仅在未发现或仍在增长时继续翻页
  assert.match(source, /detailImageCountGrew/);
  // OCR 预热与详情图等待并行
  assert.match(source, /dealbuddy:ocr:warmup/);
  assert.match(source, /warmupOcr\(\)/);
});
