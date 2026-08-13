/* DealBuddy 落地页 — 无依赖。JS 不可用或 reduced-motion 时内容默认完整可见。 */
(function () {
  "use strict";

  /* 主题三态(自动/浅色/深色),与工作台同机制;head 内联脚本已提前应用避免闪烁 */
  var THEME_KEY = "dealbuddy.theme";
  var themeButtons = Array.prototype.slice.call(
    document.querySelectorAll("[data-theme-choice]")
  );
  if (themeButtons.length) {
    var applyTheme = function (choice) {
      if (choice === "light" || choice === "dark") {
        document.documentElement.setAttribute("data-theme", choice);
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
      themeButtons.forEach(function (btn) {
        btn.setAttribute(
          "aria-pressed",
          String(btn.getAttribute("data-theme-choice") === choice)
        );
      });
    };
    var saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) { /* 忽略 */ }
    applyTheme(saved === "light" || saved === "dark" ? saved : "auto");
    themeButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-theme-choice");
        try {
          if (next === "auto") localStorage.removeItem(THEME_KEY);
          else localStorage.setItem(THEME_KEY, next);
        } catch (e) { /* 忽略 */ }
        applyTheme(next);
      });
    });
  }

  /* 代码块复制按钮（无 JS 即不出现，代码仍可手动选中复制） */
  if (navigator.clipboard && window.isSecureContext) {
    document.querySelectorAll("pre.code").forEach(function (pre) {
      var btn = document.createElement("button");
      btn.className = "code-copy";
      btn.type = "button";
      btn.textContent = "复制";
      btn.setAttribute("aria-live", "polite");
      btn.addEventListener("click", function () {
        var code = pre.querySelector("code");
        navigator.clipboard.writeText(code.innerText).then(function () {
          btn.textContent = "已复制";
          btn.classList.add("ok");
          setTimeout(function () {
            btn.textContent = "复制";
            btn.classList.remove("ok");
          }, 2000);
        });
      });
      pre.appendChild(btn);
    });
  }

  if (!("IntersectionObserver" in window)) return;

  /* 目录 scrollspy（状态指示，与动效无关） */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
  if (tocLinks.length) {
    var byId = {};
    tocLinks.forEach(function (a) {
      byId[a.getAttribute("href").slice(1)] = a;
    });
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var link = byId[e.target.id];
          if (!link) return;
          tocLinks.forEach(function (x) { x.classList.remove("current"); });
          link.classList.add("current");
        });
      },
      { rootMargin: "-35% 0px -55% 0px" }
    );
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) spy.observe(el);
    });
  }

  /* 渐显：reduced-motion 时不启用，内容保持静态完整 */
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  document.documentElement.classList.add("js");

  var els = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  var vh = window.innerHeight;
  var later = [];
  els.forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.top < vh * 0.92 && r.bottom > 0) el.classList.add("in"); // 首屏同步点亮
    else later.push(el);
  });

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );
  later.forEach(function (el) { io.observe(el); });

  /* 兜底：任何情况下 3 秒后全部可见 */
  setTimeout(function () {
    els.forEach(function (el) { el.classList.add("in"); });
  }, 3000);
})();
