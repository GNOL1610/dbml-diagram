'use strict';

/* ══════════════════════════════════════════════
   DEFAULT DBML
══════════════════════════════════════════════ */
const DEFAULT_DBML = `// Paste nội dung DBML vào đây rồi nhấn Ctrl+Enter (hoặc nút Apply) để hiển thị diagram.
// File schema: project/Datamapping/doc/ghn_schema_v2.dbml
`;

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
(function initFromState() {
  const saved = loadSavedState();
  if (saved) {
    masterSrc = saved.src;
    editor.value = masterSrc;
    if (saved.pos)    tablePositions = saved.pos;
    if (saved.mid)    saved.mid.forEach(([k, v]) => edgeCustomMid.set(k, v));
    if (saved.active) saved.active.forEach(n => activeTables.add(n));
    if (saved.colHidden) {
      Object.entries(saved.colHidden).forEach(([tbl, cols]) => {
        colHidden.set(tbl, new Set(cols));
      });
    }
    if (saved.hiddenRefs) saved.hiddenRefs.forEach(k => hiddenRefs.add(k));
    update(false);
  } else {
    editor.value = DEFAULT_DBML;
    masterSrc = editor.value;
    update(false);
  }
})();
