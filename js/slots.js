'use strict';

/* ══════════════════════════════════════════════
   SAVE SLOTS — File System Access API + Tab Bar

   Dữ liệu lưu dưới dạng file .json trong folder
   do user chọn.

   Folder structure on disk:
     [folder]/slots.json          ← index (danh sách phiên)
     [folder]/slot_<id>.json      ← dữ liệu từng phiên

   Tab bar: mỗi phiên đang mở hiện thị dưới dạng
   tab. Lưu là EXPLICIT — chỉ khi Ctrl+S hoặc
   click nút lưu. Dấu ● trên tab = chưa lưu.

   Fallback: localStorage nếu trình duyệt không
   hỗ trợ File System Access API.
══════════════════════════════════════════════ */

const SUPPORTED = typeof window.showDirectoryPicker === 'function';

/* ── IndexedDB helpers ── */
const IDB_DB    = 'dbml-diagram-idb';
const IDB_STORE = 'kv';

function _idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_DB, 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    r.onsuccess  = e => res(e.target.result);
    r.onerror    = () => rej();
  });
}
async function _idbGet(key) {
  try {
    const db = await _idbOpen();
    return new Promise(res => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror   = () => res(null);
    });
  } catch { return null; }
}
async function _idbSet(key, val) {
  try {
    const db = await _idbOpen();
    return new Promise(res => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => res();
      tx.onerror    = () => res();
    });
  } catch {}
}
async function _idbDel(key) {
  try {
    const db = await _idbOpen();
    return new Promise(res => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => res();
      tx.onerror    = () => res();
    });
  } catch {}
}

/* ── Folder handle ── */
let _folderHandle = null;

async function _loadStoredHandle() {
  _folderHandle = await _idbGet('folder-handle');
}
async function _storeHandle(h) {
  _folderHandle = h;
  await _idbSet('folder-handle', h);
}
async function _clearHandle() {
  _folderHandle = null;
  await _idbDel('folder-handle');
}

async function _checkPermission() {
  if (!_folderHandle) return 'none';
  try {
    return await _folderHandle.queryPermission({ mode: 'readwrite' });
  } catch { return 'none'; }
}
async function _requestPermission() {
  if (!_folderHandle) return false;
  try {
    const r = await _folderHandle.requestPermission({ mode: 'readwrite' });
    return r === 'granted';
  } catch { return false; }
}

// If stored handle points to a parent folder (not diagram-saves),
// auto-create diagram-saves/ inside it, migrate slot files, update handle.
async function _ensureSavesSubdir() {
  if (!_folderHandle) return;
  if (_folderHandle.name === SAVES_SUBDIR) return;  // already correct
  try {
    const parent = _folderHandle;
    const saves  = await parent.getDirectoryHandle(SAVES_SUBDIR, { create: true });

    // Migrate: copy slot files and slots.json from parent → saves
    const toMigrate = [];
    for await (const [name, entry] of parent.entries()) {
      if (entry.kind === 'file' && (name === 'slots.json' || name.endsWith('_diagram.json') || name.startsWith('slot_'))) {
        toMigrate.push(name);
      }
    }
    for (const name of toMigrate) {
      try {
        const srcFh = await parent.getFileHandle(name);
        const text  = await (await srcFh.getFile()).text();
        const dstFh = await saves.getFileHandle(name, { create: true });
        const w     = await dstFh.createWritable();
        await w.write(text);
        await w.close();
        // Remove from parent after successful copy
        await parent.removeEntry(name);
      } catch {}
    }

    await _storeHandle(saves);
  } catch {}
}

