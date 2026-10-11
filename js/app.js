import { CATEGORIES, CATEGORY_BY_ID, MOODS, MOOD_BY_ID, STRENGTHS } from './flavors.js';
import { pickMix } from './mixer.js';
import * as store from './store.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ui = {
  mood: 'any',
  mix: null,           // поточний показаний мікс
  search: '',
  stockFilter: 'all',  // all | in | out
  historyFilter: 'all', // all | up | down | none
  editingId: null,
  formTags: [],
};

// ---------- Навігація ----------

function showTab(name) {
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.id === `tab-${name}`));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

const tagsText = (tags) => tags.map((id) => {
  const c = CATEGORY_BY_ID[id];
  return c ? `${c.emoji} ${c.label}` : id;
}).join(' · ');

const strengthLabel = (id) => (id ? STRENGTHS.find((s) => s.id === id)?.label : '');

function formatDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Сьогодні, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Вчора, ${time}`;
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }) + `, ${time}`;
}

// ---------- Мікс ----------

function renderMoods() {
  $('#moods').innerHTML = MOODS.map((m) =>
    `<button class="chip ${m.id === ui.mood ? 'active' : ''}" data-mood="${m.id}">${m.emoji} ${m.label}</button>`
  ).join('');
}
$('#moods').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mood]');
  if (!btn) return;
  ui.mood = btn.dataset.mood;
  renderMoods();
});

function doMix(excludeKey = null) {
  const { tobaccos, history } = store.getState();
  ui.mix = pickMix(tobaccos, history, ui.mood, excludeKey);
  renderMix();
}
$('#btn-mix').addEventListener('click', () => doMix());

function tobaccoBlock(t) {
  return `<div class="mix-tobacco">
    <div class="brand">${esc(t.brand || ' ')}</div>
    <div class="name">${esc(t.name)}</div>
    <div class="tags">${esc(tagsText(t.tags))}</div>
  </div>`;
}

function renderMix() {
  const el = $('#mix-result');
  const m = ui.mix;
  if (!m) { el.innerHTML = ''; return; }
  if (m.error) {
    const noTobaccos = store.getState().tobaccos.length === 0;
    el.innerHTML = `<div class="card empty">${esc(m.error)}
      ${noTobaccos ? '<br><button class="btn" data-goto="collection">Перейти до колекції</button>' : ''}</div>`;
    return;
  }
  const mood = MOOD_BY_ID[ui.mood];
  el.innerHTML = `<div class="card mix-card">
    <div class="mix-pair">${tobaccoBlock(m.a)}<div class="mix-plus">+</div>${tobaccoBlock(m.b)}</div>
    <div class="ratio"><span></span><span></span></div>
    <div class="ratio-label"><span>50%</span><span>50%</span></div>
    <p class="mix-meta"><span class="label">${esc(m.label)}</span>
      ${m.reasons.length ? `<br><span class="muted">${esc(m.reasons.join(' · '))}</span>` : ''}
      ${mood.id !== 'any' ? `<br><span class="muted">Настрій: ${mood.emoji} ${esc(mood.label)}</span>` : ''}
    </p>
    <div class="mix-actions">
      <button class="btn" id="btn-another">🔄 Інший мікс</button>
      <button class="btn btn-primary" id="btn-smoke">🔥 Курю цей!</button>
    </div>
  </div>`;
  $('#btn-another').onclick = () => doMix(m.key);
  $('#btn-smoke').onclick = () => {
    store.addHistory(m.a, m.b, ui.mood);
    ui.mix = null;
    renderMix();
    toast('Записав в історію. Гарного кальяну! 💨');
  };
}

$('#tab-mix').addEventListener('click', (e) => {
  const goto = e.target.closest('[data-goto]');
  if (goto) showTab(goto.dataset.goto);
});

// Картка «Як зайшов мікс?» для останнього неоціненого міксу (до 2 днів).
function renderRateLast() {
  const { history } = store.getState();
  const last = [...history].sort((x, y) => y.date - x.date)[0];
  const el = $('#rate-last');
  if (!last || last.rating || Date.now() - last.date > 2 * 86400000) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card rate-card">
    <div class="text">Як зайшов мікс?<br><b>${esc(last.aName)}</b> + <b>${esc(last.bName)}</b></div>
    <div class="actions">
      <button class="btn btn-icon" data-rate="1" data-id="${last.id}" aria-label="Сподобався">👍</button>
      <button class="btn btn-icon" data-rate="-1" data-id="${last.id}" aria-label="Не сподобався">👎</button>
    </div>
  </div>`;
}
$('#rate-last').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-rate]');
  if (!btn) return;
  store.rateHistory(btn.dataset.id, Number(btn.dataset.rate));
  toast(btn.dataset.rate === '1' ? 'Запам\'ятав — буду пропонувати частіше' : 'Запам\'ятав — пропонуватиму рідше');
});

