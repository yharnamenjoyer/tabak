// Збереження даних у localStorage телефона + експорт/імпорт бекапу.

const KEY = 'tabak:v1';

const empty = () => ({ tobaccos: [], history: [] });

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return normalize(JSON.parse(raw));
  } catch {
    return empty();
  }
}

function normalize(data) {
  if (!data || !Array.isArray(data.tobaccos) || !Array.isArray(data.history)) {
    throw new Error('Невірний формат файлу');
  }
  return {
    tobaccos: data.tobaccos.map((t) => ({
      id: String(t.id),
      name: String(t.name || '').trim(),
      brand: String(t.brand || '').trim(),
      tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
      strength: t.strength || '',
      inStock: t.inStock !== false,
      createdAt: Number(t.createdAt) || Date.now(),
    })),
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

export const displayName = (t) => (t.brand ? `${t.brand} — ${t.name}` : t.name);

export function upsertTobacco(data) {
  const existing = data.id && state.tobaccos.find((t) => t.id === data.id);
  if (existing) {
    Object.assign(existing, data);
  } else {
    state.tobaccos.push({ inStock: true, createdAt: Date.now(), ...data, id: uid() });
  }
  save();
}

export function toggleStock(id) {
  const t = state.tobaccos.find((x) => x.id === id);
  if (t) { t.inStock = !t.inStock; save(); }
}

export function deleteTobacco(id) {
  state.tobaccos = state.tobaccos.filter((t) => t.id !== id);
  save();
}

export function addHistory(a, b, mood) {
  const entry = {
    id: uid(), a: a.id, b: b.id, aName: displayName(a), bName: displayName(b),
    mood, date: Date.now(), rating: 0,
  };
  state.history.push(entry);
  save();
  return entry;
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
  return JSON.stringify({ app: 'tabak', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importJSON(text) {
  state = normalize(JSON.parse(text));
  save();
}

export function addExamples() {
  const examples = [
    ['Лимон', ['citrus'], 'light'],
    ['Малина', ['berry'], 'medium'],
    ["М'ята з льодом", ['fresh'], 'medium'],
    ['Манго', ['tropical', 'fruit'], 'light'],
    ['Чізкейк', ['dessert', 'creamy'], 'medium'],
    ['Грейпфрут', ['citrus'], 'medium'],
    ['Кавун', ['fruit', 'fresh'], 'light'],
    ['Ваніль', ['dessert', 'creamy'], 'light'],
    ['Лохина', ['berry'], 'medium'],
    ['Мохіто', ['drink', 'fresh', 'citrus'], 'medium'],
  ];
  for (const [name, tags, strength] of examples) {
    state.tobaccos.push({
      id: uid(), name, brand: 'Приклад', tags, strength, inStock: true, createdAt: Date.now(),
    });
  }
  save();
}