/* ── File read/write ── */
async function _readJSON(filename) {
  try {
    const fh   = await _folderHandle.getFileHandle(filename);
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  } catch { return null; }
}
async function _writeJSON(filename, data) {
  const fh       = await _folderHandle.getFileHandle(filename, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}
async function _deleteFile(filename) {
  try { await _folderHandle.removeEntry(filename); } catch {}
}

/* ── Slot index (slots.json) ── */
async function _loadIdx() {
  if (!_folderHandle) return _lsGetIdx();
  return (await _readJSON('slots.json')) || [];
}
async function _saveIdx(idx) {
  if (!_folderHandle) { _lsSetIdx(idx); return; }
  await _writeJSON('slots.json', idx);
}

/* ── LocalStorage fallback ── */
const LS_IDX = 'dbml_slots_v1';
const LS_PFX = 'dbml_slot_v1_';
function _lsGetIdx()       { try { return JSON.parse(localStorage.getItem(LS_IDX)) || []; } catch { return []; } }
function _lsSetIdx(idx)    { localStorage.setItem(LS_IDX, JSON.stringify(idx)); }
function _lsGetSlot(id)    { try { return JSON.parse(localStorage.getItem(LS_PFX + id)); } catch { return null; } }
function _lsSetSlot(id, d) { localStorage.setItem(LS_PFX + id, JSON.stringify(d)); }
function _lsDelSlot(id)    { localStorage.removeItem(LS_PFX + id); }

/* ── State payload helpers ── */
let currentSlotId = null;

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
function _genId()  { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function _nowISO() { return new Date().toISOString(); }

// Convert slot name → safe filename:  "Phiên 22/05" → "Phiên_22-05_diagram.json"
function _nameToFile(name) {
  const safe = name
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-{2,}/g, '-')
    .replace(/_{2,}/g, '_')
    .replace(/^[_.\-]+|[_.\-]+$/g, '')
    .slice(0, 60) || 'phien';
  return safe + '_diagram.json';
}

// Get the filename for a slot entry (with fallback for old slots)
function _entryFile(entry) {
  return entry.filename || `slot_${entry.id}.json`;
}
function _fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
         + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

/* ══════════════════════════════════════════════
   TAB BAR
   openTabs: [{id, name, dirty}]
   activeTabId: id của tab đang active
   _dirty: canvas hiện tại có thay đổi chưa lưu
══════════════════════════════════════════════ */
let openTabs    = [];
let activeTabId = null;
let _dirty      = false;

function markDirty() {
  if (_dirty) return;
  _dirty = true;
  if (currentSlotId) {
    const tab = openTabs.find(t => t.id === currentSlotId);
    if (tab) tab.dirty = true;
  }
  _renderTabBar();
  const saveBtn = document.getElementById('btn-save-slot');
  if (saveBtn) saveBtn.classList.add('dirty');
}

function _markClean() {
  _dirty = false;
  const saveBtn = document.getElementById('btn-save-slot');
  if (saveBtn) saveBtn.classList.remove('dirty');
}

function _renderTabBar() {
  const bar = document.getElementById('slot-tab-bar');
  if (!bar) return;
  if (!openTabs.length) { bar.innerHTML = ''; return; }

  let html = openTabs.map(t => `
    <div class="slot-tab${t.id === activeTabId ? ' active' : ''}" data-tab-id="${esc(t.id)}">
      <span class="slot-tab-name">${esc(t.name)}</span>
      ${t.dirty ? '<span class="slot-tab-dirty" title="Chưa lưu">●</span>' : ''}
      <button class="slot-tab-close" data-close-id="${esc(t.id)}" title="Đóng tab">×</button>
    </div>`).join('');
  html += `<button class="slot-tab-add" id="slot-tab-add-btn" title="Mở / tạo phiên mới">+</button>`;

  bar.innerHTML = html;

  bar.querySelectorAll('.slot-tab').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.slot-tab-close')) return;
      _switchToTab(el.dataset.tabId);
    });
  });
  bar.querySelectorAll('.slot-tab-close').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _closeTab(btn.dataset.closeId);
    });
  });
  const addBtn = bar.querySelector('#slot-tab-add-btn');
  if (addBtn) addBtn.addEventListener('click', openSlotModal);
}

function _addOrActivateTab(id, name) {
  const existing = openTabs.find(t => t.id === id);
  if (!existing) {
    openTabs.push({ id, name, dirty: false });
  }
  activeTabId = id;
  _markClean();
  const tab = openTabs.find(t => t.id === id);
  if (tab) { tab.name = name; tab.dirty = false; }
  _renderTabBar();
}

async function _switchToTab(id) {
  if (id === activeTabId) return;
  if (_dirty) {
    const ok = confirm('Phiên hiện tại có thay đổi chưa lưu.\nLưu trước khi chuyển tab?');
    if (ok) await saveCurrentSlot();
    // cancel = false: discard and switch anyway
  }
  await loadSlotById(id);
}

