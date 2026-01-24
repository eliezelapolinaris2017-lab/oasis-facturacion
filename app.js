/* =========================
   OASIS / NEXUS INVOICING — app.js (FULL) ✅ FIREBASE PRO
   - GitHub Pages friendly (ESM module)
   - Auth Google
   - Firestore: Docs + Customers + Vendors + Settings
   - Storage: Logo (URL) + cache DataURL para PDF
   - PDF (jsPDF + AutoTable)
   - FIX real: History NO se mostraba porque setSub() no activaba panel-history
   - NEW: Service Catalog (categorías/servicios) + Templates (Notas/Garantías/Condiciones)
     -> editable y reusable en Cotización + Factura (single source of truth)
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
function userBase(uid_) { return `users/${uid_}`; }
function colDocs(uid_) { return collection(db, `${userBase(uid_)}/docs`); }
function colCustomers(uid_) { return collection(db, `${userBase(uid_)}/customers`); }
function colVendors(uid_) { return collection(db, `${userBase(uid_)}/vendors`); }
function docSettings(uid_) { return doc(db, `${userBase(uid_)}/settings/main`); }

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
  cfg: null,

  // runtime cache
  catalogIndex: { catById: new Map(), svcById: new Map() }
};

/* =========================
   DEFAULTS (incluye Catálogo + Plantillas)
========================= */
function defaultCatalog() {
  // Catálogo inicial “enterprise-ready”: útil y editable
  return {
    categories: [
      {
        id: "cat_mant",
        name: "Mantenimiento",
        services: [
          {
            id: "svc_mant_res",
            name: "Mantenimiento Preventivo Mini Split (Residencial)",
            desc: "Servicio preventivo: limpieza, revisión eléctrica, drenajes, presión/temperatura, prueba operacional.",
            price: 55,
            notes: "Incluye 1 unidad. Precio puede variar por acceso/condición.",
            warranty: "Garantía de servicio: 30 días en mano de obra (no cubre mal uso, equipos intervenidos, ni fallas ajenas al servicio).",
            terms: "Depósito (si aplica) no reembolsable en caso de ausencia/no respuesta. 15 min de espera."
          }
        ]
      },
      {
        id: "cat_diag",
        name: "Diagnóstico",
        services: [
          {
            id: "svc_diag_bas",
            name: "Diagnóstico Técnico",
            desc: "Evaluación completa: lectura de códigos, verificación sensores, amperaje/voltaje, presiones (si aplica) y recomendación técnica.",
            price: 45,
            notes: "Diagnóstico no incluye reparación ni piezas.",
            warranty: "Garantía aplica solo a reparación realizada (si procede).",
            terms: "El diagnóstico se acredita a reparación el mismo día (si aplica)."
          }
        ]
      }
    ]
  };
}

function defaultTemplates() {
  return {
    notes: [
      { id: "nt_std", name: "Nota estándar", text: "Gracias por preferirnos. Trabajo realizado según inspección en sitio." },
      { id: "nt_dep", name: "Depósito requerido", text: "Depósito requerido para agendar. Se descuenta del servicio al completar." }
    ],
    warranties: [
      { id: "w_30", name: "Garantía 30 días", text: "Garantía de 30 días en mano de obra. No cubre mal uso, terceros, variaciones eléctricas o piezas no provistas." },
      { id: "w_90", name: "Garantía 90 días", text: "Garantía de 90 días en mano de obra. No cubre mal uso, terceros, variaciones eléctricas o piezas no provistas." }
    ],
    terms: [
      { id: "t_std", name: "Términos estándar", text: "Pago contra entrega. Cotización sujeta a disponibilidad de piezas. IVU aplicado según ley." },
      { id: "t_wait", name: "Política de espera", text: "Se esperan 15 minutos en la ubicación. De no responder, se cancela y puede aplicar cargo." }
    ]
  };
}

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
    taxRate: 11.5,

    // NEW
    catalog: defaultCatalog(),
    templates: defaultTemplates()
  };
}

