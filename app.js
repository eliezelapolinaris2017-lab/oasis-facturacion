/* =========================
   OASIS / NEXUS INVOICING — app.js (FULL) ✅
   - GitHub Pages friendly
   - Historial REAL (tabla + abrir + PDF)
   - Customers + Vendors + Reporting + Config
   - Subtabs FIX: Confirm / Preview / History (history ahora se muestra)
========================= */

/* ====== HUB ====== */
const HUB_URL = "https://eliezelapolinaris2017-lab.github.io/oasis-hub/";

/* ====== HUB FAB (si no existe, lo crea) ====== */
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

/* ====== STORAGE KEYS ====== */
const KEY_DB  = "nexus_invoicing_db_v1";
const KEY_CFG = "nexus_invoicing_cfg_v1";

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

/* ====== DB ====== */
function loadDB() {
  const def = { docs: [], customers: [], vendors: [] };
  try {
    const raw = localStorage.getItem(KEY_DB);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch {
    return def;
  }
}
function saveDB(db) {
  localStorage.setItem(KEY_DB, JSON.stringify(db));
}

/* ====== CONFIG ====== */
function loadCfg() {
  const def = {
    biz: {
      name: "Oasis Air Cleaner Services LLC",
      phone: "787-664-3079",
      email: "",
      addr: "Puerto Rico",
      logoDataUrl: ""
    },
    taxRate: 11.5
  };
  try {
    const raw = localStorage.getItem(KEY_CFG);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch {
    return def;
  }
}
function saveCfg(cfg) {
  localStorage.setItem(KEY_CFG, JSON.stringify(cfg));
}

/* ====== APP STATE ====== */
let state = {
  view: "invoicing",
  sub: "confirm",
  activeDocId: null,
  current: null,
  previewBlobUrl: null
};

function newDoc() {
  const cfg = loadCfg();
  const today = toISODate(new Date());
  const valid = toISODate(new Date(Date.now() + 14 * 24 * 3600 * 1000));

  return {
    id: uid("doc"),
    type: "COT",
    number: "",
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

/* ====== NAV / TABS ====== */
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
  // configuration solo abre modal desde su botón, la vista es informativa
}

function setSub(sub) {
  state.sub = sub;

  document.querySelectorAll(".subtab").forEach(b => b.classList.remove("is-active"));
  document.querySelectorAll(`.subtab[data-sub="${sub}"]`).forEach(b => b.classList.add("is-active"));

  // ✅ FIX: ahora incluye HISTORY
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("is-active"));
  if (sub === "confirm") $("panel-confirm")?.classList.add("is-active");
  if (sub === "preview") $("panel-preview")?.classList.add("is-active");
  if (sub === "history") $("panel-history")?.classList.add("is-active");

  if (sub === "history") renderHistory();
  if (sub === "preview") makePreview();
}

/* ====== BIND FORM ====== */
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

/* ====== ITEMS ====== */
function renderItems() {
  const wrap = $("items");
  if (!wrap) return;
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
  const cfg = loadCfg();
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

/* ====== NUMBERING ====== */
function nextNumber(type) {
  const db = loadDB();
  const year = new Date().getFullYear();
  const prefix = type === "FAC" ? "FAC" : "COT";

  const docs = db.docs || [];
  const re = new RegExp(`^${prefix}-${year}-(\\d{4})$`);
  let max = 0;

  docs.forEach(d => {
    const m = (d.number || "").match(re);
    if (m) max = Math.max(max, Number(m[1]));
  });

  const next = String(max + 1).padStart(4, "0");
  return `${prefix}-${year}-${next}`;
}

/* ====== SAVE / LOAD / HISTORY ====== */
function saveCurrentToHistory({ forceNumber = false } = {}) {
  readDocHeaderIntoState();
  updateTotalsLive();

  const db = loadDB();

  if (forceNumber || !state.current.number) {
    state.current.number = nextNumber(state.current.type);
    $("docNumber").value = state.current.number;
  }

  state.current.updatedAt = new Date().toISOString();

  const idx = (db.docs || []).findIndex(d => d.id === state.activeDocId);
  if (idx >= 0) {
    db.docs[idx] = JSON.parse(JSON.stringify(state.current));
  } else {
    db.docs = db.docs || [];
    db.docs.unshift(JSON.parse(JSON.stringify(state.current)));
    state.activeDocId = state.current.id;
  }

  saveDB(db);
  refreshKPIs();
  renderHistory();
  renderReporting();
}

function loadDocFromHistory(id) {
  const db = loadDB();
  const doc = (db.docs || []).find(d => d.id === id);
  if (!doc) return;

  state.activeDocId = doc.id;
  state.current = JSON.parse(JSON.stringify(doc));

  bindDocHeader();
  renderItems();
  updateTotalsLive();

  setSub("confirm");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteDoc() {
  if (!state.activeDocId) return alert("No hay documento seleccionado.");
  if (!confirm("¿Borrar este documento del historial?")) return;

  const db = loadDB();
  db.docs = (db.docs || []).filter(d => d.id !== state.activeDocId);
  saveDB(db);

  state.activeDocId = null;
  state.current = newDoc();

  bindDocHeader();
  renderItems();
  updateTotalsLive();

  refreshKPIs();
  renderHistory();
  renderReporting();
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

function exportHistory() {
  const db = loadDB();
  const blob = new Blob([JSON.stringify(db.docs || [], null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `nexus_docs_${toISODate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function clearHistory() {
  if (!confirm("¿Vaciar historial completo?")) return;
  const db = loadDB();
  db.docs = [];
  saveDB(db);
  refreshKPIs();
  renderHistory();
  renderReporting();
}

/* ====== HISTORY UI ====== */
function renderHistory() {
  const body = $("histBody");
  if (!body) return;

  const db = loadDB();
  const q = (($("histSearch")?.value || "").trim().toLowerCase());
  body.innerHTML = "";

  let rows = db.docs || [];
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
    btnPdf.addEventListener("click", () => {
      loadDocFromHistory(d.id);
      confirmPDF();
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

/* ====== KPIs ====== */
function refreshKPIs() {
  const db = loadDB();
  if ($("kpiDocs")) $("kpiDocs").textContent = String((db.docs || []).length);

  const cfg = loadCfg();
  if ($("kpiTax")) $("kpiTax").textContent = `${Number(cfg.taxRate || 11.5).toFixed(2)}%`;

  if ($("kpiLastTotal")) $("kpiLastTotal").textContent = fmtMoney(state.current?.totals?.grand || 0);
}

/* ====== PDF ====== */
async function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function buildPdfDoc() {
  const { jsPDF } = window.jspdf;
  const cfg = loadCfg();
  const biz = cfg.biz || {};
  const taxRate = Number(cfg.taxRate || 11.5);

  readDocHeaderIntoState();
  updateTotalsLive();

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 42;

  doc.setDrawColor(220);
  doc.setLineWidth(1);
  doc.line(margin, 110, W - margin, 110);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(state.current.type === "FAC" ? "FACTURA" : "COTIZACIÓN", margin, 64);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`No.: ${state.current.number || "AUTO"}`, margin, 86);
  doc.text(`Fecha: ${state.current.date || ""}`, margin, 102);

  const rightX = W - margin;

  let textTopY = 52;
  if (biz.logoDataUrl) {
    try {
      const imgW = 54, imgH = 54;
      const imgX = W - margin - imgW;
      const imgY = 24;

      const isPng = String(biz.logoDataUrl).startsWith("data:image/png");
      doc.addImage(biz.logoDataUrl, isPng ? "PNG" : "JPEG", imgX, imgY, imgW, imgH);

      textTopY = imgY + imgH + 10;
    } catch {}
  }

  let topY = textTopY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(biz.name || "Empresa", rightX, topY, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  topY += 14;
  if (biz.addr) { doc.text(biz.addr, rightX, topY, { align: "right" }); topY += 12; }
  if (biz.phone) { doc.text(`Tel: ${biz.phone}`, rightX, topY, { align: "right" }); topY += 12; }
  if (biz.email) { doc.text(`Email: ${biz.email}`, rightX, topY, { align: "right" }); topY += 12; }

  const boxY = 132;
  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(230);
  doc.roundedRect(margin, boxY, W - 2 * margin, 74, 10, 10, "FD");

  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Cliente", margin + 14, boxY + 22);

  doc.setFont("helvetica", "normal");
  doc.text(state.current.client.name || "—", margin + 14, boxY + 38);
  doc.text(state.current.client.contact || "—", margin + 14, boxY + 52);
  doc.text(state.current.client.addr || "—", margin + 14, boxY + 66);

  doc.setFont("helvetica", "bold");
  doc.text("Válida hasta", W - margin - 160, boxY + 22);
  doc.setFont("helvetica", "normal");
  doc.text(state.current.validUntil || "—", W - margin - 160, boxY + 40);

  const items = state.current.items.map(it => {
    const qty = Number(it.qty || 0);
    const price = Number(it.price || 0);
    return [it.desc || "", String(qty), fmtMoney(price), fmtMoney(qty * price)];
  });

  doc.autoTable({
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

  const afterTableY = doc.lastAutoTable.finalY + 14;

  const totW = 220;
  const totX = W - margin - totW;
  const totY = afterTableY;

  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(230);
  doc.roundedRect(totX, totY, totW, 74, 10, 10, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Subtotal:", totX + 12, totY + 22);
  doc.text(fmtMoney(state.current.totals.sub), totX + totW - 12, totY + 22, { align: "right" });

  doc.text(`IVU (${taxRate.toFixed(2)}%):`, totX + 12, totY + 40);
  doc.text(fmtMoney(state.current.totals.tax), totX + totW - 12, totY + 40, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.text("TOTAL:", totX + 12, totY + 60);
  doc.text(fmtMoney(state.current.totals.grand), totX + totW - 12, totY + 60, { align: "right" });

  let textY = totY + 98;
  doc.setFont("helvetica", "bold");
  doc.text("Notas", margin, textY);
  doc.setFont("helvetica", "normal");
  doc.text((state.current.notes || "—").slice(0, 650), margin, textY + 14, { maxWidth: W - 2 * margin });

  textY += 70;
  doc.setFont("helvetica", "bold");
  doc.text("Condiciones", margin, textY);
  doc.setFont("helvetica", "normal");
  doc.text((state.current.terms || "—").slice(0, 650), margin, textY + 14, { maxWidth: W - 2 * margin });

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${biz.name || "Empresa"} · ${state.current.type === "FAC" ? "FACTURA" : "COTIZACIÓN"} ${state.current.number || ""}`,
    margin,
    H - 26
  );

  return doc;
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

function confirmPDF() {
  saveCurrentToHistory({ forceNumber: true });
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

/* ====== CUSTOMERS ====== */
function renderCustomers() {
  const db = loadDB();
  if ($("kpiCustomers")) $("kpiCustomers").textContent = String((db.customers || []).length);

  const q = (($("cSearch")?.value || "").trim().toLowerCase());
  const body = $("customersBody");
  if (!body) return;

  body.innerHTML = "";

  let rows = db.customers || [];
  if (q) {
    rows = rows.filter(c => {
      const s = `${c.name} ${c.contact} ${c.addr}`.toLowerCase();
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
    del.addEventListener("click", () => {
      if (!confirm("¿Borrar cliente?")) return;
      const db2 = loadDB();
      db2.customers = (db2.customers || []).filter(x => x.id !== c.id);
      saveDB(db2);
      renderCustomers();
    });

    wrap.appendChild(use);
    wrap.appendChild(del);
    td.appendChild(wrap);
    body.appendChild(tr);
  });
}

function addCustomer() {
  const name = ($("cName").value || "").trim();
  if (!name) return alert("Nombre requerido.");

  const db = loadDB();
  db.customers = db.customers || [];
  db.customers.unshift({
    id: uid("cus"),
    name,
    contact: ($("cContact").value || "").trim(),
    addr: ($("cAddr").value || "").trim(),
    note: ($("cNote").value || "").trim(),
    createdAt: new Date().toISOString()
  });
  saveDB(db);

  $("cName").value = "";
  $("cContact").value = "";
  $("cAddr").value = "";
  $("cNote").value = "";

  renderCustomers();
}

/* ====== VENDORS ====== */
function ensureVendorsUI() {
  const view = $("view-vendors");
  if (!view) return;

  // Si el HTML estaba en "En construcción", lo reemplaza por UI funcional
  if (!view.querySelector("#vendorsBody")) {
    view.innerHTML = `
      <div class="headerRow">
        <div class="titleBlock">
          <div class="h1">Vendors</div>
          <div class="muted">Suplidores: nombre, contacto, términos. (Local)</div>
        </div>
      </div>

      <section class="gridCards">
        <article class="card kpi kpi-a">
          <div class="kpiLabel">Vendors</div>
          <div class="kpiValue" id="kpiVendors">0</div>
          <div class="kpiHint">Local</div>
        </article>
        <article class="card kpi kpi-b">
          <div class="kpiLabel">Control</div>
          <div class="kpiValue">OK</div>
          <div class="kpiHint">Sin caos</div>
        </article>
        <article class="card kpi kpi-c">
          <div class="kpiLabel">Acción</div>
          <div class="kpiValue">Rápida</div>
          <div class="kpiHint">Guardar / Editar</div>
        </article>
      </section>

      <section class="card section">
        <div class="sectionHead">
          <div class="sectionTitle">Nuevo vendor</div>
          <div class="rowBtns">
            <button class="btn" id="btnAddVendor" type="button">Guardar</button>
          </div>
        </div>
        <div class="grid2">
          <div class="field"><label>Nombre</label><input class="input" id="vName"></div>
          <div class="field"><label>Tel/Email</label><input class="input" id="vContact"></div>
          <div class="field"><label>Términos</label><input class="input" id="vTerms" placeholder="30 días / COD / etc."></div>
          <div class="field"><label>Nota</label><input class="input" id="vNote"></div>
        </div>
      </section>

      <section class="card section">
        <div class="sectionHead">
          <div class="sectionTitle">Lista</div>
          <input class="input small" id="vSearch" placeholder="Buscar...">
        </div>
        <div class="tableWrap">
          <table class="histTable">
            <thead><tr><th>Nombre</th><th>Contacto</th><th>Términos</th><th>Acciones</th></tr></thead>
            <tbody id="vendorsBody"></tbody>
          </table>
        </div>
      </section>
    `;

    $("btnAddVendor").addEventListener("click", addVendor);
    $("vSearch").addEventListener("input", renderVendors);
  }
}

function renderVendors() {
  ensureVendorsUI();

  const db = loadDB();
  if ($("kpiVendors")) $("kpiVendors").textContent = String((db.vendors || []).length);

  const q = (($("vSearch")?.value || "").trim().toLowerCase());
  const body = $("vendorsBody");
  if (!body) return;

  body.innerHTML = "";

  let rows = db.vendors || [];
  if (q) {
    rows = rows.filter(v => {
      const s = `${v.name} ${v.contact} ${v.terms}`.toLowerCase();
      return s.includes(q);
    });
  }

  rows.forEach(v => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(v.name || "")}</td>
      <td>${escapeHtml(v.contact || "")}</td>
      <td>${escapeHtml(v.terms || "")}</td>
      <td></td>
    `;

    const td = tr.querySelector("td:last-child");
    const wrap = document.createElement("div");
    wrap.className = "aBtns";

    const edit = document.createElement("button");
    edit.className = "aBtn";
    edit.type = "button";
    edit.textContent = "Editar";
    edit.addEventListener("click", () => {
      const name = prompt("Nombre", v.name || "");
      if (name === null) return;

      const contact = prompt("Contacto", v.contact || "");
      if (contact === null) return;

      const terms = prompt("Términos", v.terms || "");
      if (terms === null) return;

      const db2 = loadDB();
      const idx = (db2.vendors || []).findIndex(x => x.id === v.id);
      if (idx >= 0) {
        db2.vendors[idx].name = name.trim();
        db2.vendors[idx].contact = (contact || "").trim();
        db2.vendors[idx].terms = (terms || "").trim();
        db2.vendors[idx].updatedAt = new Date().toISOString();
        saveDB(db2);
        renderVendors();
      }
    });

    const del = document.createElement("button");
    del.className = "aBtn";
    del.type = "button";
    del.textContent = "Borrar";
    del.addEventListener("click", () => {
      if (!confirm("¿Borrar vendor?")) return;
      const db2 = loadDB();
      db2.vendors = (db2.vendors || []).filter(x => x.id !== v.id);
      saveDB(db2);
      renderVendors();
    });

    wrap.appendChild(edit);
    wrap.appendChild(del);
    td.appendChild(wrap);
    body.appendChild(tr);
  });
}

function addVendor() {
  const name = ($("vName").value || "").trim();
  if (!name) return alert("Nombre requerido.");

  const db = loadDB();
  db.vendors = db.vendors || [];
  db.vendors.unshift({
    id: uid("ven"),
    name,
    contact: ($("vContact").value || "").trim(),
    terms: ($("vTerms").value || "").trim(),
    note: ($("vNote").value || "").trim(),
    createdAt: new Date().toISOString()
  });
  saveDB(db);

  $("vName").value = "";
  $("vContact").value = "";
  $("vTerms").value = "";
  $("vNote").value = "";

  renderVendors();
}

/* ====== REPORTING ====== */
function renderReporting() {
  const db = loadDB();
  const docs = db.docs || [];

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

/* ====== CONFIG MODAL ====== */
function openBiz() {
  const cfg = loadCfg();
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
  const cfg = loadCfg();
  cfg.biz = cfg.biz || {};
  cfg.biz.name = ($("bizName").value || "").trim();
  cfg.biz.phone = ($("bizPhone").value || "").trim();
  cfg.biz.email = ($("bizEmail").value || "").trim();
  cfg.biz.addr = ($("bizAddr").value || "").trim();
  cfg.taxRate = Number($("taxRate").value || 11.5);

  const file = $("bizLogo").files && $("bizLogo").files[0];
  if (file) cfg.biz.logoDataUrl = await fileToDataUrl(file);

  saveCfg(cfg);
  refreshKPIs();
  updateTotalsLive();
  alert("Empresa guardada ✅");
  closeBiz();
}

/* ====== INVOICING ====== */
function renderInvoicing() {
  if (!state.current) state.current = newDoc();
  bindDocHeader();
  renderItems();
  updateTotalsLive();
  renderHistory();
  refreshKPIs();
}

/* ====== EVENTS ====== */
function bindEvents() {
  $("mainTabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    setView(b.dataset.view);

    // si entra a vendors, renderiza vendors
    if (b.dataset.view === "vendors") renderVendors();
  });

  $("invoiceSubtabs").addEventListener("click", (e) => {
    const b = e.target.closest(".subtab");
    if (!b) return;
    setSub(b.dataset.sub);
  });

  $("btnNew").addEventListener("click", () => {
    state.activeDocId = null;
    state.current = newDoc();
    renderInvoicing();
    setSub("confirm");
  });

  $("btnSettings").addEventListener("click", openBiz);
  $("btnOpenConfig")?.addEventListener("click", openBiz);
  $("btnCloseBiz").addEventListener("click", closeBiz);
  $("btnSaveBiz").addEventListener("click", saveBiz);

  [
    "docType","docNumber","docDate","docStatus",
    "clientName","clientContact","clientAddr","validUntil",
    "notes","terms"
  ].forEach(id => {
    $(id).addEventListener("input", () => { readDocHeaderIntoState(); updateTotalsLive(); });
    $(id).addEventListener("change", () => { readDocHeaderIntoState(); updateTotalsLive(); });
  });

  $("btnAddItem").addEventListener("click", () => {
    state.current.items.push({ id: uid("it"), desc: "", qty: 1, price: 0 });
    renderItems();
    updateTotalsLive();
  });

  $("btnSaveDoc").addEventListener("click", () => {
    saveCurrentToHistory({ forceNumber: false });
    alert("Guardado ✅");
  });

  $("btnPDF").addEventListener("click", confirmPDF);

  $("btnDuplicate").addEventListener("click", duplicateDoc);
  $("btnDelete").addEventListener("click", deleteDoc);

  $("histSearch")?.addEventListener("input", renderHistory);
  $("btnExportHist")?.addEventListener("click", exportHistory);
  $("btnClearHist")?.addEventListener("click", clearHistory);

  $("btnRefreshPreview")?.addEventListener("click", makePreview);
  $("btnConfirmFromPreview")?.addEventListener("click", confirmPDF);

  $("btnAddCustomer")?.addEventListener("click", addCustomer);
  $("cSearch")?.addEventListener("input", renderCustomers);

  const hubBtn = $("hubBackBtn");
  if (hubBtn) hubBtn.href = HUB_URL;
}

/* ====== BOOT ====== */
function boot() {
  state.current = newDoc();
  bindEvents();
  setView("invoicing");
  setSub("confirm");
  renderReporting();
}

document.addEventListener("DOMContentLoaded", boot);
