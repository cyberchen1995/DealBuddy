(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.DealBuddySkuUtils = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeWhitespace(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t\r\n\f\v]+/g, " ")
      .trim();
  }

  function normalizeSkuGroups(groups) {
    const normalizedGroups = [];
    let fallbackIndex = 1;

    for (const group of groups || []) {
      const values = [];
      const seen = new Set();
      for (const value of group?.values || []) {
        const text = normalizeWhitespace(value?.text || "");
        if (!text || seen.has(text)) {
          continue;
        }
        seen.add(text);
        values.push({
          text,
          selected: Boolean(value?.selected),
          disabled: Boolean(value?.disabled),
        });
      }
      if (values.length === 0) {
        continue;
      }

      const name = normalizeWhitespace(group?.name || "") || `规格${fallbackIndex}`;
      fallbackIndex += 1;
      normalizedGroups.push({ name, values });
    }

    return normalizedGroups;
  }

  function skuIdFromUrl(url) {
    try {
      const parsed = new URL(String(url || ""), "https://dealbuddy.local");
      return (
        parsed.searchParams.get("skuId") ||
        parsed.searchParams.get("sku_id") ||
        parsed.searchParams.get("skuid") ||
        ""
      ).trim();
    } catch (_error) {
      return "";
    }
  }

  function cleanProductUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) {
      return "";
    }
    try {
      const parsed = new URL(raw, "https://dealbuddy.local");
      const hostname = parsed.hostname.toLowerCase();
      const skuId = skuIdFromUrl(parsed.href);
      const itemId = parsed.searchParams.get("id");

      if (
        itemId &&
        (hostname.endsWith("taobao.com") || hostname.endsWith("tmall.com"))
      ) {
        const clean = new URL(`${parsed.origin}${parsed.pathname}`);
        clean.searchParams.set("id", itemId);
        if (skuId) {
          clean.searchParams.set("skuId", skuId);
        }
        return clean.href;
      }

      const jdItemMatch = parsed.pathname.match(/^\/\d+\.html$/);
      if (hostname.endsWith("jd.com") && jdItemMatch) {
        const clean = new URL(`${parsed.origin}${parsed.pathname}`);
        if (skuId) {
          clean.searchParams.set("skuId", skuId);
        }
        return clean.href;
      }

      return parsed.href;
    } catch (_error) {
      return raw;
    }
  }

  function extractJsonObjectAfterKey(source, key) {
    const variants = [
      String(source || ""),
      String(source || "")
        .replace(/&quot;/g, '"')
        .replace(/\\"/g, '"'),
    ];

    for (const variant of variants) {
      const keyIndex = variant.indexOf(`"${key}"`);
      if (keyIndex < 0) {
        continue;
      }
      const colonIndex = variant.indexOf(":", keyIndex);
      const objectStart = variant.indexOf("{", colonIndex);
      if (colonIndex < 0 || objectStart < 0) {
        continue;
      }

      let depth = 0;
      let inString = false;
      let escaping = false;
      for (let index = objectStart; index < variant.length; index += 1) {
        const character = variant[index];
        if (inString) {
          if (escaping) {
            escaping = false;
          } else if (character === "\\") {
            escaping = true;
          } else if (character === '"') {
            inString = false;
          }
          continue;
        }
        if (character === '"') {
          inString = true;
        } else if (character === "{") {
          depth += 1;
        } else if (character === "}") {
          depth -= 1;
          if (depth === 0) {
            try {
              return JSON.parse(variant.slice(objectStart, index + 1));
            } catch (_error) {
              break;
            }
          }
        }
      }
    }

    return null;
  }

  function selectedSkuFromSkuBase(source, urlOrSkuId) {
    const normalizedInput = normalizeWhitespace(urlOrSkuId);
    const skuId =
      skuIdFromUrl(normalizedInput) ||
      (/^https?:\/\//i.test(normalizedInput) ? "" : normalizedInput);
    if (!skuId) {
      return { skuId: "", text: "", groups: [] };
    }

    const skuBase = extractJsonObjectAfterKey(source, "skuBase");
    const sku = (skuBase?.skus || []).find(
      (item) => normalizeWhitespace(item?.skuId) === skuId
    );
    if (!sku?.propPath) {
      return { skuId, text: "", groups: [] };
    }

    const selectedByPid = new Map();
    for (const propPathPart of String(sku.propPath).split(";")) {
      const [pid, vid] = propPathPart.split(":").map(normalizeWhitespace);
      if (pid && vid) {
        selectedByPid.set(pid, vid);
      }
    }

    const groups = [];
    for (const prop of skuBase.props || []) {
      const pid = normalizeWhitespace(prop?.pid);
      const selectedVid = selectedByPid.get(pid);
      if (!pid || !selectedVid) {
        continue;
      }

      const values = [];
      for (const value of prop?.values || []) {
        const vid = normalizeWhitespace(value?.vid);
        const text = normalizeWhitespace(value?.name || value?.text || "");
        if (!vid || !text) {
          continue;
        }
        values.push({
          text,
          selected: vid === selectedVid,
          disabled: Boolean(value?.disabled),
        });
      }
      if (values.length === 0 && prop?.valueMap?.[selectedVid]) {
        const selectedValue = prop.valueMap[selectedVid];
        values.push({
          text: normalizeWhitespace(selectedValue?.name || selectedValue?.text || ""),
          selected: true,
          disabled: Boolean(selectedValue?.disabled),
        });
      }
      if (values.length === 0) {
        continue;
      }
      groups.push({
        name: normalizeWhitespace(prop?.name || prop?.nameDesc || "") || pid,
        values,
      });
    }

    const normalizedGroups = normalizeSkuGroups(groups);
    return {
      skuId,
      text: selectedSkuText(normalizedGroups),
      groups: normalizedGroups,
    };
  }

  function selectedSkuText(groups) {
    return normalizeSkuGroups(groups)
      .flatMap((group) =>
        group.values.filter((value) => value.selected).map((value) => value.text)
      )
      .join(" / ");
  }

  return {
    cleanProductUrl,
    normalizeSkuGroups,
    selectedSkuFromSkuBase,
    selectedSkuText,
    skuIdFromUrl,
  };
});
