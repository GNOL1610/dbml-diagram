'use strict';

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
let masterSchema    = null;
let currentSchema   = null;
let activeTables    = new Set();
let colHidden       = new Map();   // tableName → Set<colName>
let hiddenRefs      = new Set();   // edgeKeys hidden from canvas (canvas-only, not master)
let tablePositions  = {};
let focusMode       = null;
let edgeCustomMid   = new Map();
let selectedEdge    = null;
let edgeDragState   = null;
let drawMode        = null;
let drawType        = '>';
let cardPickerState = null;

// Library panel UI state (session only)
let databaseCollapsed = new Set();  // collapsed database groups
let schemaCollapsed  = new Set();   // collapsed schema groups
let tableColExpanded = new Set();   // tables with column list open
let hiddenSchemas    = new Set();   // schemas hidden from library panel

// Fullscreen
let fullscreenMode       = false;
let _filterWasVisible    = false;

// Undo history
const undoStack = [];
const MAX_UNDO  = 50;

function pushHistory() {
  const snap = {
    active: [...activeTables],
    colHidden: {},
    pos: JSON.parse(JSON.stringify(tablePositions)),
    mid: [...edgeCustomMid],
    hiddenRefs: [...hiddenRefs]
  };
  colHidden.forEach((cols, tbl) => { snap.colHidden[tbl] = [...cols]; });
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  const btn = document.getElementById('tb-undo');
  if (btn) btn.disabled = false;
}

function undo() {
  if (!undoStack.length) return;
  const snap = undoStack.pop();
  activeTables = new Set(snap.active);
  colHidden.clear();
  Object.entries(snap.colHidden).forEach(([t, cols]) => colHidden.set(t, new Set(cols)));
  tablePositions = snap.pos;
  edgeCustomMid  = new Map(snap.mid);
  hiddenRefs     = new Set(snap.hiddenRefs);
  selectedEdge   = null;
  renderActiveCanvas();
  saveToLocalStorage();
  const btn = document.getElementById('tb-undo');
  if (btn) btn.disabled = undoStack.length === 0;
  updateActionBtns();
}

/* ══════════════════════════════════════════════
   STATE PERSISTENCE
══════════════════════════════════════════════ */
const LS_KEY = 'dbml-diagram-v5';

function encodeState() {
  const colHiddenObj = {};
  colHidden.forEach((cols, tbl) => { if (cols.size > 0) colHiddenObj[tbl] = [...cols]; });
  const obj = { src: masterSrc, pos: tablePositions, mid: [...edgeCustomMid], active: [...activeTables], colHidden: colHiddenObj, hiddenRefs: [...hiddenRefs] };
  return LZString.compressToEncodedURIComponent(JSON.stringify(obj));
}

function decodeState(encoded) {
  try {
    const obj = JSON.parse(LZString.decompressFromEncodedURIComponent(encoded));
    return (obj && typeof obj.src === 'string') ? obj : null;
  } catch { return null; }
}

function saveToLocalStorage() {
  try {
    if (typeof saveCurrentSlot === 'function') { saveCurrentSlot(); return; }
    // Fallback (before slots.js loads)
    const colHiddenObj = {};
    colHidden.forEach((cols, tbl) => { if (cols.size > 0) colHiddenObj[tbl] = [...cols]; });
    localStorage.setItem(LS_KEY, JSON.stringify({
      src: masterSrc, pos: tablePositions, mid: [...edgeCustomMid],
      active: [...activeTables], colHidden: colHiddenObj, hiddenRefs: [...hiddenRefs]
    }));
  } catch {}
}

function loadSavedState() {
  if (location.hash.startsWith('#state=')) {
    const state = decodeState(location.hash.slice(7));
    if (state) {
      history.replaceState(null, '', location.pathname + location.search);
      return state;
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const obj = JSON.parse(raw); if (obj && typeof obj.src === 'string') return obj; }
  } catch {}
  return null;
}

function showToast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

function render(schema, resetLayout) {
  masterSchema = schema;
  for (const name of [...activeTables]) {
    if (!schema.tables.find(t => t.name === name)) activeTables.delete(name);
  }
  if (resetLayout && activeTables.size > 0) {
    const activeTbls = schema.tables.filter(t => activeTables.has(t.name));
    const activeRefs = schema.refs.filter(r => activeTables.has(r.from.table) && activeTables.has(r.to.table));
    const newPos = snapLayout(computeLayout(activeTbls, activeRefs));
    Object.assign(tablePositions, newPos);
    edgeCustomMid.clear();
    selectedEdge = null;
  }
  buildSchemaFilter();
  renderActiveCanvas();
}

/* ══════════════════════════════════════════════
   SCHEMA FILTER — checkboxes per schema
══════════════════════════════════════════════ */
function buildSchemaFilter() {
  const section   = document.getElementById('fp-schema-filter');
  const container = document.getElementById('fp-schema-checks');
  if (!masterSchema) { section.style.display = 'none'; return; }

  const schemas = [...new Set(masterSchema.tables.map(t => t.schema))].filter(s => s !== '');
  if (schemas.length < 2) { section.style.display = 'none'; return; }

  // Remove stale hidden schemas
  for (const s of [...hiddenSchemas]) {
    if (!schemas.includes(s)) hiddenSchemas.delete(s);
  }

  section.style.display = '';
  container.innerHTML = schemas.map(s => {
    const checked = !hiddenSchemas.has(s);
    return `<label class="fp-check" style="flex-direction:row;gap:5px;margin-bottom:0">
      <input type="checkbox" class="schema-filter-cb" data-schema="${esc(s)}" ${checked ? 'checked' : ''}>
      <span style="font-size:11px">${esc(s)}</span>
    </label>`;
  }).join('');

  container.querySelectorAll('.schema-filter-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const s = cb.dataset.schema;
      if (cb.checked) hiddenSchemas.delete(s);
      else hiddenSchemas.add(s);
      buildLibraryPanel();
    });
  });
}
