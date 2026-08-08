"use strict";

const WMS_V9_CORE_FIX = true;

const MODULE_INFO = {
  search: {icon:"🔎", title:"Tra cứu vật tư", subtitle:"Tìm theo mã hoặc tên vật tư"},
  rack: {icon:"🏗", title:"Tìm theo giá, kệ", subtitle:"Xem vật tư theo Kho → Giá/Kệ/Vị trí → Tầng → Khoang"},
  missing: {icon:"⊗", title:"Chưa có vị trí", subtitle:"Vật tư có tồn nhưng chưa được bố trí vị trí"},
  multi: {icon:"▱", title:"Nhiều vị trí", subtitle:"Vật tư đang được lưu tại từ hai vị trí trở lên"},
  ton0: {icon:"⓪", title:"Tồn 0 có vị trí", subtitle:"Vật tư tồn hệ thống bằng 0 nhưng vẫn đang có vị trí"}
};

function openDrawer(){
  document.getElementById("sideDrawer").classList.remove("hidden");
  document.getElementById("drawerOverlay").classList.remove("hidden");
  requestAnimationFrame(()=>document.getElementById("sideDrawer").classList.add("open"));
  document.body.classList.add("drawer-open");
}

function closeDrawer(){
  const drawer=document.getElementById("sideDrawer");
  drawer.classList.remove("open");
  document.body.classList.remove("drawer-open");
  setTimeout(()=>{
    drawer.classList.add("hidden");
    document.getElementById("drawerOverlay").classList.add("hidden");
  },180);
}

function setModuleHeader(mode){
  const info=MODULE_INFO[mode]||MODULE_INFO.search;
  document.getElementById("moduleIcon").textContent=info.icon;
  document.getElementById("moduleTitle").textContent=info.title;
  document.getElementById("moduleSubtitle").textContent=info.subtitle;
}

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
  const drawerName=document.getElementById("drawerAccountName");
  const drawerRole=document.getElementById("drawerAccountRole");
  if(drawerName) drawerName.textContent=user.displayName;
  if(drawerRole) drawerRole.textContent=user.role==="admin"?"Tài khoản quản trị":"Tài khoản chỉ xem";

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
const setText = (id, value) => { const el=document.getElementById(id); if(el) el.textContent=value; };

let missing=[], multi=[], ton0=[], lastResults=[];

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
function locationType(v){
  const t=String(v?.type||"").trim().toUpperCase();
  if(t==="KE"||t==="MAT_DAT"||t==="KHOANG") return t;

  const rack=norm(v?.rack).replace(/\s+/g,"_");
  const level=String(v?.level??"").trim();

  if(rack.includes("mat_dat")||rack.includes("mặt_đất")) return "MAT_DAT";
  if(rack==="khoang"||(!rack&&!level)) return "KHOANG";
  return "KE";
}

function compartmentKey(v){
  const raw=String(v?.compartment??"").trim();
  if(!raw) return "";
  const parts=raw.split(".");
  return parts[parts.length-1].replace(/^khoang\s*/i,"").trim();
}

function locText(v){
  const wh=esc(warehouseName(v));
  const type=locationType(v);
  const c=esc(compartmentKey(v));

  if(type==="MAT_DAT"){
    return `📍 ${wh} • Mặt đất${c?` • Khoang ${c}`:""}`;
  }

  if(type==="KHOANG"){
    return `📍 ${wh}${c?` • Khoang ${c}`:""}`;
  }

  return `📍 ${wh} • Giá ${esc(v.rack)} • Tầng ${esc(v.level)}${c?` • Khoang ${c}`:""}`;
}

function formatStock(x){
  return new Intl.NumberFormat("vi-VN",{maximumFractionDigits:3}).format(Number(x)||0);
}

function switchView(mode){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  const id=`view${mode[0].toUpperCase()+mode.slice(1)}`;
  const target=document.getElementById(id);
  if(target) target.classList.add("active");
  setModuleHeader(mode);
  closeDrawer();
  window.scrollTo({top:0,behavior:"smooth"});
}