function normalizeCfg(cfg) {
  const base = defaultCfg();
  const merged = { ...base, ...(cfg || {}) };
  merged.biz = { ...base.biz, ...(cfg?.biz || {}) };
  merged.catalog = cfg?.catalog?.categories ? cfg.catalog : base.catalog;
  merged.templates = cfg?.templates ? {
    notes: Array.isArray(cfg.templates.notes) ? cfg.templates.notes : base.templates.notes,
    warranties: Array.isArray(cfg.templates.warranties) ? cfg.templates.warranties : base.templates.warranties,
    terms: Array.isArray(cfg.templates.terms) ? cfg.templates.terms : base.templates.terms
  } : base.templates;

  // limpia mínimos
  merged.catalog.categories = (merged.catalog.categories || []).map(c => ({
    id: String(c.id || uid("cat")),
    name: String(c.name || "Categoría"),
    services: (c.services || []).map(s => ({
      id: String(s.id || uid("svc")),
      name: String(s.name || "Servicio"),
      desc: String(s.desc || ""),
      price: Number(s.price || 0),
      notes: String(s.notes || ""),
      warranty: String(s.warranty || ""),
      terms: String(s.terms || "")
    }))
  }));

  const fixTpl = (arr, fallback) =>
    (Array.isArray(arr) ? arr : fallback).map(x => ({
      id: String(x.id || uid("tpl")),
      name: String(x.name || "Plantilla"),
      text: String(x.text || "")
    }));

  merged.templates.notes = fixTpl(merged.templates.notes, base.templates.notes);
  merged.templates.warranties = fixTpl(merged.templates.warranties, base.templates.warranties);
  merged.templates.terms = fixTpl(merged.templates.terms, base.templates.terms);

  return merged;
}

function indexCatalog() {
  state.catalogIndex.catById = new Map();
  state.catalogIndex.svcById = new Map();

  const cats = state.cfg?.catalog?.categories || [];
  cats.forEach(c => {
    state.catalogIndex.catById.set(c.id, c);
    (c.services || []).forEach(s => state.catalogIndex.svcById.set(s.id, { ...s, _catId: c.id }));
  });
}

/* =========================
   DOC DEFAULT
========================= */
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
    items: [{ id: uid("it"), desc: "", qty: 1, price: 0, catId: "", svcId: "" }], // NEW: catId/svcId opcional
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

  ["btnSaveDoc","btnPDF","btnConfirmFromPreview","btnExportHist","btnClearHist","btnAddCustomer"]
    .forEach(id => { if ($(id)) $(id).disabled = !isOn; });

  // Catálogo/plantillas también requieren login (es data de la cuenta)
  ["btnOpenCatalog","btnSaveCatalog","btnAddCategory","btnDelCategory","btnAddService","btnDelService",
   "btnAddTplNotes","btnDelTplNotes","btnAddTplWarranty","btnDelTplWarranty","btnAddTplTerms","btnDelTplTerms"
  ].forEach(id => { if ($(id)) $(id).disabled = !isOn; });
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
  state.cfg = snap.exists() ? normalizeCfg(snap.data()) : normalizeCfg(defaultCfg());

  // Cache logo para PDF si aplica
  if (state.cfg?.biz?.logoUrl && !state.cfg.biz.logoDataUrl) {
    try {
      state.cfg.biz.logoDataUrl = await urlToDataUrl(state.cfg.biz.logoUrl);
    } catch { /* ignore */ }
  }

  indexCatalog();

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
  refreshTemplateUI();
}

