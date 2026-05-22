'use strict';

/* ══════════════════════════════════════════════
   DRAG
══════════════════════════════════════════════ */
let dragState = null;
const tablesLayer = document.getElementById('tables-layer');

tablesLayer.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (e.target.classList.contains('tbl-remove')) return;
  const group = e.target.closest('.tbl-group');
  if (!group) return;
  e.stopPropagation(); e.preventDefault();
  const isCol = e.target.classList.contains('col-hit');
  const isHdr = e.target.classList.contains('tbl-hdr-hit');
  const pt    = toSVGCoords(e.clientX, e.clientY);
  const tr    = (group.getAttribute('transform') || '').match(/translate\(([^,]+),([^)]+)\)/);
  dragState = {
    group,
    ox: pt.x - (tr ? parseFloat(tr[1]) : 0),
    oy: pt.y - (tr ? parseFloat(tr[2]) : 0),
    startX: e.clientX, startY: e.clientY,
    moved: false, isCol, isHdr,
    colTable: e.target.dataset.table, colName: e.target.dataset.col,
  };
  group.style.opacity = '0.92';
});

document.addEventListener('mousemove', e => {
  if (!dragState) return;
  if (Math.abs(e.clientX - dragState.startX) > 3 || Math.abs(e.clientY - dragState.startY) > 3)
    dragState.moved = true;
  if (!dragState.moved) return;
  const pt = toSVGCoords(e.clientX, e.clientY);
  const x = pt.x - dragState.ox, y = pt.y - dragState.oy;
  dragState.group.setAttribute('transform', `translate(${x},${y})`);
  tablePositions[dragState.group.dataset.name] = { x, y };
  renderEdges();
});

document.addEventListener('mouseup', () => {
  if (!dragState) return;
  dragState.group.style.opacity = '';
  if (!dragState.moved) {
    if (drawMode) {
      if (dragState.isHdr && dragState.colTable) {
        handleDrawTableClick(dragState.colTable);
      } else if (dragState.isCol && dragState.colName) {
        handleDrawClick(dragState.colTable, dragState.colName);
      }
    } else if (dragState.isCol && dragState.colName) {
      const same = focusMode && focusMode.type === 'col' &&
                   focusMode.table === dragState.colTable && focusMode.col === dragState.colName;
      if (same) {
        clearFocus();
        hideJoinSuggest();
      } else {
        setColumnFocus(dragState.colTable, dragState.colName);
        showJoinSuggest(dragState.colTable, dragState.colName);
      }
    } else {
      hideJoinSuggest();
      const name = dragState.group.dataset.name;
      const same = focusMode && focusMode.type === 'table' && focusMode.name === name;
      same ? clearFocus() : setTableFocus(name);
    }
  } else {
    const name = dragState.group.dataset.name;
    const snapped = findFreeCell(tablePositions[name].x, tablePositions[name].y, name);
    dragState.group.setAttribute('transform', `translate(${snapped.x},${snapped.y})`);
    tablePositions[name] = snapped;
    renderEdges();
    saveToLocalStorage();
    syncDBMLOrder();
  }
  dragState = null;
});

/* ══════════════════════════════════════════════
   EDGE INTERACTION
══════════════════════════════════════════════ */
document.getElementById('edges-layer').addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const handle = e.target.closest('.edge-handle');
  if (!handle) return;
  e.stopPropagation(); e.preventDefault();
  edgeDragState = { key: handle.dataset.edgeKey };
});

document.addEventListener('mousemove', e => {
  if (!edgeDragState) return;
  const pt = toSVGCoords(e.clientX, e.clientY);
  edgeCustomMid.set(edgeDragState.key, pt.x);
  renderEdges();
});

document.addEventListener('mouseup', () => { if (edgeDragState) edgeDragState = null; });

document.getElementById('edges-layer').addEventListener('click', e => {
  const cap = e.target.closest('.edge-cap');
  if (cap) {
    if (drawMode) return;
    e.stopPropagation();
    const key  = cap.dataset.edgeKey;
    const side = cap.dataset.side;
    if (!currentSchema) return;
    const ref = currentSchema.refs.find(r =>
      `${r.from.table}.${r.from.col}→${r.to.table}.${r.to.col}` === key
    );
    if (!ref) return;
    const { fromCard, toCard } = opToCards(ref.type);
    let px = e.clientX + 8, py = e.clientY + 8;
    if (px + 190 > window.innerWidth)  px = e.clientX - 192;
    if (py + 170 > window.innerHeight) py = e.clientY - 172;
    showCardPicker(key, side, fromCard, toCard, px, py);
    return;
  }
  if (drawMode) return;
  if (e.target.closest('.edge-handle')) return;
  const edgeG = e.target.closest('.edge-g');
  if (!edgeG) { selectedEdge = null; updateActionBtns(); return; }
  const key = edgeG.dataset.edgeKey;
  selectedEdge = (selectedEdge === key) ? null : key;
  updateActionBtns();
  renderEdges();
});

