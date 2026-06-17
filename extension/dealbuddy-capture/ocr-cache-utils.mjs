const OCR_CACHE_DB_NAME = "dealbuddy-ocr-cache";
const OCR_CACHE_DB_VERSION = 1;
const OCR_CACHE_STORE_NAME = "ocr_results";

export function normalizeOcrCacheKey(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.href;
  } catch (_error) {
    return raw;
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

function openOcrCacheDb(indexedDb) {
  return new Promise((resolve, reject) => {
    if (!indexedDb) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDb.open(OCR_CACHE_DB_NAME, OCR_CACHE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OCR_CACHE_STORE_NAME)) {
        db.createObjectStore(OCR_CACHE_STORE_NAME, { keyPath: "url" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB failed"));
  });
}

export function createIndexedDbOcrCache(options = {}) {
  const indexedDb = options.indexedDB || globalThis.indexedDB;
  const now = options.now || (() => new Date());
  let dbPromise = null;

  function openDb() {
    if (!dbPromise) {
      dbPromise = openOcrCacheDb(indexedDb);
    }
    return dbPromise;
  }

  return {
    async get(imageUrl) {
      const url = normalizeOcrCacheKey(imageUrl);
      if (!url) {
        return "";
      }
      try {
        const db = await openDb();
        const transaction = db.transaction(OCR_CACHE_STORE_NAME, "readonly");
        const record = await requestToPromise(
          transaction.objectStore(OCR_CACHE_STORE_NAME).get(url)
        );
        return String(record?.text || "").trim();
      } catch (_error) {
        return "";
      }
    },

    async set(imageUrl, text) {
      const url = normalizeOcrCacheKey(imageUrl);
      const normalizedText = String(text || "").trim();
      if (!url || !normalizedText) {
        return;
      }
      try {
        const db = await openDb();
        const transaction = db.transaction(OCR_CACHE_STORE_NAME, "readwrite");
        transaction.objectStore(OCR_CACHE_STORE_NAME).put({
          url,
          text: normalizedText,
          updated_at: now().toISOString(),
        });
        await transactionDone(transaction);
      } catch (_error) {
        // OCR cache is an optimization; failed writes must not break capture.
      }
    },
  };
}