async function saveSettingsToFirestore() {
  if (!state.user) return;
  const sref = docSettings(state.user.uid);

  const safeCfg = JSON.parse(JSON.stringify(normalizeCfg(state.cfg || defaultCfg())));
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
   TEMPLATE UI (Notas/Garantías/Condiciones) — inyectado
========================= */
function ensureTemplateUI() {
  const notesEl = $("notes");
  const termsEl = $("terms");
  if (!notesEl || !termsEl) return;
  if (document.getElementById("tplControls")) return;

  // Inserta controles arriba de Notas/Condiciones
  const grid2 = notesEl.closest(".grid2");
  if (!grid2) return;

  const bar = document.createElement("div");
  bar.id = "tplControls";
  bar.className = "card section";
  bar.style.marginTop = "12px";
  bar.innerHTML = `
    <div class="sectionHead">
      <div class="sectionTitle">Plantillas rápidas</div>
      <div class="rowBtns">
        <button class="btn ghost" id="btnOpenCatalog" type="button">Service Catalog</button>
      </div>
    </div>

    <div class="grid2">
      <div class="field">
        <label>Notas (plantilla)</label>
        <div class="rowBtns" style="gap:8px">
          <select class="input" id="tplNotesSelect"></select>
          <button class="btn ghost" id="btnApplyNotes" type="button">Insertar</button>
          <button class="btn ghost" id="btnReplaceNotes" type="button">Reemplazar</button>
        </div>
      </div>

      <div class="field">
        <label>Garantía (plantilla)</label>
        <div class="rowBtns" style="gap:8px">
          <select class="input" id="tplWarrantySelect"></select>
          <button class="btn ghost" id="btnApplyWarranty" type="button">Insertar</button>
          <button class="btn ghost" id="btnReplaceWarranty" type="button">Reemplazar</button>
        </div>
      </div>

      <div class="field">
        <label>Condiciones (plantilla)</label>
        <div class="rowBtns" style="gap:8px">
          <select class="input" id="tplTermsSelect"></select>
          <button class="btn ghost" id="btnApplyTerms" type="button">Insertar</button>
          <button class="btn ghost" id="btnReplaceTerms" type="button">Reemplazar</button>
        </div>
      </div>

      <div class="field">
        <label>Acciones</label>
        <div class="muted">Catálogo y plantillas se guardan en tu cuenta (Firestore settings).</div>
      </div>
    </div>
  `;

  // Insertarlo justo antes de la grid2 (Notas/Condiciones) para que se sienta nativo
  grid2.parentElement.insertBefore(bar, grid2);

  // Bind
  $("btnApplyNotes").addEventListener("click", () => applyTemplateTo("notes", "notes", { replace: false }));
  $("btnReplaceNotes").addEventListener("click", () => applyTemplateTo("notes", "notes", { replace: true }));

  $("btnApplyWarranty").addEventListener("click", () => applyTemplateTo("warranties", "notes", { replace: false }));
  $("btnReplaceWarranty").addEventListener("click", () => applyTemplateTo("warranties", "notes", { replace: true }));

  $("btnApplyTerms").addEventListener("click", () => applyTemplateTo("terms", "terms", { replace: false }));
  $("btnReplaceTerms").addEventListener("click", () => applyTemplateTo("terms", "terms", { replace: true }));

  // Catalog modal open
  $("btnOpenCatalog").addEventListener("click", openCatalogModal);

  refreshTemplateUI();
  refreshAuthUI();
}

function refreshTemplateUI() {
  const cfg = state.cfg || defaultCfg();
  const t = cfg.templates || defaultTemplates();

  const fill = (selId, arr) => {
    const sel = $(selId);
    if (!sel) return;
    sel.innerHTML = "";
    arr.forEach(x => {
      const o = document.createElement("option");
      o.value = x.id;
      o.textContent = x.name;
      sel.appendChild(o);
    });
  };

  fill("tplNotesSelect", t.notes || []);
  fill("tplWarrantySelect", t.warranties || []);
  fill("tplTermsSelect", t.terms || []);
}

function applyTemplateTo(kind, targetField, { replace }) {
  const cfg = state.cfg || defaultCfg();
  const tpl = cfg.templates?.[kind] || [];
  const selId = kind === "notes" ? "tplNotesSelect" : (kind === "warranties" ? "tplWarrantySelect" : "tplTermsSelect");
  const chosenId = $(selId)?.value;

  const found = tpl.find(x => x.id === chosenId);
  if (!found) return;

  const box = $(targetField);
  if (!box) return;

  const text = (found.text || "").trim();
  if (!text) return;

  if (replace || !box.value.trim()) {
    box.value = text;
  } else {
    box.value = (box.value.trim() + "\n\n" + text).trim();
  }

  // sync state
  readDocHeaderIntoState();
}

/* =========================
   SERVICE CATALOG MANAGER — modal inyectado (Configuration-grade)
========================= */
function ensureCatalogModal() {
  if (document.getElementById("catalogPanel")) return;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "catalogPanel";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modalCard">
      <div class="modalHead">
        <div>
          <div class="modalTitle">Service Catalog</div>
          <div class="modalHint">Categorías + servicios + plantillas. Una sola fuente de verdad.</div>
        </div>
        <button class="btn ghost" id="btnCloseCatalog" type="button">Cerrar</button>
      </div>

      <div class="modalBody">
        <section class="card section">
          <div class="sectionHead">
            <div class="sectionTitle">Categorías</div>
            <div class="rowBtns">
              <button class="btn ghost" id="btnAddCategory" type="button">+ Categoría</button>
              <button class="btn danger" id="btnDelCategory" type="button">Borrar categoría</button>
            </div>
          </div>

          <div class="grid2">
            <div class="field">
              <label>Seleccionar</label>
              <select class="input" id="catSelect"></select>
            </div>
            <div class="field">
              <label>Nombre de categoría</label>
              <input class="input" id="catName" placeholder="Ej. Mantenimiento" />
            </div>
          </div>
        </section>

        <section class="card section">
          <div class="sectionHead">
            <div class="sectionTitle">Servicios de la categoría</div>
            <div class="rowBtns">
              <button class="btn ghost" id="btnAddService" type="button">+ Servicio</button>
              <button class="btn danger" id="btnDelService" type="button">Borrar servicio</button>
            </div>
          </div>

          <div class="grid2">
            <div class="field">
              <label>Seleccionar servicio</label>
              <select class="input" id="svcSelect"></select>
            </div>
            <div class="field">
              <label>Nombre del servicio</label>
              <input class="input" id="svcName" placeholder="Ej. Diagnóstico Técnico" />
            </div>
            <div class="field">
              <label>Precio base</label>
              <input class="input" id="svcPrice" type="number" step="0.01" />
            </div>
            <div class="field">
              <label>Descripción (para Items)</label>
              <textarea class="input" id="svcDesc" rows="3"></textarea>
            </div>
            <div class="field">
              <label>Notas sugeridas</label>
              <textarea class="input" id="svcNotes" rows="3"></textarea>
            </div>
            <div class="field">
              <label>Garantía sugerida</label>
              <textarea class="input" id="svcWarranty" rows="3"></textarea>
            </div>
            <div class="field">
              <label>Condiciones sugeridas</label>
              <textarea class="input" id="svcTerms" rows="3"></textarea>
            </div>
          </div>
        </section>

        <section class="card section">
          <div class="sectionHead">
            <div class="sectionTitle">Plantillas (Notas / Garantías / Condiciones)</div>
          </div>

          <div class="grid2">
            <div class="field">
              <label>Notas</label>
              <div class="rowBtns" style="gap:8px">
                <select class="input" id="tplNotesMng"></select>
                <button class="btn ghost" id="btnAddTplNotes" type="button">+</button>
                <button class="btn danger" id="btnDelTplNotes" type="button">✕</button>
              </div>
              <input class="input" id="tplNotesName" placeholder="Nombre plantilla" style="margin-top:8px" />
              <textarea class="input" id="tplNotesText" rows="3" placeholder="Texto"></textarea>
            </div>

            <div class="field">
              <label>Garantías</label>
              <div class="rowBtns" style="gap:8px">
                <select class="input" id="tplWarrantyMng"></select>
                <button class="btn ghost" id="btnAddTplWarranty" type="button">+</button>
                <button class="btn danger" id="btnDelTplWarranty" type="button">✕</button>
              </div>
              <input class="input" id="tplWarrantyName" placeholder="Nombre plantilla" style="margin-top:8px" />
              <textarea class="input" id="tplWarrantyText" rows="3" placeholder="Texto"></textarea>
            </div>

            <div class="field">
              <label>Condiciones</label>
              <div class="rowBtns" style="gap:8px">
                <select class="input" id="tplTermsMng"></select>
                <button class="btn ghost" id="btnAddTplTerms" type="button">+</button>
                <button class="btn danger" id="btnDelTplTerms" type="button">✕</button>
              </div>
              <input class="input" id="tplTermsName" placeholder="Nombre plantilla" style="margin-top:8px" />
              <textarea class="input" id="tplTermsText" rows="3" placeholder="Texto"></textarea>
            </div>

            <div class="field">
              <label>Guardar cambios</label>
              <div class="rowBtns">
                <button class="btn" id="btnSaveCatalog" type="button">Guardar en Firestore</button>
              </div>
              <div class="hint">Esto actualiza tu catálogo y plantillas para toda la app.</div>
            </div>
          </div>
        </section>

      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // bind modal controls
  $("btnCloseCatalog").addEventListener("click", closeCatalogModal);
  $("btnAddCategory").addEventListener("click", addCategory);
  $("btnDelCategory").addEventListener("click", delCategory);
  $("btnAddService").addEventListener("click", addService);
  $("btnDelService").addEventListener("click", delService);
  $("btnSaveCatalog").addEventListener("click", saveCatalogAndTemplates);

  $("catSelect").addEventListener("change", () => loadCategoryToForm($("catSelect").value));
  $("catName").addEventListener("input", () => {
    const cat = getSelectedCategory();
    if (!cat) return;
    cat.name = $("catName").value;
    refreshCatalogSelects({ keepSelection: true });
  });

  $("svcSelect").addEventListener("change", () => loadServiceToForm($("svcSelect").value));
  ["svcName","svcPrice","svcDesc","svcNotes","svcWarranty","svcTerms"].forEach(id => {
    $(id).addEventListener("input", () => {
      const svc = getSelectedService();
      if (!svc) return;
      svc.name = ($("svcName").value || "").trim();
      svc.price = Number($("svcPrice").value || 0);
      svc.desc = ($("svcDesc").value || "");
      svc.notes = ($("svcNotes").value || "");
      svc.warranty = ($("svcWarranty").value || "");
      svc.terms = ($("svcTerms").value || "");
      refreshCatalogSelects({ keepSelection: true });
    });
  });

  // Templates management binds
  bindTemplateManager();

  refreshAuthUI();
}

function openCatalogModal() {
  ensureCatalogModal();
  if (!state.user) return alert("Necesitas login para editar el catálogo.");
  $("catalogPanel").style.display = "flex";
  refreshCatalogSelects({ keepSelection: false });
  refreshTemplateManagerUI();
  loadCategoryToForm($("catSelect").value);
  loadServiceToForm($("svcSelect").value);
}

function closeCatalogModal() {
  if ($("catalogPanel")) $("catalogPanel").style.display = "none";
}

function getSelectedCategory() {
  const cfg = state.cfg || defaultCfg();
  const catId = $("catSelect")?.value || "";
  return (cfg.catalog?.categories || []).find(c => c.id === catId) || null;
}

function getSelectedService() {
  const cat = getSelectedCategory();
  if (!cat) return null;
  const svcId = $("svcSelect")?.value || "";
  return (cat.services || []).find(s => s.id === svcId) || null;
}

function refreshCatalogSelects({ keepSelection } = { keepSelection: false }) {
  const cfg = state.cfg || defaultCfg();
  cfg.catalog = cfg.catalog || defaultCatalog();
  cfg.catalog.categories = cfg.catalog.categories || [];

  const prevCat = $("catSelect")?.value;
  const prevSvc = $("svcSelect")?.value;

  // Cats
  const catSelect = $("catSelect");
  if (catSelect) {
    catSelect.innerHTML = "";
    (cfg.catalog.categories || []).forEach(c => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      catSelect.appendChild(o);
    });
    if (keepSelection && prevCat && [...catSelect.options].some(o => o.value === prevCat)) catSelect.value = prevCat;
  }

  // Services
  const cat = getSelectedCategory() || cfg.catalog.categories[0] || null;
  const svcSelect = $("svcSelect");
  if (svcSelect) {
    svcSelect.innerHTML = "";
    (cat?.services || []).forEach(s => {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.name;
      svcSelect.appendChild(o);
    });
    if (keepSelection && prevSvc && [...svcSelect.options].some(o => o.value === prevSvc)) svcSelect.value = prevSvc;
  }

  // Re-index runtime
  state.cfg = normalizeCfg(cfg);
  indexCatalog();
  refreshTemplateUI();
}

