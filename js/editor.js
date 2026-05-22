'use strict';

/* ══════════════════════════════════════════════
   EDITOR CONTROLLER
══════════════════════════════════════════════ */
const editor   = document.getElementById('editor');
const statusEl = document.getElementById('status');
let debounce = null;
let masterSrc     = '';
let editorSyncing = false;

function update(resetLayout) {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const src = editor.value.trim();
    if (!src) {
      document.getElementById('tables-layer').innerHTML = '';
      document.getElementById('edges-layer').innerHTML  = '';
      document.getElementById('fp-tree').innerHTML = '';
      masterSchema = null; currentSchema = null; activeTables.clear(); tablePositions = {};
      buildSchemaFilter(); syncCanvasEditor();
      statusEl.className = ''; statusEl.textContent = '—'; return;
    }
    try {
      const schema = parseDBML(src);
      render(schema, resetLayout);
      if (resetLayout && activeTables.size > 0) setTimeout(fitView, 60);
    } catch (err) {
      statusEl.className = 'err'; statusEl.textContent = '⚠ ' + err.message;
    }
  }, 350);
}

function saveMaster() {
  masterSrc = editor.value;
  update(false);
}

editor.addEventListener('input', () => { masterSrc = editor.value; });
editor.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveMaster(); }
});
document.getElementById('btn-save-master').addEventListener('click', saveMaster);

/* ── Canvas DBML generator ── */
function generateCanvasDBML() {
  if (!currentSchema || !currentSchema.tables.length) return '';
  let out = '';
  currentSchema.tables.forEach(t => {
    const tb = masterSchema.tables.find(x => x.name === t.name);
    if (!tb) return;
    const hidden = getEffectiveHidden(tb);
    const visCols = tb.columns.filter(c => !hidden.has(c.name));
    out += `Table ${t.name}`;
    if (tb.note) out += ` [note: '${tb.note}']`;
    out += ' {\n';
    visCols.forEach(c => {
      let line = `  ${c.name} ${c.type}`;
      const attrs = [];
      if (c.isPk) attrs.push('pk');
      if (c.isPt) attrs.push('note: "partition"');
      if (c.fk) attrs.push(`ref: > ${c.fk.table}.${c.fk.col}`);
      if (attrs.length) line += ` [${attrs.join(', ')}]`;
      out += line + '\n';
    });
    out += '}\n\n';
  });
  currentSchema.refs.forEach(r => {
    const k = `${r.from.table}.${r.from.col}→${r.to.table}.${r.to.col}`;
    if (!hiddenRefs.has(k))
      out += `Ref: ${r.from.table}.${r.from.col} ${r.type} ${r.to.table}.${r.to.col}\n`;
  });
  return out.trim();
}

function syncCanvasEditor() {
  const el = document.getElementById('canvas-editor');
  if (el) el.value = generateCanvasDBML();
}

function applyCanvasDBML() {
  const src = document.getElementById('canvas-editor').value.trim();
  if (!src || !masterSchema) return;
  try {
    const parsed = parseDBML(src);
    pushHistory();
    activeTables = new Set(
      parsed.tables.map(t => t.name).filter(n => masterSchema.tables.find(t => t.name === n))
    );
    parsed.tables.forEach(ct => {
      const mt = masterSchema.tables.find(t => t.name === ct.name);
      if (!mt) return;
      const visNames = new Set(ct.columns.map(c => c.name));
      const hiddenSet = new Set(mt.columns.filter(c => !visNames.has(c.name)).map(c => c.name));
      if (hiddenSet.size > 0) colHidden.set(ct.name, hiddenSet);
      else colHidden.delete(ct.name);
    });
    const canvasRefKeys = new Set();
    parsed.refs.forEach(r => canvasRefKeys.add(`${r.from.table}.${r.from.col}→${r.to.table}.${r.to.col}`));
    masterSchema.refs.forEach(r => {
      const k = `${r.from.table}.${r.from.col}→${r.to.table}.${r.to.col}`;
      if (!canvasRefKeys.has(k)) hiddenRefs.add(k);
      else hiddenRefs.delete(k);
    });
    renderActiveCanvas();
    saveToLocalStorage();
    showToast('Canvas đã cập nhật.');
  } catch (err) {
    showToast('⚠ ' + err.message);
  }
}

/* ── Tab switching ── */
document.getElementById('tab-master').addEventListener('click', () => {
  document.getElementById('tab-master').classList.add('active');
  document.getElementById('tab-canvas').classList.remove('active');
  document.getElementById('ed-master-pane').classList.remove('hidden');
  document.getElementById('ed-canvas-pane').classList.add('hidden');
});
document.getElementById('tab-canvas').addEventListener('click', () => {
  document.getElementById('tab-canvas').classList.add('active');
  document.getElementById('tab-master').classList.remove('active');
  document.getElementById('ed-canvas-pane').classList.remove('hidden');
  document.getElementById('ed-master-pane').classList.add('hidden');
  syncCanvasEditor();
});

document.getElementById('btn-apply-canvas').addEventListener('click', applyCanvasDBML);
document.getElementById('canvas-editor').addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); applyCanvasDBML(); }
});

document.getElementById('btn-editor').addEventListener('click', () => {
  const btn = document.getElementById('btn-editor');
  const edPanel = document.getElementById('editor-panel');
  const div = document.getElementById('divider');
  const isVisible = edPanel.style.display !== 'none';
  if (isVisible) {
    edPanel.style.display = 'none';
    div.style.display = 'none';
    btn.classList.remove('active');
  } else {
    edPanel.style.display = '';
    div.style.display = '';
    btn.classList.add('active');
  }
});

document.getElementById('btn-layout').addEventListener('click', () => {
  if (!masterSchema || activeTables.size === 0) return;
  const activeTbls = masterSchema.tables.filter(t => activeTables.has(t.name));
  const activeRefs = masterSchema.refs.filter(r => activeTables.has(r.from.table) && activeTables.has(r.to.table));
  const newPos = snapLayout(computeLayout(activeTbls, activeRefs));
  Object.assign(tablePositions, newPos);
  edgeCustomMid.clear();
  renderActiveCanvas();
  setTimeout(fitView, 60);
});

document.getElementById('btn-fit').addEventListener('click', fitView);
document.getElementById('btn-export').addEventListener('click', exportPNG);
document.getElementById('btn-clear').addEventListener('click', () => { editor.value = ''; update(true); });

document.getElementById('btn-copy-link').addEventListener('click', () => {
  if (!masterSchema) { showToast('Chưa có DBML để share.'); return; }
  const encoded = encodeState();
  const url = `${location.origin}${location.pathname}#state=${encoded}`;
  navigator.clipboard.writeText(url)
    .then(() => showToast('Link đã copy! Paste để chia sẻ.'))
    .catch(() => { prompt('Copy link bên dưới:', url); });
});