async function _closeTab(id) {
  const tab = openTabs.find(t => t.id === id);
  if (tab && tab.dirty && id === activeTabId) {
    if (!confirm('Phiên này có thay đổi chưa lưu. Đóng mà không lưu?')) return;
  }
  openTabs = openTabs.filter(t => t.id !== id);
  if (id === activeTabId) {
    activeTabId = null;
    if (openTabs.length) {
      await loadSlotById(openTabs[openTabs.length - 1].id);
    } else {
      _resetCanvas();
      currentSlotId = null;
      _markClean();
      _renderTabBar();
      openSlotModal();
    }
  } else {
    _renderTabBar();
  }
}

function _resetCanvas() {
  masterSrc = ''; editor.value = '';
  activeTables.clear(); tablePositions = {};
  edgeCustomMid.clear(); hiddenRefs.clear(); colHidden.clear();
  update(false);
  _updateBadge(null);
}

/* ══════════════════════════════════════════════
   SAVE / LOAD
══════════════════════════════════════════════ */
async function saveCurrentSlot() {
  // If File System Access API is supported but no folder configured yet → open setup modal
  if (SUPPORTED && !_folderHandle) {
    openSlotModal();   // user needs to pick HTML folder first
    showToast('Vui lòng chọn thư mục chứa HTML để thiết lập nơi lưu.');
    return;
  }

  const now = _nowISO();
  const location = _folderHandle ? `📂 ${_folderHandle.name}` : '🌐 trình duyệt';

  if (!currentSlotId) {
    // No active slot — create one
    const name = 'Phiên ' + new Date().toLocaleDateString('vi-VN') + ' '
               + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    currentSlotId = _genId();
    const filename = _nameToFile(name);
    const idx = await _loadIdx();
    idx.unshift({ id: currentSlotId, name, filename, updatedAt: now, activeCount: activeTables.size });
    await _saveIdx(idx);
    const data = { ..._payload(), updatedAt: now };
    if (_folderHandle) await _writeJSON(filename, data);
    else _lsSetSlot(currentSlotId, data);
    _addOrActivateTab(currentSlotId, name);
    showToast(`Đã lưu "${name}" → ${location}`);
  } else {
    // Write slot data
    const data = { ..._payload(), updatedAt: now };
    const idx = await _loadIdx();
    const entry = idx.find(e => e.id === currentSlotId);
    if (_folderHandle) {
      await _writeJSON(_entryFile(entry || { id: currentSlotId }), data);
    } else {
      _lsSetSlot(currentSlotId, data);
    }
    // Update index
    if (entry) { entry.updatedAt = now; entry.activeCount = activeTables.size; await _saveIdx(idx); }
    _updateBadge(idx);
    showToast(`Đã lưu → ${location}`);
  }

  // Mark clean
  _markClean();
  const tab = openTabs.find(t => t.id === currentSlotId);
  if (tab) tab.dirty = false;
  _renderTabBar();
}

async function loadSlotById(id) {
  const idx = await _loadIdx();
  const entry = idx.find(e => e.id === id);
  let data;
  if (_folderHandle) {
    data = await _readJSON(_entryFile(entry || { id }));
  } else {
    data = _lsGetSlot(id);
  }
  if (!data) { showToast('Không tìm thấy dữ liệu phiên.'); return; }

  currentSlotId   = id;
  masterSrc       = data.src || '';
  editor.value    = masterSrc;
  tablePositions  = data.pos || {};
  edgeCustomMid   = new Map(data.mid || []);
  activeTables    = new Set(data.active || []);
  colHidden.clear();
  Object.entries(data.colHidden || {}).forEach(([t, c]) => colHidden.set(t, new Set(c)));
  hiddenRefs      = new Set(data.hiddenRefs || []);

  _addOrActivateTab(id, entry ? entry.name : id);
  _updateBadge(idx);
  update(false);
  if (activeTables.size > 0) setTimeout(fitView, 80);
}