function loadCategoryToForm(catId) {
  const cfg = state.cfg || defaultCfg();
  const cat = (cfg.catalog?.categories || []).find(c => c.id === catId) || cfg.catalog?.categories?.[0];
  if (!cat) return;

  $("catSelect").value = cat.id;
  $("catName").value = cat.name || "";

  // refresh svc list for this cat
  refreshCatalogSelects({ keepSelection: true });
  loadServiceToForm($("svcSelect").value);
}

function loadServiceToForm(svcId) {
  const cat = getSelectedCategory();
  if (!cat) return;

  const svc = (cat.services || []).find(s => s.id === svcId) || cat.services?.[0];
  if (!svc) {
    $("svcName").value = "";
    $("svcPrice").value = "0";
    $("svcDesc").value = "";
    $("svcNotes").value = "";
    $("svcWarranty").value = "";
    $("svcTerms").value = "";
    return;
  }

  $("svcSelect").value = svc.id;
  $("svcName").value = svc.name || "";
  $("svcPrice").value = String(Number(svc.price || 0));
  $("svcDesc").value = svc.desc || "";
  $("svcNotes").value = svc.notes || "";
  $("svcWarranty").value = svc.warranty || "";
  $("svcTerms").value = svc.terms || "";
}

function addCategory() {
  const cfg = state.cfg || defaultCfg();
  cfg.catalog = cfg.catalog || defaultCatalog();
  cfg.catalog.categories = cfg.catalog.categories || [];

  const id = uid("cat");
  cfg.catalog.categories.unshift({ id, name: "Nueva categoría", services: [] });
  state.cfg = normalizeCfg(cfg);
  refreshCatalogSelects({ keepSelection: false });
  loadCategoryToForm(id);
}

