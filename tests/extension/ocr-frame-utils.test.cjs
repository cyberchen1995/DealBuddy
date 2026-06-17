const assert = require("node:assert/strict");
const test = require("node:test");

async function loadUtils() {
  return import("../../extension/dealbuddy-capture/ocr-frame-utils.mjs");
}

test("prefetchImageBlobs downloads with bounded parallelism and keeps result order", async () => {
  const { prefetchImageBlobs } = await loadUtils();
  const started = [];
  const releases = new Map();

  const results = prefetchImageBlobs(
    ["https://img.example/a.jpg", "https://img.example/b.jpg", "https://img.example/c.jpg"],
    (imageUrl) => {
      started.push(imageUrl);
      return new Promise((resolve) => {
        releases.set(imageUrl, () => resolve(`blob:${imageUrl}`));
      });
    },
    { concurrency: 2 }
  );

  assert.deepEqual(started, [
    "https://img.example/a.jpg",
    "https://img.example/b.jpg",
  ]);

  releases.get("https://img.example/b.jpg")();
  assert.deepEqual(await results[1], {
    imageUrl: "https://img.example/b.jpg",
    blobUrl: "blob:https://img.example/b.jpg",
  });
  await Promise.resolve();

  assert.deepEqual(started, [
    "https://img.example/a.jpg",
    "https://img.example/b.jpg",
    "https://img.example/c.jpg",
  ]);

  releases.get("https://img.example/a.jpg")();
  releases.get("https://img.example/c.jpg")();

  assert.deepEqual(await Promise.all(results), [
    {
      imageUrl: "https://img.example/a.jpg",
      blobUrl: "blob:https://img.example/a.jpg",
    },
    {
      imageUrl: "https://img.example/b.jpg",
      blobUrl: "blob:https://img.example/b.jpg",
    },
    {
      imageUrl: "https://img.example/c.jpg",
      blobUrl: "blob:https://img.example/c.jpg",
    },
  ]);
});

test("prefetchImageBlobs converts download failures into ordered item errors", async () => {
  const { prefetchImageBlobs } = await loadUtils();

  const results = await Promise.all(
    prefetchImageBlobs(
      ["https://img.example/a.jpg", "https://img.example/b.jpg"],
      (imageUrl) => {
        if (imageUrl.endsWith("/a.jpg")) {
          throw new Error("download denied");
        }
        return `blob:${imageUrl}`;
      },
      { concurrency: 2 }
    )
  );

  assert.equal(results[0].imageUrl, "https://img.example/a.jpg");
  assert.match(results[0].error.message, /download denied/);
  assert.deepEqual(results[1], {
    imageUrl: "https://img.example/b.jpg",
    blobUrl: "blob:https://img.example/b.jpg",
  });
});

test("prepareOcrInputs reuses cached OCR text and downloads only cache misses", async () => {
  const { prepareOcrInputs } = await loadUtils();
  const downloaded = [];

  const results = await Promise.all(
    prepareOcrInputs(
      [
        "https://img.example/a.jpg",
        "https://img.example/b.jpg",
        "https://img.example/c.jpg",
      ],
      async (imageUrl) => {
        if (imageUrl.endsWith("/b.jpg")) {
          return "cached text for b";
        }
        return "";
      },
      async (imageUrl) => {
        downloaded.push(imageUrl);
        return `blob:${imageUrl}`;
      },
      { concurrency: 2 }
    )
  );

  assert.deepEqual(downloaded, [
    "https://img.example/a.jpg",
    "https://img.example/c.jpg",
  ]);
  assert.deepEqual(results, [
    {
      imageUrl: "https://img.example/a.jpg",
      blobUrl: "blob:https://img.example/a.jpg",
    },
    {
      imageUrl: "https://img.example/b.jpg",
      cachedText: "cached text for b",
    },
    {
      imageUrl: "https://img.example/c.jpg",
      blobUrl: "blob:https://img.example/c.jpg",
    },
  ]);
});

test("prepareOcrInputs treats cache read failures as misses", async () => {
  const { prepareOcrInputs } = await loadUtils();

  const results = await Promise.all(
    prepareOcrInputs(
      ["https://img.example/a.jpg"],
      async () => {
        throw new Error("cache unavailable");
      },
      async (imageUrl) => `blob:${imageUrl}`,
      { concurrency: 1 }
    )
  );

  assert.deepEqual(results, [
    {
      imageUrl: "https://img.example/a.jpg",
      blobUrl: "blob:https://img.example/a.jpg",
    },
  ]);
});
