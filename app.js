/* =========================
   OASIS / NEXUS INVOICING — app.js (FULL) ✅ FIREBASE PRO
   - GitHub Pages friendly (ESM module)
   - Auth Google
   - Firestore: Docs + Customers + Vendors + Settings
   - Storage: Logo (URL) + cache DataURL para PDF
   - PDF (jsPDF + AutoTable)
   - FIX real: History NO se mostraba porque setSub() no activaba panel-history
========================= */

/* ===== Firebase ESM CDN ===== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, getDocs, query, orderBy,
  serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/* ====== HUB ====== */
const HUB_URL = "https://eliezelapolinaris2017-lab.github.io/oasis-hub/";

/* ====== Firebase config (TUYO) ====== */
const firebaseConfig = {
  apiKey: "AIzaSyBm67RjL0QzMRLfo6zUYCI0bak1eGJAR-U",
  authDomain: "oasis-facturacion.firebaseapp.com",
  projectId: "oasis-facturacion",
  storageBucket: "oasis-facturacion.firebasestorage.app",
  messagingSenderId: "84422038905",
  appId: "1:84422038905:web:b0eef65217d2bfc3298ba8"
};

/* ====== Init Firebase ====== */
const FB_APP = initializeApp(firebaseConfig);
const auth = getAuth(FB_APP);
const db = getFirestore(FB_APP);
const storage = getStorage(FB_APP);

/* ====== UTIL ====== */
const $ = (id) => document.getElementById(id);

const fmtMoney = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString("en-US", { style: "currency", currency: "USD" });
};

const toISODate = (d) => new Date(d).toISOString().slice(0, 10);

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

async function urlToDataUrl(url) {
  const resp = await fetch(url, { cache: "no-store" });
  const blob = await resp.blob();
  return blobToDataUrl(blob);
}

async function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* ====== UI: HUB FAB ensure ====== */
(function ensureHubFab(){
  if (document.getElementById("hubBackBtn")) return;
  const a = document.createElement("a");
  a.id = "hubBackBtn";
  a.href = HUB_URL;
  a.textContent = "⟵ Hub";
  a.title = "Volver a Oasis Hub";
  a.setAttribute("aria-label", "Volver a Oasis Hub");
  a.className = "hub-fab";
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(a));
})();

/* =========================
   FIRESTORE PATHS
========================= */
function userBase(uid) { return `users/${uid}`; }
function colDocs(uid) { return collection(db, `${userBase(uid)}/docs`); }
function colCustomers(uid) { return collection(db, `${userBase(uid)}/customers`); }
function colVendors(uid) { return collection(db, `${userBase(uid)}/vendors`); }
function docSettings(uid) { return doc(db, `${userBase(uid)}/settings/main`); }

/* =========================
   APP STATE
========================= */
let state = {
  user: null,
  view: "invoicing",
  sub: "confirm",
  activeDocId: null,
  current: null,
  previewBlobUrl: null,

  // caches (firestore)
  docs: [],
  customers: [],
  vendors: [],
  cfg: null
};

/* =========================
   DEFAULTS
========================= */
function defaultCfg() {
  return {
    biz: {
      name: "Oasis Air Cleaner Services LLC",
      phone: "787-664-3079",
      email: "",
      addr: "Puerto Rico",
      logoUrl: "",      // Storage URL
      logoDataUrl: ""   // cache para PDF (no obligatorio guardarlo en Firestore)
    },
    taxRate: 11.5
  };
}

