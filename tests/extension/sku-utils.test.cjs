const assert = require("node:assert/strict");
const test = require("node:test");

const {
  cleanProductUrl,
  normalizeSkuGroups,
  selectedSkuFromSkuBase,
  selectedSkuText,
  skuIdFromUrl,
} = require("../../extension/dealbuddy-capture/sku-utils.js");

test("normalizeSkuGroups keeps visible values and removes blanks and duplicates", () => {
  const groups = normalizeSkuGroups([
    {
      name: "尺码",
      values: [
        { text: " M ", selected: true, disabled: false },
        { text: "M", selected: false, disabled: false },
        { text: "", selected: false, disabled: false },
        { text: "L", selected: false, disabled: true },
      ],
    },
    {
      name: "",
      values: [
        { text: "蓝色", selected: false, disabled: false },
        { text: "粉色", selected: true, disabled: false },
      ],
    },
  ]);

  assert.deepEqual(groups, [
    {
      name: "尺码",
      values: [
        { text: "M", selected: true, disabled: false },
        { text: "L", selected: false, disabled: true },
      ],
    },
    {
      name: "规格2",
      values: [
        { text: "蓝色", selected: false, disabled: false },
        { text: "粉色", selected: true, disabled: false },
      ],
    },
  ]);
});

test("selectedSkuText joins selected values across groups", () => {
  const groups = normalizeSkuGroups([
    {
      name: "尺码",
      values: [{ text: "M", selected: true, disabled: false }],
    },
    {
      name: "颜色",
      values: [{ text: "蓝色", selected: true, disabled: false }],
    },
  ]);

  assert.equal(selectedSkuText(groups), "M / 蓝色");
});

test("skuIdFromUrl reads common platform sku query parameters", () => {
  assert.equal(
    skuIdFromUrl("https://detail.tmall.com/item.htm?id=1&skuId=6202090222025"),
    "6202090222025"
  );
  assert.equal(
    skuIdFromUrl("https://item.taobao.com/item.htm?id=1&sku_id=5243726441124"),
    "5243726441124"
  );
  assert.equal(skuIdFromUrl("https://item.jd.com/10211466186894.html"), "");
});

test("cleanProductUrl keeps item id and sku id while dropping tracking parameters", () => {
  assert.equal(
    cleanProductUrl(
      "https://detail.tmall.com/item.htm?id=853032923388&mi_id=secret&pvid=abc&skuId=5821746491453&spm=a&utparam=%7B%22userId%22%3A789865928%7D&xxc=home_recommend"
    ),
    "https://detail.tmall.com/item.htm?id=853032923388&skuId=5821746491453"
  );
  assert.equal(
    cleanProductUrl(
      "https://item.taobao.com/item.htm?id=760318224020&sku_id=5243726441124&scm=abc"
    ),
    "https://item.taobao.com/item.htm?id=760318224020&skuId=5243726441124"
  );
  assert.equal(
    cleanProductUrl("https://item.jd.com/10211466186894.html?pcdk=secret&spmTag=abc"),
    "https://item.jd.com/10211466186894.html"
  );
});

test("selectedSkuFromSkuBase maps current sku id and keeps every sku option", () => {
  const pageSource = String.raw`
    window.__DATA__="{\"skuBase\":{\"skus\":[
      {\"propPath\":\"1627207:42715762093\",\"skuId\":\"6202090222025\"},
      {\"propPath\":\"1627207:42817972078\",\"skuId\":\"6206521750212\"}
    ],\"props\":[{
      \"pid\":\"1627207\",
      \"name\":\"颜色分类\",
      \"values\":[
        {\"vid\":\"42715762093\",\"name\":\"EYSZW22586SHU1 22套 邃空黑\"},
        {\"vid\":\"42817972078\",\"name\":\"EYZW2286U1(W5000Plus2.0白) 22套 茉莉白\"}
      ]
    }]}}";
  `;

  assert.deepEqual(
    selectedSkuFromSkuBase(
      pageSource,
      "https://detail.tmall.com/item.htm?id=1027600328909&skuId=6202090222025"
    ),
    {
      skuId: "6202090222025",
      text: "EYSZW22586SHU1 22套 邃空黑",
      groups: [
        {
          name: "颜色分类",
          values: [
            {
              text: "EYSZW22586SHU1 22套 邃空黑",
              selected: true,
              disabled: false,
            },
            {
              text: "EYZW2286U1(W5000Plus2.0白) 22套 茉莉白",
              selected: false,
              disabled: false,
            },
          ],
        },
      ],
    }
  );
});

test("selectedSkuFromSkuBase does not treat a URL without sku id as an id", () => {
  assert.deepEqual(
    selectedSkuFromSkuBase(
      '{"skuBase":{"skus":[],"props":[]}}',
      "https://item.jd.com/10211466186894.html"
    ),
    { skuId: "", text: "", groups: [] }
  );
});
