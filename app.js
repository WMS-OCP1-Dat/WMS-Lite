"use strict";

const AUTH_USERS = {
  admin: {
    hash: "ad5d4a5abdaced8d0e6c7012fab90f1c857126e218e6e7e2da83b55e65e79a6d",
    displayName: "Quản trị",
    role: "admin"
  },
  noibo: {
    hash: "2ca3b3aaf39fecb27e79928f6b90f8ba472a68cf7cb3b36192c43afc9e46def4",
    displayName: "Nội bộ",
    role: "viewer"
  }
};
const AUTH_KEY = "wms_lite_session_v1";
const AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let currentUser = null;

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function saveSession(username, remember) {
  const session = {
    username,
    expiresAt: remember ? Date.now() + AUTH_TTL_MS : 0
  };
  if (remember) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    sessionStorage.removeItem(AUTH_KEY);
  } else {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
    localStorage.removeItem(AUTH_KEY);
  }
}

function readSession() {
  const raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!AUTH_USERS[session.username]) return null;
    if (session.expiresAt && Date.now() > session.expiresAt) {
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);
      return null;
    }
    return session.username;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
}

function showLogin() {
  currentUser = null;
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginError").textContent = "";
}

function showApp(username) {
  currentUser = username;
  const user = AUTH_USERS[username];
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  document.getElementById("accountName").textContent = user.displayName;
  document.getElementById("accountRole").textContent =
    user.role === "admin" ? "Tài khoản quản trị" : "Tài khoản chỉ xem";
}

async function attemptLogin(username, password, remember) {
  const key = username.trim().toLowerCase();
  const user = AUTH_USERS[key];
  if (!user) return false;
  const passwordHash = await sha256(password);
  if (passwordHash !== user.hash) return false;
  saveSession(key, remember);
  showApp(key);
  await startWmsApp();
  return true;
}

function bindAuthEvents() {
  const form = document.getElementById("loginForm");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const user = document.getElementById("loginUser").value;
    const password = document.getElementById("loginPassword").value;
    const remember = document.getElementById("rememberLogin").checked;
    const error = document.getElementById("loginError");
    error.textContent = "Đang kiểm tra...";

    const ok = await attemptLogin(user, password, remember);
    if (!ok) {
      error.textContent = "Tên đăng nhập hoặc mật khẩu không đúng.";
    }
  });

  document.getElementById("togglePassword").addEventListener("click", () => {
    const input = document.getElementById("loginPassword");
    input.type = input.type === "password" ? "text" : "password";
  });

  document.getElementById("accountButton").addEventListener("click", () => {
    document.getElementById("accountMenu").classList.toggle("hidden");
  });

  document.getElementById("logoutButton").addEventListener("click", () => {
    clearSession();
    location.reload();
  });

  document.addEventListener("click", event => {
    const box = document.querySelector(".account-box");
    if (box && !box.contains(event.target)) {
      document.getElementById("accountMenu").classList.add("hidden");
    }
  });
}

let DB = {updated:"",items:[],stats:{total:0,missing:0,multi:0}};
const $ = id => document.getElementById(id);
const norm = s => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let missing=[], multi=[], lastResults=[];

function warehouseCode(v){
  if(v.warehouseCode) return String(v.warehouseCode).toUpperCase();
  const m=(v.sheet||"").match(/^([A-Z]+\d+)_/i);
  return m?m[1].toUpperCase():"KHO";
}
function warehouseName(v){
  if(v.warehouseName) return v.warehouseName;
  if(v.warehouse) return v.warehouse;
  const names={KK1:"Kho kín 1",KK2:"Kho kín 2",KH1:"Kho hở 1",KH2:"Kho hở 2",HC:"Kho hóa chất",MMTB:"Kho máy móc thiết bị",NT:"Kho ngoài trời"};
  return names[warehouseCode(v)]||warehouseCode(v);
}
function num(v){
  const m=String(v??"").replace(",",".").match(/-?\d+(?:\.\d+)?/);
  return m?Number(m[0]):Number.MAX_SAFE_INTEGER;
}
function cmp(a,b){
  const na=num(a),nb=num(b);
  return na!==nb?na-nb:String(a).localeCompare(String(b),"vi",{numeric:true,sensitivity:"base"});
}
function isGround(r){
  const s=norm(r).replace(/\s+/g,"_");
  return s.includes("mat_dat")||s.includes("mặt_đất");
}
function locText(v){
  const wh=esc(warehouseName(v));
  return isGround(v.rack)
    ? `📍 ${wh} • Mặt đất • Khoang ${esc(v.compartment)}`
    : `📍 ${wh} • Giá ${esc(v.rack)} • Tầng ${esc(v.level)} • Khoang ${esc(v.compartment)}`;
}
function formatStock(x){
  return new Intl.NumberFormat("vi-VN",{maximumFractionDigits:3}).format(Number(x)||0);
}