// ---------- Колекція ----------

const STOCK_FILTERS = [
  { id: 'all', label: 'Усі' },
  { id: 'in', label: 'Є вдома' },
  { id: 'out', label: 'Закінчились' },
];

function renderCollection() {
  const { tobaccos } = store.getState();
  $('#stock-filter').innerHTML = STOCK_FILTERS.map((f) =>
    `<button class="chip ${f.id === ui.stockFilter ? 'active' : ''}" data-stock="${f.id}">${f.label}</button>`
  ).join('');

  const q = ui.search.trim().toLowerCase();
  const list = tobaccos
    .filter((t) => ui.stockFilter === 'all' || (ui.stockFilter === 'in') === t.inStock)
    .filter((t) => !q || `${t.brand} ${t.name}`.toLowerCase().includes(q))
    .sort((a, b) => (b.inStock - a.inStock) || store.displayName(a).localeCompare(store.displayName(b), 'uk'));

  const el = $('#collection-list');
  if (!tobaccos.length) {
    el.innerHTML = `<div class="empty">Колекція порожня.<br>Додай табаки, які є в тебе вдома.
      <br><button class="btn" id="btn-examples">Додати приклади для тесту</button></div>`;
    $('#btn-examples').onclick = () => { store.addExamples(); toast('Додав 10 прикладів'); };
    return;
  }
  if (!list.length) { el.innerHTML = '<div class="empty">Нічого не знайдено</div>'; return; }

  el.innerHTML = `<p class="muted">Є вдома: ${tobaccos.filter((t) => t.inStock).length} з ${tobaccos.length}</p>` +
    list.map((t) => `<div class="list-item ${t.inStock ? '' : 'out'}">
      <div class="main">
        <div class="title">${esc(t.name)}${t.brand ? ` <span class="muted">· ${esc(t.brand)}</span>` : ''}</div>
        <div class="sub">${esc(tagsText(t.tags))}${t.strength ? ` · ${esc(strengthLabel(t.strength))}` : ''}</div>
      </div>
      <div class="actions">
        <button class="stock-toggle ${t.inStock ? 'on' : ''}" data-toggle="${t.id}">${t.inStock ? '✓ Є' : 'Немає'}</button>
        <button class="btn btn-ghost" data-edit="${t.id}" aria-label="Редагувати">✏️</button>
      </div>
    </div>`).join('');
}

$('#search').addEventListener('input', (e) => { ui.search = e.target.value; renderCollection(); });
$('#stock-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-stock]');
  if (btn) { ui.stockFilter = btn.dataset.stock; renderCollection(); }
});
$('#collection-list').addEventListener('click', (e) => {
  const tg = e.target.closest('[data-toggle]');
  if (tg) { store.toggleStock(tg.dataset.toggle); return; }
  const ed = e.target.closest('[data-edit]');
  if (ed) openForm(ed.dataset.edit);
});

// ---------- Форма табаку ----------

const dialog = $('#tobacco-dialog');
const form = $('#tobacco-form');
$('#strength-select').innerHTML = STRENGTHS.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');

function renderTagPicker() {
  $('#tag-picker').innerHTML = CATEGORIES.map((c) =>
    `<button type="button" class="chip ${ui.formTags.includes(c.id) ? 'active' : ''}" data-tag="${c.id}">${c.emoji} ${c.label}</button>`
  ).join('');
}
$('#tag-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tag]');
  if (!btn) return;
  const id = btn.dataset.tag;
  if (ui.formTags.includes(id)) ui.formTags = ui.formTags.filter((x) => x !== id);
  else if (ui.formTags.length < 3) ui.formTags.push(id);
  else toast('Максимум 3 категорії');
  renderTagPicker();
});

