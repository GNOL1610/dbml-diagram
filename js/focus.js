'use strict';

/* ══════════════════════════════════════════════
   HIGHLIGHT / FOCUS
══════════════════════════════════════════════ */
function neighborsOf(name) {
  const nb = new Set([name]);
  if (!currentSchema) return nb;
  currentSchema.refs.forEach(r => {
    if (r.from.table === name) nb.add(r.to.table);
    if (r.to.table   === name) nb.add(r.from.table);
  });
  return nb;
}

function setTableFocus(name) {
  clearFocus(false);
  focusMode = { type: 'table', name };
  const nb = neighborsOf(name);
  document.querySelectorAll('.tbl-group').forEach(g => {
    g.classList.toggle('dimmed',  !nb.has(g.dataset.name));
    g.classList.toggle('focused', g.dataset.name === name);
  });
  applyFocusToEdges();
  updateActionBtns();
}

function setColumnFocus(tblName, colName) {
  clearFocus(false);
  focusMode = { type: 'col', table: tblName, col: colName };
  const hlCols   = new Set([`${tblName}.${colName}`]);
  const hlTables = new Set([tblName]);
  if (currentSchema) {
    currentSchema.refs.forEach(r => {
      if (r.from.table === tblName && r.from.col === colName) { hlCols.add(`${r.to.table}.${r.to.col}`); hlTables.add(r.to.table); }
      if (r.to.table   === tblName && r.to.col   === colName) { hlCols.add(`${r.from.table}.${r.from.col}`); hlTables.add(r.from.table); }
    });
  }
  document.querySelectorAll('.tbl-group').forEach(g => {
    g.classList.toggle('dimmed',  !hlTables.has(g.dataset.name));
    g.classList.toggle('focused', g.dataset.name === tblName);
  });
  document.querySelectorAll('.col-hl').forEach(el => {
    el.setAttribute('opacity', hlCols.has(`${el.dataset.table}.${el.dataset.col}`) ? '0.55' : '0');
  });
  applyFocusToEdges();
}

function applyFocusToEdges() {
  if (!focusMode) return;
  let hlCols = null, hlTables = null;
  if (focusMode.type === 'table') {
    hlTables = neighborsOf(focusMode.name);
  } else {
    hlCols   = new Set([`${focusMode.table}.${focusMode.col}`]);
    hlTables = new Set([focusMode.table]);
    if (currentSchema) {
      currentSchema.refs.forEach(r => {
        if (r.from.table === focusMode.table && r.from.col === focusMode.col) { hlCols.add(`${r.to.table}.${r.to.col}`); hlTables.add(r.to.table); }
        if (r.to.table   === focusMode.table && r.to.col   === focusMode.col) { hlCols.add(`${r.from.table}.${r.from.col}`); hlTables.add(r.from.table); }
      });
    }
  }
  document.querySelectorAll('#edges-layer .edge-g').forEach(g => {
    const show = focusMode.type === 'table'
      ? hlTables.has(g.dataset.from) && hlTables.has(g.dataset.to)
      : hlCols.has(`${g.dataset.from}.${g.dataset.fromcol}`) && hlCols.has(`${g.dataset.to}.${g.dataset.tocol}`);
    g.style.opacity = show ? '1' : '0.04';
  });
}

function clearFocus(resetMode = true) {
  if (resetMode) { focusMode = null; hideJoinSuggest(); }
  document.querySelectorAll('.tbl-group').forEach(g => g.classList.remove('dimmed', 'focused'));
  document.querySelectorAll('.col-hl').forEach(el => el.setAttribute('opacity', '0'));
  document.querySelectorAll('#edges-layer .edge-g').forEach(g => g.style.opacity = '1');
  if (resetMode) updateActionBtns();
}

function reapplyFocus() {
  if (!focusMode) return;
  if (focusMode.type === 'table') setTableFocus(focusMode.name);
  else setColumnFocus(focusMode.table, focusMode.col);
}

/* ══════════════════════════════════════════════
   DBML SYNC — reorder Table blocks by visual position
══════════════════════════════════════════════ */
function syncDBMLOrder() {
  const src = editor.value;
  if (!src.trim() || !currentSchema) return;

  const cleansed = src
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

  const blocks = [];
  const tblRe  = /\bTable\s+([\w]+(?:\.[\w]+)?)\b/g;
  let m;
  while ((m = tblRe.exec(cleansed)) !== null) {
    const name = m[1];
    let i = m.index + m[0].length;
    while (i < cleansed.length && cleansed[i] !== '{') i++;
    if (i >= cleansed.length) continue;
    let depth = 1; i++;
    const start = m.index;
    while (i < cleansed.length && depth > 0) {
      if (cleansed[i] === '{') depth++; else if (cleansed[i] === '}') depth--;
      i++;
    }
    blocks.push({ name, start, end: i });
  }
  if (blocks.length < 2) return;

  const byPos = [...blocks].sort((a, b) => a.start - b.start);
  const nonTable = [];
  let prev = 0;
  for (const b of byPos) {
    const gap = src.slice(prev, b.start).trim();
    if (gap) nonTable.push(gap);
    prev = b.end;
  }
  const tail = src.slice(prev).trim();
  if (tail) nonTable.push(tail);

  blocks.sort((a, b) => {
    const pa = tablePositions[a.name] || { x: 0, y: 0 };
    const pb = tablePositions[b.name] || { x: 0, y: 0 };
    const dx = pa.x - pb.x;
    if (Math.abs(dx) > TBL_W * 1.5) return dx;
    return pa.y - pb.y;
  });

  const tableParts = blocks.map(b => src.slice(b.start, b.end).trim());
  const newSrc = [...nonTable, ...tableParts].filter(Boolean).join('\n\n');

  if (newSrc.trim() !== src.trim()) {
    editor.value = newSrc;
  }
}
