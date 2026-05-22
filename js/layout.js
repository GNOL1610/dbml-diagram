'use strict';

/* ══════════════════════════════════════════════
   LAYOUT
══════════════════════════════════════════════ */
function computeLayout(tables, refs) {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'LR', ranksep: 200, nodesep: 80, marginx: 80, marginy: 80 });
  g.setDefaultEdgeLabel(() => ({}));
  tables.forEach(t => g.setNode(t.name, { width: TBL_W, height: HDR_H + t.columns.length * ROW_H + PAD_B }));
  refs.forEach((r, i) => {
    if (g.hasNode(r.from.table) && g.hasNode(r.to.table) && r.from.table !== r.to.table)
      g.setEdge(r.from.table, r.to.table, {}, 'e' + i);
  });
  dagre.layout(g);
  const pos = {};
  g.nodes().forEach(n => { const nd = g.node(n); if (nd) pos[n] = { x: nd.x - nd.width/2, y: nd.y - nd.height/2 }; });
  return pos;
}

/* ══════════════════════════════════════════════
   GRID / SNAP
══════════════════════════════════════════════ */

// Number of grid cells a table spans horizontally (fixed)
const TABLE_W_CELLS = Math.ceil(TBL_W / CELL_W);

// Number of grid cells a table spans vertically (depends on column count)
function tableHeightCells(name) {
  const tbl = masterSchema && masterSchema.tables.find(t => t.name === name);
  if (!tbl) return Math.ceil(300 / CELL_H);
  const h = HDR_H + tbl.columns.length * ROW_H + PAD_B;
  return Math.ceil(h / CELL_H);
}

// Mark all cells occupied by each active table
function occupiedCells(excludeName) {
  const cells = new Map();
  for (const name of activeTables) {
    if (name === excludeName) continue;
    const pos = tablePositions[name];
    if (!pos) continue;
    const cx = Math.round((pos.x - CELL_PAD) / CELL_W);
    const cy = Math.round((pos.y - CELL_PAD) / CELL_H);
    const wc = TABLE_W_CELLS;
    const hc = tableHeightCells(name);
    for (let dx = 0; dx < wc; dx++)
      for (let dy = 0; dy < hc; dy++)
        cells.set(`${cx + dx},${cy + dy}`, name);
  }
  return cells;
}

function findFreeCell(preferX, preferY, excludeName) {
  const startCX = Math.round(preferX / CELL_W);
  const startCY = Math.max(0, Math.round(preferY / CELL_H));
  const cells = occupiedCells(excludeName);
  const wc = TABLE_W_CELLS;
  const hc = tableHeightCells(excludeName);

  for (let r = 0; r <= 30; r++) {
    const candidates = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const cx = startCX + dx, cy = startCY + dy;
        if (cy < 0) continue;
        candidates.push({ cx, cy, dist: dx * dx + dy * dy });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const { cx, cy } of candidates) {
      let free = true;
      outer: for (let tx = 0; tx < wc; tx++)
        for (let ty = 0; ty < hc; ty++)
          if (cells.has(`${cx + tx},${cy + ty}`)) { free = false; break outer; }
      if (free) return { x: cx * CELL_W + CELL_PAD, y: cy * CELL_H + CELL_PAD };
    }
  }
  return { x: preferX, y: preferY };
}

function snapLayout(positions) {
  const usedCells = new Set();
  const snapped = {};
  const names = Object.keys(positions).sort((a, b) => {
    const pa = positions[a], pb = positions[b];
    const colA = Math.round(pa.x / CELL_W), rowA = Math.round(pa.y / CELL_H);
    const colB = Math.round(pb.x / CELL_W), rowB = Math.round(pb.y / CELL_H);
    return colA !== colB ? colA - colB : rowA - rowB;
  });
  for (const name of names) {
    const pos = positions[name];
    const wc = TABLE_W_CELLS;
    const hc = tableHeightCells(name);
    let cx = Math.round(pos.x / CELL_W), cy = Math.max(0, Math.round(pos.y / CELL_H));
    let found = false;
    outer: for (let r = 0; r <= 30; r++) {
      const cands = [];
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          cands.push({ nx: cx + dx, ny: Math.max(0, cy + dy), d: dx * dx + dy * dy });
        }
      }
      cands.sort((a, b) => a.d - b.d);
      for (const { nx, ny } of cands) {
        let cellFree = true;
        check: for (let tx = 0; tx < wc; tx++)
          for (let ty = 0; ty < hc; ty++)
            if (usedCells.has(`${nx + tx},${ny + ty}`)) { cellFree = false; break check; }
        if (cellFree) {
          for (let tx = 0; tx < wc; tx++)
            for (let ty = 0; ty < hc; ty++)
              usedCells.add(`${nx + tx},${ny + ty}`);
          snapped[name] = { x: nx * CELL_W + CELL_PAD, y: ny * CELL_H + CELL_PAD };
          found = true; break outer;
        }
      }
    }
    if (!found) snapped[name] = pos;
  }
  return snapped;
}