function materialCard(x){
  const hasLocations=x.locations.length>0;
  return `<article class="material-card ${hasLocations?"":"missing-card"}">
    <div class="material-info compact-material-info">
      <div class="top-code"><span>Mã vật tư</span><b class="material-code">${esc(x.code)}</b></div>
      <div class="top-unit"><span>Đơn vị tính</span><b>${esc(x.unit)}</b></div>
      <div class="top-stock"><span>Tồn</span><b class="stock-value">${formatStock(x.stock)}</b></div>
      <div class="material-name"><span>Tên vật tư</span><b>${esc(x.name)}</b></div>
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
    ${(type==="multi"||type==="ton0")
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

function catalogRows(){
  if(Array.isArray(DB.locationCatalog)&&DB.locationCatalog.length){
    return DB.locationCatalog;
  }

  const fallback=[];
  const seen=new Set();

  DB.items.forEach(x=>(x.locations||[]).forEach(v=>{
    const type=locationType(v);
    const row={
      warehouseCode:warehouseCode(v),
      warehouseName:warehouseName(v),
      type,
      rack:type==="KE"?String(v.rack||""):"",
      level:type==="KE"?String(v.level||""):"",
      compartment:compartmentKey(v)
    };
    const key=[row.warehouseCode,row.type,row.rack,row.level,row.compartment].join("|");
    if(!seen.has(key)){
      seen.add(key);
      fallback.push(row);
    }
  }));

  return fallback;
}

function warehouseRows(){
  if(Array.isArray(DB.warehouses)&&DB.warehouses.length){
    return DB.warehouses
      .map(w=>({code:String(w.code||"").toUpperCase(),name:String(w.name||w.code||"")}))
      .filter(w=>w.code);
  }

  const m=new Map();
  DB.items.forEach(x=>(x.locations||[]).forEach(v=>{
    const k=warehouseCode(v);
    if(!m.has(k)) m.set(k,warehouseName(v));
  }));
  return [...m].map(([code,name])=>({code,name}));
}

function browseUnit(v){
  const type=locationType(v);
  if(type==="MAT_DAT") return {key:"MAT_DAT|",label:"Mặt đất",type,value:""};
  if(type==="KHOANG"){
    const c=compartmentKey(v);
    return {key:`KHOANG|${c}`,label:`Khoang ${c}`,type,value:c};
  }
  const rack=String(v?.rack||"").trim();
  return {key:`KE|${rack}`,label:`Giá ${rack}`,type:"KE",value:rack};
}

function selectedBrowseUnit(){
  const raw=String($("rackSelect").value||"");
  const p=raw.indexOf("|");
  if(p<0) return {type:"KE",value:raw};
  return {type:raw.slice(0,p),value:raw.slice(p+1)};
}

function matchBrowseLocation(v,w,unit){
  if(warehouseCode(v)!==w) return false;
  const type=locationType(v);
  if(type!==unit.type) return false;

  if(type==="KE") return String(v.rack||"")===unit.value;
  if(type==="KHOANG") return compartmentKey(v)===unit.value;
  return true;
}

function initRack(){
  const warehouses=warehouseRows();

  $("warehouseSelect").innerHTML=warehouses
    .sort((a,b)=>a.name.localeCompare(b.name,"vi",{numeric:true,sensitivity:"base"}))
    .map(w=>`<option value="${esc(w.code)}">${esc(w.name)}</option>`)
    .join("");

  updateRackOptions();
}

function updateRackOptions(){
  const w=$("warehouseSelect").value;
  const units=new Map();

  catalogRows()
    .filter(v=>String(v.warehouseCode||"").toUpperCase()===w)
    .forEach(v=>{
      const u=browseUnit(v);
      if(u.value!==""||u.type==="MAT_DAT"){
        if(!units.has(u.key)) units.set(u.key,u);
      }
    });

  if(!units.size){
    DB.items.forEach(x=>(x.locations||[]).forEach(v=>{
      if(warehouseCode(v)!==w) return;
      const u=browseUnit(v);
      if(u.value!==""||u.type==="MAT_DAT"){
        if(!units.has(u.key)) units.set(u.key,u);
      }
    }));
  }

  const order={KE:1,MAT_DAT:2,KHOANG:3};

  $("rackSelect").innerHTML=[...units.values()]
    .sort((a,b)=>(order[a.type]||9)-(order[b.type]||9)||cmp(a.value,b.value))
    .map(u=>`<option value="${esc(u.key)}">${esc(u.label)}</option>`)
    .join("");

  renderRack();
}

function renderRack(){
  const w=$("warehouseSelect").value;
  const unit=selectedBrowseUnit();
  const rows=[];

  DB.items.forEach(x=>(x.locations||[]).forEach(v=>{
    if(matchBrowseLocation(v,w,unit)) rows.push({x,v});
  }));

  rows.sort((a,b)=>
    cmp(a.v.level,b.v.level)||
    cmp(compartmentKey(a.v),compartmentKey(b.v))||
    String(a.x.code).localeCompare(String(b.x.code),"vi",{numeric:true})
  );

  const whObj=warehouseRows().find(x=>x.code===w);
  const wh=whObj?whObj.name:(rows[0]?warehouseName(rows[0].v):w);

  let label="";
  if(unit.type==="MAT_DAT") label="Mặt đất";
  else if(unit.type==="KHOANG") label=`Khoang ${unit.value}`;
  else label=`Giá ${unit.value}`;

  const codes=new Set(rows.map(o=>o.x.code));
  const levels=new Set(rows.map(o=>String(o.v.level||"")).filter(Boolean));
  const compartments=new Set(rows.map(o=>compartmentKey(o.v)).filter(Boolean));

  let detail=`${codes.size} mã vật tư`;
  if(unit.type==="KE") detail+=` • ${levels.size} tầng • ${compartments.size} khoang`;
  else if(unit.type==="MAT_DAT") detail+=` • ${compartments.size} khoang`;

  $("rackSummary").innerHTML=`<strong>📍 ${esc(wh)} • ${esc(label)}</strong><span>${detail}</span>`;

  if(!rows.length){
    $("groups").innerHTML='<div class="empty">Vị trí này hiện chưa có vật tư.</div>';
    return;
  }

  if(unit.type==="MAT_DAT"){
    const cs=new Map();
    rows.forEach(o=>{
      const c=compartmentKey(o.v);
      if(!cs.has(c)) cs.set(c,[]);
      cs.get(c).push(o.x);
    });

    $("groups").innerHTML=[...cs]
      .sort((a,b)=>cmp(a[0],b[0]))
      .map(([c,items])=>compartmentHtml(c,items))
      .join("");
    return;
  }

  if(unit.type==="KHOANG"){
    $("groups").innerHTML=compartmentHtml(
      unit.value,
      rows.map(o=>o.x)
    );
    return;
  }

  const levelMap=new Map();
  rows.forEach(o=>{
    const l=String(o.v.level);
    const c=compartmentKey(o.v);
    if(!levelMap.has(l)) levelMap.set(l,new Map());
    if(!levelMap.get(l).has(c)) levelMap.get(l).set(c,[]);
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

function replaceTextNodes(root,from,to){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n=>{
    if(n.nodeValue&&n.nodeValue.includes(from)){
      n.nodeValue=n.nodeValue.replaceAll(from,to);
    }
  });
}

function markTon0Count(root){
  root.querySelectorAll("[id]").forEach(el=>{
    if(/multi(count)?$/i.test(el.id)||/navmulti|drawermulti/i.test(el.id)){
      el.removeAttribute("id");
      el.setAttribute("data-ton0-count","");
      el.textContent="0";
    }else{
      el.removeAttribute("id");
    }
  });
}

function ensureTon0Ui(){
  if(document.getElementById("viewTon0")) return;

  document.querySelectorAll('[data-mode="multi"]').forEach(source=>{
    const clone=source.cloneNode(true);
    clone.dataset.mode="ton0";
    clone.classList.remove("active");
    clone.removeAttribute("id");
    replaceTextNodes(clone,"Nhiều vị trí","Tồn 0 có vị trí");
    replaceTextNodes(clone,"NHIỀU VỊ TRÍ","TỒN 0 CÓ VỊ TRÍ");
    markTon0Count(clone);
    source.insertAdjacentElement("afterend",clone);
  });

  const sourceView=document.getElementById("viewMulti");
  if(sourceView){
    const view=sourceView.cloneNode(true);
    view.id="viewTon0";
    view.classList.remove("active");

    view.querySelectorAll("[id]").forEach(el=>{
      if(el.id==="multiFilter"){
        el.id="ton0Filter";
        if("value" in el) el.value="";
      }else if(el.id==="contentMulti"){
        el.id="contentTon0";
      }else{
        el.removeAttribute("id");
      }
    });

    replaceTextNodes(view,"Nhiều vị trí","Tồn 0 có vị trí");
    replaceTextNodes(view,"NHIỀU VỊ TRÍ","TỒN 0 CÓ VỊ TRÍ");
    sourceView.insertAdjacentElement("afterend",view);
  }
}

function setTon0Count(value){
  document.querySelectorAll("[data-ton0-count]").forEach(el=>{
    el.textContent=String(value);
  });
}

function bind(){
  document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>switchView(b.dataset.mode));
  $("btnSearch").onclick=doSearch;
  $("btnClear").onclick=()=>{$("q").value="";lastResults=[];renderSearch([])};
  $("q").addEventListener("keydown",e=>{if(e.key==="Enter")doSearch()});

  $("missingFilter").addEventListener("input",()=>renderFiltered(missing,"missingFilter","contentMissing","missing"));
  $("multiFilter").addEventListener("input",()=>renderFiltered(multi,"multiFilter","contentMulti","multi"));

  const ton0Filter=$("ton0Filter");
  if(ton0Filter){
    ton0Filter.addEventListener("input",()=>renderFiltered(ton0,"ton0Filter","contentTon0","ton0"));
  }

  $("warehouseSelect").onchange=updateRackOptions;
  $("rackSelect").onchange=renderRack;

  document.getElementById("menuButton").onclick=openDrawer;
  document.getElementById("closeDrawer").onclick=closeDrawer;
  document.getElementById("drawerOverlay").onclick=closeDrawer;
  document.getElementById("drawerLogout").onclick=()=>{
    if(typeof clearSession==="function") clearSession();
    location.reload();
  };
}

async function load(){
  try{
    const r=await fetch(`wms_data_868810a6f2c1.json?t=${Date.now()}`,{cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);

    DB=await r.json();
    if(!Array.isArray(DB.items)) DB.items=[];

    missing=DB.items.filter(x=>Number(x.stock)>0&&(x.locations||[]).length===0);
    multi=DB.items.filter(x=>(x.locations||[]).length>=2);
    ton0=DB.items.filter(x=>Math.abs(Number(x.stock)||0)<1e-9&&(x.locations||[]).length>0);

    setText("updated", DB.updated||"Không rõ");
    setText("dataStatus", `Đã tải ${DB.items.length} mã vật tư`);
    setText("missingCount", missing.length);
    setText("multiCount", multi.length);
    setText("navMissing", missing.length);
    setText("navMulti", multi.length);
    setText("drawerMissing", missing.length);
    setText("drawerMulti", multi.length);
    setTon0Count(ton0.length);

    renderSearch([]);
    renderFiltered(missing,"missingFilter","contentMissing","missing");
    renderFiltered(multi,"multiFilter","contentMulti","multi");

    if($("ton0Filter")&&$("contentTon0")){
      renderFiltered(ton0,"ton0Filter","contentTon0","ton0");
    }

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
  ensureTon0Ui();
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
