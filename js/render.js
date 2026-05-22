'use strict';

/* ══════════════════════════════════════════════
   SVG UTILS
══════════════════════════════════════════════ */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0,n-1)+'…' : s; }

function getEffectiveHidden(table) {
  const hidePk = document.getElementById('fp-hidepk').checked;
  const hideFk = document.getElementById('fp-hidefk').checked;
  const hidePt = document.getElementById('fp-hidept').checked;
  const manual = colHidden.get(table.name) || new Set();
  const eff = new Set(manual);
  table.columns.forEach(col => {
    if (hidePk && col.pk) eff.add(col.name);
    if (hideFk && col.fk && !col.pk) eff.add(col.name);
    if (hidePt && col.isPt) eff.add(col.name);
  });
  return eff;
}

/* ══════════════════════════════════════════════
   TABLE SVG
══════════════════════════════════════════════ */
function tableBodySVG(table, hiddenCols) {
  const visCols = table.columns.filter(col => !hiddenCols.has(col.name));
  const H  = HDR_H + visCols.length * ROW_H + PAD_B;
  const C  = getColors(table.note);
  // Use schema as hint (from schema.tablename), shortName as display
  const schemaHint = (table.schema || '').slice(0, 22);
  const displayName = table.shortName || table.name;

  let s = '';
  s += `<rect class="tbl-outline" width="${TBL_W}" height="${H}" rx="7" fill="#161b22"
    stroke="${C.border}" stroke-width="1.5"/>`;
  s += `<rect x="0" y="0" width="${TBL_W}" height="${HDR_H}" rx="7" fill="${C.hdr}"/>`;
  s += `<rect x="0" y="${HDR_H - 7}" width="${TBL_W}" height="7" fill="${C.hdr}"/>`;
  s += `<line x1="0" y1="${HDR_H}" x2="${TBL_W}" y2="${HDR_H}" stroke="${C.border}" stroke-width="1" opacity=".35"/>`;
  s += `<rect x="0" y="0" width="4" height="${H}" rx="2" fill="${C.border}"/>`;
  if (schemaHint)
    s += `<text x="13" y="15" font-size="9.5" fill="${C.txt}" opacity=".8" font-family="Segoe UI,Tahoma,sans-serif">${esc(schemaHint)}</text>`;
  const nameY = schemaHint ? 31 : 27;
  s += `<text x="13" y="${nameY}" font-size="13" font-weight="700" fill="#e2e8f0" font-family="Segoe UI,Tahoma,sans-serif">${esc(trunc(displayName, 22))}</text>`;
  s += `<rect class="tbl-hdr-hit" x="0" y="0" width="${TBL_W - 26}" height="${HDR_H}" fill="transparent" data-table="${esc(table.name)}" style="cursor:pointer"/>`;
  s += `<text x="${TBL_W - 14}" y="21" font-size="14" fill="#475569" text-anchor="middle" font-family="Segoe UI,Tahoma,sans-serif" pointer-events="none">×</text>`;
  s += `<rect class="tbl-remove" x="${TBL_W - 26}" y="6" width="22" height="22" rx="4" fill="transparent" data-table="${esc(table.name)}" style="cursor:pointer"/>`;

  visCols.forEach((col, i) => {
    const cy = HDR_H + i * ROW_H;
    if (i % 2 === 1)
      s += `<rect x="4" y="${cy}" width="${TBL_W - 4}" height="${ROW_H}" fill="rgba(255,255,255,0.03)"/>`;
    s += `<rect class="col-hl" x="4" y="${cy}" width="${TBL_W - 4}" height="${ROW_H}" fill="rgba(249,115,22,0.22)" opacity="0" data-table="${esc(table.name)}" data-col="${esc(col.name)}"/>`;

    let icon = '', iconColor = '#64748b';
    if      (col.pk)   { icon = '#';  iconColor = '#f97316'; }
    else if (col.isPt) { icon = '⊕'; iconColor = '#5eead4'; }
    else if (col.fk)   { icon = '◇'; iconColor = '#93c5fd'; }

    let tx = 13;
    if (icon) {
      s += `<text x="${tx}" y="${cy + 16}" font-size="11" font-weight="700" fill="${iconColor}"
        font-family="Segoe UI,Tahoma,sans-serif">${icon}</text>`;
      tx += 14;
    }
    const fw = (col.pk || col.fk) ? '600' : '400';
    const nameColor = col.pk ? '#fde68a' : col.fk ? '#bae6fd' : '#e2e8f0';
    s += `<text x="${tx}" y="${cy + 16}" font-size="12" font-weight="${fw}" fill="${nameColor}"
      font-family="Segoe UI,Tahoma,sans-serif">${esc(trunc(col.name, 18))}</text>`;
    s += `<text x="${TBL_W - 10}" y="${cy + 16}" font-size="10" fill="#4b5563" text-anchor="end"
      font-family="Segoe UI,Tahoma,sans-serif">${esc(trunc(col.type, 10))}</text>`;
    const tip = col.note ? `data-tip="${esc(col.note)}"` : '';
    s += `<rect class="col-hit" x="0" y="${cy}" width="${TBL_W}" height="${ROW_H}" fill="transparent"
      data-table="${esc(table.name)}" data-col="${esc(col.name)}" ${tip} style="cursor:pointer"/>`;
  });

  return s;
}

