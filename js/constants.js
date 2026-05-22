'use strict';

/* ══════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════ */
const TBL_W  = 240;
const HDR_H  = 44;
const ROW_H  = 24;
const PAD_B  = 8;

const CELL_W   = 60;    // grid cell width (matches SVG pattern)
const CELL_H   = 80;    // grid cell height (matches SVG pattern)
const CELL_PAD = 8;             // inner offset from cell corner

const CF_L   = 16;
const CF_S   = 10;
const CF_BAR = 7;
const LANE_STEP = 22;

const TABLE_TYPES = {
  fact:     { border: '#f97316', hdr: 'rgba(249,115,22,0.18)',   txt: '#fb923c', label: 'Fact' },
  dim:      { border: '#38bdf8', hdr: 'rgba(56,189,248,0.15)',   txt: '#7dd3fc', label: 'Dimension' },
  ref:      { border: '#34d399', hdr: 'rgba(52,211,153,0.12)',   txt: '#6ee7b7', label: 'Reference' },
  bridge:   { border: '#c4b5fd', hdr: 'rgba(196,181,253,0.10)', txt: '#ddd6fe', label: 'Bridge' },
  staging:  { border: '#64748b', hdr: 'rgba(100,116,139,0.10)', txt: '#94a3b8', label: 'Staging' },
  audit:    { border: '#475569', hdr: 'rgba(71,85,105,0.10)',    txt: '#64748b', label: 'Audit/Log' },
  snapshot: { border: '#fbbf24', hdr: 'rgba(251,191,36,0.10)',  txt: '#fcd34d', label: 'Snapshot' },
  agg:      { border: '#5eead4', hdr: 'rgba(94,234,212,0.10)',  txt: '#99f6e4', label: 'Aggregate' },
  _:        { border: '#30363d', hdr: 'rgba(48,54,61,0.15)',     txt: '#64748b', label: 'Other' },
};

function getColors(note) {
  const n = (note || '').toLowerCase().trim().split(/[\s.,]/)[0];
  return TABLE_TYPES[n] || TABLE_TYPES._;
}

function getEdgeStroke(fromTable) {
  if (!currentSchema) return '#4a6380';
  const tbl = currentSchema.tables.find(t => t.name === fromTable);
  return tbl ? getColors(tbl.note).border : '#4a6380';
}

/* ══════════════════════════════════════════════
   DOM ID HELPER — dots in schema.tablename are unsafe in IDs
══════════════════════════════════════════════ */
function tblDomId(name) { return 'tbl-' + name.replace(/[^a-zA-Z0-9_-]/g, '_'); }
