const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildOcrText,
  mergeOcrResult,
  pickOcrImageUrls,
} = require("../../extension/dealbuddy-capture/ocr-utils.js");

function sampleOcrPayload() {
  return {
    detail_image_urls: [
      "https://img.alicdn.com/a.jpg",
      "https://g.alicdn.com/s.gif",
      "https://img.alicdn.com/a.jpg",
      "",
      "https://img.alicdn.com/b.jpg",
      "https://img.alicdn.com/c.jpg",
      "https://img.alicdn.com/d.jpg",
      "https://img.alicdn.com/e.jpg",
      "https://img.alicdn.com/f.jpg",
    ],
  };
}

test("pickOcrImageUrls keeps every unique real detail image by default", () => {
  const urls = pickOcrImageUrls(sampleOcrPayload());

  assert.deepEqual(urls, [
    "https://img.alicdn.com/a.jpg",
    "https://img.alicdn.com/b.jpg",
    "https://img.alicdn.com/c.jpg",
    "https://img.alicdn.com/d.jpg",
    "https://img.alicdn.com/e.jpg",
    "https://img.alicdn.com/f.jpg",
  ]);
});

test("pickOcrImageUrls supports an explicit image limit", () => {
  const urls = pickOcrImageUrls(sampleOcrPayload(), 5);

  assert.deepEqual(urls, [
    "https://img.alicdn.com/a.jpg",
    "https://img.alicdn.com/b.jpg",
    "https://img.alicdn.com/c.jpg",
    "https://img.alicdn.com/d.jpg",
    "https://img.alicdn.com/e.jpg",
  ]);
});

test("mergeOcrResult adds searchable OCR text and improves confidence", () => {
  const payload = {
    title: "石头 P20",
    visible_price: "3425.75",
    confidence: "medium",
    warnings: ["详情信息主要是图片，暂未得到可搜索的文字参数。"],
  };

  const merged = mergeOcrResult(payload, {
    status: "completed",
    items: [
      {
        image_url: "https://img.alicdn.com/a.jpg",
        text: "18500Pa 吸力\n自动清洗拖布",
      },
      {
        image_url: "https://img.alicdn.com/b.jpg",
        text: "活水洗地 60度热风烘干",
      },
    ],
    warnings: [],
  });

  assert.equal(merged.ocr_status, "completed");
  assert.equal(merged.confidence, "high");
  assert.equal(
    merged.ocr_text,
    "18500Pa 吸力\n自动清洗拖布\n\n活水洗地 60度热风烘干"
  );
  assert.deepEqual(merged.warnings, ["已通过本地 OCR 读取详情图片文字。"]);
});

test("buildOcrText ignores blank OCR items and normalizes whitespace", () => {
  assert.equal(
    buildOcrText([
      { text: "  A  \n\n\n B " },
      { text: "" },
      { error: "load failed" },
      { text: "C" },
    ]),
    "A\n\nB\n\nC"
  );
});

test("mergeOcrResult surfaces per-image OCR errors as warnings", () => {
  const merged = mergeOcrResult(
    { warnings: [], confidence: "low" },
    {
      status: "completed",
      items: [
        { image_url: "https://img.alicdn.com/a.jpg", text: "", error: "加载失败" },
      ],
      warnings: [],
    }
  );

  assert.deepEqual(merged.warnings, [
    "OCR 图片识别失败：加载失败",
    "OCR 已执行，但没有从详情图片中识别到可用文字。",
  ]);
});