function tableSVG(table, x, y) {
  const id = tblDomId(table.name);
  return `<g class="tbl-group" id="${esc(id)}" data-name="${esc(table.name)}" transform="translate(${x},${y})">`
    + tableBodySVG(table, getEffectiveHidden(table))
    + `</g>`;
}

/* ══════════════════════════════════════════════
   CROW'S FOOT SYMBOLS
══════════════════════════════════════════════ */
function symbolSVG(x, y, card, dir, color) {
  const parts = [];
  if (card === 'many' || card === 'one-many') {
    // crow's foot + bar  =  one-or-many  — prongs xoè tại table, tụ ra phía đường
    const tip = x + dir * CF_L;   // điểm tụ (phía đường kẻ, xa table)
    parts.push(`<line x1="${tip}" y1="${y}" x2="${x}" y2="${y - CF_S}" stroke-linecap="round"/>`);
    parts.push(`<line x1="${tip}" y1="${y}" x2="${x}" y2="${y}"        stroke-linecap="round"/>`);
    parts.push(`<line x1="${tip}" y1="${y}" x2="${x}" y2="${y + CF_S}" stroke-linecap="round"/>`);
    const bar = tip + dir * CF_BAR;
    parts.push(`<line x1="${bar}" y1="${y - CF_S - 2}" x2="${bar}" y2="${y + CF_S + 2}"/>`);
  } else if (card === 'zero-many') {
    // crow's foot + circle  =  zero-or-many
    const tip = x + dir * CF_L;
    parts.push(`<line x1="${tip}" y1="${y}" x2="${x}" y2="${y - CF_S}" stroke-linecap="round"/>`);
    parts.push(`<line x1="${tip}" y1="${y}" x2="${x}" y2="${y}"        stroke-linecap="round"/>`);
    parts.push(`<line x1="${tip}" y1="${y}" x2="${x}" y2="${y + CF_S}" stroke-linecap="round"/>`);
    const cr = tip + dir * (CF_BAR + 4);
    parts.push(`<circle cx="${cr}" cy="${y}" r="4" fill="#0d1117"/>`);
  } else if (card === 'zero-one') {
    // bar + circle  =  zero-or-one  |O
    const b1 = x + dir * 5;
    parts.push(`<line x1="${b1}" y1="${y - 8}" x2="${b1}" y2="${y + 8}"/>`);
    const cr = b1 + dir * 11;
    parts.push(`<circle cx="${cr}" cy="${y}" r="4" fill="#0d1117"/>`);
  } else {
    // double bar  =  one-and-only-one  ||
    const b1 = x + dir * 5;
    const b2 = x + dir * 12;
    parts.push(`<line x1="${b1}" y1="${y - 8}" x2="${b1}" y2="${y + 8}"/>`);
    parts.push(`<line x1="${b2}" y1="${y - 8}" x2="${b2}" y2="${y + 8}"/>`);
  }
  return `<g class="edge-sym" stroke="${color}" fill="none" stroke-width="2">${parts.join('')}</g>`;
}

