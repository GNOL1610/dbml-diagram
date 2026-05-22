'use strict';

/* ══════════════════════════════════════════════
   SAVE SLOTS — named sessions, stored in localStorage
   Each slot: { id, name, updatedAt, activeCount }
   Slot data: { src, pos, mid, active, colHidden, hiddenRefs, updatedAt }
══════════════════════════════════════════════ */
const SLOTS_IDX = 'dbml_slots_v1';
const SLOT_PFX  = 'dbml_slot_v1_';
let currentSlotId = null;

/* ── Helpers ── */
function slotsIndex() {
  try { return JSON.parse(localStorage.getItem(SLOTS_IDX)) || []; }
  catch { return []; }
}
function _saveIdx(idx) { localStorage.setItem(SLOTS_IDX, JSON.stringify(idx)); }
function _genId()  { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function _nowISO() { return new Date().toISOString(); }
function _fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

/* ── Payload from current state ── */
function _payload() {
  const ch = {};
  colHidden.forEach((cols, tbl) => { if (cols.size) ch[tbl] = [...cols]; });
  return {
    src:        masterSrc,
    pos:        JSON.parse(JSON.stringify(tablePositions)),
    mid:        [...edgeCustomMid],
    active:     [...activeTables],
    colHidden:  ch,
    hiddenRefs: [...hiddenRefs]
  };
}

/* ── Save current slot ── */
function saveCurrentSlot() {
  if (!currentSlotId) {
    // Auto-create on first save
    const name = 'Phiên ' + new Date().toLocaleDateString('vi-VN') + ' '
               + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    currentSlotId = _genId();
    _saveIdx([{ id: currentSlotId, name, updatedAt: _nowISO(), activeCount: activeTables.size },
              ...slotsIndex()]);
    showToast('Đã tạo phiên: ' + name);
  }
  const now = _nowISO();
  const data = { ..._payload(), updatedAt: now };
  localStorage.setItem(SLOT_PFX + currentSlotId, JSON.stringify(data));
  const idx = slotsIndex();
  const entry = idx.find(e => e.id === currentSlotId);
  if (entry) { entry.updatedAt = now; entry.activeCount = activeTables.size; _saveIdx(idx); }
  _updateBadge();
}

/* ── Load a slot ── */
function loadSlotById(id) {
  const raw = localStorage.getItem(SLOT_PFX + id);
  if (!raw) { showToast('Phiên không tìm thấy.'); return; }
  const data = JSON.parse(raw);
  currentSlotId   = id;
  masterSrc       = data.src || '';
  editor.value    = masterSrc;
  tablePositions  = data.pos || {};
  edgeCustomMid   = new Map(data.mid || []);
  activeTables    = new Set(data.active || []);
  colHidden.clear();
  Object.entries(data.colHidden || {}).forEach(([t, c]) => colHidden.set(t, new Set(c)));
  hiddenRefs = new Set(data.hiddenRefs || []);
  _updateBadge();
  update(false);
  if (activeTables.size > 0) setTimeout(fitView, 80);
}

/* ── Delete a slot ── */
function _deleteSlot(id) {
  localStorage.removeItem(SLOT_PFX + id);
  _saveIdx(slotsIndex().filter(e => e.id !== id));
}

/* ── Header badge ── */
function _updateBadge() {
  const el = document.getElementById('slot-name-badge');
  if (!el) return;
  if (!currentSlotId) { el.textContent = ''; el.hidden = true; return; }
  const entry = slotsIndex().find(e => e.id === currentSlotId);
  el.textContent = entry ? '📄 ' + entry.name : '';
  el.hidden = false;
}

/* ══════════════════════════════════════════════
   MODAL
══════════════════════════════════════════════ */
function openSlotModal() {
  _renderList();
  document.getElementById('slot-modal').classList.remove('hidden');
}
function closeSlotModal() {
  document.getElementById('slot-modal').classList.add('hidden');
}

function _renderList() {
  const idx  = slotsIndex();
  const list = document.getElementById('slot-list');
  const sep  = document.getElementById('slot-sep');
  if (!idx.length) {
    sep.hidden = true;
    list.innerHTML = '';
    return;
  }
  sep.hidden = false;
  list.innerHTML = idx.map(e => `
    <div class="slot-item">
      <div class="slot-item-info">
        <div class="slot-item-name">${esc(e.name)}</div>
        <div class="slot-item-meta">${e.activeCount || 0} bảng · ${_fmtDate(e.updatedAt)}</div>
      </div>
      <div class="slot-item-btns">
        <button class="btn primary slot-open-btn" data-id="${esc(e.id)}">Mở</button>
        <button class="btn slot-del-btn" data-id="${esc(e.id)}" title="Xóa phiên">✕</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.slot-open-btn').forEach(b =>
    b.addEventListener('click', () => { loadSlotById(b.dataset.id); closeSlotModal(); }));

  list.querySelectorAll('.slot-del-btn').forEach(b =>
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      const name = (slotsIndex().find(x => x.id === b.dataset.id) || {}).name || '';
      if (!confirm('Xóa phiên "' + name + '"?')) return;
      _deleteSlot(b.dataset.id);
      _renderList();
    }));
}

/* ── Migrate old single-key save (dbml-diagram-v5) ── */
function _migrateOldSave() {
  if (slotsIndex().length) return; // already have slots
  const OLD_KEY = 'dbml-diagram-v5';
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj || !obj.src) return;
    const id   = _genId();
    const name = 'Phiên đã lưu trước đây';
    const idx  = [{ id, name, updatedAt: _nowISO(), activeCount: (obj.active || []).length }];
    _saveIdx(idx);
    localStorage.setItem(SLOT_PFX + id, JSON.stringify({ ...obj, updatedAt: _nowISO() }));
    localStorage.removeItem(OLD_KEY);
  } catch {}
}

/* ── Wire up events ── */

// "+ Phiên mới" button in modal
document.getElementById('slot-btn-new').addEventListener('click', () => {
  const name = 'Phiên ' + new Date().toLocaleDateString('vi-VN') + ' '
             + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  currentSlotId = _genId();
  _saveIdx([{ id: currentSlotId, name, updatedAt: _nowISO(), activeCount: 0 },
            ...slotsIndex()]);
  masterSrc = ''; editor.value = '';
  activeTables.clear(); tablePositions = {};
  edgeCustomMid.clear(); hiddenRefs.clear(); colHidden.clear();
  update(false);
  _updateBadge();
  closeSlotModal();
});

// "📁 Phiên" button in header
document.getElementById('btn-slots').addEventListener('click', openSlotModal);

// Click overlay to close
document.getElementById('slot-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSlotModal();
});

// Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('slot-modal').classList.contains('hidden'))
    closeSlotModal();
});

// Click badge to rename current slot
document.getElementById('slot-name-badge').addEventListener('click', () => {
  if (!currentSlotId) return;
  const idx   = slotsIndex();
  const entry = idx.find(e => e.id === currentSlotId);
  if (!entry) return;
  const n = prompt('Tên phiên:', entry.name);
  if (n && n.trim()) { entry.name = n.trim(); _saveIdx(idx); _updateBadge(); }
});