function newDoc() {
  const cfg = state.cfg || defaultCfg();
  const today = toISODate(new Date());
  const valid = toISODate(new Date(Date.now() + 14 * 24 * 3600 * 1000));

  return {
    id: uid("doc"),
    type: "COT",              // COT / FAC
    number: "",               // AUTO
    date: today,
    status: "PENDIENTE",
    client: { name: "", contact: "", addr: "" },
    validUntil: valid,
    items: [{ id: uid("it"), desc: "", qty: 1, price: 0 }],
    notes: "",
    terms: "",
    totals: { sub: 0, tax: 0, grand: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    taxRate: Number(cfg.taxRate || 11.5)
  };
}

/* =========================
   AUTH UI (inyección)
========================= */
function ensureAuthButtons() {
  // Mete botones en topActions sin tocar HTML
  const topActions = document.querySelector(".topActions");
  if (!topActions) return;

  if (!$("btnLogin")) {
    const b = document.createElement("button");
    b.className = "btn ghost";
    b.id = "btnLogin";
    b.type = "button";
    b.textContent = "Login";
    topActions.prepend(b);
  }
  if (!$("btnLogout")) {
    const b = document.createElement("button");
    b.className = "btn ghost";
    b.id = "btnLogout";
    b.type = "button";
    b.textContent = "Logout";
    topActions.prepend(b);
  }

  $("btnLogin").addEventListener("click", login);
  $("btnLogout").addEventListener("click", logout);

  refreshAuthUI();
}

function refreshAuthUI() {
  const isOn = !!state.user;
  if ($("btnLogin")) $("btnLogin").style.display = isOn ? "none" : "inline-flex";
  if ($("btnLogout")) $("btnLogout").style.display = isOn ? "inline-flex" : "none";

  // Si no hay sesión, bloquea guardar/pdf (para no perder data)
  ["btnSaveDoc","btnPDF","btnConfirmFromPreview","btnExportHist","btnClearHist","btnAddCustomer"]
    .forEach(id => { if ($(id)) $(id).disabled = !isOn; });
}

/* =========================
   AUTH
========================= */
async function login() {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

async function logout() {
  await signOut(auth);
}

/* =========================
   FIRESTORE LOAD/SAVE
========================= */
async function loadAllFromFirestore() {
  if (!state.user) return;

  // Settings
  const sref = docSettings(state.user.uid);
  const snap = await getDoc(sref);
  state.cfg = snap.exists() ? { ...defaultCfg(), ...snap.data() } : defaultCfg();

  // Si hay logoUrl y NO hay logoDataUrl, cachealo para PDF
  if (state.cfg?.biz?.logoUrl && !state.cfg.biz.logoDataUrl) {
    try {
      state.cfg.biz.logoDataUrl = await urlToDataUrl(state.cfg.biz.logoUrl);
    } catch { /* ignore */ }
  }

  // Docs
  const qDocs = query(colDocs(state.user.uid), orderBy("updatedAt", "desc"));
  const docsSnap = await getDocs(qDocs);
  state.docs = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Customers
  const qCus = query(colCustomers(state.user.uid), orderBy("createdAt", "desc"));
  const cusSnap = await getDocs(qCus);
  state.customers = cusSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Vendors
  const qVen = query(colVendors(state.user.uid), orderBy("createdAt", "desc"));
  const venSnap = await getDocs(qVen);
  state.vendors = venSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  refreshKPIs();
  renderHistory();
  renderCustomers();
  renderReporting();
}

async function saveSettingsToFirestore() {
  if (!state.user) return;
  const sref = docSettings(state.user.uid);

  // Guarda SOLO lo esencial (logoDataUrl no hace falta guardarlo)
  const safeCfg = JSON.parse(JSON.stringify(state.cfg || defaultCfg()));
  if (safeCfg?.biz) safeCfg.biz.logoDataUrl = "";

  await setDoc(sref, { ...safeCfg, updatedAt: serverTimestamp() }, { merge: true });
}

/* =========================
   NAV / TABS
========================= */
function setView(view) {
  state.view = view;

  document.querySelectorAll(".view").forEach(v => v.classList.remove("is-active"));
  const el = $("view-" + view);
  if (el) el.classList.add("is-active");

  document.querySelectorAll(".tab").forEach(b => b.classList.remove("is-active"));
  document.querySelectorAll(`.tab[data-view="${view}"]`).forEach(b => b.classList.add("is-active"));

  if (view === "invoicing") renderInvoicing();
  if (view === "customers") renderCustomers();
  if (view === "vendors") renderVendors();
  if (view === "reporting") renderReporting();
  if (view === "configuration") {/* nada extra */}
}

function setSub(sub) {
  state.sub = sub;

  document.querySelectorAll(".subtab").forEach(b => b.classList.remove("is-active"));
  document.querySelectorAll(`.subtab[data-sub="${sub}"]`).forEach(b => b.classList.add("is-active"));

  document.querySelectorAll(".panel").forEach(p => p.classList.remove("is-active"));
  if (sub === "confirm") $("panel-confirm")?.classList.add("is-active");
  if (sub === "preview") $("panel-preview")?.classList.add("is-active");
  if (sub === "history") $("panel-history")?.classList.add("is-active"); // ✅ FIX REAL

  if (sub === "preview") makePreview();
  if (sub === "history") renderHistory();
}

/* =========================
   BIND FORM
========================= */
function bindDocHeader() {
  $("docType").value = state.current.type;
  $("docNumber").value = state.current.number || "";
  $("docDate").value = state.current.date;
  $("docStatus").value = state.current.status;

  $("clientName").value = state.current.client.name || "";
  $("clientContact").value = state.current.client.contact || "";
  $("clientAddr").value = state.current.client.addr || "";
  $("validUntil").value = state.current.validUntil || "";

  $("notes").value = state.current.notes || "";
  $("terms").value = state.current.terms || "";

  $("docModePill").textContent = state.activeDocId ? "Editando" : "Nuevo";
}

function readDocHeaderIntoState() {
  state.current.type = $("docType").value;
  state.current.number = ($("docNumber").value || "").trim();
  state.current.date = $("docDate").value || toISODate(new Date());
  state.current.status = $("docStatus").value;

  state.current.client.name = ($("clientName").value || "").trim();
  state.current.client.contact = ($("clientContact").value || "").trim();
  state.current.client.addr = ($("clientAddr").value || "").trim();
  state.current.validUntil = $("validUntil").value || "";

  state.current.notes = ($("notes").value || "").trim();
  state.current.terms = ($("terms").value || "").trim();
}

/* =========================
   ITEMS RENDER
========================= */
function renderItems() {
  const wrap = $("items");
  wrap.innerHTML = "";

  state.current.items.forEach((it) => {
    const row = document.createElement("div");
    row.className = "tRow";
    row.dataset.itemId = it.id;

    const desc = document.createElement("input");
    desc.className = "input";
    desc.placeholder = "Descripción";
    desc.value = it.desc || "";
    desc.addEventListener("input", () => { it.desc = desc.value; });

    const qty = document.createElement("input");
    qty.className = "input";
    qty.type = "number";
    qty.min = "0";
    qty.step = "1";
    qty.value = String(it.qty ?? 1);

    const price = document.createElement("input");
    price.className = "input";
    price.type = "number";
    price.min = "0";
    price.step = "0.01";
    price.value = String(it.price ?? 0);

    const total = document.createElement("div");
    total.style.fontWeight = "900";
    total.textContent = fmtMoney(Number(it.qty || 0) * Number(it.price || 0));

    const refreshRowTotal = () => {
      total.textContent = fmtMoney(Number(it.qty || 0) * Number(it.price || 0));
    };

    qty.addEventListener("input", () => {
      it.qty = Number(qty.value || 0);
      refreshRowTotal();
      updateTotalsLive();
    });

    price.addEventListener("input", () => {
      it.price = Number(price.value || 0);
      refreshRowTotal();
      updateTotalsLive();
    });

    const del = document.createElement("button");
    del.className = "del";
    del.type = "button";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      state.current.items = state.current.items.filter(x => x.id !== it.id);
      if (state.current.items.length === 0) {
        state.current.items.push({ id: uid("it"), desc: "", qty: 1, price: 0 });
      }
      renderItems();
      updateTotalsLive();
    });

    row.appendChild(desc);
    row.appendChild(qty);
    row.appendChild(price);
    row.appendChild(total);
    row.appendChild(del);
    wrap.appendChild(row);
  });
}