/* ══════════════════════════════════════════════
   ORTHOGONAL PATH
══════════════════════════════════════════════ */
function buildPath(x1, y1, xmid, x2, y2) {
  if (Math.abs(y2 - y1) < 1) return `M${x1},${y1} H${x2}`;
  const r = Math.min(12,
    Math.abs(xmid - x1) * 0.45,
    Math.abs(xmid - x2) * 0.45,
    Math.abs(y2 - y1) / 2
  );
  if (r < 0.5) return `M${x1},${y1} H${xmid} V${y2} H${x2}`;
  const ray  = y2 > y1 ?  r : -r;
  const rax1 = xmid >= x1 ?  r : -r;
  const rax2 = x2  >= xmid ?  r : -r;
  return [
    `M${x1},${y1}`,
    `H${xmid - rax1}`,
    `Q${xmid},${y1} ${xmid},${y1 + ray}`,
    `V${y2 - ray}`,
    `Q${xmid},${y2} ${xmid + rax2},${y2}`,
    `H${x2}`
  ].join(' ');
}

/* ══════════════════════════════════════════════
   FIND LANE
══════════════════════════════════════════════ */
function findLane(x1, x2, y1, y2, fromTbl, toTbl) {
  if (!currentSchema) return (x1 + x2) / 2;
  const base = (x1 + x2) / 2;
  const miny = Math.min(y1, y2) - 8;
  const maxy = Math.max(y1, y2) + 8;
  const fromP = tablePositions[fromTbl];
  const toP   = tablePositions[toTbl];

  for (let d = 0; d <= 700; d += 6) {
    for (const cx of (d === 0 ? [base] : [base + d, base - d])) {
      if (fromP && cx > fromP.x + 2 && cx < fromP.x + TBL_W - 2) continue;
      if (toP   && cx > toP.x   + 2 && cx < toP.x   + TBL_W - 2) continue;
      let blocked = false;
      for (const t of currentSchema.tables) {
        if (t.name === fromTbl || t.name === toTbl) continue;
        const p = tablePositions[t.name];
        if (!p) continue;
        const th = HDR_H + t.columns.length * ROW_H + PAD_B;
        if (cx >= p.x - 8 && cx <= p.x + TBL_W + 8 && maxy >= p.y - 8 && miny <= p.y + th + 8) {
          blocked = true; break;
        }
      }
      if (!blocked) return cx;
    }
  }
  return base;
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function getTablePos(name) {
  const el = document.getElementById(tblDomId(name));
  if (!el) return null;
  const t = (el.getAttribute('transform') || '').match(/translate\(([^,]+),([^)]+)\)/);
  const x = t ? parseFloat(t[1]) : 0, y = t ? parseFloat(t[2]) : 0;
  const tb = currentSchema && currentSchema.tables.find(tb => tb.name === name);
  if (!tb) return null;
  return { x, y, w: TBL_W, h: HDR_H + tb.columns.length * ROW_H + PAD_B };
}

function getColY(tblName, colName) {
  if (!currentSchema) return HDR_H / 2;
  const tb  = currentSchema.tables.find(t => t.name === tblName);
  if (!tb) return HDR_H / 2;
  const hidden = getEffectiveHidden(tb);
  const visCols = tb.columns.filter(c => !hidden.has(c.name));
  const idx = visCols.findIndex(c => c.name === colName);
  return HDR_H + (idx < 0 ? 0 : idx) * ROW_H + ROW_H / 2;
}

/* ══════════════════════════════════════════════
   RELATIONSHIP TYPE → CARDINALITY
══════════════════════════════════════════════ */
function opToCards(op) {
  // op → [fromCard, toCard]
  // End types: 'one' (||), 'zero-one' (O|), 'many' (<|), 'zero-many' (<O)
  const MAP = {
    '>':   ['many',      'one'      ],  // <| → ||   FK(many) → PK(one)   — DBML: A > B = A is many
    '<':   ['one',       'many'     ],  // || → <|   PK(one) → FK(many)   — DBML: A < B = B is many
    '-':   ['one',       'one'      ],  // || → ||   one to one
    '>0':  ['many',      'zero-many'],  // <| → <O   many to zero-or-many
    '0<':  ['zero-many', 'one'      ],  // <O → ||   zero-or-many to one
    '0>':  ['zero-one',  'many'     ],  // O| → <|   zero-or-one to many
    '>?':  ['many',      'zero-one' ],  // <| → O|   many to zero-or-one
    '?<':  ['zero-one',  'one'      ],  // O| → ||   zero-or-one to one
    '<>':  ['zero-many', 'zero-many'],  // <O → <O   many-to-many
  };
  const pair = MAP[op];
  return pair ? { fromCard: pair[0], toCard: pair[1] }
              : { fromCard: 'one',   toCard: 'many'  };
}

