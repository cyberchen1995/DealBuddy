(function () {
  "use strict";

  const OCR_FRAME_ID = "dealbuddy-ocr-frame";
  const READING_OVERLAY_ID = "dealbuddy-reading-overlay";
  const READING_OVERLAY_STATUS_ID = "dealbuddy-reading-overlay-status";
  const READING_OVERLAY_MINI_STATUS_ID = "dealbuddy-reading-overlay-mini-status";
  const MAX_DETAIL_TEXT_LENGTH = 6000;
  const MAX_IMAGE_URLS = 80;
  const OCR_REQUEST_TIMEOUT_MS = 600000;
  const LAZY_LOAD_SCROLL_STEP_RATIO = 0.86;
  const IMAGE_PLACEHOLDER_PATTERN =
    /g\.alicdn\.com\/s\.gif|tps-\d+-\d+\.gif|placeholder|spaceball|blank\.gif|1x1\./i;
  let ocrFrameReadyPromise = null;
  let captureSettings = {
    autoCaptureEnabled: false,
    detailLoadTimeoutMs: 12000,
    intakeUrl: "http://127.0.0.1:8765/api/current/offers",
  };
  let autoCaptureEnabled = false;
  let autoCaptureRunning = false;
  let captureRunning = false;
  let lastAutoCaptureKey = "";
  let captureStatus = "idle";
  let captureStatusMessage = "";
  let lastCapturePayload = null;
  let lastCaptureError = "";
  let lastCaptureUpdatedAt = "";

  const IMAGE_PLACEHOLDER_MARKERS = [
    "g.alicdn.com/s.gif",
    "tps-56-56.gif",
    "placeholder",
  ];

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function normalizeWhitespace(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeUrl(url) {
    const raw = String(url || "").trim();
    if (!raw || raw.startsWith("data:") || raw === "//g.alicdn.com/s.gif") {
      return "";
    }
    let normalized = raw.startsWith("//") ? `https:${raw}` : raw;
    try {
      normalized = new URL(normalized, window.location.href).href;
    } catch (_error) {
      // Keep the raw value if URL parsing fails.
    }
    const lowered = normalized.toLowerCase();
    if (IMAGE_PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker))) {
      return "";
    }
    return normalized;
  }

  function cleanTitle(value) {
    return normalizeWhitespace(value)
      .split("\n")[0]
      .replace(/\s*[-_]\s*tmall\.com天猫.*$/i, "")
      .replace(/\s*[-_]\s*淘宝网.*$/i, "")
      .replace(/\s*[-_]\s*天猫tmall.*$/i, "")
      .replace(/\s*[-_]\s*京东.*$/i, "")
      .trim();
  }

  function cleanStoreName(value) {
    const firstLine = normalizeWhitespace(value)
      .split("\n")
      .map((item) => item.trim())
      .find(Boolean);
    return firstLine || "";
  }

  function documentTitleFallback() {
    return cleanTitle(
      attr(
        [
          "meta[property='og:title']",
          "meta[name='og:title']",
          "meta[name='title']",
        ],
        "content"
      ) || document.title
    );
  }

  function uniqNonEmpty(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const normalized = normalizeWhitespace(value);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }
    return result;
  }

  function uniqUrls(values) {
    return uniqNonEmpty(values.map(normalizeUrl)).slice(0, MAX_IMAGE_URLS);
  }

  function query(selectorList, root = document) {
    for (const selector of selectorList) {
      try {
        const element = root.querySelector(selector);
        if (element) {
          return element;
        }
      } catch (_error) {
        // Ignore selectors that are not supported by the current browser.
      }
    }
    return null;
  }

  function queryAll(selectorList, root = document) {
    const elements = [];
    for (const selector of selectorList) {
      try {
        elements.push(...root.querySelectorAll(selector));
      } catch (_error) {
        // Ignore selectors that are not supported by the current browser.
      }
    }
    return Array.from(new Set(elements));
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function text(selectorList, root = document) {
    const element = query(selectorList, root);
    if (!element) {
      return "";
    }
    return normalizeWhitespace(element.innerText || element.textContent || "");
  }

  function attr(selectorList, attrName, root = document) {
    const element = query(selectorList, root);
    if (!element) {
      return "";
    }
    return normalizeWhitespace(element.getAttribute(attrName) || element[attrName] || "");
  }

  function imageUrlFromElement(element) {
    if (!element) {
      return "";
    }
    // 懒加载图片的 src 常是占位图（如 //g.alicdn.com/s.gif），真实地址在 data-src，
    // 故优先取第一个非占位候选，避免占位图被当成详情图后被丢弃。
    const candidates = [
      element.getAttribute("data-src"),
      element.getAttribute("data-ks-lazyload"),
      element.getAttribute("data-lazyload"),
      element.getAttribute("data-original"),
      element.currentSrc,
      element.getAttribute("src"),
    ];
    for (const candidate of candidates) {
      if (candidate && !IMAGE_PLACEHOLDER_PATTERN.test(candidate)) {
        return normalizeUrl(candidate);
      }
    }
    return "";
  }

  function collectImageUrls(selectorList, root = document) {
    return uniqUrls(queryAll(selectorList, root).map(imageUrlFromElement));
  }

  function collectVisibleText(root) {
    if (!root || !isVisible(root)) {
      return "";
    }
    const textValue = normalizeWhitespace(root.innerText || root.textContent || "");
    return textValue.slice(0, MAX_DETAIL_TEXT_LENGTH);
  }

  function collectFirstVisibleText(selectorList) {
    for (const element of queryAll(selectorList)) {
      const value = collectVisibleText(element);
      if (value) {
        return value;
      }
    }
    return "";
  }

  function splitSpecText(value) {
    const normalized = normalizeWhitespace(value);
    if (!normalized) {
      return null;
    }
    const separators = [":", "："];
    for (const separator of separators) {
      const index = normalized.indexOf(separator);
      if (index > 0 && index < normalized.length - 1) {
        return [
          normalizeWhitespace(normalized.slice(0, index)),
          normalizeWhitespace(normalized.slice(index + 1)),
        ];
      }
    }
    return null;
  }

  function addSpec(specs, key, value) {
    const normalizedKey = normalizeWhitespace(key).replace(/[：:]+$/, "");
    const normalizedValue = normalizeWhitespace(value);
    if (normalizedKey && normalizedValue && normalizedKey.length <= 40) {
      specs[normalizedKey] = normalizedValue;
    }
  }

  function collectSpecs(options) {
    const specs = {};
    const {
      itemSelectors,
      titleSelectors = [],
      valueSelectors = [],
      fallbackPairSelectors = [],
    } = options;

    for (const item of queryAll(itemSelectors)) {
      const titleElement = titleSelectors.length ? query(titleSelectors, item) : null;
      const valueElement = valueSelectors.length ? query(valueSelectors, item) : null;
      if (titleElement && valueElement) {
        addSpec(
          specs,
          titleElement.getAttribute("title") ||
            titleElement.innerText ||
            titleElement.textContent,
          valueElement.getAttribute("title") ||
            valueElement.innerText ||
            valueElement.textContent
        );
        continue;
      }
      const pair = splitSpecText(item.innerText || item.textContent || "");
      if (pair) {
        addSpec(specs, pair[0], pair[1]);
      }
    }

    for (const row of queryAll(fallbackPairSelectors)) {
      const children = Array.from(row.children).filter((child) =>
        normalizeWhitespace(child.innerText || child.textContent)
      );
      if (children.length >= 2) {
        addSpec(
          specs,
          children[0].innerText || children[0].textContent,
          children
            .slice(1)
            .map((child) => child.innerText || child.textContent)
            .join(" ")
        );
      }
    }

    return specs;
  }

  function collectSkuText(selectorList) {
    const values = [];
    for (const element of queryAll(selectorList)) {
      const value = normalizeWhitespace(element.innerText || element.textContent || "");
      if (value && value.length <= 120) {
        values.push(value);
      }
    }
    return uniqNonEmpty(values).join(" / ");
  }

  function getSkuUtils() {
    return window.DealBuddySkuUtils || null;
  }

  function getAutoCaptureUtils() {
    return window.DealBuddyAutoCaptureUtils || null;
  }

  function getSettingsUtils() {
    return window.DealBuddySettingsUtils || null;
  }

  function normalizeCaptureSettings(value) {
    const utils = getSettingsUtils();
    return utils ? utils.normalizeSettings(value) : { ...captureSettings };
  }

  function skuOptionState(element) {
    const className = String(element.className || "").toLowerCase();
    const selected =
      element.getAttribute("aria-checked") === "true" ||
      element.getAttribute("aria-selected") === "true" ||
      element.getAttribute("data-selected") === "true" ||
      element.querySelector("input:checked") !== null ||
      /\b(selected|curr|current|active|checked|isselected)\b/i.test(className);
    const disabled =
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true" ||
      element.getAttribute("data-disabled") === "true" ||
      element.querySelector("input:disabled") !== null ||
      /(disabled|disable|unavailable|soldout|nostock|no-stock)/i.test(className);
    return { selected, disabled };
  }

  function skuOptionText(element) {
    const image = query(["img"], element);
    return normalizeWhitespace(
      element.getAttribute("title") ||
        element.getAttribute("aria-label") ||
        image?.getAttribute("alt") ||
        image?.getAttribute("title") ||
        element.innerText ||
        element.textContent ||
        ""
    );
  }

  function collectSkuGroups(platform) {
    const groupSelectors =
      platform === "jd"
        ? [
            "#choose-attrs .li",
            ".choose-attrs .li",
            "[id^='choose-attr-']",
            "#choose-color",
            "#choose-version",
            ".page-right-spec .specification-group",
            ".page-right-spec .horizontal-layout",
            ".specifications-panel-content .specification-group",
          ]
        : [
            "[class*='SkuContent'] [class*='skuProp']",
            "[class*='skuWrapper'] [class*='skuProp']",
            "[class*='skuItemWrapper']",
            "[class*='skuContent'] [class*='prop']",
            ".tb-sku dl",
            ".tm-sale-prop",
          ];
    const nameSelectors =
      platform === "jd"
        ? [
            ".dt",
            ".label",
            ".layout-label",
            ".specification-group-label",
            "[class*='label']",
            "[class*='name']",
          ]
        : [
            "[class*='propName']",
            "[class*='skuTitle']",
            "[class*='label']",
            ".tb-metatit",
            "dt",
          ];
    const optionSelectors =
      platform === "jd"
        ? [
            ".dd .item",
            ".dd a",
            ".specification-item-sku",
            ".specification-series-item",
            "[role='radio']",
            "[aria-checked]",
          ]
        : [
            "[class*='skuItem']",
            "[class*='SkuItem']",
            "[role='radio']",
            "[aria-checked]",
            "li",
            "button",
            "a",
          ];
    const rawGroups = [];

    for (const group of queryAll(groupSelectors)) {
      if (!isVisible(group)) {
        continue;
      }
      const name = text(nameSelectors, group);
      const values = [];
      for (const option of queryAll(optionSelectors, group)) {
        if (option === group || !isVisible(option)) {
          continue;
        }
        const valueText = skuOptionText(option);
        if (!valueText || valueText.length > 80) {
          continue;
        }
        values.push({ text: valueText, ...skuOptionState(option) });
      }
      rawGroups.push({ name, values });
    }

    const utils = getSkuUtils();
    return utils ? utils.normalizeSkuGroups(rawGroups) : rawGroups;
  }

  function selectedSkuTextFromGroups(groups) {
    const utils = getSkuUtils();
    if (utils) {
      return utils.selectedSkuText(groups);
    }
    return (groups || [])
      .flatMap((group) =>
        (group.values || []).filter((value) => value.selected).map((value) => value.text)
      )
      .join(" / ");
  }

  function selectedSkuFromPageSource() {
    const utils = getSkuUtils();
    if (!utils?.selectedSkuFromSkuBase) {
      return { skuId: "", text: "", groups: [] };
    }
    return utils.selectedSkuFromSkuBase(
      document.documentElement?.innerHTML || "",
      window.location.href
    );
  }

  function detailRootSelectorsForPlatform(platform) {
    if (platform === "jd") {
      return [
        "#graphic-content",
        "#J-detail-content",
        "#sx-product-detail",
        "#img-text-warp",
        ".detail-content",
      ];
    }
    return [
      "[class*='imageTextInfo']",
      "[class*='ImageText']",
      "#description",
      "#J_DivItemDesc",
      ".descV8-container",
    ];
  }

  function detailImageSelectorsForPlatform(platform) {
    if (platform === "jd") {
      return [
        "#graphic-content img",
        "#J-detail-content img",
        "#sx-product-detail img",
        "#img-text-warp img",
        ".ssd-module-wrap img",
      ];
    }
    return [
      "[class*='imageTextInfo'] img",
      "[class*='singleImage'] img",
      "[class*='ImageText'] img",
      "#description img",
      "#J_DivItemDesc img",
      ".descV8-container img",
    ];
  }

  function detailBackgroundSelectorsForPlatform(platform) {
    return platform === "jd" ? [".ssd-module-wrap .ssd-module"] : [];
  }

  function collectBackgroundImageUrlsFromElements(elements) {
    const urls = [];
    for (const element of elements) {
      const background = window.getComputedStyle(element).backgroundImage;
      const match = background && background.match(/url\(["']?(.*?)["']?\)/);
      if (match && match[1]) {
        urls.push(match[1]);
      }
    }
    return urls;
  }

  function collectDetailImageUrls(platform) {
    // 详情图选择器已限定在图文详情容器内（.descV8-container / #description 等），
    // 天然不会命中底部推荐区，故无需再按标题做边界裁剪。
    const imageElements = queryAll(detailImageSelectorsForPlatform(platform));
    const backgroundElements = queryAll(
      detailBackgroundSelectorsForPlatform(platform)
    );
    return uniqUrls([
      ...imageElements.map(imageUrlFromElement),
      ...collectBackgroundImageUrlsFromElements(backgroundElements),
    ]);
  }

  function collectCurrentDetailImageUrls(platform) {
    return collectDetailImageUrls(platform);
  }

  function countPendingDetailImages(platform) {
    return queryAll(detailImageSelectorsForPlatform(platform)).filter((image) => {
      if (!(image instanceof HTMLImageElement) || !imageUrlFromElement(image)) {
        return false;
      }
      return !image.complete || image.naturalWidth === 0;
    }).length;
  }

  function documentScrollHeight() {
    return Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0
    );
  }

  function currentScrollTop() {
    return (
      window.scrollY ||
      document.documentElement?.scrollTop ||
      document.body?.scrollTop ||
      0
    );
  }

  function isAtPageBottom(scrollHeight = documentScrollHeight()) {
    const viewportHeight =
      window.innerHeight || document.documentElement?.clientHeight || 800;
    return currentScrollTop() + viewportHeight >= scrollHeight - 24;
  }

  function lazyLoadSnapshot(platform, startedAt) {
    const scrollHeight = documentScrollHeight();
    return {
      scrollHeight,
      detailImageCount: collectCurrentDetailImageUrls(platform).length,
      pendingImageCount: countPendingDetailImages(platform),
      atBottom: isAtPageBottom(scrollHeight),
      elapsedMs: Date.now() - startedAt,
    };
  }

  function lazyLoadStatusText(state) {
    if (!state) {
      return "正在整理详情图...";
    }
    if (state.reason === "timeout") {
      return "详情图等待达到上限，继续整理已加载内容。";
    }
    return `正在整理详情图... 已发现 ${state.detailImageCount} 张`;
  }

  async function waitForLazyLoadedDetailImages(platform, onStatus, options = {}) {
    const utils = getAutoCaptureUtils();
    if (!utils) {
      onStatus?.("等待详情图加载...");
      await wait(2000);
      return null;
    }

    const startedAt = Date.now();
    let state = null;
    onStatus?.("正在整理详情图...");

    do {
      const viewportHeight =
        window.innerHeight || document.documentElement?.clientHeight || 800;
      const scrollStep = Math.max(
        480,
        Math.floor(viewportHeight * LAZY_LOAD_SCROLL_STEP_RATIO)
      );
      // 滚动策略：仅在「还没发现详情图」或「上一拍图片数仍在增长」（京东分块渲染）时
      // 继续下滚；图片数稳定后停在原地等稳定拍数凑齐，避免无意义翻页。
      const shouldScroll =
        !state ||
        state.detailImageCount === 0 ||
        state.detailImageCountGrew === true;
      if (shouldScroll) {
        const targetTop = Math.min(
          currentScrollTop() + scrollStep,
          documentScrollHeight()
        );
        if (targetTop > currentScrollTop() + 1) {
          window.scrollTo({ top: targetTop, behavior: "smooth" });
        }
      }
      await wait(utils.DEFAULT_LAZY_LOAD_POLL_INTERVAL_MS || 1500);
      state = utils.nextLazyLoadState(state, lazyLoadSnapshot(platform, startedAt), {
        maxWaitMs: options.maxWaitMs,
      });
      onStatus?.(lazyLoadStatusText(state));
    } while (!state.done);

    return state;
  }

  function detectPlatform() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("tmall.com")) {
      return "tmall";
    }
    if (host.includes("taobao.com")) {
      return "taobao";
    }
    if (host.includes("jd.com")) {
      return "jd";
    }
    return "unknown";
  }

  function isSupportedProductPage(platform = detectPlatform()) {
    const href = window.location.href.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    if (platform === "taobao") {
      return (
        href.includes("taobao.com/item") ||
        href.includes("taobao.com/auction") ||
        path.includes("/item")
      );
    }
    if (platform === "tmall") {
      return (
        href.includes("detail.tmall.com") ||
        path.includes("/item") ||
        href.includes("tmall.com/item")
      );
    }
    if (platform === "jd") {
      return (
        window.location.hostname.toLowerCase() === "item.jd.com" ||
        /\/\d+\.html($|\?)/.test(path + window.location.search) ||
        /\/product\/\d+/.test(path)
      );
    }
    return false;
  }

  function isPlatformBlockPage() {
    const href = window.location.href.toLowerCase();
    const bodyText = normalizeWhitespace(document.body?.innerText || "").toLowerCase();
    return (
      href.includes("punish/deny") ||
      href.includes("action=deny") ||
      bodyText.includes("unusual traffic from your network") ||
      bodyText.includes("please try again later") ||
      bodyText.includes("访问过于频繁") ||
      bodyText.includes("检测到异常流量")
    );
  }

  function clickDetailTab(platform) {
    const labels =
      platform === "jd"
        ? ["商品详情", "图文详情", "规格与包装"]
        : ["图文详情", "商品详情", "宝贝详情"];
    const selectors =
      platform === "jd"
        ? [
            ".tab-main li",
            ".detail-tab-main li",
            ".tab-con li",
            "[data-tab='trigger']",
            "button",
            "a",
          ]
        : [
            "div[class*='tabTitleItem']",
            "[class*='tabTitleItem']",
            "[role='tab']",
            "button",
            "a",
          ];
    for (const element of queryAll(selectors)) {
      const label = normalizeWhitespace(element.innerText || element.textContent || "");
      if (isVisible(element) && labels.some((item) => label.includes(item))) {
        element.click();
        return true;
      }
    }
    return false;
  }

  function scrollDetailRoot(platform) {
    const root = query(detailRootSelectorsForPlatform(platform));
    if (root) {
      root.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  async function prepareDetailArea(platform) {
    try {
      clickDetailTab(platform);
      scrollDetailRoot(platform);
      await wait(platform === "jd" ? 2000 : 1500);
    } catch (_error) {
      await wait(800);
    }
  }

  function extractTaobao() {
    const specs = collectSpecs({
      itemSelectors: [
        ".attributes-list li",
        ".tm-detail-meta li",
        "[class*='--baseDropsInfo'] [class*='--infoItem--']",
        "[class*='infoItem']",
        "[class*='Attrs'] li",
      ],
      titleSelectors: [
        "[class*='--infoItemTitle--']",
        "[class*='infoItemTitle']",
        ".attr-key",
      ],
      valueSelectors: [
        "[class*='--infoItemContent--']",
        "[class*='infoItemContent']",
        ".attr-value",
      ],
      fallbackPairSelectors: ["[class*='baseDropsInfo'] dl", "[class*='Attrs'] dl"],
    });
    return {
      platform: "taobao",
      url: window.location.href,
      title: text([
        ".ItemHeader--mainTitle--3XCBj",
        "[class*='ItemHeader'] [class*='mainTitle']",
        "[class*='--mainTitle']",
        ".tb-detail-hd h1",
        ".tb-main-title",
        "h1",
      ]),
      visible_price: text([
        "[class*='highlightPrice'] [class*='text']",
        "[class*='--priceText']",
        "[class*='priceText']",
        ".tb-rmb-num",
        ".tm-price",
      ]),
      store_name: text([
        "[class*='ShopHeader'] [class*='shopName']",
        "[class*='shopName']",
        ".shop-name-link",
        ".tb-shop-name a",
        "[class*='seller'] a",
      ]),
      image_url: normalizeUrl(
        imageUrlFromElement(
          query([
            "#J_ImgBooth",
            ".tb-booth img",
            "[class*='mainPic'] img",
            "[class*='picGallery'] img",
            "[class*='thumbnails'] img",
          ])
        ) ||
          attr(
            [
              "#J_ImgBooth",
              ".tb-booth img",
              "[class*='mainPic'] img",
              "[class*='picGallery'] img",
            ],
            "src"
          )
      ),
      gallery_image_urls: collectImageUrls([
        "[class*='picGallery'] img",
        "[class*='thumbnails'] img",
        ".tb-thumb img",
        ".spec-preview img",
      ]),
      detail_image_urls: collectDetailImageUrls("taobao"),
      sku_text: collectSkuText([
        "[class*='skuItem'][class*='selected']",
        "[class*='skuItem'][class*='isSelected']",
        "[class*='SkuContent'] [aria-checked='true']",
        ".tb-selected",
        ".tb-sku .selected",
      ]),
      specs,
      detail_text: collectFirstVisibleText([
        "[class*='imageTextInfo']",
        "[class*='ImageText']",
        "#description",
        "#J_DivItemDesc",
        ".descV8-container",
        "[class*='baseDropsInfo']",
      ]),
    };
  }

  function extractTmall() {
    const base = extractTaobao();
    const specs = {
      ...base.specs,
      ...collectSpecs({
        itemSelectors: [
          "[class*='infoItem']",
          ".attributes-list li",
          ".tm-detail-meta li",
          "#J_AttrUL li",
        ],
        titleSelectors: ["[class*='infoItemTitle']", ".attr-key"],
        valueSelectors: ["[class*='infoItemContent']", ".attr-value"],
        fallbackPairSelectors: ["#J_Attrs dl", "[class*='Attrs'] dl"],
      }),
    };
    return {
      ...base,
      platform: "tmall",
      title:
        text([
          "h1.mainTitle",
          "div.ItemTitle h1",
          "h1[class*='mainTitle']",
          "div[class*='ItemTitle'] h1",
          "[class*='--mainTitle']",
          "[class*='mainTitle']",
          "[class*='titleText']",
          "h1",
        ]) ||
        base.title ||
        documentTitleFallback(),
      visible_price:
        text([
          "[class*='highlightPrice'] [class*='text']",
          "[class*='priceText']",
          ".tm-price",
          "[class*='Price']",
        ]) || base.visible_price,
      image_url:
        imageUrlFromElement(
          query([
            "[class*='mainPic'] img",
            "[class*='picGallery'] img",
            "[class*='thumbnails'] img",
            "#J_ImgBooth",
          ])
        ) || base.image_url,
      specs,
      detail_image_urls: collectDetailImageUrls("tmall"),
      gallery_image_urls: uniqUrls([
        ...base.gallery_image_urls,
        ...collectImageUrls([
          "[class*='picGallery'] img",
          "[class*='thumbnails'] img",
          ".tb-thumb img",
        ]),
      ]),
    };
  }

  function extractJd() {
    const specs = collectSpecs({
      itemSelectors: ["#product-attribute .item", ".goods-base .item", ".Ptable-item dl"],
      titleSelectors: [".label .text", ".name", "dt"],
      valueSelectors: [".value .text", ".text", "dd"],
      fallbackPairSelectors: [".Ptable-item dl", ".parameter2 li"],
    });
    return {
      platform: "jd",
      url: window.location.href,
      title: text([".sku-title-name", ".sku-name-title", ".sku-name", "h1"]),
      visible_price: text([
        "#J_FinalPrice .price",
        ".J-summary-price .price",
        ".summary-price .price",
        "[class*='summary-price'] [class*='price']",
      ]),
      store_name: text([
        ".J-hove-wrap .name",
        ".popbox-inner .name",
        ".seller-infor a",
        ".shopName",
        "#popbox .name",
      ]),
      image_url: imageUrlFromElement(query(["#spec-img", ".img-hover", "#preview img"])),
      gallery_image_urls: collectImageUrls([
        ".image-carousel.thumbnails img.image",
        ".spec-items img",
        "#spec-list img",
        "#preview img",
      ]),
      detail_image_urls: collectDetailImageUrls("jd"),
      sku_text: collectSkuText([
        "#choose-attrs .item.selected",
        "#choose-attrs .item.curr",
        ".choose-attrs .item.selected",
        ".choose-attrs .item.curr",
        "[class*='choose'] [class*='selected']",
      ]),
      specs,
      detail_text: collectFirstVisibleText([
        "#graphic-content",
        "#J-detail-content",
        "#sx-product-detail",
        "#img-text-warp",
        ".detail-content",
        ".Ptable",
      ]),
    };
  }

  function evaluatePayload(payload) {
    const warnings = [];
    if (isPlatformBlockPage()) {
      warnings.push("当前页面疑似平台风控或异常流量提示页。");
    }
    if (!isSupportedProductPage(payload.platform)) {
      warnings.push("当前 URL 不像受支持的商品详情页。");
    }
    if (!payload.title) {
      warnings.push("未整理到商品标题。");
    }
    if (!payload.visible_price) {
      warnings.push("未整理到页面展示价。");
    }
    if (!payload.store_name) {
      warnings.push("未整理到店铺名称。");
    }
    if (!payload.image_url) {
      warnings.push("未整理到主图 URL。");
    }
    if (
      Object.keys(payload.specs).length === 0 &&
      !payload.detail_text &&
      payload.detail_image_urls.length === 0
    ) {
      warnings.push("未整理到规格、详情正文或详情图片。");
    }
    if (
      Object.keys(payload.specs).length === 0 &&
      !payload.detail_text &&
      payload.detail_image_urls.length > 0
    ) {
      warnings.push("详情信息主要是图片，暂未得到可搜索的文字参数。");
    }

    let confidence = "low";
    if (
      payload.title &&
      payload.visible_price &&
      (Object.keys(payload.specs).length > 0 || payload.detail_text)
    ) {
      confidence = warnings.length <= 1 ? "high" : "medium";
    } else if (
      payload.title &&
      payload.visible_price &&
      payload.detail_image_urls.length > 0
    ) {
      confidence = "medium";
    } else if (payload.title && (payload.visible_price || payload.detail_text)) {
      confidence = "medium";
    }

    return { confidence, warnings };
  }

  function extractCurrentPage() {
    const platform = detectPlatform();
    const base =
      platform === "taobao"
        ? extractTaobao()
        : platform === "tmall"
          ? extractTmall()
          : platform === "jd"
            ? extractJd()
            : {
                platform,
                url: window.location.href,
                title: "",
                visible_price: "",
                store_name: "",
                image_url: "",
                gallery_image_urls: [],
                detail_image_urls: [],
                sku_text: "",
                sku_groups: [],
                selected_sku_text: "",
                specs: {},
                detail_text: "",
              };

    const skuUtils = getSkuUtils();
    const pageSourceSku = selectedSkuFromPageSource();
    const urlSkuId = skuUtils?.skuIdFromUrl?.(window.location.href) || "";
    const domSkuGroups = collectSkuGroups(platform);
    const skuGroups = domSkuGroups.length > 0 ? domSkuGroups : pageSourceSku.groups;
    const selectedSkuText =
      selectedSkuTextFromGroups(domSkuGroups) ||
      pageSourceSku.text ||
      selectedSkuTextFromGroups(pageSourceSku.groups);
    const payload = {
      platform: base.platform,
      url: skuUtils?.cleanProductUrl?.(window.location.href) || window.location.href,
      title: cleanTitle(base.title || documentTitleFallback()),
      visible_price: normalizeWhitespace(base.visible_price),
      store_name: cleanStoreName(base.store_name),
      sku_id: pageSourceSku.skuId || urlSkuId,
      image_url: normalizeUrl(base.image_url),
      gallery_image_urls: uniqUrls(base.gallery_image_urls || []),
      detail_image_urls: uniqUrls(base.detail_image_urls || []),
      sku_text: normalizeWhitespace(base.sku_text || selectedSkuText),
      sku_groups: skuGroups,
      selected_sku_text: selectedSkuText,
      specs: base.specs || {},
      detail_text: normalizeWhitespace(base.detail_text).slice(0, MAX_DETAIL_TEXT_LENGTH),
      ocr_status: "not_started",
      ocr_items: [],
      ocr_text: "",
      captured_at: new Date().toISOString(),
      confidence: "low",
      warnings: [],
    };
    const evaluation = evaluatePayload(payload);
    payload.confidence = evaluation.confidence;
    payload.warnings = evaluation.warnings;
    return payload;
  }

  function removeReadingOverlay() {
    document.getElementById(READING_OVERLAY_ID)?.remove();
  }

  function updateReadingOverlayStatus(message) {
    const statusText = message || "正在整理商品详情...";
    for (const id of [READING_OVERLAY_STATUS_ID, READING_OVERLAY_MINI_STATUS_ID]) {
      const status = document.getElementById(id);
      if (status) {
        status.textContent = statusText;
      }
    }
  }

  function showReadingOverlay(message = "正在准备整理商品详情...") {
    const existing = document.getElementById(READING_OVERLAY_ID);
    if (existing) {
      updateReadingOverlayStatus(message);
      return existing;
    }

    const overlay = document.createElement("div");
    overlay.id = READING_OVERLAY_ID;
    overlay.className = "dealbuddy-reading-overlay";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.setAttribute("aria-label", "DealBuddy 购物搭子正在整理商品信息");

    const card = document.createElement("div");
    card.className = "dealbuddy-reading-card";

    const header = document.createElement("div");
    header.className = "dealbuddy-reading-header";

    const title = document.createElement("div");
    title.className = "dealbuddy-reading-title";
    title.textContent = "DealBuddy 购物搭子正在整理商品信息";

    const minimizeButton = document.createElement("button");
    minimizeButton.type = "button";
    minimizeButton.className = "dealbuddy-reading-minimize";
    minimizeButton.textContent = "最小化";
    minimizeButton.setAttribute("aria-label", "最小化采集进度");
    minimizeButton.addEventListener("click", () => {
      overlay.classList.add("dealbuddy-reading-overlay--minimized");
      overlay.setAttribute("aria-label", "DealBuddy 购物搭子采集进度已最小化");
    });

    const status = document.createElement("div");
    status.id = READING_OVERLAY_STATUS_ID;
    status.className = "dealbuddy-reading-status";
    status.textContent = message;

    const mini = document.createElement("button");
    mini.type = "button";
    mini.className = "dealbuddy-reading-mini";
    mini.setAttribute("aria-label", "展开采集进度");
    mini.addEventListener("click", () => {
      overlay.classList.remove("dealbuddy-reading-overlay--minimized");
      overlay.setAttribute("aria-label", "DealBuddy 购物搭子正在整理商品信息");
    });

    const miniTitle = document.createElement("span");
    miniTitle.className = "dealbuddy-reading-mini-title";
    miniTitle.textContent = "DealBuddy 购物搭子";

    const miniStatus = document.createElement("span");
    miniStatus.id = READING_OVERLAY_MINI_STATUS_ID;
    miniStatus.className = "dealbuddy-reading-mini-status";
    miniStatus.textContent = message;

    header.appendChild(title);
    header.appendChild(minimizeButton);
    mini.appendChild(miniTitle);
    mini.appendChild(miniStatus);
    card.appendChild(header);
    card.appendChild(status);
    overlay.appendChild(card);
    overlay.appendChild(mini);
    document.body.appendChild(overlay);
    return overlay;
  }

  function setCaptureStatus(status, message, error = "") {
    captureStatus = status;
    captureStatusMessage = message || "";
    lastCaptureError = error || "";
    lastCaptureUpdatedAt = new Date().toISOString();
    updateReadingOverlayStatus(message);
  }

  function summarizePayload(payload) {
    if (!payload) {
      return null;
    }
    return {
      platform: payload.platform,
      url: payload.url,
      title: payload.title,
      visible_price: payload.visible_price,
      store_name: payload.store_name,
      image_url: payload.image_url,
      gallery_image_count: payload.gallery_image_urls?.length || 0,
      detail_image_count: payload.detail_image_urls?.length || 0,
      sku_text: payload.sku_text,
      selected_sku_text: payload.selected_sku_text,
      spec_count: Object.keys(payload.specs || {}).length,
      detail_text_length: payload.detail_text?.length || 0,
      ocr_status: payload.ocr_status || "not_started",
      ocr_item_count: payload.ocr_items?.length || 0,
      confidence: payload.confidence,
      captured_at: payload.captured_at,
    };
  }

  function defaultStatusMessage(platform, supported) {
    if (captureRunning) {
      return captureStatusMessage || "正在整理商品信息...";
    }
    if (!supported) {
      return platform === "unknown"
        ? "当前平台暂不在 DealBuddy 支持范围内。"
        : "当前页面不是受支持的商品详情页，请打开商品详情页后重试。";
    }
    if (lastCapturePayload) {
      return captureStatusMessage || "已整理当前商品信息。";
    }
    return "已连接当前商品页，可在 popup 中开始整理。";
  }

  function currentStatusSnapshot() {
    const platform = detectPlatform();
    const supported = isSupportedProductPage(platform);
    return {
      platform,
      supported,
      autoCaptureEnabled,
      autoCaptureRunning,
      captureRunning,
      status: captureStatus,
      message: defaultStatusMessage(platform, supported),
      lastUpdatedAt: lastCaptureUpdatedAt,
      hasPayload: Boolean(lastCapturePayload),
      payloadSummary: summarizePayload(lastCapturePayload),
      warnings: lastCapturePayload?.warnings || [],
      error: lastCaptureError,
    };
  }

  function storageLocal() {
    return typeof chrome !== "undefined" && chrome.storage?.local
      ? chrome.storage.local
      : null;
  }

  function settingsStorageKey() {
    return getSettingsUtils()?.SETTINGS_STORAGE_KEY || "dealbuddyCaptureSettings";
  }

  function getStoredSettings() {
    const storage = storageLocal();
    if (!storage) {
      try {
        return Promise.resolve(
          normalizeCaptureSettings(
            JSON.parse(window.localStorage.getItem(settingsStorageKey()) || "{}")
          )
        );
      } catch (_error) {
        return Promise.resolve(normalizeCaptureSettings({}));
      }
    }
    return new Promise((resolve) => {
      storage.get([settingsStorageKey()], (result) => {
        resolve(normalizeCaptureSettings(result?.[settingsStorageKey()]));
      });
    });
  }

  function currentProductKey() {
    const platform = detectPlatform();
    try {
      const url = new URL(window.location.href);
      const id =
        url.searchParams.get("id") ||
        url.pathname.match(/\/(\d+)\.html$/)?.[1] ||
        url.pathname;
      const skuId =
        url.searchParams.get("skuId") ||
        url.searchParams.get("sku_id") ||
        url.searchParams.get("skuid") ||
        "";
      return `${platform}:${id}:${skuId}`;
    } catch (_error) {
      return `${platform}:${window.location.href}`;
    }
  }

  function applySettings(settings) {
    captureSettings = normalizeCaptureSettings(settings);
    autoCaptureEnabled = captureSettings.autoCaptureEnabled;
  }

  async function loadAutoCaptureState() {
    applySettings(await getStoredSettings());
    if (autoCaptureEnabled) {
      void maybeRunAutoCapture();
    }
  }

  function getOcrUtils() {
    return window.DealBuddyOcrUtils || null;
  }

  function createRequestId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `ocr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function ensureOcrFrame() {
    if (ocrFrameReadyPromise) {
      return ocrFrameReadyPromise;
    }
    ocrFrameReadyPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById(OCR_FRAME_ID);
      if (existing instanceof HTMLIFrameElement && existing.contentWindow) {
        resolve(existing);
        return;
      }

      const frame = document.createElement("iframe");
      frame.id = OCR_FRAME_ID;
      frame.title = "DealBuddy OCR Frame";
      frame.src = chrome.runtime.getURL("ocr-frame.html");
      frame.style.cssText =
        "position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0;opacity:0;pointer-events:none;";

      const cleanup = () => {
        window.removeEventListener("message", handleReady);
        window.clearTimeout(timeoutId);
      };
      const timeoutId = window.setTimeout(() => {
        cleanup();
        if (frame.contentWindow) {
          resolve(frame);
        } else {
          reject(new Error("OCR frame 初始化超时。"));
        }
      }, 5000);
      const handleReady = (event) => {
        if (event.source !== frame.contentWindow) {
          return;
        }
        if (event.data?.type === "dealbuddy:ocr:ready") {
          cleanup();
          resolve(frame);
        }
      };

      window.addEventListener("message", handleReady);
      document.documentElement.appendChild(frame);
    });
    return ocrFrameReadyPromise;
  }

  function warmupOcr() {
    ensureOcrFrame()
      .then((frame) => {
        frame.contentWindow?.postMessage({ type: "dealbuddy:ocr:warmup" }, "*");
      })
      .catch(() => {
        // 预热失败不阻塞采集；真正 OCR 时会再次初始化并报告错误。
      });
  }

  async function requestOcr(imageUrls, onProgress) {
    const frame = await ensureOcrFrame();
    const requestId = createRequestId();

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        window.removeEventListener("message", handleMessage);
        window.clearTimeout(timeoutId);
      };
      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error("本地 OCR 超时，请减少详情图数量后重试。"));
      }, OCR_REQUEST_TIMEOUT_MS);
      const handleMessage = (event) => {
        if (event.source !== frame.contentWindow) {
          return;
        }
        const message = event.data || {};
        if (message.requestId !== requestId) {
          return;
        }
        if (message.type === "dealbuddy:ocr:progress") {
          onProgress?.(message);
          return;
        }
        if (message.type === "dealbuddy:ocr:done") {
          cleanup();
          resolve(message.result);
        }
      };

      window.addEventListener("message", handleMessage);
      frame.contentWindow.postMessage(
        {
          type: "dealbuddy:ocr:start",
          requestId,
          imageUrls,
        },
        "*"
      );
    });
  }

  async function ocrPayload(payload, onProgress) {
    const utils = getOcrUtils();
    if (!utils) {
      throw new Error("OCR 工具模块未加载，请重新加载扩展后重试。");
    }

    const imageUrls = utils.pickOcrImageUrls(payload);
    if (imageUrls.length === 0) {
      return utils.mergeOcrResult(payload, {
        status: "completed",
        items: [],
        warnings: ["没有可用于 OCR 的详情图片。"],
      });
    }

    const result = await requestOcr(imageUrls, onProgress);
    return utils.mergeOcrResult(payload, result);
  }

  function mergeOcrFailure(payload, error) {
    const warning = `本地 OCR 失败：${
      error instanceof Error ? error.message : String(error)
    }`;
    const utils = getOcrUtils();
    if (utils) {
      return utils.mergeOcrResult(payload, {
        status: "failed",
        items: [],
        warnings: [warning],
      });
    }
    return {
      ...payload,
      ocr_status: "failed",
      warnings: uniqNonEmpty([...(payload.warnings || []), warning]),
    };
  }

  async function postCapturePayload(payload, intakeUrl) {
    const response = await fetch(intakeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    let result = null;
    try {
      result = await response.json();
    } catch (_error) {
      result = null;
    }
    if (!response.ok || result?.status !== "ok") {
      throw new Error(result?.error || `本机 intake 返回 HTTP ${response.status}`);
    }
    return result;
  }

  async function captureCurrentPagePayload(options = {}) {
    const platform = detectPlatform();
    if (platform === "unknown") {
      throw new Error("当前平台暂不在 DealBuddy 支持范围内。");
    }
    if (!isSupportedProductPage(platform)) {
      throw new Error("当前页面不是受支持的商品详情页，请打开商品详情页后重试。");
    }
    // 采集过程会滚动页面触发懒渲染；记录初始位置，结束后还原，避免用户被"翻页"。
    const initialScrollTop = currentScrollTop();
    try {
      options.onStatus?.("正在打开商品详情区域...");
      await prepareDetailArea(platform);
      if (options.waitForDetailImages) {
        await waitForLazyLoadedDetailImages(platform, options.onStatus, {
          maxWaitMs:
            options.detailLoadTimeoutMs || captureSettings.detailLoadTimeoutMs,
        });
      }
      options.onStatus?.("正在整理页面字段...");
      return extractCurrentPage();
    } finally {
      window.scrollTo({ top: initialScrollTop, behavior: "auto" });
    }
  }

  async function runCapture(options = {}) {
    if (captureRunning) {
      return lastCapturePayload;
    }

    captureRunning = true;
    let payload = null;
    lastCaptureError = "";
    setCaptureStatus("running", "正在准备商品详情页...");
    showReadingOverlay("正在准备商品详情页...");
    // OCR 预热：加载 iframe + 模型与"等详情图"并行，首次采集省下数秒初始化时间。
    warmupOcr();

    try {
      const updateStatus = (message) => {
        setCaptureStatus("running", message || "正在整理商品信息...");
      };
      payload = await captureCurrentPagePayload({
        waitForDetailImages: true,
        detailLoadTimeoutMs:
          options.detailLoadTimeoutMs || captureSettings.detailLoadTimeoutMs,
        onStatus: updateStatus,
      });
      const intakeUrl = options.intakeUrl || captureSettings.intakeUrl;
      lastCapturePayload = payload;
      // 阶段 1：先把商品送达工作台（不等 OCR），用户几秒内即可见；后端按 URL 覆盖更新。
      let delivered = false;
      try {
        const firstResult = await postCapturePayload(payload, intakeUrl);
        delivered = true;
        updateStatus(
          `商品已送达工作台（共 ${firstResult.verified_count} 个），正在本地识别详情图...`
        );
      } catch (_error) {
        updateStatus("发送到本机失败，仍在本地识别详情图...");
      }
      // 阶段 2：本地 OCR（较慢），完成后带文字再次送达同一商品。
      const mergedPayload = await ocrPayload(payload, (progress) => {
        updateStatus(progress.message || "OCR 中...");
      });
      lastCapturePayload = mergedPayload;
      updateStatus("详情图识别完成，正在更新工作台...");
      try {
        const intakeResult = await postCapturePayload(mergedPayload, intakeUrl);
        setCaptureStatus(
          "completed",
          `整理完成，详情已更新（共 ${intakeResult.verified_count} 个）。`
        );
      } catch (error) {
        setCaptureStatus(
          delivered ? "completed" : "failed",
          delivered
            ? "商品已在工作台，但详情文字更新发送失败，可在 popup 复制 JSON。"
            : "整理完成，但发送到本机 DealBuddy 失败，可在 popup 中复制 JSON。",
          error instanceof Error ? error.message : String(error)
        );
      }
      return mergedPayload;
    } catch (error) {
      if (payload) {
        const failedPayload = mergeOcrFailure(payload, error);
        lastCapturePayload = failedPayload;
        // 阶段 1 已把基础商品送达，这里尽力把 OCR 失败标记也同步过去（按 URL 覆盖）。
        void postCapturePayload(
          failedPayload,
          options.intakeUrl || captureSettings.intakeUrl
        ).catch(() => {});
        setCaptureStatus(
          "failed",
          "页面字段已整理并送达，但 OCR 失败，可在 popup 中复制 JSON。",
          error instanceof Error ? error.message : String(error)
        );
        return failedPayload;
      }
      const message = `整理失败：${
        error instanceof Error ? error.message : String(error)
      }`;
      lastCapturePayload = null;
      setCaptureStatus("failed", message, message);
      throw error;
    } finally {
      removeReadingOverlay();
      captureRunning = false;
      if (!lastCapturePayload && captureStatus === "running") {
        setCaptureStatus("idle", "");
      }
    }
  }

  async function maybeRunAutoCapture() {
    if (!autoCaptureEnabled || autoCaptureRunning || captureRunning) {
      return;
    }
    const platform = detectPlatform();
    if (platform === "unknown" || !isSupportedProductPage(platform)) {
      return;
    }
    const key = currentProductKey();
    if (lastAutoCaptureKey === key) {
      return;
    }

    lastAutoCaptureKey = key;
    autoCaptureRunning = true;

    try {
      await runCapture();
    } catch (_error) {
      // Status is recorded by runCapture for the popup to display.
    } finally {
      autoCaptureRunning = false;
    }
  }

  function bindSettingsChanges() {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
      return;
    }
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      const change = changes[settingsStorageKey()];
      if (!change) {
        return;
      }
      const wasEnabled = autoCaptureEnabled;
      applySettings(change.newValue);
      if (!wasEnabled && autoCaptureEnabled) {
        void maybeRunAutoCapture();
      }
    });
  }

  function messageType(message) {
    const raw = String(message?.type || "");
    return raw.startsWith("dealbuddy:") ? raw.slice("dealbuddy:".length) : raw;
  }

  async function statusResponse(extra = {}) {
    applySettings(await getStoredSettings());
    return {
      ok: true,
      status: currentStatusSnapshot(),
      ...extra,
    };
  }

  async function handleRuntimeMessage(message) {
    switch (messageType(message)) {
      case "getStatus":
        return statusResponse();
      case "runCapture":
        try {
          await runCapture({
            detailLoadTimeoutMs: message?.detailLoadTimeoutMs,
            intakeUrl: message?.intakeUrl,
          });
          return statusResponse();
        } catch (error) {
          return statusResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      case "copyLastPayload":
        if (!lastCapturePayload) {
          return statusResponse({
            ok: false,
            error: "暂无可复制的商品 JSON，请先整理当前商品信息。",
          });
        }
        return statusResponse({
          json: JSON.stringify(lastCapturePayload, null, 2),
        });
      case "setAutoCapture":
        applySettings({
          ...captureSettings,
          autoCaptureEnabled: Boolean(message?.enabled),
          detailLoadTimeoutMs:
            message?.detailLoadTimeoutMs || captureSettings.detailLoadTimeoutMs,
          intakeUrl: message?.intakeUrl || captureSettings.intakeUrl,
        });
        if (autoCaptureEnabled) {
          void maybeRunAutoCapture();
        }
        return {
          ok: true,
          status: currentStatusSnapshot(),
        };
      default:
        return null;
    }
  }

  function bindRuntimeMessages() {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const type = messageType(message);
      if (
        type !== "getStatus" &&
        type !== "runCapture" &&
        type !== "copyLastPayload" &&
        type !== "setAutoCapture"
      ) {
        return false;
      }
      handleRuntimeMessage(message)
        .then((response) => {
          sendResponse(response);
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            status: currentStatusSnapshot(),
          });
        });
      return true;
    });
  }

  function boot() {
    if (!document.body) {
      window.setTimeout(boot, 200);
      return;
    }
    void loadAutoCaptureState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  bindSettingsChanges();
  bindRuntimeMessages();

  window.addEventListener("load", () => {
    void maybeRunAutoCapture();
  });
})();