function updateTotalsLive() {
  const cfg = state.cfg || defaultCfg();
  const taxRate = Number(cfg.taxRate ?? state.current.taxRate ?? 11.5);
  state.current.taxRate = taxRate;

  let sub = 0;
  state.current.items.forEach(it => { sub += Number(it.qty || 0) * Number(it.price || 0); });

  const tax = sub * (taxRate / 100);
  const grand = sub + tax;

  state.current.totals = { sub, tax, grand };

  $("subTotal").textContent = fmtMoney(sub);
  $("taxTotal").textContent = fmtMoney(tax);
  $("grandTotal").textContent = fmtMoney(grand);

  $("kpiLastTotal").textContent = fmtMoney(grand);
  $("kpiTax").textContent = `${taxRate.toFixed(2)}%`;
}

/* =========================
   NUMBERING
========================= */
function nextNumber(type) {
  const year = new Date().getFullYear();
  const prefix = type === "FAC" ? "FAC" : "COT";
  const re = new RegExp(`^${prefix}-${year}-(\\d{4})$`);
  let max = 0;

  (state.docs || []).forEach(d => {
    const m = (d.number || "").match(re);
    if (m) max = Math.max(max, Number(m[1]));
  });

  const next = String(max + 1).padStart(4, "0");
  return `${prefix}-${year}-${next}`;
}

