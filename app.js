import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, orderBy, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBm67RjL0QzMRLfo6zUYCI0bak1eGJAR-U",
  authDomain: "oasis-facturacion.firebaseapp.com",
  projectId: "oasis-facturacion",
  storageBucket: "oasis-facturacion.firebasestorage.app",
  messagingSenderId: "84422038905",
  appId: "1:84422038905:web:b0eef65217d2bfc3298ba8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const $ = (id) => document.getElementById(id);
const money = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const uid = (p = "id") => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
const base = (u) => `users/${u}`;
const docsCol = (u) => collection(db, `${base(u)}/docs`);
const customersCol = (u) => collection(db, `${base(u)}/customers`);
const settingsRef = (u) => doc(db, `${base(u)}/settings/main`);
const crmCol = (u) => collection(db, `${base(u)}/oasis_crm_v3/clients/items`);

let state = {
  user: null,
  view: "dashboard",
  activeDocId: null,
  current: null,
  docs: [],
  customers: [],
  cfg: null,
  loaded: false
};

function clean(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function norm(s) { return String(s || "").trim().toLowerCase(); }
function defaultCfg() {
  return {
    biz: { name: "Oasis Air Cleaner Services LLC", phone: "787-664-3079", email: "", addr: "Puerto Rico", logoUrl: "", logoDataUrl: "" },
    taxRate: 0
  };
}
function normalizeCfg(c) {
  const d = defaultCfg();
  return { ...d, ...(c || {}), biz: { ...d.biz, ...(c?.biz || {}) }, taxRate: Number(c?.taxRate ?? 0) };
}
function newDoc(type = "COT") {
  return {
    id: uid("doc"),
    type,
    number: "",
    date: today(),
    validUntil: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    status: type === "FAC" ? "PENDIENTE" : "PENDIENTE",
    client: { name: "", contact: "", addr: "" },
    items: [{ id: uid("it"), desc: "", qty: 1, price: 0 }],
    notes: "",
    terms: "",
    totals: { sub: 0, tax: 0, grand: 0 },
    taxRate: Number(state.cfg?.taxRate ?? 0),
    createdAt: now(),
    updatedAt: now()
  };
}
async function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
async function urlToDataUrl(url) {
  const resp = await fetch(url, { cache: "no-store" });
  const blob = await resp.blob();
  return fileToDataUrl(blob);
}
function setAuthUI() {
  const on = !!state.user;
  $("btnLogin")?.classList.toggle("hidden", on);
  $("btnLogout")?.classList.toggle("hidden", !on);
  $("authState").textContent = on ? "Online" : "Offline";
  ["btnSaveDoc", "btnPDF", "btnDeleteDoc", "btnAddCustomer", "btnImportCrm", "btnImportCrm2", "btnSaveSettings", "btnBackup", "btnRestore"].forEach(id => {
    if ($(id)) $(id).disabled = !on;
  });
}
async function login() {
  const provider = new GoogleAuthProvider();
  if (isIOS()) return signInWithRedirect(auth, provider);
  try { await signInWithPopup(auth, provider); }
  catch (e) { await signInWithRedirect(auth, provider); }
}
async function logout() { await signOut(auth); }

async function loadAll() {
  if (!state.user) return;
  $("authState").textContent = "Sync...";
  const uidv = state.user.uid;

  const s = await getDoc(settingsRef(uidv));
  state.cfg = normalizeCfg(s.exists() ? s.data() : defaultCfg());
  if (state.cfg.biz.logoUrl && !state.cfg.biz.logoDataUrl) {
    try { state.cfg.biz.logoDataUrl = await urlToDataUrl(state.cfg.biz.logoUrl); } catch {}
  }

  const [ds, cs] = await Promise.all([
    getDocs(query(docsCol(uidv), orderBy("updatedAt", "desc"))).catch(() => getDocs(docsCol(uidv))),
    getDocs(query(customersCol(uidv), orderBy("updatedAt", "desc"))).catch(() => getDocs(customersCol(uidv)))
  ]);
  state.docs = ds.docs.map(d => ({ id: d.id, ...d.data() }));
  state.customers = cs.docs.map(d => ({ id: d.id, ...d.data() }));
  state.loaded = true;
  refreshAll();
  $("authState").textContent = "Online";
}

function customerKey(c) { return norm(`${c.name}|${c.contact || ""}`); }
function mergedCustomers() {
  const map = new Map();
  (state.customers || []).forEach(c => { if (c?.name) map.set(customerKey(c), { ...c, source: c.source || "clientes" }); });
  (state.docs || []).forEach(d => {
    const c = d.client || {};
    if (!c.name) return;
    const k = customerKey(c);
    if (!map.has(k)) map.set(k, { id: uid("auto"), name: c.name, contact: c.contact || "", addr: c.addr || "", source: "documentos" });
  });
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
async function upsertCustomer(raw, source = "manual") {
  if (!state.user || !raw?.name) return null;
  const name = String(raw.name || "").trim();
  const contact = String(raw.contact || raw.phone || raw.tel || "").trim();
  const addr = String(raw.addr || raw.address || "").trim();
  const note = String(raw.note || "").trim();
  const existing = mergedCustomers().find(c => norm(c.name) === norm(name) && norm(c.contact || "") === norm(contact));
  const id = existing?.id && !String(existing.id).startsWith("auto_") ? existing.id : (raw.id || uid("cus"));
  const payload = { id, name, contact, addr, note, source, updatedAt: serverTimestamp(), updatedISO: now() };
  await setDoc(doc(db, `${base(state.user.uid)}/customers/${id}`), payload, { merge: true });
  return payload;
}
async function importCrmCustomers() {
  if (!state.user) return alert("Login requerido.");
  $("authState").textContent = "Importando...";
  let snap;
  try { snap = await getDocs(crmCol(state.user.uid)); }
  catch (e) { alert("No pude leer clientes del CRM. Revisa reglas de Firestore."); $("authState").textContent = "Online"; return; }
  let count = 0;
  for (const d of snap.docs) {
    const c = d.data();
    if (!c?.name) continue;
    await upsertCustomer({ id: c.id || d.id, name: c.name, contact: c.contact || c.phone || "", addr: c.addr || c.address || "", note: c.note || "" }, "CRM");
    count++;
  }
  await loadAll();
  alert(`Clientes importados: ${count}`);
}

function readForm() {
  if (!state.current) state.current = newDoc();
  const c = state.current;
  c.type = $("docType").value;
  c.number = $("docNumber").value.trim();
  c.date = $("docDate").value || today();
  c.validUntil = c.validUntil || new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  c.status = $("docStatus").value;
  c.client = { name: $("clientName").value.trim(), contact: $("clientContact").value.trim(), addr: $("clientAddr").value.trim() };
  c.notes = $("notes").value.trim();
  c.terms = $("terms").value.trim();
  c.taxRate = Number(state.cfg?.taxRate ?? 0);
  c.items = [...document.querySelectorAll(".itemRow")].map(row => ({
    id: row.dataset.id || uid("it"),
    desc: row.querySelector(".desc").value.trim(),
    qty: Number(row.querySelector(".qty").value || 0),
    price: Number(row.querySelector(".price").value || 0)
  })).filter(it => it.desc || it.qty || it.price);
  if (!c.items.length) c.items = [{ id: uid("it"), desc: "", qty: 1, price: 0 }];
  calcTotals();
}
function calcTotals() {
  if (!state.current) return;
  const sub = (state.current.items || []).reduce((a, it) => a + Number(it.qty || 0) * Number(it.price || 0), 0);
  const tax = sub * (Number(state.current.taxRate ?? state.cfg?.taxRate ?? 0) / 100);
  state.current.totals = { sub, tax, grand: sub + tax };
  $("subTotal").textContent = money(sub);
  $("taxTotal").textContent = money(tax);
  $("grandTotal").textContent = money(sub + tax);
}
function syncForm() {
  const c = state.current || newDoc();
  $("docType").value = c.type || "COT";
  $("docNumber").value = c.number || "";
  $("docDate").value = c.date || today();
  $("docStatus").value = c.status || "PENDIENTE";
  $("clientName").value = c.client?.name || "";
  $("clientContact").value = c.client?.contact || "";
  $("clientAddr").value = c.client?.addr || "";
  $("notes").value = c.notes || "";
  $("terms").value = c.terms || "";
  $("docMode").textContent = state.activeDocId ? "Editando" : "Nuevo";
  renderItems();
}
function renderItems() {
  const box = $("items");
  box.innerHTML = "";
  (state.current?.items || []).forEach(it => {
    const row = document.createElement("div");
    row.className = "itemRow";
    row.dataset.id = it.id || uid("it");
    row.innerHTML = `<input class="input desc" placeholder="Descripción" value="${clean(it.desc)}"><input class="input qty" type="number" step="0.01" value="${Number(it.qty || 0)}"><input class="input price" type="number" step="0.01" value="${Number(it.price || 0)}"><div class="itemTotal">${money(Number(it.qty || 0) * Number(it.price || 0))}</div><button class="btn danger del" type="button">×</button>`;
    row.querySelectorAll("input").forEach(i => i.addEventListener("input", () => { readForm(); renderItemTotalsOnly(); }));
    row.querySelector(".del").addEventListener("click", () => { row.remove(); readForm(); renderItems(); });
    box.appendChild(row);
  });
  calcTotals();
}
function renderItemTotalsOnly() {
  document.querySelectorAll(".itemRow").forEach(row => {
    const qty = Number(row.querySelector(".qty").value || 0);
    const price = Number(row.querySelector(".price").value || 0);
    row.querySelector(".itemTotal").textContent = money(qty * price);
  });
}
function nextNumber(type) {
  const year = new Date().getFullYear();
  const prefix = `${type}-${year}-`;
  const nums = state.docs.map(d => String(d.number || "")).filter(n => n.startsWith(prefix)).map(n => Number(n.split("-").pop())).filter(Boolean);
  return `${prefix}${String((Math.max(0, ...nums) + 1)).padStart(4, "0")}`;
}
async function saveDoc({ forceNumber = false } = {}) {
  if (!state.user) return alert("Login requerido.");
  readForm();
  if (!state.current.client.name) return alert("Cliente requerido.");
  if (forceNumber && !state.current.number) state.current.number = nextNumber(state.current.type);
  state.current.id = state.activeDocId || state.current.id || uid("doc");
  state.current.updatedAt = serverTimestamp();
  state.current.updatedISO = now();
  if (!state.current.createdAt) state.current.createdAt = now();
  await setDoc(doc(db, `${base(state.user.uid)}/docs/${state.current.id}`), state.current, { merge: true });
  await upsertCustomer(state.current.client, "documento");
  state.activeDocId = state.current.id;
  await loadAll();
  syncForm();
}
async function loadDoc(id) {
  const d = state.docs.find(x => x.id === id);
  if (!d) return;
  state.current = JSON.parse(JSON.stringify(d));
  state.activeDocId = id;
  setView("editor");
  syncForm();
}
async function deleteCurrentDoc() {
  if (!state.user || !state.activeDocId) return;
  if (!confirm("¿Borrar documento?")) return;
  await deleteDoc(doc(db, `${base(state.user.uid)}/docs/${state.activeDocId}`));
  state.activeDocId = null;
  state.current = newDoc();
  await loadAll();
  syncForm();
}
function duplicateDoc() {
  readForm();
  state.current = { ...JSON.parse(JSON.stringify(state.current)), id: uid("doc"), number: "", status: "PENDIENTE", date: today(), createdAt: now(), updatedAt: now() };
  state.activeDocId = null;
  syncForm();
}
async function makePDF() {
  await saveDoc({ forceNumber: true });
  readForm();

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const cfg = state.cfg || defaultCfg();
  const doc = state.current || newDoc();
  const docTitle = doc.type === "FAC" ? "FACTURA" : "COTIZACIÓN";
  const docNumber = doc.number || nextNumber(doc.type || "COT");
  const taxRate = Number(doc.taxRate ?? cfg.taxRate ?? 0);
  const validUntil = doc.validUntil || new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 46;
  const safeText = (value) => String(value || "");
  const line = (y) => {
    pdf.setDrawColor(225, 225, 225);
    pdf.setLineWidth(0.8);
    pdf.line(marginX, y, pageW - marginX, y);
  };
  const writeWrapped = (text, x, y, width, lineHeight = 12) => {
    const lines = pdf.splitTextToSize(safeText(text), width);
    pdf.text(lines, x, y);
    return y + lines.length * lineHeight;
  };
  const labelMoney = (label, value, y, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(bold ? 11 : 10);
    pdf.text(label, totalsX + 14, y);
    pdf.text(money(value), totalsX + totalsW - 14, y, { align: "right" });
  };

  pdf.setTextColor(20, 20, 20);

  // Header exacto estilo anterior moderno
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(docTitle, marginX, 64);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`No.: ${docNumber}`, marginX, 88);
  pdf.text(`Fecha: ${safeText(doc.date || today())}`, marginX, 104);

  const bizRight = pageW - marginX;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(safeText(cfg.biz?.name || "Oasis Air Cleaner Services LLC"), bizRight, 64, { align: "right" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  let by = 80;
  const bizLines = [];
  if (cfg.biz?.addr) bizLines.push(cfg.biz.addr);
  if (cfg.biz?.phone) bizLines.push(`Tel: ${cfg.biz.phone}`);
  if (cfg.biz?.email) bizLines.push(`Email: ${cfg.biz.email}`);
  bizLines.forEach((txt) => {
    pdf.text(safeText(txt), bizRight, by, { align: "right" });
    by += 14;
  });

  line(116);

  // Bloque cliente / válida hasta
  const boxY = 140;
  const boxH = 76;
  pdf.setFillColor(248, 248, 248);
  pdf.setDrawColor(225, 225, 225);
  pdf.roundedRect(marginX, boxY, pageW - marginX * 2, boxH, 10, 10, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Cliente", marginX + 14, boxY + 24);
  pdf.text("Válida hasta", pageW - 205, boxY + 24);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  let cy = boxY + 40;
  if (doc.client?.name) cy = writeWrapped(doc.client.name, marginX + 14, cy, 335, 12);
  if (doc.client?.contact) cy = writeWrapped(doc.client.contact, marginX + 14, cy, 335, 12);
  if (doc.client?.addr) writeWrapped(doc.client.addr, marginX + 14, cy, 335, 12);
  pdf.text(safeText(validUntil), pageW - 205, boxY + 40);

  // Tabla
  const rows = (doc.items || [])
    .filter((it) => it.desc || Number(it.qty || 0) || Number(it.price || 0))
    .map((it) => [
      safeText(it.desc),
      String(Number(it.qty || 0)).replace(/\.00$/, ""),
      money(it.price),
      money(Number(it.qty || 0) * Number(it.price || 0))
    ]);

  pdf.autoTable({
    startY: boxY + boxH + 22,
    head: [["Descripción", "Cant.", "Precio", "Total"]],
    body: rows,
    theme: "grid",
    margin: { left: marginX, right: marginX },
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: { top: 8, right: 8, bottom: 8, left: 8 },
      textColor: [70, 70, 70],
      lineColor: [235, 235, 235],
      lineWidth: 0.3,
      fillColor: [255, 255, 255]
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [18, 18, 18],
      textColor: [255, 255, 255],
      lineColor: [18, 18, 18],
      lineWidth: 0.4
    },
    columnStyles: {
      0: { cellWidth: 286 },
      1: { cellWidth: 70, halign: "right" },
      2: { cellWidth: 92, halign: "right" },
      3: { cellWidth: 92, halign: "right" }
    }
  });

  let y = pdf.lastAutoTable.finalY + 28;
  const sub = Number(doc.totals?.sub || 0);
  const tax = Number(doc.totals?.tax || 0);
  const grand = Number(doc.totals?.grand || 0);

  // Totales en caja gris como formato anterior
  var totalsW = 226;
  var totalsX = pageW - marginX - totalsW;
  const totalsH = 74;
  pdf.setFillColor(248, 248, 248);
  pdf.setDrawColor(225, 225, 225);
  pdf.roundedRect(totalsX, y - 8, totalsW, totalsH, 10, 10, "FD");
  labelMoney("Subtotal:", sub, y + 14);
  labelMoney(`IVU (${taxRate.toFixed(2)}%):`, tax, y + 32);
  labelMoney("TOTAL:", grand, y + 54, true);

  y += totalsH + 28;

  const ensureRoom = (needed = 80) => {
    if (y + needed > pageH - 75) {
      pdf.addPage();
      y = 54;
    }
  };

  if (doc.notes) {
    ensureRoom(90);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(30, 30, 30);
    pdf.text("Notas", marginX, y);
    y += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    y = writeWrapped(doc.notes, marginX, y, pageW - marginX * 2, 12) + 36;
  }

  if (doc.terms) {
    ensureRoom(90);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("Condiciones", marginX, y);
    y += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    y = writeWrapped(doc.terms, marginX, y, pageW - marginX * 2, 12) + 14;
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(150, 150, 150);
  pdf.text(`${safeText(cfg.biz?.name || "Oasis Air Cleaner Services LLC")} · ${docTitle} ${docNumber}`, marginX, pageH - 32);

  pdf.save(`${doc.type || "DOC"}_${docNumber}.pdf`);
}

function badge(s) { return `<span class="badge ${s === "PAGADA" ? "ok" : s === "PENDIENTE" ? "warn" : ""}">${clean(s || "—")}</span>`; }
function refreshKPIs() {
  const customers = mergedCustomers();
  const revenue = state.docs.reduce((a, d) => a + Number(d.totals?.grand || 0), 0);
  const pending = state.docs.filter(d => d.status !== "PAGADA" && d.status !== "CANCELADA").reduce((a, d) => a + Number(d.totals?.grand || 0), 0);
  $("kpiCustomers").textContent = customers.length;
  $("kpiDocs").textContent = state.docs.length;
  $("kpiRevenue").textContent = money(revenue);
  $("kpiPending").textContent = money(pending);
}
function renderDashboard() {
  const body = $("recentBody"); body.innerHTML = "";
  state.docs.slice(0, 8).forEach(d => body.innerHTML += `<tr><td>${clean(d.date)}</td><td>${clean(d.client?.name)}</td><td>${clean(d.number || d.type)}</td><td><strong>${money(d.totals?.grand)}</strong></td><td>${badge(d.status)}</td></tr>`);
  if (!body.innerHTML) body.innerHTML = `<tr><td colspan="5" class="muted">Sin documentos. Haz login y presiona Sync.</td></tr>`;
  const list = $("sharedList"); list.innerHTML = "";
  mergedCustomers().slice(0, 10).forEach(c => list.innerHTML += `<div class="listItem"><strong>${clean(c.name)}</strong><small>${clean(c.contact || c.addr || "")} · ${clean(c.source || "cliente")}</small></div>`);
  if (!list.innerHTML) list.innerHTML = `<div class="listItem"><strong>Sin clientes</strong><small>Importa desde CRM o guarda un documento.</small></div>`;
}
function renderDatalist() {
  const dl = $("customerNames"); if (!dl) return;
  dl.innerHTML = mergedCustomers().map(c => `<option value="${clean(c.name)}"></option>`).join("");
}
function useCustomerByName() {
  const name = $("clientName").value;
  const c = mergedCustomers().find(x => norm(x.name) === norm(name));
  if (!c) return;
  if (!$("clientContact").value) $("clientContact").value = c.contact || "";
  if (!$("clientAddr").value) $("clientAddr").value = c.addr || "";
}
function renderCustomers() {
  const q = norm($("customerSearch")?.value || $("globalSearch")?.value || "");
  const body = $("customersBody"); body.innerHTML = "";
  mergedCustomers().filter(c => !q || [c.name, c.contact, c.addr, c.note, c.source].join(" ").toLowerCase().includes(q)).forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${clean(c.name)}</strong><div class="muted">${clean(c.note || "")}</div></td><td>${clean(c.contact || "—")}</td><td>${clean(c.addr || "—")}</td><td>${clean(c.source || "—")}</td><td><button class="chip use" type="button">Usar</button> <button class="chip del" type="button">Borrar</button></td>`;
    tr.querySelector(".use").onclick = () => { state.current = state.current || newDoc(); state.current.client = { name: c.name, contact: c.contact || "", addr: c.addr || "" }; setView("editor"); syncForm(); };
    tr.querySelector(".del").onclick = async () => { if (!state.user || !c.id || String(c.id).startsWith("auto_")) return; if (!confirm("¿Borrar cliente?")) return; await deleteDoc(doc(db, `${base(state.user.uid)}/customers/${c.id}`)); await loadAll(); };
    body.appendChild(tr);
  });
  if (!body.innerHTML) body.innerHTML = `<tr><td colspan="5" class="muted">Sin clientes.</td></tr>`;
  renderDatalist();
}
function renderHistory() {
  const q = norm($("globalSearch")?.value || "");
  const body = $("historyBody"); body.innerHTML = "";
  state.docs.filter(d => !q || [d.number, d.client?.name, d.client?.contact, d.status].join(" ").toLowerCase().includes(q)).forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${clean(d.date)}</td><td>${clean(d.number || "—")}</td><td>${clean(d.client?.name || "—")}</td><td><strong>${money(d.totals?.grand)}</strong></td><td>${badge(d.status)}</td><td><button class="chip open" type="button">Abrir</button></td>`;
    tr.querySelector(".open").onclick = () => loadDoc(d.id);
    body.appendChild(tr);
  });
  if (!body.innerHTML) body.innerHTML = `<tr><td colspan="6" class="muted">Sin documentos.</td></tr>`;
}
function refreshSettingsUI() {
  if (!state.cfg) return;
  if ($("bizName")) $("bizName").value = state.cfg.biz?.name || "";
  if ($("bizPhone")) $("bizPhone").value = state.cfg.biz?.phone || "";
  if ($("bizEmail")) $("bizEmail").value = state.cfg.biz?.email || "";
  if ($("bizAddr")) $("bizAddr").value = state.cfg.biz?.addr || "";
  if ($("taxRate")) $("taxRate").value = state.cfg.taxRate ?? 0;
}
function refreshAll() { setAuthUI(); refreshKPIs(); renderDashboard(); renderCustomers(); renderHistory(); refreshSettingsUI(); renderDatalist(); }
async function addCustomer() {
  if (!state.user) return alert("Login requerido.");
  const c = { name: $("cName").value.trim(), contact: $("cContact").value.trim(), addr: $("cAddr").value.trim(), note: $("cNote").value.trim() };
  if (!c.name) return alert("Nombre requerido.");
  await upsertCustomer(c, "manual");
  ["cName", "cContact", "cAddr", "cNote"].forEach(id => $(id).value = "");
  await loadAll();
}
async function saveSettings() {
  if (!state.user) return alert("Login requerido.");
  const cfg = state.cfg || defaultCfg();
  cfg.biz = { name: $("bizName").value.trim(), phone: $("bizPhone").value.trim(), email: $("bizEmail").value.trim(), addr: $("bizAddr").value.trim(), logoUrl: cfg.biz?.logoUrl || "", logoDataUrl: cfg.biz?.logoDataUrl || "" };
  cfg.taxRate = $("taxRate").value === "" ? 0 : Number($("taxRate").value || 0);
  const file = $("bizLogo").files?.[0];
  if (file) {
    const r = ref(storage, `users/${state.user.uid}/logos/nexus_${Date.now()}_${file.name}`);
    await uploadBytes(r, file);
    cfg.biz.logoUrl = await getDownloadURL(r);
    cfg.biz.logoDataUrl = await fileToDataUrl(file);
  }
  const safe = JSON.parse(JSON.stringify(cfg));
  if (safe.biz) safe.biz.logoDataUrl = "";
  await setDoc(settingsRef(state.user.uid), { ...safe, updatedAt: serverTimestamp() }, { merge: true });
  state.cfg = cfg;
  alert("Guardado.");
  refreshAll();
}
function exportCSV(rows, name) {
  const csv = rows.map(r => r.map(x => `"${String(x ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}
function backup() {
  const payload = { version: "nexus_invoicing_sync_fix_v1", exportedAt: now(), docs: state.docs, customers: state.customers, cfg: state.cfg };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  a.download = `nexus_backup_${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}
async function restore(file) {
  if (!state.user || !file) return;
  const p = JSON.parse(await file.text());
  if (p.cfg) await setDoc(settingsRef(state.user.uid), p.cfg, { merge: true });
  for (const c of p.customers || []) await upsertCustomer(c, c.source || "backup");
  for (const d of p.docs || []) await setDoc(doc(db, `${base(state.user.uid)}/docs/${d.id || uid("doc")}`), d, { merge: true });
  await loadAll();
}
function setView(view) {
  state.view = view;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("is-active"));
  $("view-" + view)?.classList.add("is-active");
  document.querySelectorAll(".navBtn").forEach(b => b.classList.toggle("is-active", b.dataset.view === view));
  const names = { dashboard: "Dashboard", editor: "Documento", customers: "Clientes", history: "Historial", settings: "Config" };
  $("pageTitle").textContent = names[view] || "Nexus Invoicing";
  refreshAll();
}
function bind() {
  document.querySelectorAll(".navBtn").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  $("btnLogin").onclick = login;
  $("btnLogout").onclick = logout;
  $("btnNewDoc").onclick = () => { state.current = newDoc(); state.activeDocId = null; setView("editor"); syncForm(); };
  $("btnAddItem").onclick = () => { readForm(); state.current.items.push({ id: uid("it"), desc: "", qty: 1, price: 0 }); renderItems(); };
  ["docType", "docNumber", "docDate", "docStatus", "clientName", "clientContact", "clientAddr", "notes", "terms"].forEach(id => $(id)?.addEventListener("input", () => { if (id === "clientName") useCustomerByName(); readForm(); }));
  $("btnSaveDoc").onclick = () => saveDoc();
  $("btnPDF").onclick = makePDF;
  $("btnDuplicate").onclick = duplicateDoc;
  $("btnDeleteDoc").onclick = deleteCurrentDoc;
  $("btnAddCustomer").onclick = addCustomer;
  $("btnImportCrm").onclick = importCrmCustomers;
  $("btnImportCrm2").onclick = importCrmCustomers;
  $("btnRefresh").onclick = loadAll;
  $("customerSearch").oninput = renderCustomers;
  $("globalSearch").oninput = () => { renderDashboard(); renderCustomers(); renderHistory(); };
  $("btnSaveSettings").onclick = saveSettings;
  $("btnExportCustomers").onclick = () => exportCSV([["Nombre", "Contacto", "Dirección", "Origen"], ...mergedCustomers().map(c => [c.name, c.contact, c.addr, c.source])], `clientes_${today()}.csv`);
  $("btnExportDocs").onclick = () => exportCSV([["Fecha", "Número", "Cliente", "Total", "Estado"], ...state.docs.map(d => [d.date, d.number, d.client?.name, d.totals?.grand, d.status])], `documentos_${today()}.csv`);
  $("btnBackup").onclick = backup;
  $("btnRestore").onclick = () => $("restoreFile").click();
  $("restoreFile").onchange = e => restore(e.target.files?.[0]);
}
async function boot() {
  bind();
  state.cfg = defaultCfg();
  state.current = newDoc();
  syncForm();
  setAuthUI();
  try { await getRedirectResult(auth); } catch (e) { console.warn(e); }
  onAuthStateChanged(auth, async (u) => {
    state.user = u || null;
    setAuthUI();
    if (u) await loadAll();
    else { state.docs = []; state.customers = []; refreshAll(); }
  });
}
document.addEventListener("DOMContentLoaded", boot);
