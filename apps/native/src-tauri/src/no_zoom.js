// Injected into every page the app shows (lib.rs): the page itself must not zoom, as in a native app. The
// website keeps browser zoom; only the app adds this. The family-tree canvas still zooms: it handles pinch and
// Ctrl+scroll itself, and nothing here stops those events from reaching it.
(function () {
  var VIEWPORT = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

  // iOS / Android: the viewport tag (app web views honour it). Next.js may rewrite it on navigation.
  function lockViewport() {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      (document.head || document.documentElement).appendChild(meta);
    }
    if (meta.content !== VIEWPORT) meta.content = VIEWPORT;
  }

  function start() {
    lockViewport();
    new MutationObserver(lockViewport).observe(document.head || document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["content"],
    });
    // No double-tap zoom.
    var style = document.createElement("style");
    style.textContent = "html{touch-action:manipulation;-webkit-text-size-adjust:100%}";
    (document.head || document.documentElement).appendChild(style);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  // Desktop trackpad pinch arrives as Ctrl+scroll (Linux, Windows); WebKit also sends gesture events.
  document.addEventListener("wheel", function (e) { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  ["gesturestart", "gesturechange"].forEach(function (type) {
    document.addEventListener(type, function (e) { e.preventDefault(); });
  });
})();
