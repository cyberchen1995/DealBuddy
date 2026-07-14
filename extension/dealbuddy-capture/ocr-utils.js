(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.DealBuddyOcrUtils = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_OCR_IMAGE_LIMIT = Number.POSITIVE_INFINITY;
  const MAX_OCR_TEXT_LENGTH = 12000;
  const IMAGE_ONLY_WARNING = "详情信息主要是图片，暂未得到可搜索的文字参数。";
  const OCR_SUCCESS_WARNING = "已通过本地 OCR 读取详情图片文字。";
  const PLACEHOLDER_MARKERS = [
    "g.alicdn.com/s.gif",
    "tps-56-56.gif",
    "placeholder",
  ];
  // 动图（.gif）几乎都是演示动画而非规格表，OCR 只能读到第 0 帧、价值低，
  // 跳过它们可减少识别张数、加快本地 OCR，而不丢真正的参数文字。
  const ANIMATED_IMAGE_PATTERN = /\.gif(?:[?#]|$)/i;

  function normalizeWhitespace(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isRealImageUrl(value) {
    const url = normalizeWhitespace(value);
    if (!url || url.startsWith("data:")) {
      return false;
    }
    const lowered = url.toLowerCase();
    return !PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker));
  }

  function isOcrCandidate(url) {
    return isRealImageUrl(url) && !ANIMATED_IMAGE_PATTERN.test(url);
  }

  function pickOcrImageUrls(payload, limit = DEFAULT_OCR_IMAGE_LIMIT) {
    const maxItems = Number.isFinite(limit)
      ? Math.max(Math.floor(limit), 0)
      : Number.POSITIVE_INFINITY;
    const seen = new Set();
    const urls = [];
    for (const value of payload?.detail_image_urls || []) {
      const url = normalizeWhitespace(value);
      if (!isOcrCandidate(url) || seen.has(url)) {
        continue;
      }
      seen.add(url);
      urls.push(url);
      if (urls.length >= maxItems) {
        break;
      }
    }
    return urls;
  }

  function buildOcrText(items) {
    return (items || [])
      .map((item) => normalizeWhitespace(item?.text || ""))
      .filter(Boolean)
      .join("\n\n")
      .slice(0, MAX_OCR_TEXT_LENGTH);
  }

  function mergeOcrResult(payload, result) {
    const ocrItems = Array.isArray(result?.items)
      ? result.items.map((item) => ({
          image_url: normalizeWhitespace(item?.image_url || ""),
          text: normalizeWhitespace(item?.text || ""),
          error: normalizeWhitespace(item?.error || ""),
        }))
      : [];
    const ocrText = buildOcrText(ocrItems);
    const warnings = (payload?.warnings || [])
      .map(normalizeWhitespace)
      .filter((warning) => warning && warning !== IMAGE_ONLY_WARNING);

    for (const warning of result?.warnings || []) {
      const normalized = normalizeWhitespace(warning);
      if (normalized && !warnings.includes(normalized)) {
        warnings.push(normalized);
      }
    }

    for (const item of ocrItems) {
      if (!item.error) {
        continue;
      }
      const warning = `OCR 图片识别失败：${item.error}`;
      if (!warnings.includes(warning)) {
        warnings.push(warning);
      }
    }

    if (ocrText && !warnings.includes(OCR_SUCCESS_WARNING)) {
      warnings.push(OCR_SUCCESS_WARNING);
    }
    if (!ocrText && result?.status === "completed") {
      warnings.push("OCR 已执行，但没有从详情图片中识别到可用文字。");
    }

    let confidence = payload?.confidence || "low";
    if (ocrText && payload?.title && payload?.visible_price) {
      confidence = "high";
    } else if (ocrText && confidence === "low") {
      confidence = "medium";
    }

    return {
      ...payload,
      confidence,
      warnings,
      ocr_status: result?.status || "not_started",
      ocr_items: ocrItems,
      ocr_text: ocrText,
      ocr_completed_at: result?.completed_at || new Date().toISOString(),
    };
  }

  return {
    DEFAULT_OCR_IMAGE_LIMIT,
    IMAGE_ONLY_WARNING,
    OCR_SUCCESS_WARNING,
    buildOcrText,
    mergeOcrResult,
    pickOcrImageUrls,
  };
});