/* ══════════════════════════════════════════════
   PAN / ZOOM
══════════════════════════════════════════════ */
let vt = { x: 40, y: 40, s: 1 };

function applyVT() {
  document.getElementById('viewport').setAttribute('transform', `translate(${vt.x},${vt.y}) scale(${vt.s})`);
}
function toSVGCoords(cx, cy) {
  const vp  = document.getElementById('viewport');
  const ctm = vp.getScreenCTM();
  if (!ctm) return { x: cx, y: cy };
  const pt = document.getElementById('diagram').createSVGPoint();
  pt.x = cx; pt.y = cy;
  return pt.matrixTransform(ctm.inverse());
}

function toScreenCoords(svgX, svgY) {
  const vp  = document.getElementById('viewport');
  const ctm = vp.getScreenCTM();
  if (!ctm) return { x: svgX, y: svgY };
  const pt = document.getElementById('diagram').createSVGPoint();
  pt.x = svgX; pt.y = svgY;
  const sp = pt.matrixTransform(ctm);
  return { x: sp.x, y: sp.y };
}

const svgEl = document.getElementById('diagram');
svgEl.addEventListener('wheel', e => {
  e.preventDefault();
  const f = e.deltaY < 0 ? 1.12 : 1/1.12;
  const rect = svgEl.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  vt.x = mx - (mx - vt.x) * f; vt.y = my - (my - vt.y) * f;
  vt.s = Math.max(0.1, Math.min(4, vt.s * f));
  applyVT();
}, { passive: false });

let panState = null;
svgEl.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (e.target.closest('.tbl-group') || e.target.closest('.edge-handle')) return;
  panState = { sx: e.clientX - vt.x, sy: e.clientY - vt.y };
  svgEl.classList.add('grabbing'); e.preventDefault();
});
document.addEventListener('mousemove', e => {
  if (!panState) return;
  vt.x = e.clientX - panState.sx; vt.y = e.clientY - panState.sy; applyVT();
});
document.addEventListener('mouseup', () => { if (panState) { panState = null; svgEl.classList.remove('grabbing'); } });
document.getElementById('svg-bg').addEventListener('click', clearFocus);

/* ══════════════════════════════════════════════
   FIT VIEW
══════════════════════════════════════════════ */
function fitView() {
  if (!currentSchema || !currentSchema.tables.length) return;
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  currentSchema.tables.forEach(t => {
    const p = tablePositions[t.name]; if (!p) return;
    const h = HDR_H + t.columns.length * ROW_H + PAD_B;
    mnX = Math.min(mnX, p.x); mnY = Math.min(mnY, p.y);
    mxX = Math.max(mxX, p.x + TBL_W); mxY = Math.max(mxY, p.y + h);
  });
  const PAD = 60, rect = svgEl.getBoundingClientRect();
  const s = Math.min(rect.width / (mxX - mnX + PAD*2), rect.height / (mxY - mnY + PAD*2), 1.2);
  vt.s = s;
  vt.x = (rect.width  - (mxX - mnX) * s) / 2 - mnX * s;
  vt.y = (rect.height - (mxY - mnY) * s) / 2 - mnY * s;
  applyVT();
}

/* ══════════════════════════════════════════════
   EXPORT PNG
══════════════════════════════════════════════ */
function exportPNG() {
  const svg  = document.getElementById('diagram');
  const rect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    const DPR = 2, canvas = document.createElement('canvas');
    canvas.width = rect.width * DPR; canvas.height = rect.height * DPR;
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR); ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.drawImage(img, 0, 0, rect.width, rect.height);
    const a = document.createElement('a'); a.download = 'diagram.png';
    a.href = canvas.toDataURL('image/png'); a.click(); URL.revokeObjectURL(url);
  };
  img.src = url;
}

/* ══════════════════════════════════════════════
   TOOLTIP
══════════════════════════════════════════════ */
const tooltip = document.getElementById('tooltip');
svgEl.addEventListener('mousemove', e => {
  const el = e.target.closest('[data-tip]');
  if (!el) { tooltip.style.display = 'none'; return; }
  tooltip.textContent = el.dataset.tip;
  tooltip.style.display = 'block';
  tooltip.style.left = (e.clientX + 14) + 'px';
  tooltip.style.top  = (e.clientY - 6)  + 'px';
});
svgEl.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

