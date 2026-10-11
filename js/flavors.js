// Категорії смаків, сумісність між ними та настрої.

export const CATEGORIES = [
  { id: 'fruit', label: 'Фрукти', emoji: '🍑' },
  { id: 'berry', label: 'Ягоди', emoji: '🫐' },
  { id: 'citrus', label: 'Цитрус', emoji: '🍋' },
  { id: 'tropical', label: 'Тропік', emoji: '🥭' },
  { id: 'fresh', label: 'Свіжість', emoji: '🌿' },
  { id: 'dessert', label: 'Десерт', emoji: '🍰' },
  { id: 'creamy', label: 'Вершкове', emoji: '🥛' },
  { id: 'spice', label: 'Пряне', emoji: '🌶️' },
  { id: 'floral', label: 'Квіти', emoji: '🌸' },
  { id: 'drink', label: 'Напої', emoji: '🍹' },
  { id: 'nut', label: 'Горіхи', emoji: '🥜' },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// Оцінка поєднання двох категорій: 2 — чудово, 1 — добре, 0 — нейтрально, -1 — сумнівно.
// Пари, яких тут немає, вважаються нейтральними (0). Однакові категорії — 1.
const PAIRS = {
  'fruit|berry': 2, 'fruit|citrus': 1, 'fruit|tropical': 2, 'fruit|fresh': 2,
  'fruit|dessert': 1, 'fruit|creamy': 1, 'fruit|floral': 1, 'fruit|drink': 1,
  'fruit|spice': 0, 'fruit|nut': -1,
  'berry|citrus': 2, 'berry|tropical': 1, 'berry|fresh': 2, 'berry|dessert': 2,
  'berry|creamy': 2, 'berry|floral': 1, 'berry|drink': 1, 'berry|spice': 0, 'berry|nut': 0,
  'citrus|tropical': 2, 'citrus|fresh': 2, 'citrus|dessert': 1, 'citrus|creamy': -1,
  'citrus|floral': 1, 'citrus|drink': 2, 'citrus|spice': 1, 'citrus|nut': -1,
  'tropical|fresh': 2, 'tropical|dessert': 1, 'tropical|creamy': 2, 'tropical|floral': 0,
  'tropical|drink': 2, 'tropical|spice': 0, 'tropical|nut': 0,
  'fresh|dessert': 0, 'fresh|creamy': -1, 'fresh|floral': 1, 'fresh|drink': 2,
  'fresh|spice': -1, 'fresh|nut': -1,
  'dessert|creamy': 2, 'dessert|spice': 2, 'dessert|nut': 2, 'dessert|drink': 1, 'dessert|floral': -1,
  'creamy|spice': 1, 'creamy|nut': 2, 'creamy|drink': 1, 'creamy|floral': 0,
  'spice|nut': 1, 'spice|drink': 1, 'spice|floral': -1,
  'floral|drink': 1, 'floral|nut': -1,
  'drink|nut': 0,
};

export function categoryCompat(a, b) {
  if (a === b) return 1;
  return PAIRS[`${a}|${b}`] ?? PAIRS[`${b}|${a}`] ?? 0;
}

// Середня сумісність усіх тегів одного табаку з тегами іншого (від -1 до 2).
export function tagsCompat(tagsA, tagsB) {
  if (!tagsA.length || !tagsB.length) return 0;
  let sum = 0;
  for (const a of tagsA) for (const b of tagsB) sum += categoryCompat(a, b);
  return sum / (tagsA.length * tagsB.length);
}

// must  — хоча б один табак у парі має мати одну з цих категорій;
// allow — кожен табак має мати хоча б одну категорію з цього списку.
export const MOODS = [
  { id: 'any', label: 'Будь-що', emoji: '🎲' },
  {
    id: 'fresh', label: 'Свіже', emoji: '❄️',
    must: ['fresh', 'citrus'],
    allow: ['fresh', 'citrus', 'berry', 'fruit', 'tropical', 'drink', 'floral'],
  },
  {
    id: 'sweet', label: 'Солодке', emoji: '🍬',
    must: ['dessert', 'tropical', 'fruit', 'creamy'],
    allow: ['dessert', 'creamy', 'fruit', 'tropical', 'berry', 'nut', 'drink'],
  },
  {
    id: 'sour', label: 'Кисле', emoji: '🍋',
    must: ['citrus', 'berry'],
    allow: ['citrus', 'berry', 'fruit', 'fresh', 'tropical', 'drink'],
  },
  {
    id: 'dessert', label: 'Десертне', emoji: '🍰',
    must: ['dessert', 'creamy', 'nut'],
    allow: ['dessert', 'creamy', 'nut', 'berry', 'fruit', 'spice', 'drink'],
  },
  {
    id: 'fruity', label: 'Фруктове', emoji: '🍉',
    must: ['fruit', 'berry', 'tropical', 'citrus'],
    allow: ['fruit', 'berry', 'tropical', 'citrus', 'fresh', 'floral', 'drink'],
  },
];

export const MOOD_BY_ID = Object.fromEntries(MOODS.map((m) => [m.id, m]));

export const STRENGTHS = [
  { id: '', label: 'Не вказано' },
  { id: 'light', label: 'Легкий' },
  { id: 'medium', label: 'Середній' },
  { id: 'strong', label: 'Міцний' },
];
