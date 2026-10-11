import { CATEGORY_BY_ID, MOODS, MOOD_BY_ID, STRENGTHS } from './flavors.js';
import { pickMix, pairKey } from './mixer.js';
import { BRANDS, loadCatalog, catalogInfo, allTobaccos } from './catalog.js';
import * as store from './store.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ui = {
  mood: 'any',
  mix: null,             // поточний показаний мікс
  search: '',
  brand: 'all',
  catFilter: 'all',      // all | home | rated | shop
  historyFilter: 'all',  // all | up | down | none
  detailId: null,
  draftRating: 0,
  catalogError: null,
};

// Табаки рахуються заново при кожному рендері: каталог + мої оцінки/коментарі/«вдома».
let tobaccos = [];
let byId = new Map();
function refreshTobaccos() {
  tobaccos = allTobaccos(store.getState().my);
  byId = new Map(tobaccos.map((t) => [t.id, t]));
}

// ---------- Загальне ----------

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

const tagsText = (tags) => (tags || []).map((id) => {
  const c = CATEGORY_BY_ID[id];
  return c ? `${c.emoji} ${c.label}` : id;
}).join(' · ');

const strengthLabel = (id) => (id ? STRENGTHS.find((s) => s.id === id)?.label : '');
const brandLine = (t) => [t.brand, t.line].filter(Boolean).join(' · ');

function starsText(rating) {
  return rating ? `<span class="stars-mini" aria-label="${rating} з 5">${'★'.repeat(rating)}<span class="off">${'★'.repeat(5 - rating)}</span></span>` : '';
}

function formatDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Сьогодні, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Вчора, ${time}`;
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }) + `, ${time}`;
}

// Відкрити картку табаку по кліку на будь-який елемент з data-open.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-home]')) return;
  const el = e.target.closest('[data-open]');
  if (el) openDetail(el.dataset.open);
});

// ---------- Мікс ----------

const SOURCES = [
  { id: 'home', label: '🏠 Вдома', filter: (t) => t.home },
  { id: 'top', label: '⭐ Мій топ', filter: (t) => t.rating >= 4 },
  { id: 'shop', label: '🛒 Магазин', filter: (t) => t.inStock && !t.gone },
];

function renderSources() {
  const cur = store.getState().settings.source;
  $('#sources').innerHTML = SOURCES.map((s) => {
    const n = tobaccos.filter(s.filter).length;
    return `<button class="chip ${s.id === cur ? 'active' : ''}" data-source="${s.id}">${s.label} <span class="count">${n}</span></button>`;
  }).join('');
}
$('#sources').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-source]');
  if (!btn) return;
  ui.mix = null;
  store.setSource(btn.dataset.source);
});

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

const SOURCE_EMPTY = {
  home: 'Відміть у «Каталозі» хоча б 2 табаки, які є вдома (кнопка 🏠).',
  top: 'Поки замало табаків з оцінкою 4–5★. Оціни їх у «Каталозі».',
  shop: 'Каталог магазину ще не завантажився.',
};

function doMix(excludeKey = null) {
  const source = SOURCES.find((s) => s.id === store.getState().settings.source) || SOURCES[0];
  const pool = tobaccos.filter(source.filter);
  ui.mix = pool.length < 2
    ? { error: SOURCE_EMPTY[source.id], goto: 'catalog' }
    : pickMix(pool, store.getState().history, ui.mood, excludeKey);
  renderMix();
}
$('#btn-mix').addEventListener('click', () => doMix());

// «№25 Lemon Yougurt (Лимон Йогурт)» → «№25 Lemon Yougurt»: смак і так видно нижче.
const shortName = (name) => name.replace(/\s*\([^)]*\)\s*$/, '') || name;

function tobaccoBlock(t) {
  return `<button type="button" class="mix-tobacco" data-open="${esc(t.id)}">
    <div class="brand">${esc(brandLine(t))}</div>
    <div class="name">${esc(shortName(t.name))}</div>
    <div class="flavor">${esc(t.flavor || tagsText(t.tags))}</div>
    ${t.rating ? `<div>${starsText(t.rating)}</div>` : ''}
    <div class="meta">${t.home ? '🏠 вдома' : t.inStock && t.price ? `🛒 ${t.price} грн` : t.gone ? 'немає в каталозі' : 'немає в наявності'}</div>
  </button>`;
}

function renderMix() {
  const el = $('#mix-result');
  const m = ui.mix;
  if (!m) { el.innerHTML = ''; return; }
  if (m.error) {
    el.innerHTML = `<div class="card empty">${esc(m.error)}
      ${m.goto ? '<br><button class="btn" data-goto="catalog">Відкрити каталог</button>' : ''}</div>`;
    return;
  }
  // Оновити дані табаків (могли змінитися оцінки), поки мікс показано.
  const a = byId.get(m.a.id) || m.a;
  const b = byId.get(m.b.id) || m.b;
  const mood = MOOD_BY_ID[ui.mood];
  el.innerHTML = `<div class="card mix-card">
    <div class="mix-pair">${tobaccoBlock(a)}<div class="mix-plus">+</div>${tobaccoBlock(b)}</div>
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
    store.addHistory(a, b, ui.mood);
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

