import {
  initOCR,
  recognizeImage,
} from "./assets/reference-compare-runtime.js";
import { createIndexedDbOcrCache } from "./ocr-cache-utils.mjs";
import {
  DEFAULT_IMAGE_PREFETCH_CONCURRENCY,
  prepareOcrInputs,
} from "./ocr-frame-utils.mjs";

const ALLOWED_IMAGE_HOST_SUFFIXES = [
  ".alicdn.com",
  ".tbcdn.cn",
  ".jd.com",
  ".360buyimg.com",
  ".jdimg.com",
];

let initPromise = null;
const ocrCache = createIndexedDbOcrCache();

function post(message) {
  window.parent.postMessage(message, "*");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isAllowedImageUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }
    return ALLOWED_IMAGE_HOST_SUFFIXES.some((suffix) =>
      url.hostname.toLowerCase().endsWith(suffix)
    );
  } catch (_error) {
    return false;
  }
}

async function ensureOcrReady() {
  if (!initPromise) {
    initPromise = initOCR();
  }
  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

async function toLocalBlobUrl(imageUrl) {
  if (!isAllowedImageUrl(imageUrl)) {
    throw new Error("图片域名不在 OCR 允许范围内。");
  }
  const response = await fetch(imageUrl, {
    cache: "force-cache",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`图片下载失败: ${response.status} ${response.statusText}`);
  }
  return URL.createObjectURL(await response.blob());
}

async function handleOcrRequest(message) {
  const requestId = message.requestId;
  const imageUrls = Array.isArray(message.imageUrls) ? message.imageUrls : [];
  const items = [];
  const warnings = [];

  try {
    let downloadedCount = 0;
    let cacheHitCount = 0;
    let ocrReady = false;
    const ocrInputs = prepareOcrInputs(imageUrls, ocrCache.get, toLocalBlobUrl, {
      concurrency:
        message.prefetchConcurrency || DEFAULT_IMAGE_PREFETCH_CONCURRENCY,
    }).map((inputResult) =>
      inputResult.then((result) => {
        if (result.cachedText) {
          cacheHitCount += 1;
          post({
            type: "dealbuddy:ocr:progress",
            requestId,
            stage: "cache",
            current: cacheHitCount,
            total: imageUrls.length,
            message: `已复用本地 OCR 缓存 ${cacheHitCount}/${imageUrls.length}...`,
          });
          return result;
        }
        downloadedCount += 1;
        post({
          type: "dealbuddy:ocr:progress",
          requestId,
          stage: "download",
          current: downloadedCount,
          total: imageUrls.length,
          message: `正在下载详情图 ${downloadedCount}/${imageUrls.length}...`,
        });
        return result;
      })
    );
    const ensureOcrReadyForMiss = async () => {
      if (ocrReady) {
        return;
      }
      post({
        type: "dealbuddy:ocr:progress",
        requestId,
        stage: "init",
        message: "正在初始化本地 OCR 模型...",
      });
      await ensureOcrReady();
      ocrReady = true;
    };

    for (let index = 0; index < imageUrls.length; index += 1) {
      const imageUrl = imageUrls[index];
      const ocrInput = await ocrInputs[index];
      if (ocrInput.cachedText) {
        items.push({ image_url: imageUrl, text: ocrInput.cachedText });
        continue;
      }
      if (ocrInput.error || !ocrInput.blobUrl) {
        items.push({
          image_url: imageUrl,
          text: "",
          error: errorMessage(ocrInput.error || "图片下载失败。"),
        });
        continue;
      }
      await ensureOcrReadyForMiss();
      post({
        type: "dealbuddy:ocr:progress",
        requestId,
        stage: "recognize",
        current: index + 1,
        total: imageUrls.length,
        message: `正在识别详情图 ${index + 1}/${imageUrls.length}...`,
      });
      try {
        const text = await recognizeImage(ocrInput.blobUrl);
        items.push({ image_url: imageUrl, text });
        await ocrCache.set(imageUrl, text);
      } catch (error) {
        items.push({ image_url: imageUrl, text: "", error: errorMessage(error) });
      } finally {
        URL.revokeObjectURL(ocrInput.blobUrl);
      }
    }

    post({
      type: "dealbuddy:ocr:done",
      requestId,
      result: {
        status: "completed",
        items,
        warnings,
        completed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    post({
      type: "dealbuddy:ocr:done",
      requestId,
      result: {
        status: "failed",
        items,
        warnings: [`本地 OCR 失败：${errorMessage(error)}`],
        completed_at: new Date().toISOString(),
      },
    });
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) {
    return;
  }
  const message = event.data || {};
  if (message.type === "dealbuddy:ocr:start") {
    void handleOcrRequest(message);
    return;
  }
  if (message.type === "dealbuddy:ocr:warmup") {
    // 采集等待期并行加载模型；失败不上报，正式识别时会重试并给出错误。
    ensureOcrReady().catch(() => {});
  }
});

post({ type: "dealbuddy:ocr:ready" });
