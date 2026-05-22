'use strict';

/* ══════════════════════════════════════════════
   LIBRARY PANEL — grouped by schema, with column rows
══════════════════════════════════════════════ */
function buildLibraryPanel() {
  const tree = document.getElementById('fp-tree');
  if (!masterSchema) { tree.innerHTML = ''; return; }

  const searchRaw = ((document.getElementById('fp-search') || {}).value || '').toLowerCase().trim();

  // Group by database → schema (preserve insertion order)
  const dbGroups = new Map();
  masterSchema.tables.forEach(t => {
    const db = t.database || '(no database)';
    const s  = t.schema;
    if (!dbGroups.has(db)) dbGroups.set(db, new Map());
    const sg = dbGroups.get(db);
    if (!sg.has(s)) sg.set(s, []);
    sg.get(s).push(t);
  });

  const multiDb = dbGroups.size > 1;
  let html = '';

  // Helper: render table rows (shared by all schema groups)
  function renderTableRows(filteredTables, multiSchema) {
    let out = '';
    filteredTables.forEach(t => {
      const isActive = activeTables.has(t.name);
      const C = getColors(t.note);
      const typeLabel = (t.note || '').trim().split(/[\s.,]/)[0] || '';

      const colOnlyMatch = searchRaw &&
        !t.name.toLowerCase().includes(searchRaw) &&
        !t.shortName.toLowerCase().includes(searchRaw) &&
        t.columns.some(c => c.name.toLowerCase().includes(searchRaw));

      const isExpanded = tableColExpanded.has(t.name) || colOnlyMatch;
      const displayLabel = multiSchema ? (t.shortName || t.name) : t.name;

      out += `<div class="lib-item${isActive ? ' on-canvas' : ''}" data-tbl="${esc(t.name)}" draggable="${!isActive}">
        <span class="fp-dot" style="background:${C.border}"></span>
        <span class="lib-name" title="${esc(t.name)}">${esc(displayLabel)}</span>
        ${typeLabel ? `<span class="lib-type">${esc(typeLabel)}</span>` : ''}
        <button class="lib-expand-btn" data-expand="${esc(t.name)}" title="${isExpanded ? 'Ẩn cột' : 'Xem cột'}">${isExpanded ? '▼' : '▶'}</button>
        <button class="lib-btn${isActive ? ' remove' : ''}" data-action="${isActive ? 'remove' : 'add'}" data-tbl="${esc(t.name)}">${isActive ? '−' : '+'}</button>
      </div>`;

      if (isExpanded) {
        const hiddenCols = colHidden.get(t.name) || new Set();
        t.columns.forEach(col => {
          const isHidden = hiddenCols.has(col.name);
          const colMatch = searchRaw && col.name.toLowerCase().includes(searchRaw);
          let icon = '', iconColor = '#475569';
          if      (col.pk)   { icon = '#'; iconColor = '#f97316'; }
          else if (col.isPt) { icon = '⊕'; iconColor = '#5eead4'; }
          else if (col.fk)   { icon = '◇'; iconColor = '#93c5fd'; }

          out += `<div class="lib-col-row${isHidden ? ' hidden-col' : ''}${colMatch ? ' col-match' : ''}">
            <span class="lib-col-icon" style="color:${iconColor}">${icon}</span>
            <span class="lib-col-name" title="${esc(col.name)}">${esc(col.name)}</span>
            <span class="lib-col-type">${esc((col.type || '').slice(0,10))}</span>
            <button class="lib-col-toggle${isHidden ? ' is-hidden' : ''}"
              data-col-tbl="${esc(t.name)}" data-col-name="${esc(col.name)}"
              title="${isHidden ? 'Hiện cột' : 'Ẩn cột'}">${isHidden ? '+' : '−'}</button>
          </div>`;
        });
      }
    });
    return out;
  }

  // Build HTML: database → schema → table
  for (const [db, schemaGroups] of dbGroups) {
    const isDbCollapsed = databaseCollapsed.has(db);
    let dbBodyHtml = '';
    let dbCount = 0;

    for (const [schema, tables] of schemaGroups) {
      if (hiddenSchemas.has(schema)) continue;

      const filteredTables = tables.filter(t => {
        if (!searchRaw) return true;
        return t.name.toLowerCase().includes(searchRaw) ||
               t.shortName.toLowerCase().includes(searchRaw) ||
               t.columns.some(c => c.name.toLowerCase().includes(searchRaw));
      });
      if (!filteredTables.length) continue;
      dbCount += filteredTables.length;

      if (isDbCollapsed) continue;

      const isSchemaCollapsed = schemaCollapsed.has(schema);
      const schemaLabel = schema || '(no schema)';
      dbBodyHtml += `<div class="lib-schema-hdr" data-schema="${esc(schema)}">
        <span class="lib-schema-toggle">${isSchemaCollapsed ? '▶' : '▼'}</span>
        <span class="lib-schema-name">${esc(schemaLabel)}</span>
        <span class="lib-schema-count">${filteredTables.length}</span>
      </div>`;
      if (!isSchemaCollapsed) {
        dbBodyHtml += renderTableRows(filteredTables, true);
      }
    }

    if (dbCount === 0) continue;

    if (multiDb) {
      html += `<div class="lib-database-hdr" data-db="${esc(db)}">
        <span class="lib-database-toggle">${isDbCollapsed ? '▶' : '▼'}</span>
        <span class="lib-database-name">${esc(db)}</span>
        <span class="lib-database-count">${dbCount}</span>
      </div>`;
    }
    html += dbBodyHtml;
  }

  tree.innerHTML = html;

  // Database header click → toggle collapse
  tree.querySelectorAll('.lib-database-hdr').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const db = hdr.dataset.db;
      if (databaseCollapsed.has(db)) databaseCollapsed.delete(db);
      else databaseCollapsed.add(db);
      buildLibraryPanel();
    });
  });

  // Schema header click → toggle collapse
  tree.querySelectorAll('.lib-schema-hdr').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const s = hdr.dataset.schema;
      if (schemaCollapsed.has(s)) schemaCollapsed.delete(s);
      else schemaCollapsed.add(s);
      buildLibraryPanel();
    });
  });

  // Add/Remove table buttons
  tree.querySelectorAll('.lib-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.tbl;
      if (btn.dataset.action === 'add') {
        const rect = svgEl.getBoundingClientRect();
        const cx = (rect.width / 2 - vt.x) / vt.s + (activeTables.size % 5) * 30 - 60;
        const cy = (rect.height / 2 - vt.y) / vt.s + Math.floor(activeTables.size / 5) * 30 - 40;
        addTableToCanvas(name, cx, cy);
      } else {
        removeTableFromCanvas(name);
      }
    });
  });

  // Expand/collapse column list
  tree.querySelectorAll('.lib-expand-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.expand;
      if (tableColExpanded.has(name)) tableColExpanded.delete(name);
      else tableColExpanded.add(name);
      buildLibraryPanel();
    });
  });

  // Column visibility toggle
  tree.querySelectorAll('.lib-col-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tblName = btn.dataset.colTbl;
      const colName = btn.dataset.colName;
      pushHistory();
      if (!colHidden.has(tblName)) colHidden.set(tblName, new Set());
      const hidden = colHidden.get(tblName);
      if (hidden.has(colName)) hidden.delete(colName);
      else hidden.add(colName);
      renderActiveCanvas();
      saveToLocalStorage();
    });
  });

  // Drag to canvas
  tree.querySelectorAll('.lib-item:not(.on-canvas)').forEach(item => {
    item.addEventListener('dragstart', e => {
      e.dataTransfer.setData('tableName', item.dataset.tbl);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });
}

function addTableToCanvas(name, x, y) {
  if (!masterSchema) return;
  if (activeTables.has(name)) return;
  pushHistory();
  activeTables.add(name);
  tablePositions[name] = findFreeCell(x, y, name);
  renderActiveCanvas();
  saveToLocalStorage();
}

function removeTableFromCanvas(name) {
  pushHistory();
  activeTables.delete(name);
  renderActiveCanvas();
  saveToLocalStorage();
}

function renderActiveCanvas() {
  if (!masterSchema) return;

  const activeTbls = masterSchema.tables.filter(t => activeTables.has(t.name));
  const activeRefs = masterSchema.refs.filter(r =>
    activeTables.has(r.from.table) && activeTables.has(r.to.table)
  );
  currentSchema = { tables: activeTbls, refs: activeRefs };

  const layer = document.getElementById('tables-layer');
  layer.innerHTML = activeTbls.map(t => {
    const p = tablePositions[t.name] || { x: 40, y: 40 };
    return tableSVG(t, p.x, p.y);
  }).join('');

  renderEdges();
  if (focusMode) reapplyFocus();
  buildLibraryPanel();
  syncCanvasEditor();

  const st = document.getElementById('status');
  st.className = '';
  st.textContent = activeTbls.length
    ? `${activeTbls.length}/${masterSchema.tables.length} bảng · ${activeRefs.length} quan hệ`
    : `${masterSchema.tables.length} bảng trong kho — kéo ra canvas`;
}
