"use strict";

let DB = {updated:"", items:[], stats:{total:0, missing:0, multi:0}};
const $ = id => document.getElementById(id);
const norm = s => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let missing = [];
let multi = [];
let mode = "search";
let lastResults = [];

function warehouseCode(v) {
  if (v.warehouseCode) return String(v.warehouseCode).toUpperCase();
  const m = (v.sheet || "").match(/^([A-Z]+\d+)_/i);
  return m ? m[1].toUpperCase() : "KHO";
}

function warehouseName(v) {
  if (v.warehouseName) return v.warehouseName;
  if (v.warehouse) return v.warehouse;

  const names = {
    KK1: "Kho kín 1",
    KK2: "Kho kín 2",
    KH1: "Kho hở 1",
    KH2: "Kho hở 2",
    HC: "Kho hóa chất",
    MMTB: "Kho máy móc thiết bị",
    NT: "Kho ngoài trời"
  };
  return names[warehouseCode(v)] || warehouseCode(v);
}

function numberValue(value) {
  const match = String(value ?? "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function compareTextNumeric(a, b) {
  const na = numberValue(a);
  const nb = numberValue(b);
  if (na !== nb) return na - nb;
  return String(a).localeCompare(String(b), "vi", {numeric:true, sensitivity:"base"});
}

function isGroundRack(rack) {
  const s = norm(rack).replace(/\s+/g, "_");
  return s.includes("mat_dat") || s.includes("mặt_đất");
}

function locText(v) {
  const wh = esc(warehouseName(v));
  if (isGroundRack(v.rack)) {
    return `📍 ${wh} • Mặt đất • Khoang ${esc(v.compartment)}`;
  }
  return `📍 ${wh} • Giá ${esc(v.rack)} • Tầng ${esc(v.level)} • Khoang ${esc(v.compartment)}`;
}

function itemCard(x) {
  const hasLocations = x.locations.length > 0;
  const locationHtml = hasLocations
    ? `<div class="card-locations">
         <div class="card-location-title">Vị trí đang lưu (${x.locations.length})</div>
         ${x.locations.map(v => `<div class="card-location-row ${x.locations.length > 1 ? "multi" : ""}">
           <span class="location-text">${locText(v)}</span>
           <span class="location-status">Đang có</span>
         </div>`).join("")}
       </div>`
    : `<div class="card-warning">⚠ Chưa có vị trí</div>`;

  return `<article class="material-card-complete ${hasLocations ? "" : "missing-location"}">
    <div class="material-info-grid">
      <div class="info-cell">
        <span>Mã vật tư</span>
        <b class="material-code">${esc(x.code)}</b>
      </div>
      <div class="info-cell material-name-cell">
        <span>Tên vật tư</span>
        <b>${esc(x.name)}</b>
      </div>
      <div class="info-cell">
        <span>Đơn vị tính</span>
        <b>${esc(x.unit)}</b>
      </div>
      <div class="info-cell">
        <span>Tồn hệ thống</span>
        <b class="stock-value">${esc(x.stock)}</b>
      </div>
    </div>
    ${locationHtml}
  </article>`;
}

function smallCard(x) {
  const hasLocations = x.locations.length > 0;
  return `<article class="material-card-complete compact-card ${hasLocations ? "" : "missing-location"}">
    <div class="compact-header">
      <div>
        <b class="material-code">${esc(x.code)}</b>
        <div class="compact-name">${esc(x.name)}</div>
      </div>
      <div class="compact-stock">
        <span>Tồn</span>
        <b>${esc(x.stock)} ${esc(x.unit)}</b>
      </div>
    </div>
    ${hasLocations
      ? `<div class="card-locations compact-locations">
          ${x.locations.map(v => `<div class="card-location-row ${x.locations.length > 1 ? "multi" : ""}">
            <span class="location-text">${locText(v)}</span>
          </div>`).join("")}
        </div>`
      : `<div class="card-warning">⚠ Chưa có vị trí</div>`}
  </article>`;
}

function setActive(m) {
  mode = m;
  document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
}

function renderSearch(arr) {
  $("searchCount").textContent = arr.length ? `(${arr.length})` : "";
  if (!arr.length) {
    $("content").innerHTML = '<div class="empty">Nhập mã hoặc tên vật tư để tra cứu.</div>';
    return;
  }
  $("content").innerHTML = `<div class="result-count">Tìm thấy ${arr.length} kết quả</div>${arr.map(itemCard).join("")}`;
}

function renderList(arr, title) {
  $("content").innerHTML = `<div class="section-head">${title} (${arr.length})</div>
    <div class="item-list">${arr.map(smallCard).join("")}</div>`;
}

function doSearch() {
  const q = norm($("q").value);
  const t = document.querySelector('input[name="searchType"]:checked').value;

  if (!q) {
    lastResults = [];
    renderSearch([]);
    return;
  }

  lastResults = DB.items.filter(x =>
    t === "code" ? norm(x.code).includes(q) :
    t === "name" ? norm(x.name).includes(q) :
    norm(x.code).includes(q) || norm(x.name).includes(q)
  );

  setActive("search");
  renderSearch(lastResults);
}

function showMode(m) {
  setActive(m);
  if (m === "missing") renderList(missing, "Vật tư có tồn nhưng chưa có vị trí");
  else if (m === "multi") renderList(multi, "Vật tư đang có nhiều vị trí");
  else if (m === "rack") document.querySelector(".rack-panel").scrollIntoView({behavior:"smooth"});
  else renderSearch(lastResults);
}

function initRack() {
  const warehouses = new Map();

  DB.items.forEach(x => x.locations.forEach(v => {
    const key = warehouseCode(v);
    if (!warehouses.has(key)) warehouses.set(key, warehouseName(v));
  }));

  $("warehouseSelect").innerHTML = [...warehouses]
    .sort((a, b) => a[1].localeCompare(b[1], "vi", {numeric:true}))
    .map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`)
    .join("");

  updateRackOptions();
}

function updateRackOptions() {
  const w = $("warehouseSelect").value;
  const racks = new Set();

  DB.items.forEach(x => x.locations.forEach(v => {
    if (warehouseCode(v) === w) racks.add(v.rack);
  }));

  $("rackSelect").innerHTML = [...racks]
    .sort(compareTextNumeric)
    .map(r => `<option value="${esc(r)}">${isGroundRack(r) ? "Mặt đất" : "Giá " + esc(r)}</option>`)
    .join("");

  renderRack();
}

function renderRack() {
  const w = $("warehouseSelect").value;
  const r = $("rackSelect").value;
  const rows = [];

  DB.items.forEach(x => x.locations.forEach(v => {
    if (warehouseCode(v) === w && v.rack === r) rows.push({x, v});
  }));

  rows.sort((a, b) =>
    compareTextNumeric(a.v.level, b.v.level) ||
    compareTextNumeric(a.v.compartment, b.v.compartment) ||
    String(a.x.code).localeCompare(String(b.x.code), "vi", {numeric:true, sensitivity:"base"})
  );

  const wh = rows[0] ? warehouseName(rows[0].v) : w;
  const uniqueCodes = new Set(rows.map(o => o.x.code));
  const uniqueLevels = new Set(rows.map(o => String(o.v.level)));
  const uniqueCompartments = new Set(rows.map(o => `${o.v.level}|${o.v.compartment}`));

  $("rackSummary").innerHTML =
    `<b>📍 ${esc(wh)} • ${isGroundRack(r) ? "Mặt đất" : "Giá " + esc(r)}</b>
     ${uniqueCodes.size} mã vật tư • ${isGroundRack(r) ? uniqueCompartments.size + " khoang" : uniqueLevels.size + " tầng • " + uniqueCompartments.size + " khoang"}`;

  if (!rows.length) {
    $("groups").innerHTML = '<div class="empty">Không có vật tư.</div>';
    return;
  }

  if (isGroundRack(r)) {
    const compartments = new Map();
    rows.forEach(o => {
      const c = String(o.v.compartment);
      if (!compartments.has(c)) compartments.set(c, []);
      compartments.get(c).push(o.x);
    });

    $("groups").innerHTML = [...compartments.entries()]
      .sort((a, b) => compareTextNumeric(a[0], b[0]))
      .map(([compartment, items]) => rackCompartmentHtml(compartment, items))
      .join("");
    return;
  }

  const levels = new Map();

  rows.forEach(o => {
    const level = String(o.v.level);
    const compartment = String(o.v.compartment);

    if (!levels.has(level)) levels.set(level, new Map());
    const compartments = levels.get(level);

    if (!compartments.has(compartment)) compartments.set(compartment, []);
    compartments.get(compartment).push(o.x);
  });

  $("groups").innerHTML = [...levels.entries()]
    .sort((a, b) => compareTextNumeric(a[0], b[0]))
    .map(([level, compartments]) => {
      const compartmentHtml = [...compartments.entries()]
        .sort((a, b) => compareTextNumeric(a[0], b[0]))
        .map(([compartment, items]) => rackCompartmentHtml(compartment, items))
        .join("");

      return `<section class="level-block">
        <div class="level-title">TẦNG ${esc(level)}</div>
        ${compartmentHtml}
      </section>`;
    })
    .join("");
}

function rackCompartmentHtml(compartment, items) {
  const sortedItems = [...items].sort((a, b) =>
    String(a.code).localeCompare(String(b.code), "vi", {numeric:true, sensitivity:"base"})
  );

  return `<div class="group">
    <h3><span>Khoang ${esc(compartment)}</span><span class="group-count">${sortedItems.length} vật tư</span></h3>
    ${sortedItems.map(x => `<div class="rack-row">
      <b>${esc(x.code)}</b>
      <span>${esc(x.name)}</span>
      <span class="qty">${esc(x.stock)} ${esc(x.unit)}</span>
    </div>`).join("")}
  </div>`;
}

function bindEvents() {
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => showMode(b.dataset.mode)));
  $("btnSearch").onclick = doSearch;
  $("btnClear").onclick = () => {
    $("q").value = "";
    lastResults = [];
    showMode("search");
  };
  $("q").addEventListener("keydown", e => {
    if (e.key === "Enter") doSearch();
  });
  $("warehouseSelect").onchange = updateRackOptions;
  $("rackSelect").onchange = renderRack;
}

async function loadData() {
  try {
    const response = await fetch(`data.json?t=${Date.now()}`, {cache:"no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    DB = await response.json();
    if (!DB || !Array.isArray(DB.items)) throw new Error("Dữ liệu không đúng cấu trúc");

    missing = DB.items.filter(x => Number(x.stock) > 0 && x.locations.length === 0);
    multi = DB.items.filter(x => x.locations.length >= 2);

    $("updated").textContent = DB.updated || "Không rõ";
    $("missingCount").textContent = missing.length;
    $("multiCount").textContent = multi.length;
    $("dataStatus").textContent = `Đã tải ${DB.items.length} mã vật tư`;

    initRack();
    renderSearch([]);
  } catch (err) {
    console.error(err);
    $("dataStatus").textContent = "Không tải được dữ liệu";
    $("content").innerHTML = `<div class="error-box">
      <b>Không tải được data.json.</b><br>
      Hãy kiểm tra file data.json đã được tải lên GitHub cùng thư mục với index.html chưa.<br>
      <small>${esc(err.message)}</small>
    </div>`;
  }
}

bindEvents();
loadData();