/* =========================
   DOCS CRUD (Firestore)
========================= */
async function saveCurrentToHistory({ forceNumber = false } = {}) {
  if (!state.user) return alert("Necesitas login para guardar en la nube.");

  readDocHeaderIntoState();
  updateTotalsLive();

  if (forceNumber || !state.current.number) {
    state.current.number = nextNumber(state.current.type);
    $("docNumber").value = state.current.number;
  }

  const nowIso = new Date().toISOString();
  state.current.updatedAt = nowIso;
  if (!state.current.createdAt) state.current.createdAt = nowIso;

  const docId = state.current.id;
  const refDoc = doc(db, `${userBase(state.user.uid)}/docs/${docId}`);

  const payload = JSON.parse(JSON.stringify(state.current));
  payload.updatedAt = serverTimestamp();
  if (!payload._createdAtServer) payload._createdAtServer = serverTimestamp();

  await setDoc(refDoc, payload, { merge: true });

  // refresh cache
  await loadAllFromFirestore();
  state.activeDocId = docId;
}

async function loadDocFromHistory(id) {
  const d = (state.docs || []).find(x => x.id === id);
  if (!d) return;

  state.activeDocId = d.id;
  state.current = JSON.parse(JSON.stringify(d));

  bindDocHeader();
  renderItems();
  updateTotalsLive();

  setSub("confirm");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteDocCloud() {
  if (!state.user) return alert("Login requerido.");
  if (!state.activeDocId) return alert("No hay documento seleccionado.");
  if (!confirm("¿Borrar este documento del historial?")) return;

  await deleteDoc(doc(db, `${userBase(state.user.uid)}/docs/${state.activeDocId}`));
  state.activeDocId = null;
  state.current = newDoc();

  bindDocHeader();
  renderItems();
  updateTotalsLive();

  await loadAllFromFirestore();
}

function duplicateDoc() {
  readDocHeaderIntoState();

  const copy = JSON.parse(JSON.stringify(state.current));
  copy.id = uid("doc");
  copy.number = "";
  copy.status = "PENDIENTE";
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = new Date().toISOString();
  copy.items = copy.items.map(it => ({ ...it, id: uid("it") }));

  state.activeDocId = null;
  state.current = copy;

  bindDocHeader();
  renderItems();
  updateTotalsLive();
}

/* =========================
   HISTORY UI
========================= */
function renderHistory() {
  const body = $("histBody");
  if (!body) return;

  const q = (($("histSearch")?.value || "").trim().toLowerCase());
  body.innerHTML = "";

  let rows = [...(state.docs || [])];
  if (q) {
    rows = rows.filter(d => {
      const s = `${d.number || ""} ${d.client?.name || ""}`.toLowerCase();
      return s.includes(q);
    });
  }

  rows.forEach(d => {
    const tr = document.createElement("tr");

    const tdType = document.createElement("td");
    tdType.textContent = d.type === "FAC" ? "FAC" : "COT";

    const tdNo = document.createElement("td");
    tdNo.textContent = d.number || "AUTO";

    const tdDate = document.createElement("td");
    tdDate.textContent = d.date || "";

    const tdClient = document.createElement("td");
    tdClient.textContent = d.client?.name || "";

    const tdStatus = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "badge " + (d.status === "PAGADA" ? "ok" : "warn");
    badge.textContent = d.status || "PENDIENTE";
    tdStatus.appendChild(badge);

    const tdTotal = document.createElement("td");
    tdTotal.textContent = fmtMoney(d.totals?.grand || 0);

    const tdAct = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "aBtns";

    const btnOpen = document.createElement("button");
    btnOpen.className = "aBtn";
    btnOpen.type = "button";
    btnOpen.textContent = "Abrir";
    btnOpen.addEventListener("click", () => loadDocFromHistory(d.id));

    const btnPdf = document.createElement("button");
    btnPdf.className = "aBtn";
    btnPdf.type = "button";
    btnPdf.textContent = "PDF";
    btnPdf.addEventListener("click", async () => {
      await loadDocFromHistory(d.id);
      await confirmPDF();
    });

    wrap.appendChild(btnOpen);
    wrap.appendChild(btnPdf);
    tdAct.appendChild(wrap);

    tr.appendChild(tdType);
    tr.appendChild(tdNo);
    tr.appendChild(tdDate);
    tr.appendChild(tdClient);
    tr.appendChild(tdStatus);
    tr.appendChild(tdTotal);
    tr.appendChild(tdAct);

    body.appendChild(tr);
  });

  refreshKPIs();
}

/* =========================
   KPIs / REPORTING
========================= */
function refreshKPIs() {
  if ($("kpiDocs")) $("kpiDocs").textContent = String((state.docs || []).length);

  const cfg = state.cfg || defaultCfg();
  if ($("kpiTax")) $("kpiTax").textContent = `${Number(cfg.taxRate || 11.5).toFixed(2)}%`;

  if ($("kpiLastTotal")) $("kpiLastTotal").textContent = fmtMoney(state.current?.totals?.grand || 0);

  if ($("kpiCustomers")) $("kpiCustomers").textContent = String((state.customers || []).length);
}

function renderReporting() {
  const docs = state.docs || [];

  let pending = 0, paid = 0;
  docs.forEach(d => {
    const val = Number(d.totals?.grand || 0);
    if (d.status === "PAGADA") paid += val;
    else pending += val;
  });

  if ($("repPending")) $("repPending").textContent = fmtMoney(pending);
  if ($("repPaid")) $("repPaid").textContent = fmtMoney(paid);
  if ($("repDocs")) $("repDocs").textContent = String(docs.length);
}

/* =========================
   PDF
========================= */
function buildPdfDoc() {
  const { jsPDF } = window.jspdf;
  const cfg = state.cfg || defaultCfg();
  const biz = cfg.biz || {};
  const taxRate = Number(cfg.taxRate || 11.5);

  readDocHeaderIntoState();
  updateTotalsLive();

  const docp = new jsPDF({ unit: "pt", format: "a4" });
  const W = docp.internal.pageSize.getWidth();
  const H = docp.internal.pageSize.getHeight();
  const margin = 42;

  // Header line
  docp.setDrawColor(220);
  docp.setLineWidth(1);
  docp.line(margin, 110, W - margin, 110);

  // Title left
  docp.setFont("helvetica", "bold");
  docp.setFontSize(20);
  docp.text(state.current.type === "FAC" ? "FACTURA" : "COTIZACIÓN", margin, 64);

  // No. y Fecha separados
  docp.setFont("helvetica", "normal");
  docp.setFontSize(10);
  docp.text(`No.: ${state.current.number || "AUTO"}`, margin, 86);
  docp.text(`Fecha: ${state.current.date || ""}`, margin, 102);

  // Right header + logo sin overlap
  const rightX = W - margin;
  let textTopY = 52;

  if (biz.logoDataUrl) {
    try {
      const imgW = 54, imgH = 54;
      const imgX = W - margin - imgW;
      const imgY = 24;

      const isPng = String(biz.logoDataUrl).startsWith("data:image/png");
      docp.addImage(biz.logoDataUrl, isPng ? "PNG" : "JPEG", imgX, imgY, imgW, imgH);
      textTopY = imgY + imgH + 10;
    } catch { /* ignore */ }
  }

  let topY = textTopY;
  docp.setFont("helvetica", "bold");
  docp.setFontSize(12);
  docp.text(biz.name || "Empresa", rightX, topY, { align: "right" });

  docp.setFont("helvetica", "normal");
  docp.setFontSize(10);
  topY += 14;
  if (biz.addr) { docp.text(biz.addr, rightX, topY, { align: "right" }); topY += 12; }
  if (biz.phone) { docp.text(`Tel: ${biz.phone}`, rightX, topY, { align: "right" }); topY += 12; }
  if (biz.email) { docp.text(`Email: ${biz.email}`, rightX, topY, { align: "right" }); topY += 12; }

  // Client box
  const boxY = 132;
  docp.setFillColor(245, 245, 245);
  docp.setDrawColor(230);
  docp.roundedRect(margin, boxY, W - 2 * margin, 74, 10, 10, "FD");

  docp.setTextColor(20);
  docp.setFont("helvetica", "bold");
  docp.setFontSize(10);
  docp.text("Cliente", margin + 14, boxY + 22);

  docp.setFont("helvetica", "normal");
  docp.text(state.current.client.name || "—", margin + 14, boxY + 38);
  docp.text(state.current.client.contact || "—", margin + 14, boxY + 52);
  docp.text(state.current.client.addr || "—", margin + 14, boxY + 66);

  docp.setFont("helvetica", "bold");
  docp.text("Válida hasta", W - margin - 160, boxY + 22);
  docp.setFont("helvetica", "normal");
  docp.text(state.current.validUntil || "—", W - margin - 160, boxY + 40);

  // Items table
  const items = state.current.items.map(it => {
    const qty = Number(it.qty || 0);
    const price = Number(it.price || 0);
    return [it.desc || "", String(qty), fmtMoney(price), fmtMoney(qty * price)];
  });

  docp.autoTable({
    startY: boxY + 92,
    head: [["Descripción", "Cant.", "Precio", "Total"]],
    body: items,
    styles: { font: "helvetica", fontSize: 10, cellPadding: 8 },
    headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 280 },
      1: { halign: "right", cellWidth: 70 },
      2: { halign: "right", cellWidth: 90 },
      3: { halign: "right", cellWidth: 90 }
    },
    margin: { left: margin, right: margin }
  });

  const afterTableY = docp.lastAutoTable.finalY + 14;

  // Totals box
  const totW = 220;
  const totX = W - margin - totW;
  const totY = afterTableY;

  docp.setFillColor(245, 245, 245);
  docp.setDrawColor(230);
  docp.roundedRect(totX, totY, totW, 74, 10, 10, "FD");

  docp.setFont("helvetica", "normal");
  docp.setFontSize(10);
  docp.text("Subtotal:", totX + 12, totY + 22);
  docp.text(fmtMoney(state.current.totals.sub), totX + totW - 12, totY + 22, { align: "right" });

  docp.text(`IVU (${taxRate.toFixed(2)}%):`, totX + 12, totY + 40);
  docp.text(fmtMoney(state.current.totals.tax), totX + totW - 12, totY + 40, { align: "right" });

  docp.setFont("helvetica", "bold");
  docp.text("TOTAL:", totX + 12, totY + 60);
  docp.text(fmtMoney(state.current.totals.grand), totX + totW - 12, totY + 60, { align: "right" });

  // Notes / terms
  let textY = totY + 98;
  docp.setFont("helvetica", "bold");
  docp.text("Notas", margin, textY);
  docp.setFont("helvetica", "normal");
  docp.text((state.current.notes || "—").slice(0, 650), margin, textY + 14, { maxWidth: W - 2 * margin });

  textY += 70;
  docp.setFont("helvetica", "bold");
  docp.text("Condiciones", margin, textY);
  docp.setFont("helvetica", "normal");
  docp.text((state.current.terms || "—").slice(0, 650), margin, textY + 14, { maxWidth: W - 2 * margin });

  // Footer
  docp.setFontSize(9);
  docp.setTextColor(120);
  docp.text(
    `${biz.name || "Empresa"} · ${state.current.type === "FAC" ? "FACTURA" : "COTIZACIÓN"} ${state.current.number || ""}`,
    margin,
    H - 26
  );

  return docp;
}