// ---------- Каталог ----------

const CAT_FILTERS = [
  { id: 'all', label: 'Усі', filter: () => true },
  { id: 'home', label: '🏠 Вдома', filter: (t) => t.home },
  { id: 'rated', label: '⭐ Оцінені', filter: (t) => t.rating > 0 },
  { id: 'shop', label: '✅ Є в магазині', filter: (t) => t.inStock && !t.gone },
];

function tobaccoRow(t) {
  const right = t.gone
    ? '<span class="muted small">зник з каталогу</span>'
    : t.inStock ? `<span class="price">${t.price} ₴</span>` : '<span class="muted small">немає</span>';
  return `<div class="list-item tob ${t.inStock || t.home ? '' : 'out'}" data-open="${esc(t.id)}">
    ${t.img ? `<img class="thumb" src="${esc(t.img)}" alt="" loading="lazy" width="48" height="48">` : '<div class="thumb"></div>'}
    <div class="main">
      <div class="title">${esc(t.name)}</div>
      <div class="sub">${esc(brandLine(t))}${t.strength ? ` · ${esc(strengthLabel(t.strength))}` : ''}</div>
      <div class="sub">${esc(t.flavor || tagsText(t.tags))}</div>
      ${t.rating || t.comment ? `<div class="sub">${starsText(t.rating)}${t.comment ? ` 💬 ${esc(t.comment.slice(0, 60))}${t.comment.length > 60 ? '…' : ''}` : ''}</div>` : ''}
    </div>
    <div class="side">
      ${right}
      <button class="home-toggle ${t.home ? 'on' : ''}" data-home="${esc(t.id)}" aria-label="Є вдома" aria-pressed="${t.home}">🏠</button>
    </div>
  </div>`;
}

function renderCatalog() {
  $('#brand-filter').innerHTML = ['all', ...BRANDS].map((b) =>
    `<button class="chip ${b === ui.brand ? 'active' : ''}" data-brand="${b}">${b === 'all' ? 'Усі бренди' : b}</button>`
  ).join('');
  $('#catalog-filter').innerHTML = CAT_FILTERS.map((f) =>
    `<button class="chip ${f.id === ui.catFilter ? 'active' : ''}" data-cf="${f.id}">${f.label}</button>`
  ).join('');

  const el = $('#catalog-list');
  if (ui.catalogError && !tobaccos.length) {
    el.innerHTML = `<div class="empty">Не вдалося завантажити каталог (${esc(ui.catalogError)}).<br>Перевір інтернет і онови сторінку.</div>`;
    return;
  }

  const q = ui.search.trim().toLowerCase();
  const filter = CAT_FILTERS.find((f) => f.id === ui.catFilter).filter;
  const list = tobaccos
    .filter((t) => ui.brand === 'all' || t.brand === ui.brand)
    .filter(filter)
    .filter((t) => !q || `${t.brand} ${t.line} ${t.name} ${t.flavor} ${t.comment}`.toLowerCase().includes(q))
    .sort((a, b) => (b.inStock - a.inStock) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name, 'uk'));

  el.innerHTML = `<p class="muted small">Знайдено: ${list.length}</p>` +
    (list.length ? list.map(tobaccoRow).join('') : '<div class="empty">Нічого не знайдено</div>');

  const info = catalogInfo();
  $('#catalog-info').textContent = info.updatedAt
    ? `Ціни та наявність: aladin-kyiv.com, оновлено ${new Date(info.updatedAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}.`
    : '';
}

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { ui.search = e.target.value; renderCatalog(); }, 150);
});
$('#brand-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-brand]');
  if (btn) { ui.brand = btn.dataset.brand; renderCatalog(); }
});
$('#catalog-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cf]');
  if (btn) { ui.catFilter = btn.dataset.cf; renderCatalog(); }
});
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-home]');
  if (!btn) return;
  const t = byId.get(btn.dataset.home);
  if (!t) return;
  store.updateMy(t, { home: !t.home });
  toast(t.home ? `Прибрав з дому: ${t.name}` : `🏠 Вдома: ${t.name}`);
});

// ---------- Картка табаку: оцінка, коментар, «вдома» ----------

const dialog = $('#tobacco-dialog');
const form = $('#tobacco-form');
const STAR_HINTS = ['Натисни на зірку, щоб оцінити', 'Не сподобався — не пропонуватиму', 'Так собі — не пропонуватиму', 'Нормально', 'Добрий — у топі', 'Улюблений — у топі'];

function renderDraftStars() {
  $('#d-stars').innerHTML = [1, 2, 3, 4, 5].map((n) =>
    `<button type="button" class="star ${n <= ui.draftRating ? 'on' : ''}" data-star="${n}" role="radio" aria-checked="${n === ui.draftRating}" aria-label="${n} з 5">★</button>`
  ).join('');
  $('#d-stars-hint').textContent = STAR_HINTS[ui.draftRating];
}
$('#d-stars').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-star]');
  if (!btn) return;
  const n = Number(btn.dataset.star);
  ui.draftRating = ui.draftRating === n ? 0 : n;
  renderDraftStars();
});

