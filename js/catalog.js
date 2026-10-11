// Каталог табаків з магазину (data/catalog.json, оновлює scraper/aladin.py) + особисті дані з store.

export const BRANDS = ['Gedonist', '420', 'Unity', 'Custom'];

let catalog = { items: [], updatedAt: null, source: '' };

export async function loadCatalog() {
  const res = await fetch('data/catalog.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  catalog = await res.json();
  return catalog;
}

export const catalogInfo = () => catalog;

/** Усі табаки: каталог + особисті дані. Табаки, яких уже немає в каталозі, але ти їх оцінив, теж лишаються. */
export function allTobaccos(my) {
  const out = catalog.items.map((t) => withMy(t, my[t.id]));
  const ids = new Set(catalog.items.map((t) => t.id));
  for (const [id, m] of Object.entries(my)) {
    if (!ids.has(id) && m.snap) {
      out.push(withMy({ id, ...m.snap, inStock: false, gone: true, price: null, url: null, img: null }, m));
    }
  }
  return out;
}

function withMy(t, m) {
  return { ...t, home: !!m?.home, rating: m?.rating || 0, comment: m?.comment || '' };
}
