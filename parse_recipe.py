from __future__ import annotations

import re
import json
import sys
import io
import urllib.request

# Force UTF-8 stdout so cyrillic text is not garbled on Windows (CP1251 default)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    # Try windows-1251 (russianfood.com uses it), then utf-8, then latin-1
    for enc in ('windows-1251', 'utf-8', 'latin-1'):
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode('utf-8', errors='replace')


def strip_tags(s: str) -> str:
    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.I)
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'&nbsp;', ' ', s)
    s = re.sub(r'&amp;', '&', s)
    s = re.sub(r'&lt;', '<', s)
    s = re.sub(r'&gt;', '>', s)
    s = re.sub(r'&#\d+;', '', s)
    s = re.sub(r'&[a-z]+;', '', s)
    return s.strip()


def parse_russianfood(html: str, url: str) -> dict:
    result: dict = {
        'url': url,
        'site': 'russianfood.com',
        'title': '',
        'servings': '',
        'time': '',
        'ingredients': [],
        'steps': [],
        'images': [],
    }

    # ── TITLE ────────────────────────────────────────────────────────
    m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.S)
    if m:
        result['title'] = strip_tags(m.group(1))

    # ── SERVINGS ─────────────────────────────────────────────────────
    for pat in [
        r'на\s+(\d+)\s+порци',
        r'(\d+)\s+порци',
        r'servings["\s:]+(\d+)',
    ]:
        m = re.search(pat, html, re.I)
        if m:
            result['servings'] = m.group(1) + ' порции'
            break

    # ── TIME ─────────────────────────────────────────────────────────
    for pat in [
        r'[Вв]ремя\s+приготовления[:\s]+(\d+[\d\s]*(?:мин|час)[^\s<]*)',
        r'[Вв]ремя[:\s]+(\d+[\d\s]*(?:мин|час)[^\s<]*)',
        r'cooking.?time["\s:]+(\d+)',
        r'(\d+)\s*(?:минут|мин\b)',
    ]:
        m = re.search(pat, html, re.I)
        if m:
            val = m.group(1).strip()
            # Avoid capturing just a number without unit — append units
            if re.match(r'^\d+$', val):
                val += ' мин'
            result['time'] = val
            break

    # ── INGREDIENTS ──────────────────────────────────────────────────
    # russianfood.com uses <tr class="ingr_tr_1">, <tr class="ingr_tr_2">, …
    # FIX: allow extra classes after the number: ingr_tr_1, ingr_tr_1 alt, ingr_tr_1 last, etc.
    ingr_rows = re.findall(
        r'<tr[^>]+class=["\']ingr_tr_\d+[^"\']*["\'][^>]*>(.*?)</tr>',
        html, re.S | re.I
    )
    for row in ingr_rows:
        # Collect all span texts (name + quantity are usually in separate spans in the same row)
        spans = re.findall(r'<span[^>]*>(.*?)</span>', row, re.S)
        parts = [strip_tags(s).strip() for s in spans if strip_tags(s).strip()]
        text = ' '.join(parts)
        text = re.sub(r'\s+', ' ', text).strip()
        # Filter boilerplate / section headers
        if text and len(text) > 2 and not re.match(r'^(для|sauce|соус|маринад|начинка|тесто|крем|глазурь)$', text, re.I):
            result['ingredients'].append(text)

    # Fallback: try extracting from td cells if spans produced nothing
    if not result['ingredients']:
        ingr_rows2 = re.findall(
            r'<tr[^>]+class=["\']ingr_tr_\d+[^"\']*["\'][^>]*>(.*?)</tr>',
            html, re.S | re.I
        )
        for row in ingr_rows2:
            tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
            parts2 = [strip_tags(td).strip() for td in tds if strip_tags(td).strip()]
            text = ' — '.join(parts2) if parts2 else ''
            text = re.sub(r'\s+', ' ', text).strip()
            if text and len(text) > 2:
                result['ingredients'].append(text)

    # ── STEPS ────────────────────────────────────────────────────────
    # Use iterator so each step block is bounded by the NEXT step's opening tag
    # This avoids the fragile </div>\s*</div> closing-pattern approach
    step_markers = list(re.finditer(r'<div[^>]+class=["\']step_n[^"\']*["\'][^>]*>', html, re.I))
    for i, marker in enumerate(step_markers):
        start = marker.end()
        # End at the next step marker, or 4000 chars ahead (enough for one step)
        end = step_markers[i + 1].start() if i + 1 < len(step_markers) else start + 4000
        block = html[start:end]

        # Step photo (big_ = full-size image)
        img_m = re.search(r'href="(//[^"]+/big_\d+\.(?:jpg|jpeg|png))"', block, re.I)
        if img_m:
            img_url = 'https:' + img_m.group(1)
            if img_url not in result['images']:
                result['images'].append(img_url)

        # Step text — try <p> first, then any text node
        p_m = re.search(r'<p[^>]*>(.*?)</p>', block, re.S)
        if p_m:
            text = strip_tags(p_m.group(1))
        else:
            # Fallback: strip all tags from block and take first non-empty paragraph
            text = strip_tags(block)
        text = re.sub(r'\s+', ' ', text).strip()
        if text and len(text) > 5:
            result['steps'].append(text)

    # ── COVER IMAGE ──────────────────────────────────────────────────
    cover_m = re.search(r'href="(//[^"]+/big_\d+\.(?:jpg|jpeg|png))"[^>]*class=["\']tozoom["\']', html, re.I)
    if not cover_m:
        # Try reversed attribute order
        cover_m = re.search(r'class=["\']tozoom["\'][^>]*href="(//[^"]+/big_\d+\.(?:jpg|jpeg|png))"', html, re.I)
    if cover_m:
        cover_url = 'https:' + cover_m.group(1)
        if cover_url not in result['images']:
            result['images'].insert(0, cover_url)

    return result


if __name__ == '__main__':
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://www.russianfood.com/recipes/recipe.php?rid=132485'
    html = fetch_html(url)
    result = parse_russianfood(html, url)
    print(json.dumps(result, ensure_ascii=False, indent=2))