/* ══════════════════════════════════════════════
   BFS EDGE ROUTER
══════════════════════════════════════════════ */
function routeEdgeBFS(x1, y1, x2, y2, fromTbl, toTbl) {
  const G       = 20;  // routing grid resolution (px)
  const OBS_PAD = 16;  // padding around tables — prevents arrows touching table border
  const MARGIN  = 14;  // extra grid cells around search bounding box

  const ox = Math.min(x1, x2) - MARGIN * G;
  const oy = Math.min(y1, y2) - MARGIN * G;
  const gW = Math.ceil((Math.abs(x2 - x1) + 2 * MARGIN * G) / G) + 2;
  const gH = Math.ceil((Math.abs(y2 - y1) + 2 * MARGIN * G) / G) + 2;

  const toGX = x => Math.max(0, Math.min(gW - 1, Math.round((x - ox) / G)));
  const toGY = y => Math.max(0, Math.min(gH - 1, Math.round((y - oy) / G)));

  const gx1 = toGX(x1), gy1 = toGY(y1);
  const gx2 = toGX(x2), gy2 = toGY(y2);

  const n = gW * gH;
  const blocked = new Uint8Array(n);
  const parent  = new Int32Array(n).fill(-1);

  if (currentSchema) {
    for (const t of currentSchema.tables) {
      if (t.name === fromTbl || t.name === toTbl) continue;
      const p = tablePositions[t.name];
      if (!p) continue;
      const th = HDR_H + t.columns.length * ROW_H + PAD_B;
      const ax = Math.max(0, Math.floor((p.x - OBS_PAD - ox) / G));
      const bx = Math.min(gW - 1, Math.ceil((p.x + TBL_W + OBS_PAD - ox) / G));
      const ay = Math.max(0, Math.floor((p.y - OBS_PAD - oy) / G));
      const by = Math.min(gH - 1, Math.ceil((p.y + th + OBS_PAD - oy) / G));
      for (let gx = ax; gx <= bx; gx++)
        for (let gy = ay; gy <= by; gy++)
          blocked[gy * gW + gx] = 1;
    }
  }

  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  const start = gy1 * gW + gx1;
  const end   = gy2 * gW + gx2;
  parent[start] = start;
  const queue = [start];

  for (let qi = 0; qi < queue.length && parent[end] < 0; qi++) {
    const cur = queue[qi];
    const cx = cur % gW, cy = (cur / gW) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= gW || ny >= gH) continue;
      const next = ny * gW + nx;
      if (parent[next] >= 0 || blocked[next]) continue;
      parent[next] = cur;
      queue.push(next);
    }
  }

  if (parent[end] < 0) return null;

  // Reconstruct raw grid path
  const raw = [];
  let cur = end;
  while (cur !== parent[cur]) {
    raw.unshift([ox + (cur % gW) * G, oy + ((cur / gW) | 0) * G]);
    cur = parent[cur];
  }
  raw.unshift([x1, y1]);
  raw.push([x2, y2]);

  // Remove collinear interior points
  const pts = [raw[0]];
  for (let i = 1; i < raw.length - 1; i++) {
    const [px, py] = raw[i - 1], [cx, cy] = raw[i], [nx, ny] = raw[i + 1];
    const hh = Math.abs(py - cy) < 0.5 && Math.abs(cy - ny) < 0.5;
    const vv = Math.abs(px - cx) < 0.5 && Math.abs(cx - nx) < 0.5;
    if (!hh && !vv) pts.push(raw[i]);
  }
  pts.push(raw[raw.length - 1]);
  return pts;
}

function buildPolyPath(pts) {
  if (!pts || pts.length < 2) return null;
  const R = 10;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const len1 = Math.hypot(x1 - x0, y1 - y0);
    const len2 = Math.hypot(x2 - x1, y2 - y1);
    const r = Math.min(R, len1 / 2, len2 / 2);
    if (r < 0.5) { d += ` L${x1},${y1}`; continue; }
    const t1x = x1 - (x1 - x0) / len1 * r, t1y = y1 - (y1 - y0) / len1 * r;
    const t2x = x1 + (x2 - x1) / len2 * r, t2y = y1 + (y2 - y1) / len2 * r;
    d += ` L${t1x},${t1y} Q${x1},${y1} ${t2x},${t2y}`;
  }
  d += ` L${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}`;
  return d;
}

