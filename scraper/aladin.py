#!/usr/bin/env python3
"""Збирає каталог табаків 100 г (Gedonist, 420, Unity, Custom) з aladin-kyiv.com у data/catalog.json.

Запуск:  python3 scraper/aladin.py
Опції:   --cache DIR   зберігати завантажені сторінки (щоб не качати повторно під час налагодження)
         --delay SEC   пауза між запитами (за замовчуванням 1 с, щоб не навантажувати сайт)
Лише стандартна бібліотека Python.
"""
import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flavor_tags  # noqa: E402
from flavor_tags import tags_for  # noqa: E402

BASE = 'https://aladin-kyiv.com'
UA = 'Mozilla/5.0 (tabak-mixer personal catalog; +https://github.com/yharnamenjoyer/tabak)'

# (бренд, лінійка за замовчуванням, категорія з товарами 100 г)
SOURCES = [
    ('Gedonist', '', '/ua/tabak-dlya-kalyana/tyutyun-gedonist/tyutyun-gedonist-100-hr/'),
    ('420', 'Classic Line', '/ua/tabak-dlya-kalyana/tabak-4-20/tyutyun-420-classic-line/tyutyun-420-classic-line-100-gr/'),
    ('420', 'Light Line', '/ua/tabak-dlya-kalyana/tabak-4-20/tyutyun-420-light-line/tabak-420-light-line-100-gr/'),
    ('Unity', 'Urban Collection', '/ua/tabak-dlya-kalyana/tabak-unity/-tabak-unity-urban-collection/tabak-unity-urban-collection-100-gr/'),
    ('Custom', '', '/ua/tabak-dlya-kalyana/tyutyun-custom/tyutyun-custom-100-hr/'),
]

# Бустери — це добавки для міцності, а не смаки, тому їх не беремо.
SKIP = re.compile(r'booster|бустер', re.I)

args = None


def fetch(path):
    url = path if path.startswith('http') else BASE + path
    if args.cache:
        key = os.path.join(args.cache, hashlib.md5(url.encode()).hexdigest() + '.html')
        if os.path.exists(key):
            with open(key, encoding='utf-8') as f:
                return f.read()
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                text = r.read().decode('utf-8', 'replace')
            break
        except Exception as e:  # мережевий збій — пробуємо ще раз
            if attempt == 2:
                raise
            print(f'  retry {url}: {e}', file=sys.stderr)
            time.sleep(3)
    time.sleep(args.delay)
    if args.cache:
        os.makedirs(args.cache, exist_ok=True)
        with open(key, 'w', encoding='utf-8') as f:
            f.write(text)
    return text


def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


def parse_cards(page):
    cards = []
    for m in re.finditer(r'<div class="product-slider-slide">(.*?)class="product-slider-slide__icons"', page, re.S):
        c = m.group(1)
        url = re.search(r'class="product-name" href="([^"]+)"', c)
        name = re.search(r'product-slider-slide__name">([^<]+)<', c)
        price = re.search(r'product-slider-slide__price[^"]*">\s*([^<]+?)\s*<', c)
        img = re.search(r'src="(/images/products/[^"]+)"', c)
        if not (url and name):
            continue
        digits = re.sub(r'\D', '', price.group(1)) if price else ''
        cards.append({
            'url': BASE + url.group(1),
            'fullName': clean(name.group(1)),
            'price': int(digits) if digits else None,
            'inStock': 'buy_disabled' not in c,
            'img': BASE + img.group(1) if img else None,
        })
    return cards


def list_category(path):
    seen, out = set(), []
    for page_no in range(1, 30):
        page = fetch(path if page_no == 1 else f'{path}?page={page_no}')
        new = [c for c in parse_cards(page) if c['url'] not in seen]
        if not new:
            break
        for c in new:
            seen.add(c['url'])
        out += new
    return out


def parse_characteristics(page):
    chars = {}
    for m in re.finditer(
        r'product-characteristics__name">(.*?)</div>\s*<div class="product-characteristics__value">(.*?)</div>',
        page, re.S,
    ):
        chars[clean(re.sub(r'<[^>]+>', ' ', m.group(1)))] = clean(re.sub(r'<[^>]+>', ' ', m.group(2)))
    return chars


def short_name(full, brand, line):
    s = re.sub(r'^Тютюн\s+', '', full)
    s = re.sub(r'\s*\d+\s*гр?\.?$', '', s)
    s = re.sub(rf'^{re.escape(brand)}\s+', '', s, flags=re.I)
    detected = line
    m = re.match(r'^((?:Classic|Light|Dark)(?:\s+Frost)?\s+Line|Urban Collection)\s+', s, re.I)
    if m:
        detected = m.group(1)
        s = s[m.end():]
    return s.strip(), detected


def to_int(v):
    m = re.search(r'\d+', v or '')
    return int(m.group()) if m else None


STRENGTH = {'легк': 'light', 'середн': 'medium', 'міцн': 'strong', 'вище середн': 'strong'}


def strength_id(v):
    v = (v or '').lower()
    for key in ('вище середн', 'легк', 'середн', 'міцн'):
        if key in v:
            return STRENGTH[key]
    return ''


def main():
    global args
    p = argparse.ArgumentParser()
    p.add_argument('--cache')
    p.add_argument('--delay', type=float, default=1.0)
    p.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'catalog.json'))
    args = p.parse_args()

    items = []
    for brand, line, path in SOURCES:
        cards = [c for c in list_category(path) if re.search(r'\b100\s*гр?\b', c['fullName']) and not SKIP.search(c['fullName'])]
        print(f'{brand} {line}: {len(cards)} товарів', file=sys.stderr)
        for c in cards:
            chars = parse_characteristics(fetch(c['url']))
            name, detected_line = short_name(c['fullName'], brand, line)
            flavor = chars.get('Смак', '')
            item = {
                'id': 'aladin:' + c['url'].rsplit('/', 1)[-1].removesuffix('.html'),
                'brand': brand,
                'line': detected_line,
                'name': name,
                'flavor': flavor,
                'strength': strength_id(chars.get('Міцність')),
                'sweetness': to_int(chars.get('Солодкість')),
                'sourness': to_int(chars.get('Кислинка') or chars.get('Кислість')),
                'freshness': to_int(chars.get('Свіжість')),
                'price': c['price'],
                'inStock': c['inStock'],
                'url': c['url'],
                'img': c['img'],
            }
            item['tags'] = tags_for(flavor or name, item['freshness'])
            items.append(item)

    data = {
        'source': BASE,
        'updatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'items': items,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    untagged = [i['name'] for i in items if not i['tags']]
    print(f'Готово: {len(items)} табаків → {args.out}', file=sys.stderr)
    if untagged:
        print(f'Без категорій ({len(untagged)}): {untagged}', file=sys.stderr)
    if flavor_tags.unknown:
        print(f'Нові інгредієнти — додай у scraper/flavor_tags.py: {sorted(flavor_tags.unknown)}', file=sys.stderr)


if __name__ == '__main__':
    main()