function openForm(id = null) {
  const t = id && store.getState().tobaccos.find((x) => x.id === id);
  ui.editingId = t ? t.id : null;
  ui.formTags = t ? [...t.tags] : [];
  form.reset();
  form.name.value = t?.name || '';
  form.brand.value = t?.brand || '';
  form.strength.value = t?.strength || '';
  form.inStock.checked = t ? t.inStock : true;
  $('#dialog-title').textContent = t ? 'Редагувати табак' : 'Новий табак';
  $('#form-error').hidden = true;

  // Кнопка «Видалити» лише в режимі редагування.
  form.querySelector('#btn-delete')?.remove();
  if (t) {
    const del = document.createElement('button');
    del.type = 'button'; del.id = 'btn-delete'; del.className = 'btn btn-ghost';
    del.textContent = '🗑 Видалити'; del.style.marginRight = 'auto';
    del.onclick = () => {
      if (!confirm(`Видалити «${t.name}»?`)) return;
      store.deleteTobacco(t.id);
      dialog.close();
      toast('Видалено');
    };
    form.querySelector('.row-end').prepend(del);
  }
  renderTagPicker();
  dialog.showModal();
}

$('#btn-add').addEventListener('click', () => openForm());
$('#btn-cancel').addEventListener('click', () => dialog.close());

form.addEventListener('submit', (e) => {
  const name = form.name.value.trim();
  const err = $('#form-error');
  if (!name || !ui.formTags.length) {
    e.preventDefault();
    err.textContent = !name ? 'Вкажи смак' : 'Обери хоча б одну категорію смаку';
    err.hidden = false;
    return;
  }
  store.upsertTobacco({
    ...(ui.editingId ? { id: ui.editingId } : {}),
    name,
    brand: form.brand.value.trim(),
    tags: [...ui.formTags],
    strength: form.strength.value,
    inStock: form.inStock.checked,
  });
  toast(ui.editingId ? 'Збережено' : `Додано: ${name}`);
});

// ---------- Історія ----------

const HISTORY_FILTERS = [
  { id: 'all', label: 'Усі' },
  { id: 'up', label: '👍 Сподобались' },
  { id: 'down', label: '👎 Не зайшли' },
  { id: 'none', label: 'Без оцінки' },
];

function renderHistory() {
  const { history } = store.getState();
  $('#history-filter').innerHTML = HISTORY_FILTERS.map((f) =>
    `<button class="chip ${f.id === ui.historyFilter ? 'active' : ''}" data-hf="${f.id}">${f.label}</button>`
  ).join('');

  const match = { all: () => true, up: (h) => h.rating === 1, down: (h) => h.rating === -1, none: (h) => !h.rating };
  const list = history.filter(match[ui.historyFilter]).sort((a, b) => b.date - a.date);
  const el = $('#history-list');
  if (!history.length) {
    el.innerHTML = '<div class="empty">Історія порожня.<br>Обери мікс і натисни «Курю цей!»</div>';
    return;
  }
  if (!list.length) { el.innerHTML = '<div class="empty">Немає міксів з таким фільтром</div>'; return; }

  el.innerHTML = list.map((h) => {
    const mood = MOOD_BY_ID[h.mood];
    return `<div class="list-item">
      <div class="main">
        <div class="title">${esc(h.aName)} + ${esc(h.bName)}</div>
        <div class="sub">${esc(formatDate(h.date))}${mood && mood.id !== 'any' ? ` · ${mood.emoji} ${esc(mood.label)}` : ''}</div>
      </div>
      <div class="actions">
        <button class="btn btn-icon ${h.rating === 1 ? 'on-good' : ''}" data-hrate="1" data-id="${h.id}" aria-label="Сподобався">👍</button>
        <button class="btn btn-icon ${h.rating === -1 ? 'on-bad' : ''}" data-hrate="-1" data-id="${h.id}" aria-label="Не сподобався">👎</button>
        <button class="btn btn-ghost" data-hdel="${h.id}" aria-label="Видалити">✕</button>
      </div>
    </div>`;
  }).join('');
}

$('#history-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-hf]');
  if (btn) { ui.historyFilter = btn.dataset.hf; renderHistory(); }
});
$('#history-list').addEventListener('click', (e) => {
  const r = e.target.closest('[data-hrate]');
  if (r) { store.rateHistory(r.dataset.id, Number(r.dataset.hrate), true); return; }
  const d = e.target.closest('[data-hdel]');
  if (d && confirm('Видалити запис з історії?')) store.deleteHistory(d.dataset.hdel);
});

// ---------- Бекап ----------

$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tabak-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!confirm('Замінити поточну колекцію та історію даними з файлу?')) return;
  try {
    store.importJSON(await file.text());
    toast('Дані відновлено');
  } catch (err) {
    toast(`Не вдалося прочитати файл: ${err.message}`);
  }
});

// ---------- Старт ----------

function renderAll() {
  renderRateLast();
  renderCollection();
  renderHistory();
}

store.subscribe(renderAll);
renderMoods();
renderAll();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
