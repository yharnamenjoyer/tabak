// Вибір міксу з двох табаків: «розумний рандом» з урахуванням смаків, оцінок та історії.
import { tagsCompat, MOOD_BY_ID } from './flavors.js';

export const pairKey = (idA, idB) => [idA, idB].sort().join('+');

const DAY = 86400000;
const RECENT_TOBACCOS = 2;  // табаки з цієї кількості останніх міксів (за 2 дні) трохи штрафуються
const TEMPERATURE = 1.5;    // що більше, то частіше обираються саме найкращі пари

function fitsMood(a, b, mood) {
  if (!mood || mood.id === 'any') return true;
  const allowed = (t) => t.tags.some((c) => mood.allow.includes(c));
  const hasMust = (t) => t.tags.some((c) => mood.must.includes(c));
  return allowed(a) && allowed(b) && (hasMust(a) || hasMust(b));
}

// Статистика оцінок з історії: по парах і по окремих табаках.
function ratingStats(history) {
  const pairs = new Map();
  const tobaccos = new Map();
  const bump = (map, key, r) => {
    const s = map.get(key) || { up: 0, down: 0 };
    if (r > 0) s.up++; else s.down++;
    map.set(key, s);
  };
  for (const h of history) {
    if (!h.rating) continue;
    bump(pairs, pairKey(h.a, h.b), h.rating);
    bump(tobaccos, h.a, h.rating);
    bump(tobaccos, h.b, h.rating);
  }
  return { pairs, tobaccos };
}

export function scorePair(a, b, ctx) {
  const reasons = [];
  const compat = tagsCompat(a.tags, b.tags);
  let score = compat * 1.5;

  const key = pairKey(a.id, b.id);
  const ps = ctx.stats.pairs.get(key);
  if (ps) {
    score += Math.min(ps.up, 3) * 1.5 - ps.down * 2.5;
    if (ps.up > ps.down) reasons.push('тобі вже подобався');
    if (ps.down > ps.up) reasons.push('раніше не зайшов');
  }
  for (const t of [a, b]) {
    const ts = ctx.stats.tobaccos.get(t.id);
    if (ts) score += (ts.up - ts.down) * 0.25;
  }

  // Штраф за нещодавно курений мікс: що свіжіше, то сильніший.
  const lastSmoked = ctx.lastSmoked.get(key);
  const daysAgo = lastSmoked ? (ctx.now - lastSmoked) / DAY : Infinity;
  if (daysAgo < 1) score -= 4;
  else if (daysAgo < 3) score -= 2.5;
  else if (daysAgo < 7) score -= 1;
  if (daysAgo < 3) reasons.push('курив недавно');
  for (const t of [a, b]) if (ctx.recentTobaccos.has(t.id)) score -= 0.7;

  if (!lastSmoked) reasons.push('ще не пробував');
  return { score, compat, reasons };
}

function compatLabel(compat) {
  if (compat >= 1.5) return 'Чудове поєднання';
  if (compat >= 0.75) return 'Добре поєднання';
  if (compat >= 0) return 'Цікавий експеримент';
  return 'Сміливий експеримент';
}

/**
 * Повертає мікс { a, b, key, compat, label, reasons } або { error }.
 * excludeKey — пара, яку зараз показано (щоб «Інший мікс» не повторював її).
 */
export function pickMix(tobaccos, history, moodId = 'any', excludeKey = null) {
  const inStock = tobaccos.filter((t) => t.inStock && t.tags.length);
  if (inStock.length < 2) {
    return { error: 'Додай хоча б 2 табаки, що є вдома (з категоріями смаку).' };
  }

  const mood = MOOD_BY_ID[moodId];
  const now = Date.now();
  const sorted = [...history].sort((x, y) => y.date - x.date);
  const lastSmoked = new Map();
  for (const h of sorted) {
    const k = pairKey(h.a, h.b);
    if (!lastSmoked.has(k)) lastSmoked.set(k, h.date);
  }
  const ctx = {
    now,
    stats: ratingStats(history),
    lastSmoked,
    recentTobaccos: new Set(sorted.slice(0, RECENT_TOBACCOS)
      .filter((h) => now - h.date < 2 * DAY)
      .flatMap((h) => [h.a, h.b])),
  };

  let candidates = [];
  for (let i = 0; i < inStock.length; i++) {
    for (let j = i + 1; j < inStock.length; j++) {
      const a = inStock[i], b = inStock[j];
      if (!fitsMood(a, b, mood)) continue;
      candidates.push({ a, b, key: pairKey(a.id, b.id), ...scorePair(a, b, ctx) });
    }
  }
  if (!candidates.length) {
    return { error: `Для настрою «${mood.label}» не знайшлося пари. Спробуй інший настрій або додай табаків.` };
  }
  if (candidates.length > 1 && excludeKey) {
    candidates = candidates.filter((c) => c.key !== excludeKey);
  }

  // Зважений випадковий вибір: що вищий score, то більший шанс, але слабші пари теж іноді випадають.
  const best = Math.max(...candidates.map((c) => c.score));
  const weights = candidates.map((c) => Math.exp((c.score - best) * TEMPERATURE));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  let pick = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) { pick = candidates[i]; break; }
  }

  // Випадковий порядок, щоб один і той самий табак не був завжди «першим».
  const [a, b] = Math.random() < 0.5 ? [pick.a, pick.b] : [pick.b, pick.a];
  return { a, b, key: pick.key, compat: pick.compat, label: compatLabel(pick.compat), reasons: pick.reasons };
}