function delCategory() {
  const cfg = state.cfg || defaultCfg();
  const catId = $("catSelect")?.value;
  if (!catId) return;
  if (!confirm("¿Borrar esta categoría y todos sus servicios?")) return;

  cfg.catalog.categories = (cfg.catalog.categories || []).filter(c => c.id !== catId);
  state.cfg = normalizeCfg(cfg);
  refreshCatalogSelects({ keepSelection: false });
  loadCategoryToForm($("catSelect").value);
}

function addService() {
  const cfg = state.cfg || defaultCfg();
  const cat = getSelectedCategory();
  if (!cat) return;

  const id = uid("svc");
  cat.services = cat.services || [];
  cat.services.unshift({
    id,
    name: "Nuevo servicio",
    desc: "",
    price: 0,
    notes: "",
    warranty: "",
    terms: ""
  });

  state.cfg = normalizeCfg(cfg);
  refreshCatalogSelects({ keepSelection: true });
  $("svcSelect").value = id;
  loadServiceToForm(id);
}

function delService() {
  const cfg = state.cfg || defaultCfg();
  const cat = getSelectedCategory();
  if (!cat) return;
  const svcId = $("svcSelect")?.value;
  if (!svcId) return;
  if (!confirm("¿Borrar este servicio?")) return;

  cat.services = (cat.services || []).filter(s => s.id !== svcId);
  state.cfg = normalizeCfg(cfg);
  refreshCatalogSelects({ keepSelection: true });
  loadServiceToForm($("svcSelect").value);
}