function switchView(mode){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  const id=`view${mode[0].toUpperCase()+mode.slice(1)}`;
  $(id).classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
}

function materialCard(x){
  const hasLocations=x.locations.length>0;
  return `<article class="material-card ${hasLocations?"":"missing-card"}">
    <div class="material-info">
      <div>
        <span>Mã vật tư</span>
        <b class="material-code">${esc(x.code)}</b>
      </div>
      <div class="material-name">
        <span>Tên vật tư</span>
        <b>${esc(x.name)}</b>
      </div>
      <div>
        <span>Đơn vị tính</span>
        <b>${esc(x.unit)}</b>
      </div>
      <div>
        <span>Tồn hệ thống</span>
        <b class="stock-value">${formatStock(x.stock)}</b>
      </div>
    </div>
    ${hasLocations
      ? `<div class="locations-wrap">
          <div class="locations-title">Vị trí đang lưu (${x.locations.length})</div>
          ${x.locations.map(v=>`<div class="location-row ${x.locations.length>1?"multi":""}">
            <strong>${locText(v)}</strong>
            <span>Đang có</span>
          </div>`).join("")}
        </div>`
      : `<div class="warning-row">⚠ Chưa có vị trí</div>`}
  </article>`;
}

function compactCard(x,type){
  const hasLocations=x.locations.length>0;
  return `<article class="material-card compact ${hasLocations?"":"missing-card"}">
    <div class="compact-head">
      <div>
        <b class="material-code">${esc(x.code)}</b>
        <div class="compact-name">${esc(x.name)}</div>
      </div>
      <div class="compact-stock">
        <span>Tồn hệ thống</span>
        <b>${formatStock(x.stock)} ${esc(x.unit)}</b>
      </div>
    </div>
    ${type==="multi"
      ? `<div class="locations-wrap compact-locations">
          ${x.locations.map(v=>`<div class="location-row multi"><strong>${locText(v)}</strong></div>`).join("")}
        </div>`
      : `<div class="warning-row">⚠ Chưa có vị trí</div>`}
  </article>`;
}

function renderSearch(arr){
  $("searchCount").textContent=arr.length?`${arr.length} kết quả`:"";
  $("contentSearch").innerHTML=arr.length
    ? `<div class="result-note">Tìm thấy ${arr.length} kết quả phù hợp</div>${arr.map(materialCard).join("")}`
    : `<div class="empty">Nhập mã hoặc tên vật tư để tra cứu.</div>`;
}

function renderFiltered(source,inputId,targetId,type){
  const q=norm($(inputId).value);
  const arr=q?source.filter(x=>norm(x.code).includes(q)||norm(x.name).includes(q)):source;
  $(targetId).innerHTML=arr.length
    ? `<div class="result-note">Đang hiển thị ${arr.length} mã vật tư</div>${arr.map(x=>compactCard(x,type)).join("")}`
    : `<div class="empty">Không có dữ liệu phù hợp.</div>`;
}

function doSearch(){
  const q=norm($("q").value);
  const t=document.querySelector('input[name="searchType"]:checked').value;
  lastResults=!q?[]:DB.items.filter(x=>
    t==="code"?norm(x.code).includes(q):
    t==="name"?norm(x.name).includes(q):
    norm(x.code).includes(q)||norm(x.name).includes(q)
  );
  switchView("search");
  renderSearch(lastResults);
}

function initRack(){
  const warehouses=new Map();
  DB.items.forEach(x=>x.locations.forEach(v=>{
    const k=warehouseCode(v);
    if(!warehouses.has(k)) warehouses.set(k,warehouseName(v));
  }));
  $("warehouseSelect").innerHTML=[...warehouses]
    .sort((a,b)=>a[1].localeCompare(b[1],"vi",{numeric:true}))
    .map(([k,n])=>`<option value="${esc(k)}">${esc(n)}</option>`).join("");
  updateRackOptions();
}

function updateRackOptions(){
  const w=$("warehouseSelect").value;
  const racks=new Set();
  DB.items.forEach(x=>x.locations.forEach(v=>{if(warehouseCode(v)===w)racks.add(v.rack)}));
  $("rackSelect").innerHTML=[...racks].sort(cmp)
    .map(r=>`<option value="${esc(r)}">${isGround(r)?"Mặt đất":"Giá "+esc(r)}</option>`).join("");
  renderRack();
}

