(function () {
  "use strict";

  const utils = window.DealBuddySettingsUtils;
  const form = document.getElementById("dealbuddy-settings-form");
  const autoCaptureInput = document.getElementById("auto-capture-enabled");
  const intakeUrlInput = document.getElementById("intake-url");
  const timeoutInput = document.getElementById("detail-load-timeout-seconds");
  const settingsStatus = document.getElementById("settings-status");
  const captureStatus = document.getElementById("capture-status");
  const payloadSummary = document.getElementById("payload-summary");
  const warningList = document.getElementById("warning-list");
  const captureButton = document.getElementById("capture-current-button");
  const copyJsonButton = document.getElementById("copy-json-button");
  const recaptureButton = document.getElementById("recapture-button");

  function storageLocal() {
    return typeof chrome !== "undefined" && chrome.storage?.local
      ? chrome.storage.local
      : null;
  }

  function tabsApi() {
    return typeof chrome !== "undefined" && chrome.tabs ? chrome.tabs : null;
  }

  function setSettingsStatus(message, isError = false) {
    if (!settingsStatus) {
      return;
    }
    settingsStatus.textContent = message;
    settingsStatus.classList.toggle("error", isError);
    settingsStatus.classList.toggle("ok", !isError);
  }

  function setCaptureStatus(message, isError = false) {
    if (!captureStatus) {
      return;
    }
    captureStatus.textContent = message;
    captureStatus.classList.toggle("error", isError);
    captureStatus.classList.toggle("ok", !isError);
  }

  function renderSettings(settings) {
    autoCaptureInput.checked = settings.autoCaptureEnabled;
    intakeUrlInput.value = settings.intakeUrl;
    timeoutInput.value = String(Math.round(settings.detailLoadTimeoutMs / 1000));
  }

  function readStoredSettings() {
    const storage = storageLocal();
    if (!storage) {
      renderSettings(utils.DEFAULT_SETTINGS);
      return;
    }
    storage.get([utils.SETTINGS_STORAGE_KEY], (result) => {
      renderSettings(utils.normalizeSettings(result?.[utils.SETTINGS_STORAGE_KEY]));
    });
  }

  function currentFormSettings() {
    return utils.settingsToStorage({
      autoCaptureEnabled: autoCaptureInput.checked,
      intakeUrl: intakeUrlInput.value,
      detailLoadTimeoutSeconds: timeoutInput.value,
    });
  }

  function getActiveTab() {
    const tabs = tabsApi();
    if (!tabs?.query) {
      return Promise.reject(new Error("当前浏览器不支持 tabs API。"));
    }
    return new Promise((resolve, reject) => {
      tabs.query({ active: true, currentWindow: true }, (items) => {
        const error = chrome.runtime?.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        const tab = items?.[0];
        if (!tab || typeof tab.id !== "number") {
          reject(new Error("未找到当前活动标签页。"));
          return;
        }
        resolve(tab);
      });
    });
  }

  async function sendContentMessage(type, body = {}) {
    const tabs = tabsApi();
    if (!tabs?.sendMessage) {
      throw new Error("当前浏览器不支持向页面发送扩展消息。");
    }
    const tab = await getActiveTab();
    return new Promise((resolve, reject) => {
      tabs.sendMessage(tab.id, { ...body, type }, (response) => {
        const error = chrome.runtime?.lastError;
        if (error) {
          reject(
            new Error(
              "当前页面未加载 DealBuddy content script，请打开淘宝、天猫或京东商品详情页。"
            )
          );
          return;
        }
        resolve(response || {});
      });
    });
  }

  function setCaptureButtonsDisabled(disabled) {
    captureButton.disabled = disabled;
    copyJsonButton.disabled = disabled;
    recaptureButton.disabled = disabled;
  }

  function renderDisconnected(message) {
    setCaptureStatus(message, true);
    if (payloadSummary) {
      payloadSummary.textContent = "";
    }
    renderWarnings([]);
    setCaptureButtonsDisabled(true);
  }

  function renderWarnings(warnings) {
    if (!warningList) {
      return;
    }
    warningList.textContent = "";
    for (const warning of warnings || []) {
      const item = document.createElement("div");
      item.className = "warning";
      item.textContent = warning;
      warningList.appendChild(item);
    }
  }

  function summaryText(summary) {
    if (!summary) {
      return "";
    }
    const title = summary.title || "未整理到标题";
    const price = summary.visible_price ? `价格 ${summary.visible_price}` : "未整理到价格";
    const store = summary.store_name ? `店铺 ${summary.store_name}` : "未整理到店铺";
    return `${title} · ${price} · ${store} · 详情图 ${
      summary.detail_image_count || 0
    } 张 · OCR ${summary.ocr_status || "not_started"}`;
  }

  function renderCaptureState(state) {
    if (!state) {
      renderDisconnected("当前页面未返回 DealBuddy 状态。");
      return;
    }

    const supported = Boolean(state.supported);
    const running = Boolean(state.captureRunning || state.autoCaptureRunning);
    const hasPayload = Boolean(state.hasPayload);
    const isError = Boolean(state.error) || !supported;
    setCaptureStatus(state.message || "已连接当前页面。", isError);
    if (payloadSummary) {
      payloadSummary.textContent = summaryText(state.payloadSummary);
    }
    renderWarnings(state.warnings || []);

    captureButton.disabled = running || !supported;
    copyJsonButton.disabled = running || !hasPayload;
    recaptureButton.disabled = running || !supported || !hasPayload;
  }

  async function refreshCaptureStatus() {
    try {
      const response = await sendContentMessage("getStatus");
      renderCaptureState(response.status);
      if (response.ok === false && response.error) {
        setCaptureStatus(response.error, true);
      }
    } catch (error) {
      renderDisconnected(error instanceof Error ? error.message : String(error));
    }
  }

  function saveSettings(options = {}) {
    const storage = storageLocal();
    const settings = currentFormSettings();
    renderSettings(settings);
    if (!storage) {
      setSettingsStatus("当前浏览器不支持扩展存储。", true);
      return;
    }
    storage.set({ [utils.SETTINGS_STORAGE_KEY]: settings }, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        setSettingsStatus(error.message, true);
        return;
      }
      setSettingsStatus("已保存");
      window.setTimeout(() => setSettingsStatus(""), 1400);
      if (options.syncAutoCapture) {
        void sendContentMessage("setAutoCapture", {
          enabled: settings.autoCaptureEnabled,
          intakeUrl: settings.intakeUrl,
          detailLoadTimeoutMs: settings.detailLoadTimeoutMs,
        })
          .then((response) => {
            renderCaptureState(response.status);
          })
          .catch(() => {
            void refreshCaptureStatus();
          });
      }
    });
  }

  async function runCaptureFromPopup() {
    setCaptureButtonsDisabled(true);
    setCaptureStatus("正在整理当前商品信息...");
    try {
      const settings = currentFormSettings();
      const response = await sendContentMessage("runCapture", {
        detailLoadTimeoutMs: settings.detailLoadTimeoutMs,
        intakeUrl: settings.intakeUrl,
      });
      renderCaptureState(response.status);
      if (response.ok === false && response.error) {
        setCaptureStatus(response.error, true);
      }
    } catch (error) {
      renderDisconnected(error instanceof Error ? error.message : String(error));
    }
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  async function copyLastJson() {
    copyJsonButton.disabled = true;
    try {
      const response = await sendContentMessage("copyLastPayload");
      renderCaptureState(response.status);
      if (response.ok === false || !response.json) {
        throw new Error(response.error || "暂无可复制的商品 JSON。");
      }
      await writeClipboard(response.json);
      setCaptureStatus("JSON 已复制到剪贴板。");
    } catch (error) {
      setCaptureStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  if (!utils || !form) {
    setSettingsStatus("配置模块加载失败，请重新加载扩展。", true);
    renderDisconnected("popup 初始化失败。");
    return;
  }

  readStoredSettings();
  void refreshCaptureStatus();

  form.addEventListener("change", (event) => {
    saveSettings({ syncAutoCapture: event.target === autoCaptureInput });
  });
  form.addEventListener("input", (event) => {
    if (event.target === timeoutInput) {
      saveSettings();
    }
  });
  captureButton.addEventListener("click", () => {
    void runCaptureFromPopup();
  });
  recaptureButton.addEventListener("click", () => {
    void runCaptureFromPopup();
  });
  copyJsonButton.addEventListener("click", () => {
    void copyLastJson();
  });
})();