async function deleteSlotById(id) {
  const idx = await _loadIdx();
  const entry = idx.find(e => e.id === id);
  if (_folderHandle) {
    await _deleteFile(_entryFile(entry || { id }));
  } else {
    _lsDelSlot(id);
  }
  await _saveIdx(idx.filter(e => e.id !== id));
  // Close tab if open
  if (openTabs.find(t => t.id === id)) {
    openTabs = openTabs.filter(t => t.id !== id);
    if (id === activeTabId) {
      activeTabId = null;
      if (openTabs.length) {
        await loadSlotById(openTabs[openTabs.length - 1].id);
      } else {
        _resetCanvas();
        currentSlotId = null; _markClean();
        _renderTabBar();
        openSlotModal();
      }
    } else {
      _renderTabBar();
    }
  }
}

/* ── Header badge ── */
function _updateBadge(idx) {
  const el = document.getElementById('slot-name-badge');
  if (!el) return;
  if (!currentSlotId || !idx) { el.textContent = ''; el.hidden = true; return; }
  const entry = idx.find(e => e.id === currentSlotId);
  el.textContent = entry ? '📄 ' + entry.name : '';
  el.hidden = !entry;
}

/* ══════════════════════════════════════════════
   MODAL
   4 trạng thái:
   'no-support'  — trình duyệt không hỗ trợ API
   'no-folder'   — chưa chọn folder
   'need-perm'   — folder đã lưu, cần cấp lại quyền
   'ready'       — folder sẵn sàng
══════════════════════════════════════════════ */
function openSlotModal() {
  document.getElementById('slot-modal').classList.remove('hidden');
  _refreshModal();
}
function closeSlotModal() {
  document.getElementById('slot-modal').classList.add('hidden');
}

async function _refreshModal() {
  const body = document.getElementById('slot-modal-body');
  body.innerHTML = '<div class="slot-loading">Đang kiểm tra…</div>';

  if (!SUPPORTED) {
    await _renderReady(true, body);
    return;
  }

  await _loadStoredHandle();
  const perm = await _checkPermission();

  if (perm === 'none') {
    _renderNoFolder(body);
  } else if (perm === 'granted') {
    await _ensureSavesSubdir();   // migrate to diagram-saves/ if needed
    await _renderReady(false, body);
  } else {
    _renderNeedPerm(body);
  }
}

function _renderNoFolder(body) {
  body.innerHTML = `
    <div class="slot-storage-box slot-storage-file">
      <div class="slot-storage-ttl">💾 Lưu ra file trên máy <span class="slot-badge-rec">Khuyên dùng</span></div>
      <div class="slot-storage-desc">
        Trỏ vào <b>thư mục chứa file <code>dbml-diagram.html</code></b>.<br>
        App tự tạo thư mục <code>diagram-saves/</code> bên trong — chỉ cần làm <b>một lần duy nhất</b>.
      </div>
      <button class="btn primary slot-wide-btn" id="slot-pick-folder" style="margin-top:8px">📁 Chọn thư mục chứa HTML…</button>
    </div>
    <div class="slot-sep">— hoặc —</div>
    <div class="slot-storage-box slot-storage-browser">
      <div class="slot-storage-ttl">🌐 Lưu tạm trong trình duyệt</div>
      <div class="slot-storage-desc">Dữ liệu nằm trong bộ nhớ Chrome/Edge — <b>không có file thực trên máy</b>. Xoá cache trình duyệt = mất dữ liệu.</div>
      <button class="btn slot-wide-btn" id="slot-new-nofolder" style="margin-top:6px">+ Tạo phiên mới (lưu tạm)</button>
    </div>`;
  document.getElementById('slot-pick-folder').addEventListener('click', _onPickFolder);
  document.getElementById('slot-new-nofolder').addEventListener('click', _onNewSession);
}

