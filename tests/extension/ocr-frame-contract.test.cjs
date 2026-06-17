const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ocrFramePath = path.join(
  __dirname,
  "../../extension/dealbuddy-capture/ocr-frame.js"
);

function readOcrFrame() {
  return fs.readFileSync(ocrFramePath, "utf8");
}

test("ocr frame prefetches image blobs before serial recognition", () => {
  const source = readOcrFrame();

  assert.match(source, /ocr-frame-utils\.mjs/);
  assert.match(source, /prepareOcrInputs/);
  assert.match(source, /stage: "download"/);
  assert.doesNotMatch(source, /await recognizeRemoteImage\(imageUrl\)/);
});

test("ocr frame checks local OCR cache before recognition and writes misses back", () => {
  const source = readOcrFrame();

  assert.match(source, /ocr-cache-utils\.mjs/);
  assert.match(source, /createIndexedDbOcrCache/);
  assert.match(source, /prepareOcrInputs/);
  assert.match(source, /cachedText/);
  assert.match(source, /ocrCache\.set/);
});
