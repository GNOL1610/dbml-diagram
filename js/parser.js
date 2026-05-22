'use strict';

/* ══════════════════════════════════════════════
   DBML PARSER — supports schema.tablename
══════════════════════════════════════════════ */
function parseDBML(src) {
  const tables = [], refs = [];
  const text = src
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Support: Table schema.tablename [...] {
  const tableRe = /\bTable\s+([\w]+(?:\.[\w]+)?)\s*(?:\[([^\]]*)\])?\s*\{/g;
  let m;
  while ((m = tableRe.exec(text)) !== null) {
    const fullName = m[1], attrStr = m[2] || '';
    let depth = 1, i = m.index + m[0].length;
    const bodyStart = i;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++; else if (text[i] === '}') depth--;
      i++;
    }
    const body = text.slice(bodyStart, i - 1);
    const noteM = attrStr.match(/note:\s*['"]([^'"]*)['"]/i);
    const note  = noteM ? noteM[1] : '';

    const dotIdx = fullName.indexOf('.');
    const schema    = dotIdx >= 0 ? fullName.slice(0, dotIdx) : '';
    const shortName = dotIdx >= 0 ? fullName.slice(dotIdx + 1) : fullName;
    const dbM = attrStr.match(/database:\s*['"]([^'"]*)['"]/i);
    const database = dbM ? dbM[1] : '';

    const columns = [];
    body.split('\n').forEach(line => {
      const col = parseCol(line.trim());
      if (!col) return;
      columns.push(col);
      if (col.fk) refs.push({ from: { table: fullName, col: col.name }, to: col.fk, type: '>' });
    });
    tables.push({ name: fullName, database, schema, shortName, note, columns });
  }

  // Standalone Ref — support schema.table.col (3-part) and table.col (2-part)
  const refRe = /\bRef\b[^:]*:\s*([\w]+(?:\.[\w]+)+)\s*([<>|0-]+)\s*([\w]+(?:\.[\w]+)+)/mg;
  while ((m = refRe.exec(text)) !== null) {
    const fromParts = m[1].split('.');
    const fromCol   = fromParts.pop();
    const fromTable = fromParts.join('.');
    const toParts   = m[3].split('.');
    const toCol     = toParts.pop();
    const toTable   = toParts.join('.');
    refs.push({ from: { table: fromTable, col: fromCol }, to: { table: toTable, col: toCol }, type: m[2] });
  }

  const seen = new Set();
  return { tables, refs: refs.filter(r => {
    const k = `${r.from.table}.${r.from.col}→${r.to.table}.${r.to.col}`;
    return seen.has(k) ? false : (seen.add(k), true);
  })};
}

function parseCol(line) {
  if (!line || /^(Note|\/\/)/.test(line)) return null;
  const sp = line.search(/\s/);
  if (sp === -1) return null;
  const name = line.slice(0, sp);
  if (!/^\w+$/.test(name)) return null;
  const rest  = line.slice(sp).trim();
  const brk   = rest.indexOf('[');
  const type  = (brk === -1 ? rest : rest.slice(0, brk)).trim() || 'varchar';
  const attrs = brk === -1 ? '' : rest.slice(brk + 1, rest.lastIndexOf(']'));
  const pk    = /\bpk\b/i.test(attrs);
  const noteM = attrs.match(/note:\s*['"]([^'"]*)['"]/i);
  const note  = noteM ? noteM[1] : '';
  const isPt  = /\bPARTITION\b/i.test(note);

  // Support ref: > schema.table.col  OR  ref: > table.col
  const refM = attrs.match(/ref:\s*([<>|0-]+)\s*([\w]+(?:\.[\w]+)+)/);
  let fk = null;
  if (refM) {
    const parts = refM[2].split('.');
    const col   = parts.pop();
    const table = parts.join('.');
    fk = { table, col };
  }
  return { name, type, pk, fk, note, isPt };
}
