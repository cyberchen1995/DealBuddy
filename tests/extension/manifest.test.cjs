const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const manifestPath = path.join(
  __dirname,
  "../../extension/dealbuddy-capture/manifest.json"
);
const popupPath = path.join(__dirname, "../../extension/dealbuddy-capture/popup.html");

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

test("extension page CSP does not use blob workers", () => {
  const manifest = readManifest();
  const csp = manifest.content_security_policy?.extension_pages || "";

  assert.doesNotMatch(csp, /worker-src[^;]*\bblob:/);
});

test("manifest grants storage permission for auto capture setting", () => {
  const manifest = readManifest();

  assert.ok(manifest.permissions?.includes("storage"));
});

test("manifest allows extension pages to talk to the local web server", () => {
  const manifest = readManifest();

  assert.ok(manifest.host_permissions?.includes("http://127.0.0.1/*"));
  assert.ok(manifest.host_permissions?.includes("http://localhost/*"));
});

test("manifest uses shopping companion release branding", () => {
  const manifest = readManifest();

  assert.equal(manifest.name, "DealBuddy 购物搭子");
  assert.equal(
    manifest.description,
    "淘宝、天猫、京东商品详情采集搭子，本地分析整理，辅助你轻松做出购物决策。建议搭配 intake 服务使用，也可复制已提取的商品信息到任意智能体中使用。"
  );
  assert.equal(manifest.action?.default_title, "DealBuddy 购物搭子");
  assert.doesNotMatch(manifest.name, /Capture|比价/);
  assert.doesNotMatch(manifest.description, /prototype|prototyping|比价/);
  assert.doesNotMatch(manifest.description, /证据/);
});

test("manifest declares release icon assets", () => {
  const manifest = readManifest();
  const expectedIcons = {
    16: "icons/dealbuddy-16.png",
    32: "icons/dealbuddy-32.png",
    48: "icons/dealbuddy-48.png",
    128: "icons/dealbuddy-128.png",
  };

  assert.deepEqual(manifest.icons, expectedIcons);
  assert.deepEqual(manifest.action?.default_icon, expectedIcons);
  for (const iconPath of Object.values(expectedIcons)) {
    assert.ok(
      fs.existsSync(path.join(__dirname, "../../extension/dealbuddy-capture", iconPath))
    );
  }
});

test("manifest loads auto capture utility before the content script", () => {
  const manifest = readManifest();
  const scripts = manifest.content_scripts?.[0]?.js || [];

  assert.ok(scripts.includes("auto-capture-utils.js"));
  assert.ok(
    scripts.indexOf("auto-capture-utils.js") < scripts.indexOf("content-script.js")
  );
});

test("manifest loads settings utility before content script", () => {
  const manifest = readManifest();
  const scripts = manifest.content_scripts?.[0]?.js || [];

  assert.ok(scripts.includes("settings-utils.js"));
  assert.ok(scripts.indexOf("settings-utils.js") < scripts.indexOf("content-script.js"));
});

test("popup loads settings utility and popup script", () => {
  const popup = fs.readFileSync(popupPath, "utf8");

  assert.match(popup, /settings-utils\.js/);
  assert.match(popup, /popup\.js/);
  assert.match(popup, /DealBuddy 购物搭子/);
  assert.match(popup, /启用自动采集/);
  assert.match(popup, /Intake URL/);
  assert.match(popup, /intake-url/);
  assert.match(popup, /http:\/\/127\.0\.0\.1:8765\/api\/current\/offers/);
  assert.match(popup, /详情图加载等待超时/);
  assert.match(popup, /默认 12/);
  assert.match(popup, /整理当前商品信息/);
  assert.match(popup, /复制 JSON/);
  assert.match(popup, /重新整理/);
  assert.match(popup, /capture-current-button/);
  assert.match(popup, /copy-json-button/);
  assert.match(popup, /recapture-button/);
});
