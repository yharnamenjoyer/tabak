"""Перетворює поле «Смак» з сайту (список інгредієнтів через кому) на категорії апки:
fruit, berry, citrus, tropical, fresh, dessert, creamy, spice, floral, drink, nut."""
import re

# Точна відповідність інгредієнт → категорії (усе в нижньому регістрі).
INGREDIENTS = {
    'ананас': ['tropical'], 'апельсин': ['citrus'], 'сицилійський апельсин': ['citrus'],
    'арахіс': ['nut'], 'аґрус': ['berry'], 'агрус': ['berry'], 'базилік': ['spice'], 'бамбук': ['fresh'],
    'банан': ['tropical'], 'барбарис': ['berry'], 'бергамот': ['citrus'], 'бузок': ['floral'],
    'ваніль': ['dessert'], 'вафлі': ['dessert'], 'вершки': ['creamy'], 'виноград': ['fruit'],
    'чорний виноград': ['fruit'], 'вишня': ['fruit'], 'мараскінова вишня': ['fruit'], 'віскі': ['drink'],
    'горіх': ['nut'], 'гранат': ['fruit'], 'грейпфрут': ['citrus'], 'груша': ['fruit'], 'гуава': ['tropical'],
    'гуарана': ['drink'], 'джем': ['dessert'], 'диня': ['fruit'], 'енергетик': ['drink'], 'жуйка': ['dessert'],
    'солодка жуйка': ['dessert'], 'журавлина': ['berry'], 'згущене молоко': ['creamy'],
    'зелене яблуко': ['fruit'], 'яблуко': ['fruit'], 'йогурт': ['creamy'], 'йошта': ['berry'],
    'кавун': ['fruit'], 'какао': ['dessert'], 'кактус': ['fresh'], 'карамболь': ['tropical'],
    'кокос': ['tropical'], 'коктейль': ['drink'], 'кола': ['drink'], 'кориця': ['spice'], 'крем': ['creamy'],
    'кумкват': ['citrus'], 'ківі': ['tropical'], 'лаванда': ['floral'], 'лайм': ['citrus'],
    'лемонграс': ['citrus'], 'лимон': ['citrus'], 'лимонад': ['drink'], 'лонган': ['tropical'],
    'лохина': ['berry'], 'льодяник': ['dessert'], 'лід': ['fresh'], 'лікер': ['drink'],
    'лімончелло': ['citrus', 'drink'], 'лічі': ['tropical'], "м'ята": ['fresh'], 'малина': ['berry'],
    'манго': ['tropical'], 'мандарин': ['citrus'], 'маракуя': ['tropical'], 'мармелад': ['dessert'],
    'марула': ['tropical'], 'маршмеллоу': ['dessert'], 'мед': ['dessert'], 'мелісса': ['fresh'],
    'меліса': ['fresh'], 'молоко': ['creamy'], 'морозиво': ['creamy', 'dessert'], 'морс': ['drink'],
    'моті': ['dessert'], 'мохіто': ['drink', 'fresh'], 'обліпиха': ['berry'], 'огірок': ['fresh'],
    'ожина': ['berry'], 'папая': ['tropical'], 'персик': ['fruit'], 'печиво': ['dessert'],
    'пиріг': ['dessert'], 'пластівці': ['dessert'], 'полуниця': ['berry'], 'помело': ['citrus'],
    'пітая': ['tropical'], 'рафаелло': ['dessert', 'creamy'], 'ром': ['drink'], 'сидр': ['drink'],
    'скіттлс': ['dessert'], 'слива': ['fruit'], 'смузі': ['drink'], 'спеції': ['spice'], 'суниця': ['berry'],
    'сік': ['drink'], 'тархун': ['spice'], 'текіла': ['drink'], 'тонік': ['drink'], 'трави': ['spice'],
    'тропічні фрукти': ['tropical'], 'тік-так': ['dessert'], 'фанта': ['drink'], 'фейхоа': ['tropical'],
    'фісташки': ['nut'], 'хвоя': ['fresh'], 'цедра': ['citrus'], 'цитрус': ['citrus'], 'цукерки': ['dessert'],
    'цукор': ['dessert'], 'чай': ['drink'], 'червона смородина': ['berry'], 'чорна смородина': ['berry'],
    'чорниця': ['berry'], 'шавлія': ['spice'], 'шампанське': ['drink'], 'шовковиця': ['berry'],
    'шоколад': ['dessert'], 'юдзу': ['citrus'], 'ягоди': ['berry'], 'імбир': ['spice'],
    'карамель': ['dessert'], 'кава': ['drink'], 'троянда': ['floral'], 'жасмин': ['floral'],
    'ментол': ['fresh'], 'евкаліпт': ['fresh'], 'вино': ['drink'], 'мигдаль': ['nut'], 'фундук': ['nut'],
    'абрикос': ['fruit'], 'айва': ['fruit'], 'чізкейк': ['dessert', 'creamy'], 'гібіскус': ['floral'],
}

# Запасний варіант для нових інгредієнтів: початок слова → категорія.
PREFIXES = [
    ('ягід', 'berry'), ('ягод', 'berry'), ('смородин', 'berry'), ('полуни', 'berry'), ('малин', 'berry'),
    ('цитрус', 'citrus'), ('лимон', 'citrus'), ('апельсин', 'citrus'),
    ('тропі', 'tropical'), ('фрукт', 'fruit'), ('яблу', 'fruit'),
    ("м'ят", 'fresh'), ('льод', 'fresh'), ('свіж', 'fresh'), ('холод', 'fresh'),
    ('цукер', 'dessert'), ('солод', 'dessert'), ('карамел', 'dessert'), ('шоколад', 'dessert'), ('торт', 'dessert'),
    ('вершк', 'creamy'), ('молоч', 'creamy'), ('крем', 'creamy'),
    ('прян', 'spice'), ('тютюн', 'spice'), ('квіт', 'floral'), ('горіх', 'nut'),
    ('напій', 'drink'), ('лимонад', 'drink'), ('коктейл', 'drink'),
]

unknown = set()  # інгредієнти, яких немає в таблиці (скрейпер покаже їх наприкінці)


def _ingredient_tags(ing):
    if ing in INGREDIENTS:
        return INGREDIENTS[ing]
    words = re.findall(r"[\w'-]+", ing)
    found = [cat for w in words for pre, cat in PREFIXES if w.startswith(pre)]
    if not found:
        unknown.add(ing)
    return found


def tags_for(flavor, freshness=None, limit=3):
    text = (flavor or '').lower().replace('’', "'").replace('ʼ', "'")
    score, order = {}, []
    for ing in (x.strip() for x in text.split(',')):
        if not ing:
            continue
        for cat in _ingredient_tags(ing):
            if cat not in score:
                order.append(cat)
            score[cat] = score.get(cat, 0) + 1
    if freshness is not None and freshness >= 3 and 'fresh' not in score:
        order.append('fresh')
        score['fresh'] = 1
    # Частіші категорії — вище; при рівності — у порядку появи.
    ranked = sorted(order, key=lambda c: (-score[c], order.index(c)))
    return ranked[:limit]
