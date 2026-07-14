/* DealBuddy 落地页 — 滚动渐显。无依赖；JS 不可用或 reduced-motion 时内容默认完整可见。 */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) {
    return; // 不加 .js 类，.reveal 保持静态完整显示
  }

  var els = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (!els.length) {
    return;
  }

  document.documentElement.classList.add("js");

  // 首屏内的元素同步点亮，保证第一帧就有内容
  var vh = window.innerHeight;
  var below = [];
  els.forEach(function (el) {
    var rect = el.getBoundingClientRect();
    if (rect.top < vh * 0.95 && rect.bottom > 0) {
      el.classList.add("in");
    } else {
      below.push(el);
    }
  });

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.1 }
  );

  below.forEach(function (el) {
    observer.observe(el);
  });

  // 兜底：无论滚动与否，3 秒后全部可见，杜绝内容被动画卡住
  window.setTimeout(function () {
    els.forEach(function (el) {
      el.classList.add("in");
    });
  }, 3000);
})();