async function saveCatalogAndTemplates() {
  if (!state.user) return alert("Login requerido.");
  try {
    state.cfg = normalizeCfg(state.cfg || defaultCfg());
    await saveSettingsToFirestore();
    indexCatalog();
    refreshTemplateUI();
    alert("Catálogo + plantillas guardados ✅");
  } catch (e) {
    console.error(e);
    alert("No se pudo guardar. Verifica reglas/permiso en Firestore.");
  }
}

/* =========================
   TEMPLATE MANAGER (dentro del Catalog modal)
========================= */
function bindTemplateManager() {
  // Notes
  $("tplNotesMng").addEventListener("change", () => loadTemplateToForm("notes"));
  $("tplNotesName").addEventListener("input", () => saveTemplateDraft("notes"));
  $("tplNotesText").addEventListener("input", () => saveTemplateDraft("notes"));
  $("btnAddTplNotes").addEventListener("click", () => addTemplate("notes"));
  $("btnDelTplNotes").addEventListener("click", () => delTemplate("notes"));

  // Warranty
  $("tplWarrantyMng").addEventListener("change", () => loadTemplateToForm("warranties"));
  $("tplWarrantyName").addEventListener("input", () => saveTemplateDraft("warranties"));
  $("tplWarrantyText").addEventListener("input", () => saveTemplateDraft("warranties"));
  $("btnAddTplWarranty").addEventListener("click", () => addTemplate("warranties"));
  $("btnDelTplWarranty").addEventListener("click", () => delTemplate("warranties"));

  // Terms
  $("tplTermsMng").addEventListener("change", () => loadTemplateToForm("terms"));
  $("tplTermsName").addEventListener("input", () => saveTemplateDraft("terms"));
  $("tplTermsText").addEventListener("input", () => saveTemplateDraft("terms"));
  $("btnAddTplTerms").addEventListener("click", () => addTemplate("terms"));
  $("btnDelTplTerms").addEventListener("click", () => delTemplate("terms"));
}

function refreshTemplateManagerUI() {
  const cfg = state.cfg || defaultCfg();
  const t = cfg.templates || defaultTemplates();

  const fill = (sel, arr) => {
    sel.innerHTML = "";
    arr.forEach(x => {
      const o = document.createElement("option");
      o.value = x.id;
      o.textContent = x.name;
      sel.appendChild(o);
    });
  };

  fill($("tplNotesMng"), t.notes || []);
  fill($("tplWarrantyMng"), t.warranties || []);
  fill($("tplTermsMng"), t.terms || []);

  loadTemplateToForm("notes");
  loadTemplateToForm("warranties");
  loadTemplateToForm("terms");
}

function loadTemplateToForm(kind) {
  const cfg = state.cfg || defaultCfg();
  cfg.templates = cfg.templates || defaultTemplates();

  const selId = kind === "notes" ? "tplNotesMng" : (kind === "warranties" ? "tplWarrantyMng" : "tplTermsMng");
  const nameId = kind === "notes" ? "tplNotesName" : (kind === "warranties" ? "tplWarrantyName" : "tplTermsName");
  const textId = kind === "notes" ? "tplNotesText" : (kind === "warranties" ? "tplWarrantyText" : "tplTermsText");

  const sel = $(selId);
  const arr = cfg.templates[kind] || [];
  const chosen = sel?.value || arr[0]?.id;

  const found = arr.find(x => x.id === chosen) || arr[0];
  if (!found) { $(nameId).value = ""; $(textId).value = ""; return; }

  sel.value = found.id;
  $(nameId).value = found.name || "";
  $(textId).value = found.text || "";
}

function saveTemplateDraft(kind) {
  const cfg = state.cfg || defaultCfg();
  cfg.templates = cfg.templates || defaultTemplates();

  const selId = kind === "notes" ? "tplNotesMng" : (kind === "warranties" ? "tplWarrantyMng" : "tplTermsMng");
  const nameId = kind === "notes" ? "tplNotesName" : (kind === "warranties" ? "tplWarrantyName" : "tplTermsName");
  const textId = kind === "notes" ? "tplNotesText" : (kind === "warranties" ? "tplWarrantyText" : "tplTermsText");

  const arr = cfg.templates[kind] || [];
  const id_ = $(selId)?.value;
  const found = arr.find(x => x.id === id_);
  if (!found) return;

  found.name = ($(nameId).value || "").trim() || "Plantilla";
  found.text = ($(textId).value || "");

  state.cfg = normalizeCfg(cfg);
  refreshTemplateUI();
  refreshTemplateManagerUI(); // mantiene nombres actualizados
}

