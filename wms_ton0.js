(() => {
  "use strict";

  const DATA_URL = "wms_data_868810a6f2c1.json";
  const IDS = {
    style: "wms-ton0-style",
    menuItem: "wms-ton0-menu-item",
    menuCount: "wms-ton0-menu-count",
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
    menu: "Tồn 0 có vị trí",
    title: "Tồn 0 nhưng vẫn có vị trí",
    search: "Tìm theo mã, tên hoặc vị trí...",
    loading: "Đang tải dữ liệu...",
    empty: "Không có vật tư nào thỏa điều kiện.",
    noMatch: "Không tìm thấy kết quả phù hợp.",
    error: "Không tải được dữ liệu WMS.",
    unit: "ĐVT",
    stock: "Tồn",
    locations: "vị trí",
    updated: "Dữ liệu",
    close: "Đóng"
  };

  function norm(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function injectStyle() {
    const old = document.getElementById(IDS.style);
    if (old) old.remove();

    const style = document.createElement("style");
    style.id = IDS.style;
    style.textContent = `
      .wms-ton0-menu-icon{
        width:26px;height:26px;border:2px solid currentColor;border-radius:50%;
        display:inline-flex;align-items:center;justify-content:center;
        box-sizing:border-box;font:800 14px/1 Arial,sans-serif;
        flex:0 0 26px
      }
      #${IDS.overlay}{
        position:fixed;inset:0;z-index:2147483640;background:rgba(0,0,0,.45);
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
      #${IDS.list}{
        padding:10px 12px 18px;overflow:auto;max-height:calc(92vh - 130px)
      }
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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

    summary.textContent =
      `${rows.length}/${reportItems.length} mã - ${txt.updated}: ${window.__wmsTon0Updated || "-"}`;

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

  function updateMenuCount() {
    const count = document.getElementById(IDS.menuCount);
    if (count) count.textContent = loaded ? String(reportItems.length) : "...";
  }

  async function loadData(force = false) {
    if (loading) return;
    if (loaded && !force) return;

    loading = true;
    updateMenuCount();

    try {
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
        String(a?.name || "").localeCompare(
          String(b?.name || ""), "vi", { sensitivity: "base" }
        )
      );

      loaded = true;
      updateMenuCount();
      render(document.getElementById(IDS.search)?.value || "");
    } catch (err) {
      console.error("WMS TON0 report:", err);
      const count = document.getElementById(IDS.menuCount);
      if (count) count.textContent = "!";
      const list = document.getElementById(IDS.list);
      if (list) list.innerHTML = `<div class="wms-ton0-msg">${txt.error}</div>`;
    } finally {
      loading = false;
    }
  }

  function createReportUi() {
    if (document.getElementById(IDS.overlay)) return;

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
          <input id="${IDS.search}" type="search" autocomplete="off"
                 placeholder="${txt.search}">
        </div>
        <div id="${IDS.list}">
          <div class="wms-ton0-msg">${txt.loading}</div>
        </div>
      </section>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector(".wms-ton0-close").addEventListener("click", () => {
      overlay.classList.remove("open");
    });

    overlay.addEventListener("click", e => {
      if (e.target === overlay) overlay.classList.remove("open");
    });

    document.getElementById(IDS.search).addEventListener("input", e => {
      render(e.target.value);
    });
  }

  function openReport(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    createReportUi();
    const overlay = document.getElementById(IDS.overlay);
    overlay.classList.add("open");
    loadData(false);

    setTimeout(() => {
      document.getElementById(IDS.search)?.focus();
    }, 60);
  }

  function isLikelyMenuRow(el) {
    if (!el || el === document.body) return false;

    const r = el.getBoundingClientRect();
    if (r.width < 180 || r.height < 32 || r.height > 110) return false;

    const t = norm(el.textContent);
    if (!t.includes("nhieu vi tri")) return false;

    return true;
  }

  function findExistingMenuRow() {
    const all = document.querySelectorAll("span,div,p,a,button");

    for (const el of all) {
      const own = norm(el.textContent);

      if (own === "nhieu vi tri" || own.startsWith("nhieu vi tri ")) {
        let row = el.closest("a,button,[role='button'],li");

        if (row && isLikelyMenuRow(row)) return row;

        let p = el;
        for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
          if (isLikelyMenuRow(p)) return p;
        }
      }
    }

    return null;
  }

  function replaceLeafText(root, oldText, newText) {
    const nodes = root.querySelectorAll("*");

    for (const el of nodes) {
      if (el.children.length === 0 && norm(el.textContent) === norm(oldText)) {
        el.textContent = newText;
        return el;
      }
    }

    return null;
  }

  function replaceCount(root) {
    const leaves = root.querySelectorAll("*");

    for (const el of leaves) {
      if (el.children.length === 0 && /^\s*\d+\s*$/.test(el.textContent || "")) {
        el.id = IDS.menuCount;
        el.textContent = loaded ? String(reportItems.length) : "...";
        return el;
      }
    }

    const count = document.createElement("span");
    count.id = IDS.menuCount;
    count.textContent = loaded ? String(reportItems.length) : "...";
    count.style.marginLeft = "auto";
    count.style.fontWeight = "800";
    root.appendChild(count);
    return count;
  }

  function replaceIcon(root) {
    const svg = root.querySelector("svg");

    if (svg) {
      const holder = document.createElement("span");
      holder.className = "wms-ton0-menu-icon";
      holder.textContent = "0";
      svg.replaceWith(holder);
      return;
    }

    const img = root.querySelector("img");
    if (img) {
      const holder = document.createElement("span");
      holder.className = "wms-ton0-menu-icon";
      holder.textContent = "0";
      img.replaceWith(holder);
    }
  }

  function mountMenuItem() {
    if (document.getElementById(IDS.menuItem)) {
      updateMenuCount();
      return true;
    }

    const source = findExistingMenuRow();
    if (!source || !source.parentElement) return false;

    const item = source.cloneNode(true);
    item.id = IDS.menuItem;
    item.removeAttribute("onclick");
    item.removeAttribute("href");

    replaceLeafText(item, "Nhiều vị trí", txt.menu);
    replaceCount(item);
    replaceIcon(item);

    item.style.cursor = "pointer";
    item.addEventListener("click", openReport, true);

    source.insertAdjacentElement("afterend", item);
    updateMenuCount();

    return true;
  }

  function removeOldFloatingButton() {
    document.getElementById("wms-ton0-button")?.remove();
  }

  function boot() {
    removeOldFloatingButton();
    injectStyle();
    createReportUi();

    mountMenuItem();
    loadData(false);

    const observer = new MutationObserver(() => {
      removeOldFloatingButton();
      mountMenuItem();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        document.getElementById(IDS.overlay)?.classList.remove("open");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
