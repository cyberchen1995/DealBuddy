(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.DealBuddyAutoCaptureUtils = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_LAZY_LOAD_WAIT_MS = 12000;
  const DEFAULT_LAZY_LOAD_STABLE_TICKS = 2;
  const DEFAULT_LAZY_LOAD_POLL_INTERVAL_MS = 1200;
  // 详情区通常滚动 2-3 次后就会把可采集图片挂到 DOM；保留短等待避免刚触发懒渲染就收尾。
  const DEFAULT_LAZY_LOAD_MIN_WAIT_MS = 3600;

  function toNonNegativeInteger(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      return fallback;
    }
    return Math.floor(number);
  }

  function nextLazyLoadState(previous, snapshot, options = {}) {
    const maxWaitMs = toNonNegativeInteger(
      options.maxWaitMs,
      DEFAULT_LAZY_LOAD_WAIT_MS
    );
    const stableTicksRequired = Math.max(
      toNonNegativeInteger(
        options.stableTicksRequired,
        DEFAULT_LAZY_LOAD_STABLE_TICKS
      ),
      1
    );
    const minWaitMs = toNonNegativeInteger(
      options.minWaitMs,
      DEFAULT_LAZY_LOAD_MIN_WAIT_MS
    );
    const scrollHeight = toNonNegativeInteger(snapshot?.scrollHeight, 0);
    const detailImageCount = toNonNegativeInteger(snapshot?.detailImageCount, 0);
    const pendingImageCount = toNonNegativeInteger(snapshot?.pendingImageCount, 0);
    const elapsedMs = toNonNegativeInteger(snapshot?.elapsedMs, 0);
    const atBottom = Boolean(snapshot?.atBottom);
    // 发现详情图 + 详情图加载完（pendingImageCount === 0）+ 高度/图片数连续不变才算一次稳定；
    // 达到稳定拍数且超过最短等待时间才收尾，或达到超时上限。这里不强制滚到底，
    // 避免为了很长的页面做无效翻页。
    const hasDetailImages = detailImageCount > 0;
    const stable =
      Boolean(previous) &&
      hasDetailImages &&
      pendingImageCount === 0 &&
      previous.scrollHeight === scrollHeight &&
      previous.detailImageCount === detailImageCount;
    const stableTicks = stable ? previous.stableTicks + 1 : 0;
    const timedOut = elapsedMs >= maxWaitMs;
    const completed = stableTicks >= stableTicksRequired && elapsedMs >= minWaitMs;
    const done = timedOut || completed;
    // 供滚动策略判断：图片数仍在增长（如京东分块渲染）时才继续下滚。
    const detailImageCountGrew = Boolean(
      previous && detailImageCount > previous.detailImageCount
    );

    return {
      scrollHeight,
      detailImageCount,
      detailImageCountGrew,
      pendingImageCount,
      elapsedMs,
      atBottom,
      stableTicks,
      maxWaitMs,
      minWaitMs,
      stableTicksRequired,
      done,
      reason: timedOut ? "timeout" : completed ? "stable" : "waiting",
    };
  }

  return {
    DEFAULT_LAZY_LOAD_STABLE_TICKS,
    DEFAULT_LAZY_LOAD_POLL_INTERVAL_MS,
    DEFAULT_LAZY_LOAD_WAIT_MS,
    DEFAULT_LAZY_LOAD_MIN_WAIT_MS,
    nextLazyLoadState,
  };
});