/* ══════════════════════════════════════════════
   PANEL RESIZE
══════════════════════════════════════════════ */
const divider    = document.getElementById('divider');
const editorPane = document.getElementById('editor-panel');
let resizing = false;
divider.addEventListener('mousedown', e => { resizing = true; divider.classList.add('active'); e.preventDefault(); });
document.addEventListener('mousemove', e => {
  if (!resizing) return;
  const fp  = document.getElementById('filter-panel');
  const fpW = fp.classList.contains('hidden') ? 0 : 250;
  editorPane.style.width = Math.max(160, Math.min(600, e.clientX - fpW)) + 'px';
});
document.addEventListener('mouseup', () => { if (resizing) { resizing = false; divider.classList.remove('active'); } });

/* ══════════════════════════════════════════════
   LIBRARY PANEL CONTROLS
══════════════════════════════════════════════ */
const tbMenu = document.getElementById('tb-menu');
document.getElementById('btn-toolbar-menu').addEventListener('click', e => {
  tbMenu.classList.toggle('hidden');
  e.stopPropagation();
});
document.addEventListener('click', e => {
  if (!e.target.closest('.tb-dropdown-wrap')) tbMenu.classList.add('hidden');
  if (!e.target.closest('#draw-wrap')) document.getElementById('draw-type-panel').classList.add('hidden');
  if (!e.target.closest('#card-picker') && !e.target.closest('.edge-cap')) hideCardPicker();
  if (!e.target.closest('#join-suggest-panel') && !e.target.closest('.col-hit')) hideJoinSuggest();
});

function toggleFullscreen() {
  fullscreenMode = !fullscreenMode;
  const fp  = document.getElementById('filter-panel');
  const btn = document.getElementById('tb-fullscreen');
  if (fullscreenMode) {
    _filterWasVisible = !fp.classList.contains('hidden');
    fp.classList.add('hidden');
    document.getElementById('btn-filter').classList.remove('active');
    editorPane.style.display = 'none';
    divider.style.display = 'none';
    btn.classList.add('active');
    btn.textContent = '⤡ Thu nhỏ';
  } else {
    if (_filterWasVisible) {
      fp.classList.remove('hidden');
      document.getElementById('btn-filter').classList.add('active');
    }
    editorPane.style.display = '';
    divider.style.display = '';
    btn.classList.remove('active');
    btn.textContent = '⤢ Full màn hình';
  }
  tbMenu.classList.add('hidden');
}
document.getElementById('tb-fullscreen').addEventListener('click', toggleFullscreen);

document.getElementById('btn-filter').addEventListener('click', () => {
  const fp = document.getElementById('filter-panel');
  fp.classList.toggle('hidden');
  document.getElementById('btn-filter').classList.toggle('active');
  if (fullscreenMode && !fp.classList.contains('hidden')) {
    fullscreenMode = false;
    editorPane.style.display = '';
    divider.style.display = '';
    document.getElementById('tb-fullscreen').classList.remove('active');
    document.getElementById('tb-fullscreen').textContent = '⤢ Full màn hình';
  }
});

document.getElementById('tb-undo').addEventListener('click', () => { undo(); tbMenu.classList.add('hidden'); });

function updateDeleteBtn() {
  const btn = document.getElementById('tb-delete-edge');
  if (btn) btn.disabled = !selectedEdge;
}

function updateActionBtns() {
  updateDeleteBtn();
  const hasSelection = !!selectedEdge || !!(focusMode && focusMode.type === 'table');
  const delBtn = document.getElementById('btn-delete-selected');
  if (delBtn) {
    delBtn.disabled = !hasSelection;
    if (selectedEdge) delBtn.title = 'Xóa mũi tên đang chọn (ESC)';
    else if (focusMode && focusMode.type === 'table') delBtn.title = `Xóa bảng "${focusMode.name}" khỏi canvas (ESC)`;
    else delBtn.title = 'Xóa bảng/mũi tên đang chọn (ESC)';
  }
}

function deleteSelected() {
  if (selectedEdge) {
    pushHistory();
    hiddenRefs.add(selectedEdge);
    selectedEdge = null;
    updateActionBtns();
    renderActiveCanvas();
    saveToLocalStorage();
  } else if (focusMode && focusMode.type === 'table') {
    const name = focusMode.name;
    clearFocus();
    removeTableFromCanvas(name);
  }
}