function _renderNeedPerm(body) {
  const name = _folderHandle ? _folderHandle.name : '';
  body.innerHTML = `
    <div class="slot-reconnect-box">
      <div class="slot-reconnect-icon">📂</div>
      <div class="slot-reconnect-name">${esc(name)}</div>
      <div class="slot-reconnect-hint">Phiên đã lưu của bạn nằm trong thư mục <code>diagram-saves/</code> này.<br>
        Để tìm: mở <b>File Explorer</b> → tìm thư mục tên <b>"${esc(name)}"</b> → mở → thấy các file <code>*_diagram.json</code>.</div>
      <button class="btn primary slot-wide-btn" id="slot-reconnect" style="margin-top:10px">🔓 Kết nối lại và xem phiên đã lưu</button>
    </div>
    <div class="slot-sep">— hoặc —</div>
    <button class="btn slot-wide-btn" id="slot-pick-new">📁 Chọn lại thư mục HTML</button>
    <button class="btn slot-wide-btn" id="slot-new-nofolder2">+ Tạo phiên mới (lưu tạm trình duyệt)</button>`;
  document.getElementById('slot-reconnect').addEventListener('click', async () => {
    const ok = await _requestPermission();
    if (ok) {
      await _ensureSavesSubdir();   // migrate to diagram-saves/ if needed
      await _renderReady(false);
    } else {
      showToast('Không được cấp quyền.');
    }
  });
  document.getElementById('slot-pick-new').addEventListener('click', _onPickFolder);
  document.getElementById('slot-new-nofolder2').addEventListener('click', _onNewSession);
}

async function _renderReady(fallbackLS, body) {
  const b = body || document.getElementById('slot-modal-body');
  const idx = await _loadIdx();
  const folderName = (!fallbackLS && _folderHandle) ? _folderHandle.name : null;

  let html = '';
  if (folderName) {
    html += `
      <div class="slot-location-bar">
        <span>💾 File lưu tại thư mục:</span>
        <span class="slot-folder-tag" style="display:inline-flex;margin:0">📂 ${esc(folderName)}</span>
        <span class="slot-location-hint">Tìm trong File Explorer: thư mục HTML → diagram-saves → *_diagram.json</span>
      </div>`;
  } else if (fallbackLS) {
    html += `
      <div class="slot-location-bar slot-location-browser">
        <span>🌐 Dữ liệu lưu trong trình duyệt (không có file thực trên máy)</span>
        <button class="btn slot-change-btn" id="slot-upgrade-folder" style="font-size:11px;margin-left:auto">📁 Chuyển sang lưu file…</button>
      </div>`;
  }
  html += `<button class="btn primary slot-wide-btn" id="slot-btn-new">+ Tạo phiên mới</button>`;

  if (idx.length) {
    html += `<div class="slot-sep">— Phiên đã lưu —</div>`;
    html += idx.map(e => `
      <div class="slot-item${e.id === activeTabId ? ' slot-item-active' : ''}">
        <div class="slot-item-info">
          <div class="slot-item-name">${esc(e.name)}</div>
          <div class="slot-item-meta">${e.activeCount || 0} bảng · ${_fmtDate(e.updatedAt)}</div>
        </div>
        <div class="slot-item-btns">
          <button class="btn primary slot-open-btn" data-id="${esc(e.id)}">${e.id === activeTabId ? '✓ Đang mở' : 'Mở'}</button>
          <button class="btn slot-del-btn" data-id="${esc(e.id)}" title="Xóa phiên">✕</button>
        </div>
      </div>`).join('');
  } else {
    html += `<div class="slot-empty">Chưa có phiên nào. Nhấn "+ Tạo phiên mới" để bắt đầu.</div>`;
  }

  if (!fallbackLS) {
    html += `<div class="slot-change-folder-row"><button class="btn slot-change-btn" id="slot-change-folder">📁 Đổi thư mục</button></div>`;
  }

  b.innerHTML = html;

  // "upgrade to file" button (only in localStorage mode)
  const upgradeBtn = b.querySelector('#slot-upgrade-folder');
  if (upgradeBtn) upgradeBtn.addEventListener('click', _onPickFolder);

  document.getElementById('slot-btn-new').addEventListener('click', _onNewSession);

  b.querySelectorAll('.slot-open-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      if (btn.dataset.id === activeTabId) { closeSlotModal(); return; }
      loadSlotById(btn.dataset.id);
      closeSlotModal();
    }));

  b.querySelectorAll('.slot-del-btn').forEach(btn =>
    btn.addEventListener('click', async ev => {
      ev.stopPropagation();
      const entry = (await _loadIdx()).find(e => e.id === btn.dataset.id);
      if (!confirm('Xóa phiên "' + (entry ? entry.name : '') + '"?')) return;
      await deleteSlotById(btn.dataset.id);
      if (!document.getElementById('slot-modal').classList.contains('hidden'))
        await _renderReady(fallbackLS);
    }));

  const chBtn = b.querySelector('#slot-change-folder');
  if (chBtn) chBtn.addEventListener('click', _onPickFolder);
}