function statBar(label, v) {
  if (v === null || v === undefined) return '';
  return `<div class="stat"><span>${label}</span><span class="bar"><i style="width:${Math.min(v, 5) * 20}%"></i></span></div>`;
}

function openDetail(id) {
  const t = byId.get(id);
  if (!t) return;
  ui.detailId = id;
  ui.draftRating = t.rating;
  const img = $('#d-img');
  img.hidden = !t.img;
  if (t.img) img.src = t.img;
  $('#d-brand').textContent = brandLine(t) + (t.strength ? ` · ${strengthLabel(t.strength)}` : '');
  $('#d-name').textContent = t.name;
  $('#d-flavor').textContent = t.flavor || '';
  $('#d-tags').textContent = tagsText(t.tags);
  $('#d-stats').innerHTML = statBar('Солодкість', t.sweetness) + statBar('Кислинка', t.sourness) + statBar('Свіжість', t.freshness);
  $('#d-shop').innerHTML = t.gone
    ? '<span class="muted">Цього табаку вже немає в каталозі магазину</span>'
    : `<span>${t.inStock ? `✅ Є в магазині · <b>${t.price} ₴</b>` : '❌ Немає в наявності'}</span>
       ${t.url ? `<a class="btn btn-small" href="${esc(t.url)}" target="_blank" rel="noopener">У магазин ↗</a>` : ''}`;
  form.comment.value = t.comment;
  form.home.checked = t.home;
  renderDraftStars();
  dialog.showModal();
  form.comment.blur();
}

$('#btn-cancel').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // тап по фону

form.addEventListener('submit', () => {
  const t = byId.get(ui.detailId);
  if (!t) return;
  store.updateMy(t, { rating: ui.draftRating, comment: form.comment.value.trim(), home: form.home.checked });
  toast('Збережено');
});

// ---------- Топ ----------

function renderTop() {
  const top = tobaccos.filter((t) => t.rating >= 4)
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, 'uk'));
  const bad = tobaccos.filter((t) => t.rating && t.rating <= 2)
    .sort((a, b) => a.rating - b.rating || a.name.localeCompare(b.name, 'uk'));

  // Улюблені мікси: пари з 👍 в історії.
  const mixes = new Map();
  for (const h of store.getState().history) {
    if (h.rating !== 1) continue;
    const k = pairKey(h.a, h.b);
    const m = mixes.get(k) || { aName: h.aName, bName: h.bName, likes: 0, last: 0 };
    m.likes++;
    m.last = Math.max(m.last, h.date);
    mixes.set(k, m);
  }
  const topMixes = [...mixes.values()].sort((a, b) => b.likes - a.likes || b.last - a.last);

  const row = (t, i) => `<div class="list-item tob" data-open="${esc(t.id)}">
    ${i !== undefined ? `<div class="rank">${i + 1}</div>` : ''}
    <div class="main">
      <div class="title">${esc(t.name)}</div>
      <div class="sub">${esc(brandLine(t))} · ${starsText(t.rating)}</div>
      ${t.comment ? `<div class="sub comment">💬 ${esc(t.comment)}</div>` : ''}
    </div>
  </div>`;

  $('#top-content').innerHTML = `
    <h2 class="section-title">🏆 Топ смаки (4–5★)</h2>
    ${top.length ? top.map((t, i) => row(t, i)).join('') : '<div class="empty small">Поки порожньо. Відкрий табак у «Каталозі» й постав 4–5★.</div>'}

    <h2 class="section-title">❤️ Улюблені мікси</h2>
    ${topMixes.length ? topMixes.map((m) => `<div class="list-item"><div class="main">
        <div class="title">${esc(m.aName)} + ${esc(m.bName)}</div>
        <div class="sub">👍 × ${m.likes} · востаннє ${esc(formatDate(m.last))}</div></div></div>`).join('')
      : '<div class="empty small">Тут з\'являться мікси, яким ти поставив 👍.</div>'}

    <h2 class="section-title">👎 Не сподобались (1–2★)</h2>
    <p class="muted small">Ці табаки не потрапляють у мікси.</p>
    ${bad.length ? bad.map((t) => row(t)).join('') : '<div class="empty small">Таких поки немає 🙌</div>'}
  `;
}

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
  if (!confirm('Замінити поточні оцінки, коментарі та історію даними з файлу?')) return;
  try {
    store.importJSON(await file.text());
    toast('Дані відновлено');
  } catch (err) {
    toast(`Не вдалося прочитати файл: ${err.message}`);
  }
});

// ---------- Старт ----------

function renderAll() {
  refreshTobaccos();
  renderRateLast();
  renderSources();
  renderMix();
  renderCatalog();
  renderTop();
  renderHistory();
}

store.subscribe(renderAll);
renderMoods();
renderAll();

loadCatalog()
  .catch((err) => { ui.catalogError = err.message; })
  .finally(() => {
    // Перший запуск: поки вдома нічого немає — мікс з магазину.
    const s = store.getState();
    if (s.settings.source === 'home' && !Object.values(s.my).some((m) => m.home)) store.setSource('shop');
    else renderAll();
  });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
