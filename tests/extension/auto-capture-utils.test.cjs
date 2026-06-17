const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_LAZY_LOAD_STABLE_TICKS,
  DEFAULT_LAZY_LOAD_POLL_INTERVAL_MS,
  DEFAULT_LAZY_LOAD_WAIT_MS,
  DEFAULT_LAZY_LOAD_MIN_WAIT_MS,
  nextLazyLoadState,
} = require("../../extension/dealbuddy-capture/auto-capture-utils.js");

test("lazy-load wait stops after two stable detail-image checks and a short dwell time", () => {
  assert.equal(DEFAULT_LAZY_LOAD_WAIT_MS, 12000);
  assert.equal(DEFAULT_LAZY_LOAD_STABLE_TICKS, 2);
  assert.equal(DEFAULT_LAZY_LOAD_POLL_INTERVAL_MS, 1200);
  assert.equal(DEFAULT_LAZY_LOAD_MIN_WAIT_MS, 3600);

  const snapshot = (elapsedMs) => ({
    scrollHeight: 2400,
    detailImageCount: 8,
    atBottom: false,
    elapsedMs,
  });

  let state = nextLazyLoadState(null, snapshot(1200));
  assert.equal(state.stableTicks, 0);
  state = nextLazyLoadState(state, snapshot(2400));
  assert.equal(state.stableTicks, 1);
  assert.equal(state.done, false);

  state = nextLazyLoadState(state, snapshot(3600));
  assert.equal(state.stableTicks, 2);
  assert.equal(state.done, true);
  assert.equal(state.reason, "stable");
});

test("lazy-load wait resets stability when the page keeps growing", () => {
  let state = nextLazyLoadState(null, {
    scrollHeight: 2400,
    detailImageCount: 8,
    atBottom: true,
    elapsedMs: 1000,
  });
  state = nextLazyLoadState(state, {
    scrollHeight: 2400,
    detailImageCount: 8,
    atBottom: true,
    elapsedMs: 2000,
  });
  assert.equal(state.stableTicks, 1);

  state = nextLazyLoadState(state, {
    scrollHeight: 3200,
    detailImageCount: 11,
    atBottom: true,
    elapsedMs: 3000,
  });
  assert.equal(state.done, false);
  assert.equal(state.stableTicks, 0);
});

test("lazy-load wait does not count stability while detail images are pending", () => {
  let state = nextLazyLoadState(null, {
    scrollHeight: 2400,
    detailImageCount: 8,
    pendingImageCount: 2,
    atBottom: true,
    elapsedMs: 1000,
  });
  state = nextLazyLoadState(state, {
    scrollHeight: 2400,
    detailImageCount: 8,
    pendingImageCount: 2,
    atBottom: true,
    elapsedMs: 2000,
  });
  assert.equal(state.done, false);
  assert.equal(state.stableTicks, 0);

  state = nextLazyLoadState(state, {
    scrollHeight: 2400,
    detailImageCount: 8,
    pendingImageCount: 0,
    atBottom: true,
    elapsedMs: 3000,
  });
  assert.equal(state.done, false);
  assert.equal(state.stableTicks, 1);
});

test("lazy-load wait keeps scrolling until detail images are discovered", () => {
  let state = nextLazyLoadState(null, {
    scrollHeight: 2400,
    detailImageCount: 0,
    pendingImageCount: 0,
    atBottom: false,
    elapsedMs: 1200,
  });
  state = nextLazyLoadState(state, {
    scrollHeight: 2400,
    detailImageCount: 0,
    pendingImageCount: 0,
    atBottom: false,
    elapsedMs: 2400,
  });
  assert.equal(state.done, false);
  assert.equal(state.stableTicks, 0);
});

test("lazy-load wait stops after the default timeout", () => {
  const state = nextLazyLoadState(null, {
    scrollHeight: 2400,
    detailImageCount: 8,
    atBottom: false,
    elapsedMs: DEFAULT_LAZY_LOAD_WAIT_MS,
  });

  assert.equal(state.done, true);
  assert.equal(state.reason, "timeout");
});