function makePreview() {
  try {
    const pdf = buildPdfDoc();
    const blob = pdf.output("blob");
    if (state.previewBlobUrl) URL.revokeObjectURL(state.previewBlobUrl);
    state.previewBlobUrl = URL.createObjectURL(blob);
    $("pdfFrame").src = state.previewBlobUrl;
  } catch {
    alert("No se pudo generar preview. Revisa el logo o los datos.");
  }
}

async function confirmPDF() {
  await saveCurrentToHistory({ forceNumber: true });

  // Si hay logoUrl pero no dataUrl, intenta cachearlo
  const cfg = state.cfg || defaultCfg();
  if (cfg?.biz?.logoUrl && !cfg.biz.logoDataUrl) {
    try { cfg.biz.logoDataUrl = await urlToDataUrl(cfg.biz.logoUrl); } catch {}
  }

  try {
    const pdf = buildPdfDoc();
    const file = `${state.current.type}_${state.current.number || "AUTO"}.pdf`;
    pdf.save(file);
    makePreview();
    setSub("preview");
  } catch {
    alert("PDF falló. Verifica el logo (PNG/JPG) y vuelve a intentar.");
  }
}

/* =========================
   CUSTOMERS (Firestore)
========================= */
function renderCustomers() {
  if ($("kpiCustomers")) $("kpiCustomers").textContent = String((state.customers || []).length);

  const q = (($("cSearch")?.value || "").trim().toLowerCase());
  const body = $("customersBody");
  if (!body) return;

  body.innerHTML = "";
  let rows = [...(state.customers || [])];

  if (q) {
    rows = rows.filter(c => {
      const s = `${c.name || ""} ${c.contact || ""} ${c.addr || ""}`.toLowerCase();
      return s.includes(q);
    });
  }

  rows.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.name || "")}</td>
      <td>${escapeHtml(c.contact || "")}</td>
      <td>${escapeHtml(c.addr || "")}</td>
      <td></td>
    `;

    const td = tr.querySelector("td:last-child");
    const wrap = document.createElement("div");
    wrap.className = "aBtns";

    const use = document.createElement("button");
    use.className = "aBtn";
    use.type = "button";
    use.textContent = "Usar";
    use.addEventListener("click", () => {
      state.current.client.name = c.name || "";
      state.current.client.contact = c.contact || "";
      state.current.client.addr = c.addr || "";
      bindDocHeader();
      setView("invoicing");
      setSub("confirm");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const del = document.createElement("button");
    del.className = "aBtn";
    del.type = "button";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => {
      if (!state.user) return alert("Login requerido.");
      if (!confirm("¿Borrar cliente?")) return;
      await deleteDoc(doc(db, `${userBase(state.user.uid)}/customers/${c.id}`));
      await loadAllFromFirestore();
    });

    wrap.appendChild(use);
    wrap.appendChild(del);
    td.appendChild(wrap);
    body.appendChild(tr);
  });
}

async function addCustomer() {
  if (!state.user) return alert("Login requerido.");

  const name = ($("cName").value || "").trim();
  if (!name) return alert("Nombre requerido.");

  const id = uid("cus");
  const refC = doc(db, `${userBase(state.user.uid)}/customers/${id}`);

  await setDoc(refC, {
    name,
    contact: ($("cContact").value || "").trim(),
    addr: ($("cAddr").value || "").trim(),
    note: ($("cNote").value || "").trim(),
    createdAt: serverTimestamp()
  });

  $("cName").value = "";
  $("cContact").value = "";
  $("cAddr").value = "";
  $("cNote").value = "";

  await loadAllFromFirestore();
}

/* =========================
   VENDORS (mínimo, funcional)
========================= */
function renderVendors() {
  // Si tu HTML de Vendors está “en construcción”, no lo rompemos. (lo dejamos como estaba)
  // Cuando quieras lo habilitamos con Firestore igual que customers.
}

/* =========================
   SETTINGS + LOGO (Storage)
========================= */
function openBiz() {
  const cfg = state.cfg || defaultCfg();
  $("bizName").value = cfg.biz?.name || "";
  $("bizPhone").value = cfg.biz?.phone || "";
  $("bizEmail").value = cfg.biz?.email || "";
  $("bizAddr").value = cfg.biz?.addr || "";
  $("taxRate").value = String(cfg.taxRate ?? 11.5);
  $("settingsPanel").style.display = "flex";
}

function closeBiz() {
  $("settingsPanel").style.display = "none";
}

async function saveBiz() {
  if (!state.user) return alert("Login requerido.");

  const cfg = state.cfg || defaultCfg();
  cfg.biz = cfg.biz || {};

  cfg.biz.name = ($("bizName").value || "").trim();
  cfg.biz.phone = ($("bizPhone").value || "").trim();
  cfg.biz.email = ($("bizEmail").value || "").trim();
  cfg.biz.addr = ($("bizAddr").value || "").trim();
  cfg.taxRate = Number($("taxRate").value || 11.5);

  const file = $("bizLogo").files && $("bizLogo").files[0];
  if (file) {
    // Subir a Storage
    const path = `users/${state.user.uid}/logo_${Date.now()}_${file.name}`;
    const r = ref(storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);

    cfg.biz.logoUrl = url;

    // Cache DataURL para PDF (local, no hace falta guardarlo en Firestore)
    try { cfg.biz.logoDataUrl = await fileToDataUrl(file); } catch {}
  }

  state.cfg = cfg;
  await saveSettingsToFirestore();

  refreshKPIs();
  updateTotalsLive();
  alert("Empresa guardada ✅");
  closeBiz();
}

/* =========================
   INVOICING
========================= */
function renderInvoicing() {
  if (!state.current) state.current = newDoc();
  bindDocHeader();
  renderItems();
  updateTotalsLive();
  renderHistory();
  refreshKPIs();
}

/* =========================
   EVENTS
========================= */
function bindEvents() {
  // Tabs principales
  $("mainTabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    setView(b.dataset.view);
  });

  // Subtabs Invoicing
  $("invoiceSubtabs").addEventListener("click", (e) => {
    const b = e.target.closest(".subtab");
    if (!b) return;
    setSub(b.dataset.sub);
  });

  // New
  $("btnNew").addEventListener("click", () => {
    state.activeDocId = null;
    state.current = newDoc();
    renderInvoicing();
    setSub("confirm");
  });

  // Config
  $("btnSettings").addEventListener("click", openBiz);
  $("btnOpenConfig")?.addEventListener("click", openBiz);
  $("btnCloseBiz").addEventListener("click", closeBiz);
  $("btnSaveBiz").addEventListener("click", saveBiz);

  // Cambios de header
  [
    "docType","docNumber","docDate","docStatus",
    "clientName","clientContact","clientAddr","validUntil",
    "notes","terms"
  ].forEach(id => {
    $(id).addEventListener("input", () => {
      readDocHeaderIntoState();
      updateTotalsLive();
    });
    $(id).addEventListener("change", () => {
      readDocHeaderIntoState();
      updateTotalsLive();
    });
  });

  // Items
  $("btnAddItem").addEventListener("click", () => {
    state.current.items.push({ id: uid("it"), desc: "", qty: 1, price: 0 });
    renderItems();
    updateTotalsLive();
  });

  $("btnSaveDoc").addEventListener("click", async () => {
    try {
      await saveCurrentToHistory({ forceNumber: false });
      alert("Guardado ✅");
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar. Verifica login / reglas.");
    }
  });

  $("btnPDF").addEventListener("click", confirmPDF);

  $("btnDuplicate").addEventListener("click", duplicateDoc);
  $("btnDelete").addEventListener("click", deleteDocCloud);

  // Historial
  $("histSearch").addEventListener("input", renderHistory);
  $("btnExportHist").addEventListener("click", () => {
    // Export simple: descarga json de cache (útil)
    const blob = new Blob([JSON.stringify(state.docs || [], null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `docs_${toISODate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("btnClearHist").addEventListener("click", async () => {
    if (!state.user) return alert("Login requerido.");
    if (!confirm("¿Vaciar historial completo?")) return;

    // borra docs en lote (simple, uno a uno)
    for (const d of (state.docs || [])) {
      await deleteDoc(doc(db, `${userBase(state.user.uid)}/docs/${d.id}`));
    }
    await loadAllFromFirestore();
  });

  // Preview
  $("btnRefreshPreview").addEventListener("click", makePreview);
  $("btnConfirmFromPreview").addEventListener("click", confirmPDF);

  // Customers
  $("btnAddCustomer").addEventListener("click", addCustomer);
  $("cSearch").addEventListener("input", renderCustomers);

  // Hub
  const hubBtn = $("hubBackBtn");
  if (hubBtn) hubBtn.href = HUB_URL;
}

/* =========================
   BOOT
========================= */
function boot() {
  ensureAuthButtons();
  bindEvents();

  state.current = newDoc();
  setView("invoicing");
  setSub("confirm");

  // Auth listener
  onAuthStateChanged(auth, async (user) => {
    state.user = user || null;
    refreshAuthUI();

    if (state.user) {
      await loadAllFromFirestore();
      // Asegura cfg en memoria
      if (!state.cfg) state.cfg = defaultCfg();
    } else {
      // sin sesión, dejamos defaults locales
      state.cfg = defaultCfg();
      state.docs = [];
      state.customers = [];
      state.vendors = [];
      refreshKPIs();
      renderHistory();
      renderCustomers();
      renderReporting();
    }

    // refresca app
    state.current.taxRate = Number(state.cfg.taxRate || 11.5);
    updateTotalsLive();
  });
}

document.addEventListener("DOMContentLoaded", boot);
