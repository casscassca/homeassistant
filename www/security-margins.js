(() => {
  const PAD = "28px";
  const applyTo = (el) => {
    el.style.padding = PAD;
    el.style.boxSizing = "border-box";
    el.style.setProperty("--grid-card-gap", "12px");
    const styleChild = (c) => {
      if (!c || !c.style) return;
      c.style.boxSizing = "border-box";
      c.style.maxWidth = "100%";
    };
    if (el.shadowRoot) {
      Array.from(el.shadowRoot.children).forEach(styleChild);
    }
    Array.from(el.children || []).forEach(styleChild);
  };
  const walk = (root) => {
    if (!root) return;
    const visit = (n) => {
      if (!n) return;
      if (n.localName === "hui-panel-view") applyTo(n);
      if (n.shadowRoot) {
        n.shadowRoot.querySelectorAll("*").forEach((el) => {
          if (el.localName === "hui-panel-view") applyTo(el);
          if (el.shadowRoot) visit(el);
        });
      }
    };
    visit(root);
    if (root.querySelectorAll) {
      root.querySelectorAll("*").forEach(visit);
    }
  };
  let timer = 0;
  const tick = () => {
    const path = location.pathname || "";
    if (!path.includes("security-view")) return;
    walk(document);
  };
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      tick();
    }, 50);
  };
  const start = () => {
    tick();
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("location-changed", schedule);
    window.addEventListener("popstate", schedule);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