const SAVES_SUBDIR = 'diagram-saves';

async function _onPickFolder() {
  try {
    // User picks the folder where dbml-diagram.html lives
    const parent = await window.showDirectoryPicker({ mode: 'readwrite' });
    // Auto-create diagram-saves subfolder
    const saves = await parent.getDirectoryHandle(SAVES_SUBDIR, { create: true });
    await _storeHandle(saves);
    showToast(`📂 Thư mục lưu: ${parent.name}/${SAVES_SUBDIR}`);
    await _renderReady(false);
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Không thể truy cập thư mục: ' + e.message);
  }
}

async function _onNewSession() {
  const name = 'Phiên ' + new Date().toLocaleDateString('vi-VN') + ' '
             + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  currentSlotId = _genId();
  const filename = _nameToFile(name);
  const idx = await _loadIdx();
  idx.unshift({ id: currentSlotId, name, filename, updatedAt: _nowISO(), activeCount: 0 });
  await _saveIdx(idx);
  // Write empty slot file so it persists on reload
  const data = { src: '', pos: {}, mid: [], active: [], colHidden: {}, hiddenRefs: [], updatedAt: _nowISO() };
  if (_folderHandle) await _writeJSON(filename, data);
  else _lsSetSlot(currentSlotId, data);
  // Reset canvas
  masterSrc = ''; editor.value = '';
  activeTables.clear(); tablePositions = {};
  edgeCustomMid.clear(); hiddenRefs.clear(); colHidden.clear();
  update(false);
  _addOrActivateTab(currentSlotId, name);
  _updateBadge(idx);
  closeSlotModal();
}

/* ── Migrate old single-key localStorage save ── */
async function _migrateOldSave() {
  const OLD = 'dbml-diagram-v5';
  if (SUPPORTED && _folderHandle) return;
  const hasSlots = _lsGetIdx().length > 0;
  if (hasSlots) return;
  try {
    const raw = localStorage.getItem(OLD);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj || !obj.src) return;
    const id  = _genId();
    const now = _nowISO();
    _lsSetIdx([{ id, name: 'Phiên đã lưu trước đây', updatedAt: now, activeCount: (obj.active || []).length }]);
    _lsSetSlot(id, { ...obj, updatedAt: now });
    localStorage.removeItem(OLD);
  } catch {}
}

/* ── Wire up events ── */

// Escape / overlay click closes modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('slot-modal').classList.contains('hidden'))
    closeSlotModal();
});
document.getElementById('slot-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSlotModal();
});

// Header "Phiên" button
document.getElementById('btn-slots').addEventListener('click', openSlotModal);

// Header "Lưu" button
document.getElementById('btn-save-slot').addEventListener('click', () => {
  saveCurrentSlot().catch(err => showToast('Lỗi khi lưu: ' + err.message));
});

// Badge click → rename current slot
document.getElementById('slot-name-badge').addEventListener('click', async () => {
  if (!currentSlotId) return;
  const idx   = await _loadIdx();
  const entry = idx.find(e => e.id === currentSlotId);
  if (!entry) return;
  const n = prompt('Tên phiên:', entry.name);
  if (!n || !n.trim() || n.trim() === entry.name) return;
  const newName = n.trim();
  const newFile = _nameToFile(newName);
  // Rename file on disk if using folder
  if (_folderHandle && entry.filename) {
    try {
      const data = await _readJSON(entry.filename);
      if (data) {
        await _writeJSON(newFile, data);
        await _deleteFile(entry.filename);
      }
    } catch {}
  }
  entry.name = newName;
  entry.filename = newFile;
  await _saveIdx(idx);
  _updateBadge(idx);
  const tab = openTabs.find(t => t.id === currentSlotId);
  if (tab) { tab.name = newName; _renderTabBar(); }
});

// DBML textarea input → mark dirty
editor.addEventListener('input', () => { if (currentSlotId) markDirty(); });

// Ctrl+S → explicit save (document-level, fires alongside editor.js handler)
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 's') {
    // editor.js already calls e.preventDefault() and saveMaster()
    // We just trigger the disk save here
    saveCurrentSlot().catch(err => showToast('Lỗi khi lưu: ' + err.message));
  }
});
