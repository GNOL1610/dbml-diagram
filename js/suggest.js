'use strict';

/* ══════════════════════════════════════════════
   JOIN SUGGESTIONS
══════════════════════════════════════════════ */
function getJoinSuggestions(tblName, colName) {
  if (!masterSchema) return [];
  const results = [];
  const seen = new Set();

  masterSchema.refs.forEach(r => {
    let otherTable = null, otherCol = null;
    if (r.from.table === tblName && r.from.col === colName) {
      otherTable = r.to.table; otherCol = r.to.col;
    } else if (r.to.table === tblName && r.to.col === colName) {
      otherTable = r.from.table; otherCol = r.from.col;
    }
    if (!otherTable) return;
    const key = `${otherTable}.${otherCol}`;
    if (seen.has(key)) return;
    seen.add(key);
    const tbl = masterSchema.tables.find(t => t.name === otherTable);
    results.push({ table: otherTable, col: otherCol, note: tbl ? tbl.note : '', isRef: true, isOnCanvas: activeTables.has(otherTable) });
  });

  masterSchema.tables.forEach(t => {
    if (t.name === tblName) return;
    t.columns.forEach(c => {
      if (c.name !== colName) return;
      const key = `${t.name}.${c.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({ table: t.name, col: c.name, note: t.note, isRef: false, isOnCanvas: activeTables.has(t.name) });
    });
  });

  results.sort((a, b) => {
    if (a.isRef !== b.isRef) return a.isRef ? -1 : 1;
    if (a.isOnCanvas !== b.isOnCanvas) return a.isOnCanvas ? -1 : 1;
    return a.table.localeCompare(b.table);
  });
  return results;
}

function hideJoinSuggest() {
  document.getElementById('join-suggest-panel').classList.add('hidden');
}

function showJoinSuggest(tblName, colName) {
  const panel = document.getElementById('join-suggest-panel');
  const suggs = getJoinSuggestions(tblName, colName);
  const shortCol = tblName.includes('.') ? tblName.split('.').pop() : tblName;

  let html = `<div class="js-header">${esc(shortCol)}<span style="color:#f97316">.</span>${esc(colName)}</div>`;
  if (!suggs.length) {
    html += `<div class="js-empty">Không có cột join trong DBML</div>`;
  } else {
    suggs.forEach(s => {
      const C = getColors(s.note);
      const shortT = s.table.includes('.') ? s.table.split('.').pop() : s.table;
      const hint = s.isOnCanvas ? 'đang trên canvas' : 'click → thêm vào canvas';
      html += `<button class="js-item${s.isOnCanvas ? ' on-canvas' : ''}"
        data-table="${esc(s.table)}" data-col="${esc(s.col)}" data-on-canvas="${s.isOnCanvas}">
        <span class="fp-dot" style="background:${C.border};flex-shrink:0"></span>
        <span class="js-col-name">${esc(s.col)}</span>
        <span class="js-tbl-name" title="${esc(s.table)}">${esc(shortT)} · ${hint}</span>
        <span class="js-badge${s.isRef ? '' : ' name-match'}">${s.isRef ? 'REF' : 'name'}</span>
      </button>`;
    });
  }
  panel.innerHTML = html;

  const pos = tablePositions[tblName];
  if (!pos) { panel.classList.add('hidden'); return; }
  const colY = getColY(tblName, colName);
  const screen = toScreenCoords(pos.x + TBL_W + 10, pos.y + colY - 10);

  let px = screen.x, py = screen.y;
  const panelW = 280, panelH = Math.min(suggs.length * 34 + 50, 310);
  if (px + panelW > window.innerWidth - 8) px = screen.x - TBL_W - panelW - 20;
  if (py + panelH > window.innerHeight - 8) py = window.innerHeight - panelH - 8;
  if (py < 52) py = 52;

  panel.style.left = px + 'px';
  panel.style.top  = py + 'px';
  panel.classList.remove('hidden');

  panel.querySelectorAll('.js-item').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const targetTable = btn.dataset.table;
      const isOnCanvas  = btn.dataset.onCanvas === 'true';
      hideJoinSuggest();
      if (!isOnCanvas) {
        const basePos = tablePositions[tblName] || { x: 0, y: 0 };
        addTableToCanvas(targetTable, basePos.x + CELL_W, basePos.y);
        setTimeout(fitView, 80);
      }
      setColumnFocus(tblName, colName);
    });
  });
}
