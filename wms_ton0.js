(() => {
  "use strict";

  const DATA_URL = "wms_data_868810a6f2c1.json";
  const IDS = {
    style: "wms-ton0-style",
    button: "wms-ton0-button",
    badge: "wms-ton0-badge",
    overlay: "wms-ton0-overlay",
    panel: "wms-ton0-panel",
    search: "wms-ton0-search",
    summary: "wms-ton0-summary",
    list: "wms-ton0-list"
  };

  let reportItems = [];
  let loaded = false;
  let loading = false;

  const txt = {
    button: "T\u1ed2N 0 C\u00d3 V\u1eca TR\u00cd",
    title: "T\u1ed3n 0 nh\u01b0ng v\u1eabn c\u00f3 v\u1ecb tr\u00ed",
    search: "T\u00ecm theo m\u00e3, t\u00ean ho\u1eb7c v\u1ecb tr\u00ed...",
    loading: "\u0110ang t\u1ea3i d\u1eef li\u1ec7u...",
    empty: "Kh\u00f4ng c\u00f3 v\u1eadt t\u01b0 n\u00e0o th\u1ecfa \u0111i\u1ec1u ki\u1ec7n.",
    noMatch: "Kh\u00f4ng t\u00ecm th\u1ea5y k\u1ebft qu\u1ea3 ph\u00f9 h\u1ee3p.",
    error: "Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c d\u1eef li\u1ec7u WMS.",
    unit: "\u0110VT",
    stock: "T\u1ed3n",
    locations: "v\u1ecb tr\u00ed",
    updated: "D\u1eef li\u1ec7u",
    close: "\u0110\u00f3ng"
  };

  function injectStyle() {
    if (document.getElementById(IDS.style)) return;

    const style = document.createElement("style");
    style.id = IDS.style;
    style.textContent = `
      #${IDS.button}{
        position:fixed;right:16px;bottom:16px;z-index:2147483000;
        border:0;border-radius:999px;padding:11px 15px;
        background:#b42318;color:#fff;font:700 13px/1.2 Arial,sans-serif;
        box-shadow:0 5px 18px rgba(0,0,0,.24);cursor:pointer;
        display:flex;align-items:center;gap:8px
      }
      #${IDS.badge}{
        min-width:22px;height:22px;padding:0 6px;border-radius:11px;
        background:#fff;color:#b42318;display:inline-flex;
        align-items:center;justify-content:center;font-size:12px
      }
      #${IDS.overlay}{
        position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);
        display:none;align-items:flex-end;justify-content:center
      }
      #${IDS.overlay}.open{display:flex}
      #${IDS.panel}{
        width:min(760px,100%);max-height:92vh;background:#f7f8fa;
        border-radius:18px 18px 0 0;overflow:hidden;
        box-shadow:0 -8px 30px rgba(0,0,0,.25);
        font-family:Arial,sans-serif;color:#1d2939
      }
      .wms-ton0-head{
        background:#fff;padding:14px 16px 10px;border-bottom:1px solid #e4e7ec;
        position:sticky;top:0;z-index:2
      }
      .wms-ton0-title-row{display:flex;align-items:center;gap:10px}
      .wms-ton0-title{font-weight:800;font-size:18px;flex:1}
      .wms-ton0-close{
        border:0;background:#f2f4f7;border-radius:10px;padding:8px 11px;
        font-weight:700;cursor:pointer
      }
      #${IDS.summary}{font-size:13px;color:#667085;margin-top:5px}
      #${IDS.search}{
        width:100%;box-sizing:border-box;margin-top:10px;padding:11px 12px;
        border:1px solid #d0d5dd;border-radius:10px;font-size:15px;outline:none
      }
      #${IDS.list}{padding:10px 12px 18px;overflow:auto;max-height:calc(92vh - 130px)}
      .wms-ton0-card{
        background:#fff;border:1px solid #eaecf0;border-radius:12px;
        padding:11px 12px;margin-bottom:9px
      }
      .wms-ton0-name{font-weight:800;font-size:15px;line-height:1.35}
      .wms-ton0-code{font-weight:700;color:#b42318;margin-right:6px}
      .wms-ton0-meta{font-size:13px;color:#667085;margin-top:5px}
      .wms-ton0-locs{font-size:13px;line-height:1.45;margin-top:7px;color:#344054}
      .wms-ton0-loc{
        display:inline-block;background:#f2f4f7;border-radius:7px;
        padding:4px 7px;margin:2px 4px 2px 0;white-space:nowrap
      }
      .wms-ton0-msg{padding:24px 12px;text-align:center;color:#667085}
      @media (min-width:761px){
        #${IDS.overlay}{align-items:center}
        #${IDS.panel}{border-radius:18px;max-height:88vh}
        #${IDS.list}{max-height:calc(88vh - 130px)}
      }
      @media (max-width:480px){
        #${IDS.button}{right:10px;bottom:10px;padding:10px 12px;font-size:12px}
        .wms-ton0-title{font-size:16px}
      }
    `;
    document.head.appendChild(style);
  }

  function formatLocation(loc) {
    const wh = String(loc?.warehouseCode || "").trim();
    const rack = String(loc?.rack || "").trim();
    const level = String(loc?.level || "").trim();
    const comp = String(loc?.compartment || "").trim();

    if (!wh) return "";

    if (rack.toUpperCase() === "MAT_DAT") {
      return comp ? `${wh}/MD/${comp}` : `${wh}/MD`;
    }

    if (rack && level) {
      return comp ? `${wh}/${rack}${level}/${comp}` : `${wh}/${rack}${level}`;
    }

    if (comp) return `${wh}/K${comp}`;
    return wh;
  }

  function itemSearchText(item) {
    const locText = (item.locations || []).map(formatLocation).join(" ");
    return `${item.code || ""} ${item.name || ""} ${locText}`.toLocaleLowerCase("vi");
  }

  function render(query = "") {
    const list = document.getElementById(IDS.list);
    const summary = document.getElementById(IDS.summary);
    if (!list || !summary) return;

    const q = String(query || "").trim().toLocaleLowerCase("vi");
    const rows = q ? reportItems.filter(x => itemSearchText(x).includes(q)) : reportItems;

    summary.textContent = `${rows.length}/${reportItems.length} m\u00e3 - ${txt.updated}: ${window.__wmsTon0Updated || "-"}`;

    if (!rows.length) {
      list.innerHTML = `<div class="wms-ton0-msg">${q ? txt.noMatch : txt.empty}</div>`;
      return;
    }

    list.innerHTML = rows.map(item => {
      const locations = Array.isArray(item.locations) ? item.locations : [];
      const locHtml = locations.map(loc => {
        const value = formatLocation(loc);
        return value ? `<span class="wms-ton0-loc">${escapeHtml(value)}</span>` : "";
      }).join("");

      return `
        <div class="wms-ton0-card">
          <div class="wms-ton0-name">
            <span class="wms-ton0-code">${escapeHtml(item.code || "")}</span>
            ${escapeHtml(item.name || "")}
          </div>
          <div class="wms-ton0-meta">
            ${txt.unit}: ${escapeHtml(item.unit || "-")} &nbsp;|&nbsp;
            ${txt.stock}: 0 &nbsp;|&nbsp;
            ${locations.length} ${txt.locations}
          </div>
          <div class="wms-ton0-locs">${locHtml}</div>
        </div>
      `;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadData(force = false) {
    if (loading) return;
    if (loaded && !force) return;

    loading = true;
    const badge = document.getElementById(IDS.badge);
    const list = document.getElementById(IDS.list);

    try {
      if (list && !loaded) list.innerHTML = `<div class="wms-ton0-msg">${txt.loading}</div>`;

      const res = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      window.__wmsTon0Updated = data?.updated || "-";

      const dedupe = new Map();
      const items = Array.isArray(data?.items) ? data.items : [];

      for (const item of items) {
        const stock = Number(item?.stock || 0);
        const locations = Array.isArray(item?.locations) ? item.locations : [];
        const code = String(item?.code || "").trim();

        if (code && Math.abs(stock) < 1e-9 && locations.length > 0) {
          dedupe.set(code.toUpperCase(), item);
        }
      }

      reportItems = Array.from(dedupe.values()).sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), "vi", { sensitivity: "base" })
      );

      loaded = true;
      if (badge) badge.textContent = String(reportItems.length);
      render(document.getElementById(IDS.search)?.value || "");
    } catch (err) {
      console.error("WMS TON0 report:", err);
      if (badge) badge.textContent = "!";
      if (list) list.innerHTML = `<div class="wms-ton0-msg">${txt.error}</div>`;
    } finally {
      loading = false;
    }
  }

  function createUi() {
    if (document.getElementById(IDS.button)) return;

    injectStyle();

    const button = document.createElement("button");
    button.id = IDS.button;
    button.type = "button";
    button.innerHTML = `<span>${txt.button}</span><span id="${IDS.badge}">...</span>`;

    const overlay = document.createElement("div");
    overlay.id = IDS.overlay;
    overlay.innerHTML = `
      <section id="${IDS.panel}" role="dialog" aria-modal="true">
        <div class="wms-ton0-head">
          <div class="wms-ton0-title-row">
            <div class="wms-ton0-title">${txt.title}</div>
            <button class="wms-ton0-close" type="button">${txt.close}</button>
          </div>
          <div id="${IDS.summary}">-</div>
          <input id="${IDS.search}" type="search" autocomplete="off" placeholder="${txt.search}">
        </div>
        <div id="${IDS.list}"><div class="wms-ton0-msg">${txt.loading}</div></div>
      </section>
    `;

    document.body.appendChild(button);
    document.body.appendChild(overlay);

    button.addEventListener("click", () => {
      overlay.classList.add("open");
      loadData(false);
      setTimeout(() => document.getElementById(IDS.search)?.focus(), 50);
    });

    overlay.querySelector(".wms-ton0-close").addEventListener("click", () => {
      overlay.classList.remove("open");
    });

    overlay.addEventListener("click", e => {
      if (e.target === overlay) overlay.classList.remove("open");
    });

    document.getElementById(IDS.search).addEventListener("input", e => {
      render(e.target.value);
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") overlay.classList.remove("open");
    });

    loadData(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createUi, { once: true });
  } else {
    createUi();
  }
})();
