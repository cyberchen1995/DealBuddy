export const DEFAULT_IMAGE_PREFETCH_CONCURRENCY = 4;
const MAX_IMAGE_PREFETCH_CONCURRENCY = 8;

function normalizedConcurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_IMAGE_PREFETCH_CONCURRENCY;
  }
  return Math.min(
    Math.max(Math.floor(number), 1),
    MAX_IMAGE_PREFETCH_CONCURRENCY
  );
}

function runLimited(task, state) {
  return new Promise((resolve) => {
    const run = () => {
      state.active += 1;
      let promise;
      try {
        promise = Promise.resolve(task());
      } catch (error) {
        promise = Promise.reject(error);
      }
      promise
        .then(
          (value) => resolve({ ok: true, value }),
          (error) => resolve({ ok: false, error })
        )
        .finally(() => {
          state.active -= 1;
          const next = state.queue.shift();
          if (next) {
            next();
          }
        });
    };

    if (state.active < state.concurrency) {
      run();
      return;
    }
    state.queue.push(run);
  });
}

export function prefetchImageBlobs(imageUrls, downloadImage, options = {}) {
  const urls = Array.isArray(imageUrls) ? imageUrls : [];
  const state = {
    active: 0,
    concurrency: normalizedConcurrency(options.concurrency),
    queue: [],
  };

  return urls.map((imageUrl, index) =>
    runLimited(() => downloadImage(imageUrl, index), state).then((result) => {
      if (result.ok) {
        return { imageUrl, blobUrl: result.value };
      }
      return { imageUrl, error: result.error };
    })
  );
}

async function loadCachedText(loadCachedTextForUrl, imageUrl, index) {
  try {
    const text = await loadCachedTextForUrl(imageUrl, index);
    return String(text || "").trim();
  } catch (_error) {
    return "";
  }
}

export function prepareOcrInputs(
  imageUrls,
  loadCachedTextForUrl,
  downloadImage,
  options = {}
) {
  const urls = Array.isArray(imageUrls) ? imageUrls : [];
  const state = {
    active: 0,
    concurrency: normalizedConcurrency(options.concurrency),
    queue: [],
  };

  return urls.map(async (imageUrl, index) => {
    const cachedText = await loadCachedText(
      loadCachedTextForUrl,
      imageUrl,
      index
    );
    if (cachedText) {
      return { imageUrl, cachedText };
    }
    const result = await runLimited(() => downloadImage(imageUrl, index), state);
    if (result.ok) {
      return { imageUrl, blobUrl: result.value };
    }
    return { imageUrl, error: result.error };
  });
}