function renderRack(){
  const w=$("warehouseSelect").value,r=$("rackSelect").value,rows=[];
  DB.items.forEach(x=>x.locations.forEach(v=>{if(warehouseCode(v)===w&&v.rack===r)rows.push({x,v})}));

  rows.sort((a,b)=>cmp(a.v.level,b.v.level)||cmp(a.v.compartment,b.v.compartment)||String(a.x.code).localeCompare(String(b.x.code),"vi",{numeric:true}));

  const wh=rows[0]?warehouseName(rows[0].v):w;
  const codes=new Set(rows.map(o=>o.x.code));
  const levels=new Set(rows.map(o=>String(o.v.level)));
  const compartments=new Set(rows.map(o=>`${o.v.level}|${o.v.compartment}`));

  $("rackSummary").innerHTML=`<strong>📍 ${esc(wh)} • ${isGround(r)?"Mặt đất":"Giá "+esc(r)}</strong>
    <span>${codes.size} mã vật tư • ${isGround(r)?compartments.size+" khoang":levels.size+" tầng • "+compartments.size+" khoang"}</span>`;

  if(!rows.length){
    $("groups").innerHTML='<div class="empty">Không có vật tư.</div>';
    return;
  }

  if(isGround(r)){
    const cs=new Map();
    rows.forEach(o=>{
      const c=String(o.v.compartment);
      if(!cs.has(c))cs.set(c,[]);
      cs.get(c).push(o.x);
    });
    $("groups").innerHTML=[...cs]
      .sort((a,b)=>cmp(a[0],b[0]))
      .map(([c,items])=>compartmentHtml(c,items))
      .join("");
    return;
  }

  const levelMap=new Map();
  rows.forEach(o=>{
    const l=String(o.v.level),c=String(o.v.compartment);
    if(!levelMap.has(l))levelMap.set(l,new Map());
    if(!levelMap.get(l).has(c))levelMap.get(l).set(c,[]);
    levelMap.get(l).get(c).push(o.x);
  });

  $("groups").innerHTML=[...levelMap]
    .sort((a,b)=>cmp(a[0],b[0]))
    .map(([l,cs])=>`<section class="level-block">
      <div class="level-title">TẦNG ${esc(l)}</div>
      ${[...cs].sort((a,b)=>cmp(a[0],b[0])).map(([c,items])=>compartmentHtml(c,items)).join("")}
    </section>`).join("");
}

function compartmentHtml(c,items){
  items=[...items].sort((a,b)=>String(a.code).localeCompare(String(b.code),"vi",{numeric:true}));
  return `<div class="group">
    <div class="group-title"><b>Khoang ${esc(c)}</b><span>${items.length} vật tư</span></div>
    ${items.map(x=>`<div class="rack-row">
      <b>${esc(x.code)}</b>
      <span>${esc(x.name)}</span>
      <strong>${formatStock(x.stock)} ${esc(x.unit)}</strong>
    </div>`).join("")}
  </div>`;
}

function bind(){
  document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>switchView(b.dataset.mode));
  $("btnSearch").onclick=doSearch;
  $("btnClear").onclick=()=>{$("q").value="";lastResults=[];renderSearch([])};
  $("q").addEventListener("keydown",e=>{if(e.key==="Enter")doSearch()});
  $("missingFilter").addEventListener("input",()=>renderFiltered(missing,"missingFilter","contentMissing","missing"));
  $("multiFilter").addEventListener("input",()=>renderFiltered(multi,"multiFilter","contentMulti","multi"));
  $("warehouseSelect").onchange=updateRackOptions;
  $("rackSelect").onchange=renderRack;
}

async function load(){
  try{
    const r=await fetch(`wms_data_868810a6f2c1.json?t=${Date.now()}`,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    DB=await r.json();
    missing=DB.items.filter(x=>Number(x.stock)>0&&x.locations.length===0);
    multi=DB.items.filter(x=>x.locations.length>=2);

    $("updated").textContent=DB.updated||"Không rõ";
    $("dataStatus").textContent=`Đã tải ${DB.items.length} mã vật tư`;
    $("missingCount").textContent=missing.length;
    $("multiCount").textContent=multi.length;
    $("navMissing").textContent=missing.length;
    $("navMulti").textContent=multi.length;

    renderSearch([]);
    renderFiltered(missing,"missingFilter","contentMissing","missing");
    renderFiltered(multi,"multiFilter","contentMulti","multi");
    initRack();
  }catch(e){
    console.error(e);
    $("dataStatus").textContent="Không tải được dữ liệu";
    $("contentSearch").innerHTML=`<div class="error">Không tải được dữ liệu hệ thống: ${esc(e.message)}</div>`;
  }
}

let wmsStarted = false;
async function startWmsApp() {
  if (wmsStarted) return;
  wmsStarted = true;
  bind();
  await load();
}

document.addEventListener("DOMContentLoaded", async () => {
  bindAuthEvents();
  const savedUser = readSession();
  if (savedUser) {
    showApp(savedUser);
    await startWmsApp();
  } else {
    showLogin();
  }
});
