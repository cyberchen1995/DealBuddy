const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_SETTINGS,
  DEFAULT_INTAKE_URL,
  SETTINGS_STORAGE_KEY,
  normalizeSettings,
  settingsToStorage,
} = require("../../extension/dealbuddy-capture/settings-utils.js");

test("normalizeSettings keeps defaults and clamps timeout", () => {
  assert.equal(SETTINGS_STORAGE_KEY, "dealbuddyCaptureSettings");
  assert.deepEqual(DEFAULT_SETTINGS, {
    autoCaptureEnabled: false,
    detailLoadTimeoutMs: 12000,
    intakeUrl: DEFAULT_INTAKE_URL,
  });
  assert.deepEqual(normalizeSettings({ detailLoadTimeoutSeconds: 2 }), {
    autoCaptureEnabled: false,
    detailLoadTimeoutMs: 5000,
    intakeUrl: DEFAULT_INTAKE_URL,
  });
  assert.deepEqual(normalizeSettings({ detailLoadTimeoutSeconds: 120 }), {
    autoCaptureEnabled: false,
    detailLoadTimeoutMs: 60000,
    intakeUrl: DEFAULT_INTAKE_URL,
  });
});

test("normalizeSettings accepts stored milliseconds and boolean settings", () => {
  assert.deepEqual(
    normalizeSettings({
      autoCaptureEnabled: true,
      detailLoadTimeoutMs: 45000,
      intakeUrl: "http://localhost:9000/custom/offers",
    }),
    {
      autoCaptureEnabled: true,
      detailLoadTimeoutMs: 45000,
      intakeUrl: "http://localhost:9000/custom/offers",
    }
  );
});

test("normalizeSettings validates and normalizes the intake URL", () => {
  assert.equal(DEFAULT_INTAKE_URL, "http://127.0.0.1:8765/api/current/offers");
  assert.equal(
    normalizeSettings({ intakeUrl: " http://127.0.0.1:9000 " }).intakeUrl,
    "http://127.0.0.1:9000/api/current/offers"
  );
  assert.equal(
    normalizeSettings({ intakeUrl: "ftp://127.0.0.1:8765/offers" }).intakeUrl,
    DEFAULT_INTAKE_URL
  );
  assert.equal(normalizeSettings({ intakeUrl: "not a url" }).intakeUrl, DEFAULT_INTAKE_URL);
});

test("normalizeSettings migrates the legacy local intake URL to the web endpoint", () => {
  assert.equal(
    normalizeSettings({ intakeUrl: "http://127.0.0.1:8765/offers" }).intakeUrl,
    DEFAULT_INTAKE_URL
  );
  assert.equal(
    normalizeSettings({ intakeUrl: "http://localhost:8765/offers" }).intakeUrl,
    "http://localhost:8765/api/current/offers"
  );
});

test("settingsToStorage serializes timeout as seconds for the popup form", () => {
  assert.deepEqual(
    settingsToStorage({
      autoCaptureEnabled: true,
      detailLoadTimeoutSeconds: 12,
      intakeUrl: "http://localhost:9999/offers",
    }),
    {
      autoCaptureEnabled: true,
      detailLoadTimeoutMs: 12000,
      intakeUrl: "http://localhost:9999/offers",
    }
  );
});