function addTemplate(kind) {
  const cfg = state.cfg || defaultCfg();
  cfg.templates = cfg.templates || defaultTemplates();

  const id_ = uid("tpl");
  cfg.templates[kind] = cfg.templates[kind] || [];
  cfg.templates[kind].unshift({ id: id_, name: "Nueva plantilla", text: "" });

  state.cfg = normalizeCfg(cfg);
  refreshTemplateManagerUI();
  refreshTemplateUI();

  const selId = kind === "notes" ? "tplNotesMng" : (kind === "warranties" ? "tplWarrantyMng" : "tplTermsMng");
  $(selId).value = id_;
  loadTemplateToForm(kind);
}

function delTemplate(kind) {
  const cfg = state.cfg || defaultCfg();
  cfg.templates = cfg.templates || defaultTemplates();

  const selId = kind === "notes" ? "tplNotesMng" : (kind === "warranties" ? "tplWarrantyMng" : "tplTermsMng");
  const id_ = $(selId)?.value;
  if (!id_) return;
  if (!confirm("¿Borrar esta plantilla?")) return;

  cfg.templates[kind] = (cfg.templates[kind] || []).filter(x => x.id !== id_);
  state.cfg = normalizeCfg(cfg);
  refreshTemplateManagerUI();
  refreshTemplateUI();
}

/* =========================
   ITEMS RENDER (NOW: Category + Service + Description)
========================= */
function renderItems() {
  const wrap = $("items");
  wrap.innerHTML = "";

  const cfg = state.cfg || defaultCfg();
  const cats = cfg.catalog?.categories || [];

  state.current.items.forEach((it) => {
    const row = document.createElement("div");
    row.className = "tRow";
    row.dataset.itemId = it.id;

    // === Catalog selects (cat + service)
    const catSel = document.createElement("select");
    catSel.className = "input";
    const catEmpty = document.createElement("option");
    catEmpty.value = "";
    catEmpty.textContent = "Categoría (opcional)";
    catSel.appendChild(catEmpty);

    cats.forEach(c => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      catSel.appendChild(o);
    });

    // Persist selection
    it.catId = it.catId || "";
    catSel.value = it.catId;

    const svcSel = document.createElement("select");
    svcSel.className = "input";
    const svcEmpty = document.createElement("option");
    svcEmpty.value = "";
    svcEmpty.textContent = "Servicio (opcional)";
    svcSel.appendChild(svcEmpty);

    function fillServices(catId, keepSvc = false) {
      const prev = it.svcId || "";
      svcSel.innerHTML = "";
      svcSel.appendChild(svcEmpty.cloneNode(true));

      const cat = cats.find(x => x.id === catId);
      (cat?.services || []).forEach(s => {
        const o = document.createElement("option");
        o.value = s.id;
        o.textContent = s.name;
        svcSel.appendChild(o);
      });

      if (keepSvc && prev && [...svcSel.options].some(o => o.value === prev)) {
        svcSel.value = prev;
      } else {
        svcSel.value = it.svcId || "";
      }
    }

    fillServices(it.catId, true);

    // === Description input (manual override always allowed)
    const desc = document.createElement("input");
    desc.className = "input";
    desc.placeholder = "Descripción";
    desc.value = it.desc || "";
    desc.addEventListener("input", () => { it.desc = desc.value; });

    // When category changes
    catSel.addEventListener("change", () => {
      it.catId = catSel.value || "";
      // reset service if category changed
      it.svcId = "";
      fillServices(it.catId, false);
    });

    // When service selected: autofill desc + price + (opcional: sugerir notes/terms)
    svcSel.addEventListener("change", () => {
      it.svcId = svcSel.value || "";
      if (!it.svcId) return;

      const svc = state.catalogIndex.svcById.get(it.svcId);
      if (!svc) return;

      // autofill
      it.desc = svc.desc || svc.name || "";
      it.price = Number(svc.price || 0);

      desc.value = it.desc;
      price.value = String(it.price);

      // sugerencias “no intrusivas”: solo si notas/terms están vacías
      if ((!state.current.notes || !state.current.notes.trim()) && svc.notes) {
        state.current.notes = svc.notes;
        $("notes").value = svc.notes;
      }
      // garantía sugerida va a Notas (append) si vacío
      if (svc.warranty && (!state.current.notes || !state.current.notes.includes(svc.warranty))) {
        if (!state.current.notes.trim()) {
          state.current.notes = svc.warranty;
        } else {
          state.current.notes = (state.current.notes.trim() + "\n\n" + svc.warranty).trim();
        }
        $("notes").value = state.current.notes;
      }
      if ((!state.current.terms || !state.current.terms.trim()) && svc.terms) {
        state.current.terms = svc.terms;
        $("terms").value = svc.terms;
      }

      updateTotalsLive();
    });

    // === Qty/Price/Total
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
        state.current.items.push({ id: uid("it"), desc: "", qty: 1, price: 0, catId: "", svcId: "" });
      }
      renderItems();
      updateTotalsLive();
    });

    // Layout: Descripción column ahora será “Catalog + Desc”
    const descWrap = document.createElement("div");
    descWrap.style.display = "grid";
    descWrap.style.gap = "6px";
    descWrap.style.gridTemplateColumns = "1fr 1fr";
    descWrap.appendChild(catSel);
    descWrap.appendChild(svcSel);

    const descFull = document.createElement("div");
    descFull.style.gridColumn = "1 / -1";
    descFull.appendChild(desc);
    descWrap.appendChild(descFull);

    row.appendChild(descWrap);
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

  await loadAllFromFirestore();
  state.activeDocId = docId;
}

