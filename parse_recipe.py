import re
import json
import sys
import io
import urllib.request

# Force UTF-8 stdout so kirilic text is not garbled on Windows (CP1251 default)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def fetch_html(url):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    # Try windows-1251 (russianfood.com), fallback to utf-8
    for enc in ('windows-1251', 'utf-8', 'latin-1'):
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode('utf-8', errors='replace')

def strip_tags(s):
    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.I)
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'&nbsp;', ' ', s)
    s = re.sub(r'&amp;', '&', s)
    s = re.sub(r'&#\d+;', '', s)
    return s.strip()

def parse_russianfood(html, url):
    result = {
        'url': url,
        'site': 'russianfood.com',
        'title': '',
        'servings': '',
        'time': '',
        'ingredients': [],
        'steps': [],
        'images': []        # full-size recipe images only
    }

    # Title
    m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.S)
    if m:
        result['title'] = strip_tags(m.group(1))

    # Servings / time from meta description
    m = re.search(r'на\s+(\d+)\s+порци', html)
    if m:
        result['servings'] = m.group(1) + ' порции'
    m = re.search(r'время приготовления\s+(\d+\s*мин)', html, re.I)
    if m:
        result['time'] = m.group(1)

    # ── INGREDIENTS ──────────────────────────────────────────────────
    # <tr class="ingr_tr_N"> … <span>Название - кол-во</span> …
    ingr_rows = re.findall(r'class="ingr_tr_\d+"[^>]*>.*?</tr>', html, re.S)
    for row in ingr_rows:
        spans = re.findall(r'<span[^>]*>(.*?)</span>', row, re.S)
        text = ' '.join(strip_tags(s).strip() for s in spans if strip_tags(s).strip())
        text = re.sub(r'\s+', ' ', text).strip()
        if text and len(text) > 2:
            result['ingredients'].append(text)

    # ── STEPS ────────────────────────────────────────────────────────
    # Each step: <div class="step_n"> <div class="img_c"><a href="big_XXXXX.jpg">…
    #                                 <p>step text</p>
    step_blocks = re.findall(r'<div class="step_n">(.*?)</div>\s*</div>', html, re.S)
    if not step_blocks:
        # Alternative: step_images_n wraps all steps
        m = re.search(r'class="step_images_n">(.*?)(?=class="step_images_n"|id="kommentaryi")', html, re.S)
        if m:
            step_blocks = re.findall(r'<div class="step_n">(.*?)(?=<div class="step_n"|$)', m.group(1), re.S)

    for block in step_blocks:
        # Extract step photo (big_ = full size)
        img_m = re.search(r'href="(//[^"]+/big_\d+\.(?:jpg|jpeg|png))"', block, re.I)
        if img_m:
            img_url = 'https:' + img_m.group(1)
            if img_url not in result['images']:
                result['images'].append(img_url)

        # Extract step text from <p>
        p_m = re.search(r'<p>(.*?)</p>', block, re.S)
        if p_m:
            text = strip_tags(p_m.group(1))
            text = re.sub(r'\s+', ' ', text).strip()
            if text and len(text) > 5:
                result['steps'].append(text)

    # ── MAIN COVER IMAGE ─────────────────────────────────────────────
    # First big photo on the page (often big_105843.jpg = cover)
    cover_m = re.search(r'href="(//[^"]+/big_\d+\.(?:jpg|jpeg|png))"[^>]*class="tozoom"', html, re.I)
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