/* ══════════════════════════════════════════════
   RENDER EDGES
══════════════════════════════════════════════ */
function renderEdges() {
  const layer = document.getElementById('edges-layer');
  if (!currentSchema) { layer.innerHTML = ''; return; }

  let html = '';

  currentSchema.refs.forEach(r => {
    const fromEl = document.getElementById(tblDomId(r.from.table));
    const toEl   = document.getElementById(tblDomId(r.to.table));
    if (fromEl && fromEl.style.display === 'none') return;
    if (toEl   && toEl.style.display   === 'none') return;

    const A = getTablePos(r.from.table), B = getTablePos(r.to.table);
    if (!A || !B || r.from.table === r.to.table) return;

    const ay = A.y + getColY(r.from.table, r.from.col);
    const by = B.y + getColY(r.to.table,   r.to.col);

    const ac = A.x + A.w / 2, bc = B.x + B.w / 2;
    const x1 = ac <= bc ? A.x + A.w : A.x;
    const x2 = ac <= bc ? B.x       : B.x + B.w;
    const x1Dir = x1 >= A.x + A.w - 1 ?  1 : -1;
    const x2Dir = x2 >= B.x + B.w - 1 ?  1 : -1;

    const edgeKey = `${r.from.table}.${r.from.col}→${r.to.table}.${r.to.col}`;
    if (hiddenRefs.has(edgeKey)) return;

    // Stub: short exit segment from table edge before BFS routing begins
    // prevents path from touching the table border
    const STUB = 20;
    const x1s = x1 + x1Dir * STUB;
    const x2s = x2 + x2Dir * STUB;

    let d, midX, midY;
    if (edgeCustomMid.has(edgeKey)) {
      // Manual override — keep old 3-segment routing
      const xmid = edgeCustomMid.get(edgeKey);
      d = buildPath(x1, ay, xmid, x2, by);
      midX = xmid; midY = (ay + by) / 2;
    } else {
      const waypts = routeEdgeBFS(x1s, ay, x2s, by, r.from.table, r.to.table);
      if (waypts) {
        // Full path: table edge → stub (waypts already starts at x1s) → table edge
        const allpts = [[x1, ay], ...waypts, [x2, by]];
        d = buildPolyPath(allpts);
        const mid = waypts[Math.floor(waypts.length / 2)];
        midX = mid[0]; midY = mid[1];
      } else {
        // Fallback
        const xmid = findLane(x1, x2, ay, by, r.from.table, r.to.table);
        d = buildPath(x1, ay, xmid, x2, by);
        midX = xmid; midY = (ay + by) / 2;
      }
    }

    const { fromCard, toCard } = opToCards(r.type);
    const isSel = selectedEdge === edgeKey;
    const baseStroke = getEdgeStroke(r.from.table);
    const stroke = isSel ? '#fcd34d' : baseStroke;

    html += `<g class="edge-g${isSel ? ' selected' : ''}"
        data-from="${esc(r.from.table)}" data-to="${esc(r.to.table)}"
        data-fromcol="${esc(r.from.col)}" data-tocol="${esc(r.to.col)}"
        data-edge-key="${esc(edgeKey)}">
      <path d="${d}" stroke="transparent" stroke-width="14" fill="none"/>
      <path class="edge-path" d="${d}" stroke="${stroke}" stroke-width="1.8" fill="none" stroke-opacity="${isSel ? 1 : 0.75}"/>
      ${symbolSVG(x1, ay, fromCard, x1Dir, stroke)}
      ${symbolSVG(x2, by, toCard,   x2Dir, stroke)}
      <circle class="edge-handle" cx="${midX}" cy="${midY}" r="5" data-edge-key="${esc(edgeKey)}"/>
      <circle class="edge-cap" cx="${x1}" cy="${ay}" r="9" data-edge-key="${esc(edgeKey)}" data-side="from"/>
      <circle class="edge-cap" cx="${x2}" cy="${by}" r="9" data-edge-key="${esc(edgeKey)}" data-side="to"/>
      <text class="edge-label" x="${midX}" y="${midY - 6}"
        text-anchor="middle" font-size="10"
        font-family="Segoe UI,Tahoma,sans-serif"
        fill="${stroke}" stroke="#0d1117" stroke-width="3" paint-order="stroke"
        >${esc(r.from.col)}</text>
    </g>`;
  });

  layer.innerHTML = html;
  applyFocusToEdges();
}