async function loadDocFromHistory(id) {
  const d = (state.docs || []).find(x => x.id === id);
  if (!d) return;

  state.activeDocId = d.id;
  state.current = JSON.parse(JSON.stringify(d));

  // compat: docs viejos sin catId/svcId
  state.current.items = (state.current.items || []).map(it => ({
    id: it.id || uid("it"),
    desc: it.desc || "",
    qty: Number(it.qty || 0) || 1,
    price: Number(it.price || 0),
    catId: it.catId || "",
    svcId: it.svcId || ""
  }));

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
  copy.items = (copy.items || []).map(it => ({
    ...it,
    id: uid("it"),
    catId: it.catId || "",
    svcId: it.svcId || ""
  }));

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

  docp.setDrawColor(220);
  docp.setLineWidth(1);
  docp.line(margin, 110, W - margin, 110);

  docp.setFont("helvetica", "bold");
  docp.setFontSize(20);
  docp.text(state.current.type === "FAC" ? "FACTURA" : "COTIZACIÓN", margin, 64);

  docp.setFont("helvetica", "normal");
  docp.setFontSize(10);
  docp.text(`No.: ${state.current.number || "AUTO"}`, margin, 86);
  docp.text(`Fecha: ${state.current.date || ""}`, margin, 102);

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

  const items = (state.current.items || []).map(it => {
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
  // placeholder — no tocamos tu Vendors.
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
    const path = `users/${state.user.uid}/logo_${Date.now()}_${file.name}`;
    const r = ref(storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);

    cfg.biz.logoUrl = url;

    try { cfg.biz.logoDataUrl = await fileToDataUrl(file); } catch {}
  }

  state.cfg = normalizeCfg(cfg);
  await saveSettingsToFirestore();

  indexCatalog();
  refreshKPIs();
  updateTotalsLive();
  refreshTemplateUI();
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
  ensureTemplateUI();
  ensureCatalogModal();
}

/* =========================
   EVENTS
========================= */
function bindEvents() {
  $("mainTabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    setView(b.dataset.view);
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
    $(id).addEventListener("input", () => {
      readDocHeaderIntoState();
      updateTotalsLive();
    });
    $(id).addEventListener("change", () => {
      readDocHeaderIntoState();
      updateTotalsLive();
    });
  });

  $("btnAddItem").addEventListener("click", () => {
    state.current.items.push({ id: uid("it"), desc: "", qty: 1, price: 0, catId: "", svcId: "" });
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

  $("histSearch").addEventListener("input", renderHistory);
  $("btnExportHist").addEventListener("click", () => {
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

    for (const d of (state.docs || [])) {
      await deleteDoc(doc(db, `${userBase(state.user.uid)}/docs/${d.id}`));
    }
    await loadAllFromFirestore();
  });

  $("btnRefreshPreview").addEventListener("click", makePreview);
  $("btnConfirmFromPreview").addEventListener("click", confirmPDF);

  $("btnAddCustomer").addEventListener("click", addCustomer);
  $("cSearch").addEventListener("input", renderCustomers);

  const hubBtn = $("hubBackBtn");
  if (hubBtn) hubBtn.href = HUB_URL;
}

/* =========================
   BOOT
========================= */
function boot() {
  ensureAuthButtons();
  ensureCatalogModal();
  ensureTemplateUI();
  bindEvents();

  state.cfg = normalizeCfg(defaultCfg());
  indexCatalog();

  state.current = newDoc();
  setView("invoicing");
  setSub("confirm");

  onAuthStateChanged(auth, async (user) => {
    state.user = user || null;
    refreshAuthUI();

    if (state.user) {
      await loadAllFromFirestore();
      if (!state.cfg) state.cfg = normalizeCfg(defaultCfg());
    } else {
      state.cfg = normalizeCfg(defaultCfg());
      indexCatalog();
      state.docs = [];
      state.customers = [];
      state.vendors = [];
      refreshKPIs();
      renderHistory();
      renderCustomers();
      renderReporting();
      refreshTemplateUI();
    }

    state.current.taxRate = Number(state.cfg.taxRate || 11.5);
    updateTotalsLive();
    renderItems();
  });
}

document.addEventListener("DOMContentLoaded", boot);