/* ══════════════════════════════════════════════
   CARDINALITY PICKER
══════════════════════════════════════════════ */
function cardsToOp(fromCard, toCard) {
  const m = {
    'many/one':            '>',
    'one/many':            '<',
    'one/one':             '-',
    'many/zero-many':      '>0',
    'zero-many/one':       '0<',
    'zero-one/many':       '0>',
    'many/zero-one':       '>?',
    'zero-one/one':        '?<',
    'zero-many/zero-many': '<>',
  };
  return m[`${fromCard}/${toCard}`] || '>';
}

function updateRefTypeInMaster(edgeKey, newOp) {
  const arrow = edgeKey.indexOf('→');
  if (arrow === -1) return false;
  const fromStr = edgeKey.slice(0, arrow);
  const toStr   = edgeKey.slice(arrow + 1);
  const escRe   = s => s.replace(/\./g, '\\.').replace(/[+*?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(\\bRef\\b[^:]*:\\s*${escRe(fromStr)}\\s+)([<>|0?-]+)(\\s+${escRe(toStr)})`, 'm'
  );
  const newSrc = masterSrc.replace(re, `$1${newOp}$3`);
  if (newSrc === masterSrc) return false;
  masterSrc = newSrc;
  document.getElementById('editor').value = masterSrc;
  update(false);
  return true;
}

function showCardPicker(edgeKey, side, currentFromCard, currentToCard, px, py) {
  cardPickerState = { edgeKey, side, currentFromCard, currentToCard };
  const currentCard = side === 'from' ? currentFromCard : currentToCard;
  const picker = document.getElementById('card-picker');
  picker.querySelectorAll('.cp-btn').forEach(btn => {
    btn.classList.toggle('current', btn.dataset.card === currentCard);
  });
  picker.style.left = px + 'px';
  picker.style.top  = py + 'px';
  picker.classList.remove('hidden');
}

function hideCardPicker() {
  document.getElementById('card-picker').classList.add('hidden');
  cardPickerState = null;
}

document.getElementById('card-picker').addEventListener('click', e => {
  const btn = e.target.closest('.cp-btn');
  if (!btn || !cardPickerState) return;
  const newCard = btn.dataset.card;
  const { edgeKey, side, currentFromCard, currentToCard } = cardPickerState;
  const newFromCard = side === 'from' ? newCard : currentFromCard;
  const newToCard   = side === 'to'   ? newCard : currentToCard;
  const newOp = cardsToOp(newFromCard, newToCard);
  hideCardPicker();
  if (!updateRefTypeInMaster(edgeKey, newOp))
    showToast('Ref này khai báo inline (ref: trong cột) — thêm standalone Ref: để đổi loại.');
  else showToast('Đã cập nhật kiểu quan hệ.');
});

document.getElementById('tb-delete-edge').addEventListener('click', () => {
  if (!selectedEdge) return;
  pushHistory();
  hiddenRefs.add(selectedEdge);
  selectedEdge = null;
  updateActionBtns();
  renderActiveCanvas();
  saveToLocalStorage();
  tbMenu.classList.add('hidden');
});

document.getElementById('btn-delete-selected').addEventListener('click', deleteSelected);

document.getElementById('btn-add-all').addEventListener('click', () => {
  if (!masterSchema) return;
  masterSchema.tables.forEach(t => activeTables.add(t.name));
  const newPos = snapLayout(computeLayout(masterSchema.tables, masterSchema.refs));
  Object.assign(tablePositions, newPos);
  edgeCustomMid.clear();
  renderActiveCanvas();
  saveToLocalStorage();
  setTimeout(fitView, 60);
});

document.getElementById('btn-clear-canvas').addEventListener('click', () => {
  activeTables.clear();
  renderActiveCanvas();
  saveToLocalStorage();
});

document.getElementById('fp-search').addEventListener('input', buildLibraryPanel);
['fp-hidepk','fp-hidefk','fp-hidept'].forEach(id =>
  document.getElementById(id).addEventListener('change', renderActiveCanvas)
);

const canvasPanel = document.querySelector('.canvas-panel');
canvasPanel.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
canvasPanel.addEventListener('drop', e => {
  e.preventDefault();
  const name = e.dataTransfer.getData('tableName');
  if (!name || !masterSchema) return;
  if (!masterSchema.tables.find(t => t.name === name)) return;
  const rect = svgEl.getBoundingClientRect();
  const svgX = (e.clientX - rect.left - vt.x) / vt.s - TBL_W / 2;
  const svgY = (e.clientY - rect.top  - vt.y) / vt.s - HDR_H / 2;
  addTableToCanvas(name, svgX, svgY);
});

tablesLayer.addEventListener('click', e => {
  const rm = e.target.closest('.tbl-remove');
  if (!rm) return;
  e.stopPropagation();
  removeTableFromCanvas(rm.dataset.table);
});

document.getElementById('btn-draw').addEventListener('click', e => {
  e.stopPropagation();
  if (drawMode) { exitDrawMode(); return; }
  document.getElementById('draw-type-panel').classList.toggle('hidden');
});

document.querySelectorAll('.dtp-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.dtp-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    drawType = btn.dataset.type;
    document.getElementById('draw-type-panel').classList.add('hidden');
    if (!drawMode && currentSchema) enterDrawMode();
    else if (drawMode) drawMode.type = drawType;
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (cardPickerState) { hideCardPicker(); return; }
    if (drawMode) { exitDrawMode(); return; }
    if (selectedEdge || (focusMode && focusMode.type === 'table')) {
      deleteSelected(); e.preventDefault(); return;
    }
    clearFocus();
  }
  if (e.key === 'Delete' && !drawMode && !e.target.closest('textarea')) {
    if (selectedEdge || (focusMode && focusMode.type === 'table')) {
      deleteSelected(); e.preventDefault();
    }
  }
  if (e.ctrlKey && e.key === 'z' && !e.target.closest('textarea')) {
    undo(); e.preventDefault();
  }
});

document.getElementById('legend-hdr').addEventListener('click', () => {
  const body   = document.getElementById('legend-body');
  const toggle = document.getElementById('legend-toggle');
  const closed = body.classList.toggle('collapsed');
  toggle.textContent = closed ? '▸' : '▾';
});

/* ══════════════════════════════════════════════
   DRAW MODE
══════════════════════════════════════════════ */
function enterDrawMode() {
  drawMode = { type: drawType, phase: 'from', from: null };
  document.getElementById('btn-draw').classList.add('active');
  const ds = document.getElementById('draw-status');
  ds.textContent = 'Click bảng hoặc cột nguồn…';
  ds.style.display = 'block';
  document.getElementById('diagram').style.cursor = 'crosshair';
}

function exitDrawMode() {
  drawMode = null;
  document.getElementById('btn-draw').classList.remove('active');
  document.getElementById('draw-type-panel').classList.add('hidden');
  document.getElementById('draw-status').style.display = 'none';
  document.getElementById('diagram').style.cursor = '';
  document.querySelectorAll('.col-hl').forEach(el => {
    el.setAttribute('opacity', '0');
    el.setAttribute('fill', 'rgba(249,115,22,0.22)');
  });
}

function getFirstLinkCol(tableName) {
  if (!masterSchema) return 'id';
  const t = masterSchema.tables.find(t => t.name === tableName);
  if (!t || !t.columns.length) return 'id';
  return (t.columns.find(c => c.pk) || t.columns[0]).name;
}

function handleDrawTableClick(tableName) {
  if (!drawMode) return;
  if (drawMode.phase === 'from') {
    drawMode.from = { table: tableName };
    drawMode.fromType = 'table';
    drawMode.phase = 'to';
    const domId = tblDomId(tableName);
    const grp = document.getElementById(domId);
    if (grp) grp.classList.add('focused');
    document.getElementById('draw-status').textContent = `Bảng: ${tableName} → click bảng đích…`;
  } else {
    if (drawMode.from.table === tableName) { exitDrawMode(); return; }
    const fromCol = getFirstLinkCol(drawMode.from.table);
    const toCol   = getFirstLinkCol(tableName);
    createManualEdge({ table: drawMode.from.table, col: fromCol }, { table: tableName, col: toCol }, drawMode.type);
    exitDrawMode();
  }
}

function handleDrawClick(table, col) {
  if (!drawMode) return;
  if (drawMode.phase === 'from') {
    drawMode.from = { table, col };
    drawMode.fromType = 'col';
    drawMode.phase = 'to';
    document.querySelectorAll(`.col-hl[data-table="${CSS.escape(table)}"][data-col="${CSS.escape(col)}"]`)
      .forEach(el => { el.setAttribute('fill', 'rgba(249,115,22,0.5)'); el.setAttribute('opacity', '1'); });
    document.getElementById('draw-status').textContent = `Từ ${table}.${col} → click cột đích…`;
  } else {
    if (drawMode.from.table === table && drawMode.from.col === col) { exitDrawMode(); return; }
    createManualEdge(drawMode.from, { table, col }, drawMode.type);
    exitDrawMode();
  }
}

function createManualEdge(from, to, type) {
  if (!currentSchema) return;
  masterSrc += `\n\nRef: ${from.table}.${from.col} ${type} ${to.table}.${to.col}`;
  editorSyncing = true;
  document.getElementById('editor').value = masterSrc;
  editorSyncing = false;
  update(false);
}
