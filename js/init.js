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
  // URL state (share link) — load directly, skip modal
  if (location.hash.startsWith('#state=')) {
    const state = decodeState(location.hash.slice(7));
    if (state) {
      history.replaceState(null, '', location.pathname + location.search);
      masterSrc = state.src; editor.value = masterSrc;
      if (state.pos)       tablePositions = state.pos;
      if (state.mid)       state.mid.forEach(([k, v]) => edgeCustomMid.set(k, v));
      if (state.active)    state.active.forEach(n => activeTables.add(n));
      if (state.colHidden) Object.entries(state.colHidden).forEach(([t, c]) => colHidden.set(t, new Set(c)));
      if (state.hiddenRefs) state.hiddenRefs.forEach(k => hiddenRefs.add(k));
      update(false);
      return;
    }
  }

  // Migrate old single-key save → slot
  _migrateOldSave();

  // Always show slot picker on load
  openSlotModal();
})();
