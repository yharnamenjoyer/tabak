// Особисті дані користувача (у localStorage телефона): що є вдома, оцінки, коментарі, історія міксів.
// Каталог табаків — окремо, у data/catalog.json (див. catalog.js).

const KEY = 'tabak:v2';

const empty = () => ({ my: {}, history: [], settings: { source: 'home' } });

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : empty();
  } catch {
    return empty();
  }
}

function normalize(data) {
  if (!data || typeof data.my !== 'object' || !Array.isArray(data.history)) {
    throw new Error('Невірний формат файлу');
  }
  const my = {};
  for (const [id, m] of Object.entries(data.my)) {
    my[id] = {
      home: !!m.home,
      rating: [1, 2, 3, 4, 5].includes(m.rating) ? m.rating : 0,
      comment: String(m.comment || ''),
      updatedAt: Number(m.updatedAt) || Date.now(),
      snap: m.snap && typeof m.snap === 'object' ? m.snap : null,
    };
  }
  return {
    my,
    history: data.history.map((h) => ({
      id: String(h.id),
      a: String(h.a),
      b: String(h.b),
      aName: String(h.aName || ''),
      bName: String(h.bName || ''),
      mood: h.mood || 'any',
      date: Number(h.date) || Date.now(),
      rating: h.rating === 1 || h.rating === -1 ? h.rating : 0,
    })),
    settings: { source: 'home', ...(data.settings || {}) },
  };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Немає доступу до сховища (приватний режим тощо) — працюємо лише в пам'яті.
  }
  listeners.forEach((fn) => fn(state));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const getState = () => state;
export const subscribe = (fn) => listeners.add(fn);

export const displayName = (t) => `${t.brand} ${t.name}`.trim();

// Знімок основних полів табаку — щоб оцінка й коментар не загубились, якщо табак зникне з каталогу.
const snapshot = (t) => ({ brand: t.brand, line: t.line, name: t.name, flavor: t.flavor, tags: t.tags, strength: t.strength });

// Оновити особисті дані табаку: { home?, rating?, comment? }.
export function updateMy(tobacco, patch) {
  const prev = state.my[tobacco.id] || { home: false, rating: 0, comment: '' };
  const next = { ...prev, ...patch, updatedAt: Date.now(), snap: snapshot(tobacco) };
  if (!next.home && !next.rating && !next.comment.trim()) delete state.my[tobacco.id];
  else state.my[tobacco.id] = next;
  save();
}

export function setSource(source) {
  state.settings.source = source;
  save();
}

export function addHistory(a, b, mood) {
  state.history.push({
    id: uid(), a: a.id, b: b.id, aName: displayName(a), bName: displayName(b),
    mood, date: Date.now(), rating: 0,
  });
  save();
}

// toggle: повторне натискання тієї самої оцінки знімає її (для списку історії).
export function rateHistory(id, rating, toggle = false) {
  const h = state.history.find((x) => x.id === id);
  if (h) { h.rating = toggle && h.rating === rating ? 0 : rating; save(); }
}

export function deleteHistory(id) {
  state.history = state.history.filter((h) => h.id !== id);
  save();
}

export function exportJSON() {
  return JSON.stringify({ app: 'tabak', version: 2, exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importJSON(text) {
  state = normalize(JSON.parse(text));
  save();
}
