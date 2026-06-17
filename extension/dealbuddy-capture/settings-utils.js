(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.DealBuddySettingsUtils = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SETTINGS_STORAGE_KEY = "dealbuddyCaptureSettings";
  const DEFAULT_INTAKE_URL = "http://127.0.0.1:8765/api/current/offers";
  const MIN_DETAIL_LOAD_TIMEOUT_MS = 5000;
  const MAX_DETAIL_LOAD_TIMEOUT_MS = 60000;
  const DEFAULT_SETTINGS = {
    autoCaptureEnabled: false,
    detailLoadTimeoutMs: 12000,
    intakeUrl: DEFAULT_INTAKE_URL,
  };

  function booleanOrDefault(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }

  function clampTimeoutMs(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return DEFAULT_SETTINGS.detailLoadTimeoutMs;
    }
    return Math.min(
      Math.max(Math.round(number), MIN_DETAIL_LOAD_TIMEOUT_MS),
      MAX_DETAIL_LOAD_TIMEOUT_MS
    );
  }

  function timeoutMsFromInput(input) {
    if (Object.prototype.hasOwnProperty.call(input || {}, "detailLoadTimeoutSeconds")) {
      return clampTimeoutMs(Number(input.detailLoadTimeoutSeconds) * 1000);
    }
    return clampTimeoutMs(input?.detailLoadTimeoutMs);
  }

  function normalizeIntakeUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return DEFAULT_INTAKE_URL;
    }
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return DEFAULT_INTAKE_URL;
      }
      if (
        (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
        url.port === "8765" &&
        url.pathname === "/offers"
      ) {
        url.pathname = "/api/current/offers";
      }
      if (!url.pathname || url.pathname === "/") {
        url.pathname = "/api/current/offers";
      }
      return url.href;
    } catch (_error) {
      return DEFAULT_INTAKE_URL;
    }
  }

  function normalizeSettings(input = {}) {
    return {
      autoCaptureEnabled: booleanOrDefault(
        input?.autoCaptureEnabled,
        DEFAULT_SETTINGS.autoCaptureEnabled
      ),
      detailLoadTimeoutMs: timeoutMsFromInput(input),
      intakeUrl: normalizeIntakeUrl(input?.intakeUrl),
    };
  }

  function settingsToStorage(input = {}) {
    return normalizeSettings(input);
  }

  return {
    DEFAULT_INTAKE_URL,
    DEFAULT_SETTINGS,
    MAX_DETAIL_LOAD_TIMEOUT_MS,
    MIN_DETAIL_LOAD_TIMEOUT_MS,
    SETTINGS_STORAGE_KEY,
    normalizeSettings,
    settingsToStorage,
  };
});
