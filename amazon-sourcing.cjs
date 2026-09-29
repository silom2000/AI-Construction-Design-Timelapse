'use strict';

/**
 * Amazon Sourcing Module — Autonomous product discovery & scraper for Amazon France (amazon.fr)
 *
 * Capabilities:
 * 1. AI-Driven Product Matching: Deduces the ideal physical amplifier tool from any lifehack topic.
 * 2. Multi-Layer Amazon.fr Scraper:
 *    - Layer 1: Fast HTTP GET with realistic desktop headers
 *    - Layer 2: DuckDuckGo / Web search fallback for site:amazon.fr/dp
 * 3. Product Extraction: ASIN, clean title, HD images, rating, bullet points, price.
 * 4. Image Downloader: Saves HD reference image into D:\Open_Project\amazon\img/prod_{code}.jpg.
 * 5. Auto-Registration: Automatically adds new products to products.json with next sequential #code.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ai = require('./ai-client.cjs');
const amazonManager = require('./amazon-manager.cjs');

const AMAZON_DIR = path.resolve(__dirname, '..', 'amazon');
const AMAZON_IMG_DIR = path.join(AMAZON_DIR, 'img');

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getDesktopHeaders() {
    return {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    };
}

/**
 * Extracts standard Amazon ASIN (9 or 10 alphanumeric chars starting with B or digit) from any text/URL
 */
function extractAsin(input) {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim();

    // 1. Standard path with /dp/, /gp/product/, /d/, /product/, /asin/
    const standardPath = clean.match(/(?:\/dp\/|\/gp\/product\/|\/d\/|\/product\/|\/asin\/)([B0-9][A-Z0-9]{8,9})(?:[/?&#]|$)/i);
    if (standardPath) return standardPath[1].toUpperCase();

    // 2. Direct ASIN input (e.g. B00EZ7F27Y or 10-char token without shortlink domain)
    const directMatch = clean.match(/^([B0-9][A-Z0-9]{9})$/i);
    if (directMatch) return directMatch[1].toUpperCase();

    // 3. Any standalone 10-character ASIN token in the string (only if not preceded by shortlink domains)
    const isShortUrl = /(?:link\.amazon|amzn\.(?:to|eu)|a\.co)\//i.test(clean);
    if (!isShortUrl) {
        const token10Match = clean.match(/\b([B0-9][A-Z0-9]{9})\b/i);
        if (token10Match) return token10Match[1].toUpperCase();
    }

    return null;
}

/**
 * Resolves shortlinks (amzn.to, amzn.eu, link.amazon, a.co) if necessary and extracts ASIN
 */
async function resolveUrlAndExtractAsin(input) {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim();

    const shortDomains = ['amzn.to/', 'amzn.eu/', 'a.co/', 'link.amazon/'];
    const isShort = shortDomains.some(d => clean.toLowerCase().includes(d));

    if (isShort) {
        try {
            console.log(`[AmazonSourcing] Expanding shortlink redirect: ${clean}`);
            const targetUrl = clean.startsWith('http') ? clean : `https://${clean}`;
            const resp = await axios.get(targetUrl, {
                maxRedirects: 10,
                headers: getDesktopHeaders(),
                timeout: 10000,
                validateStatus: (s) => s < 400
            });
            const finalUrl = resp.request?.res?.responseUrl || resp.config?.url || '';
            console.log(`[AmazonSourcing] Shortlink expanded to: ${finalUrl}`);
            let asin = extractAsin(finalUrl);
            if (asin) return asin;
        } catch (e) {
            console.warn(`[AmazonSourcing] Shortlink expansion note: ${e.message}`);
            if (e.response?.headers?.location) {
                const redir = e.response.headers.location;
                console.log(`[AmazonSourcing] Location header found: ${redir}`);
                let asin = extractAsin(redir);
                if (asin) return asin;
            }
        }
    }

    return extractAsin(clean);
}

/**
 * Extracts product title hint from Amazon URL slug
 * e.g. https://www.amazon.fr/-/en/BIODANCE-Bio-Collagen-Real-Deep-Mask/dp/B0B2RM68G2 -> "BIODANCE Bio Collagen Real Deep Mask"
 */
function extractTitleFromUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
        const decoded = decodeURIComponent(url);
        const match = decoded.match(/amazon\.[a-z.]+(?:\/-\/[a-z]+)?\/([^/]+)\/(?:dp|gp\/product)\//i)
                   || decoded.match(/amazon\.[a-z.]+\/([^/?#]+)\/dp\//i);
        if (match && match[1]) {
            const rawSlug = match[1];
            if (/^(?:dp|gp|product|s|b|ref)$/i.test(rawSlug)) return '';
            const clean = rawSlug
                .replace(/[-_+]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (clean.length > 5) return clean;
        }
    } catch (_) {}
    return '';
}

/**
 * Fallback browser scraper using Electron's hidden BrowserWindow to bypass anti-bot / 403 / CAPTCHA
 */
async function scrapeViaHiddenBrowser(asin) {
    let electron;
    try {
        electron = require('electron');
    } catch (_) {
        return null;
    }
    const BrowserWindow = electron?.BrowserWindow;
    if (!BrowserWindow) return null;

    return new Promise((resolve) => {
        let win = null;
        let finished = false;

        const cleanup = (result) => {
            if (finished) return;
            finished = true;
            if (win) {
                try { win.destroy(); } catch (_) {}
                win = null;
            }
            resolve(result);
        };

        const timeout = setTimeout(() => {
            cleanup(null);
        }, 12000);

        try {
            win = new BrowserWindow({
                width: 1024,
                height: 768,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            win.webContents.on('did-finish-load', async () => {
                try {
                    await new Promise(r => setTimeout(r, 1500));
                    if (!win || finished) return;

                    const data = await win.webContents.executeJavaScript(`
                        (() => {
                            const titleEl = document.getElementById('productTitle');
                            const title = titleEl ? titleEl.innerText.trim() : '';

                            const imgEl = document.querySelector('#landingImage') ||
                                          document.querySelector('#imgBlkFront') ||
                                          document.querySelector('img[data-old-hires]') ||
                                          document.querySelector('#main-image-container img');
                            let img = '';
                            if (imgEl) {
                                img = imgEl.getAttribute('data-old-hires') ||
                                      imgEl.getAttribute('data-a-dynamic-image') ||
                                      imgEl.getAttribute('src') || '';
                                if (img.startsWith('{')) {
                                    try {
                                        const parsed = JSON.parse(img);
                                        const keys = Object.keys(parsed);
                                        if (keys.length > 0) img = keys[0];
                                    } catch (_) {}
                                }
                            }

                            const bullets = Array.from(document.querySelectorAll('#feature-bullets .a-list-item'))
                                .map(e => e.innerText.trim())
                                .filter(t => t && !t.includes('Amazon') && t.length > 10)
                                .slice(0, 4);

                            return { title, img, bullets };
                        })()
                    `);

                    clearTimeout(timeout);
                    cleanup(data);
                } catch (e) {
                    clearTimeout(timeout);
                    cleanup(null);
                }
            });

            win.webContents.on('did-fail-load', () => {
                clearTimeout(timeout);
                cleanup(null);
            });

            win.loadURL(`https://www.amazon.fr/dp/${asin}`, {
                userAgent: getRandomUserAgent()
            });
        } catch (e) {
            clearTimeout(timeout);
            cleanup(null);
        }
    });
}

/**
 * Boosts Amazon image URL to maximum available resolution (SL1500)
 */
function getHighResImageUrl(url) {
    if (!url || typeof url !== 'string') return url;
    // Transform ._AC_UL320_.jpg or ._SL..._.jpg to ._AC_SL1500_.jpg
    return url.replace(/\._[A-Z0-9_,]+_\./i, '._AC_SL1500_.');
}

/**
 * Downloads image buffer and saves to destination path
 */
async function downloadImageToFile(imageUrl, destPath) {
    try {
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const highResUrl = getHighResImageUrl(imageUrl);
        const resp = await axios.get(highResUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Referer': 'https://www.amazon.fr/'
            }
        });

        if (resp.status === 200 && resp.data && resp.data.length > 1000) {
            fs.writeFileSync(destPath, Buffer.from(resp.data));
            return true;
        }
        return false;
    } catch (e) {
        console.warn(`[AmazonSourcing] Failed to download image from ${imageUrl}:`, e.message);
        return false;
    }
}

/**
 * Layer 1: Direct Search on Amazon.fr
 */
async function searchAmazonFrDirect(searchKeyword) {
    try {
        const searchUrl = `https://www.amazon.fr/s?k=${encodeURIComponent(searchKeyword)}`;
        console.log(`[AmazonSourcing] Searching Amazon.fr: ${searchUrl}`);

        const resp = await axios.get(searchUrl, {
            headers: getDesktopHeaders(),
            timeout: 12000,
            validateStatus: (status) => status < 500
        });

        if (resp.status !== 200 || !resp.data) {
            console.warn(`[AmazonSourcing] Amazon direct search status: ${resp.status}`);
            return [];
        }

        const html = resp.data;
        if (html.includes('api-services-support@amazon.com') || html.includes('validateCaptcha')) {
            console.warn('[AmazonSourcing] Amazon CAPTCHA detected on direct search.');
            return [];
        }

        const results = [];
        // Regex-based robust parser for Amazon search result cards
        const cardRegex = /<div[^>]*data-asin="([B0-9][A-Z0-9]{9})"[^>]*>([\s\S]*?)<\/div>(?=\s*<div[^>]*data-asin=|\s*<\/div>\s*<\/div>\s*<\/div>)/gi;
        let match;

        while ((match = cardRegex.exec(html)) !== null && results.length < 8) {
            const asin = match[1];
            const block = match[2];

            // Extract title
            const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ||
                               block.match(/<span[^>]*class="[^"]*a-text-normal[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
            const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

            // Extract image
            const imgMatch = block.match(/<img[^>]*class="[^"]*s-image[^"]*"[^>]*src="([^"]+)"/i) ||
                             block.match(/src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i);
            const img = imgMatch ? imgMatch[1] : '';

            // Extract rating
            const starMatch = block.match(/(\d[,\.]\d)\s*(?:sur|out of)\s*5/i) ||
                              block.match(/<span[^>]*class="a-icon-alt"[^>]*>([\s\S]*?)<\/span>/i);
            let rating = 4.3;
            if (starMatch) {
                const parsed = parseFloat(starMatch[1].replace(',', '.'));
                if (!isNaN(parsed) && parsed > 0) rating = parsed;
            }

            // Extract review count
            const revMatch = block.match(/aria-label="[^"]*(\d[\d\s\.,]*)\s*évaluations/i) ||
                             block.match(/<span[^>]*class="[^"]*s-underline-text[^"]*"[^>]*>([\d\s\.,]+)<\/span>/i);
            let reviews = 150;
            if (revMatch) {
                const cleaned = revMatch[1].replace(/[^\d]/g, '');
                const parsed = parseInt(cleaned, 10);
                if (!isNaN(parsed) && parsed > 0) reviews = parsed;
            }

            // Extract price if available
            const priceMatch = block.match(/<span[^>]*class="a-offscreen"[^>]*>([\s\S]*?)<\/span>/i);
            const price = priceMatch ? priceMatch[1].replace(/&nbsp;/g, ' ').trim() : '';

            if (asin && rawTitle && img && rawTitle.length > 5) {
                results.push({
                    asin,
                    title: rawTitle,
                    img: getHighResImageUrl(img),
                    rating,
                    reviews,
                    price,
                    url: `https://www.amazon.fr/dp/${asin}`
                });
            }
        }

        console.log(`[AmazonSourcing] Found ${results.length} candidate items via direct search.`);
        return results;
    } catch (e) {
        console.warn(`[AmazonSourcing] Direct search failed: ${e.message}`);
        return [];
    }
}

/**
 * Layer 2: DuckDuckGo Fallback Search for site:amazon.fr
 */
async function searchAmazonFrFallback(searchKeyword) {
    try {
        const query = `site:amazon.fr/dp ${searchKeyword}`;
        console.log(`[AmazonSourcing] Fallback searching DuckDuckGo: "${query}"`);
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

        const resp = await axios.get(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8'
            },
            timeout: 12000
        });

        if (resp.status !== 200 || !resp.data) return [];

        const html = resp.data;
        const results = [];
        const linkRegex = /<a[^>]*class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = linkRegex.exec(html)) !== null && results.length < 5) {
            const rawUrl = match[1];
            const snippet = match[3].replace(/<[^>]+>/g, '').trim();
            const asin = extractAsin(rawUrl) || extractAsin(decodeURIComponent(rawUrl));

            if (asin) {
                results.push({
                    asin,
                    title: snippet.slice(0, 120),
                    img: '',
                    rating: 4.5,
                    reviews: 300,
                    price: '',
                    url: `https://www.amazon.fr/dp/${asin}`
                });
            }
        }

        console.log(`[AmazonSourcing] Fallback search found ${results.length} ASINs.`);
        return results;
    } catch (e) {
        console.warn(`[AmazonSourcing] Fallback search failed: ${e.message}`);
        return [];
    }
}

/**
 * Scrapes detailed product information from an Amazon.fr product page
 */
async function scrapeProductPage(asin, candidate = null) {
    const pageUrl = `https://www.amazon.fr/dp/${asin}`;
    console.log(`[AmazonSourcing] Scraping product page: ${pageUrl}`);

    let html = '';
    try {
        const resp = await axios.get(pageUrl, {
            headers: getDesktopHeaders(),
            timeout: 12000
        });
        if (resp.status === 200 && resp.data) {
            html = resp.data;
        }
    } catch (e) {
        console.warn(`[AmazonSourcing] Could not fetch product page directly: ${e.message}`);
    }

    let title = candidate?.title || '';
    let img = candidate?.img || '';
    let features = [];
    let rating = candidate?.rating || 4.4;

    if (html && !html.includes('validateCaptcha')) {
        // 1. Title
        const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>([\s\S]*?)<\/span>/i);
        if (titleMatch) {
            title = titleMatch[1].trim();
        }

        // 2. High-res image
        const hiResMatch = html.match(/data-old-hires="([^"]+)"/i) ||
                           html.match(/"large":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i) ||
                           html.match(/data-a-dynamic-image="\{&quot;(https:\/\/m\.media-amazon\.com\/images\/I\/[^&]+)&quot;/i);
        if (hiResMatch) {
            img = getHighResImageUrl(hiResMatch[1]);
        }

        // 3. Bullet points (About this item)
        const featureBlock = html.match(/<div[^>]*id="feature-bullets"[^>]*>([\s\S]*?)<\/div>/i);
        if (featureBlock) {
            const itemMatches = featureBlock[1].matchAll(/<span[^>]*class="a-list-item"[^>]*>([\s\S]*?)<\/span>/gi);
            for (const m of itemMatches) {
                const text = m[1].replace(/<[^>]+>/g, '').trim();
                if (text && text.length > 10 && !text.includes('Amazon') && features.length < 4) {
                    features.push(`✓ ${text.slice(0, 100)}`);
                }
            }
        }
    }

    return {
        asin,
        title,
        img,
        features: features.length > 0 ? features : (candidate?.features || [
            '✓ Conception ergonomique et robuste',
            '✓ Efficacité prouvée sans produits toxiques',
            '✓ Satisfaction garantie au quotidien'
        ]),
        rating,
        amazonUrl: `https://www.amazon.fr/dp/${asin}?tag=bertranna-21`
    };
}

/**
 * Uses AI to clean up raw Amazon title and draft the Pixar-Scientist card fields
 */
async function aiFormatProductCard(rawProduct, topic, provider = null) {
    const prompt = `You are a Senior E-Commerce & Script Producer for the French TikTok channel @bertranna (Pixar scientist Génie).
We just sourced a real Amazon France product to pair with a viral lifehack.

LIFEHACK TOPIC / PROBLEM:
"${topic}"

RAW AMAZON PRODUCT DATA:
- Title: "${rawProduct.title}"
- Features: ${JSON.stringify(rawProduct.features)}
- ASIN: "${rawProduct.asin}"

YOUR TASK:
Create a polished, highly converting, authentic French product card for our showcase (products.json).

CONSTRAINTS:
1. "cleanTitle": Clean, attractive, punchy French product title (3 to 6 words maximum). Strip all Amazon SEO keyword spam.
2. "category": Choose EXACTLY ONE: "nettoyage", "jardin", "cuisine", "bricolage", "beaute", "maison".
3. "quote": 1 short punchy sentence (12-18 words in French) stating the everyday frustration/pain it solves.
4. "hackMethod": 1-2 sentences (20-25 words in French) describing the specific clever DIY trick/ingredients or biological/physical principle that solves the problem.
5. "verdict": 1-2 sentences (20-25 words in French) explaining how this physical tool acts as the smart amplifier to save effort/time.
6. "features": Array of exactly 3 bullet points, each starting with "✓ ", highlighting practical benefits.

OUTPUT STRICT VALID JSON ONLY:
{
  "cleanTitle": "...",
  "category": "...",
  "quote": "...",
  "hackMethod": "...",
  "verdict": "...",
  "features": ["✓ ...", "✓ ...", "✓ ..."]
}`;

    try {
        const raw = await ai.chat([
            { role: 'system', content: 'You output strictly valid JSON without markdown wrapping.' },
            { role: 'user', content: prompt }
        ], true, provider);

        const cleanJson = raw.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
        const parsed = JSON.parse(cleanJson);

        return {
            title: parsed.cleanTitle || rawProduct.title.slice(0, 50),
            category: parsed.category || 'maison',
            quote: parsed.quote || 'Une solution simple pour régler ce problème quotidien sans effort.',
            hackMethod: parsed.hackMethod || '',
            verdict: parsed.verdict || 'Un outil pratique et éprouvé qui amplifie votre méthode naturelle.',
            features: Array.isArray(parsed.features) && parsed.features.length > 0 ? parsed.features : rawProduct.features
        };
    } catch (e) {
        console.warn('[AmazonSourcing] AI card formatting fallback:', e.message);
        return {
            title: rawProduct.title.slice(0, 50),
            category: 'maison',
            quote: 'Éliminez ce problème du quotidien sans effort grâce à une solution éprouvée.',
            hackMethod: '',
            verdict: 'Un outil malin qui décuple vos résultats et fait gagner un temps précieux.',
            features: rawProduct.features
        };
    }
}

/**
 * Deduces optimal search keyword from lifehack topic
 */
async function deduceSearchQuery(topic, provider = null) {
    const prompt = `Analyze this lifehack topic or household problem:
"${topic}"

What single, tangible, physical tool, device or gadget sold on Amazon.fr would be the ultimate SMART AMPLIFIER to solve or accelerate this trick?
Return a short, highly effective search query in French (2 to 4 words) suitable for searching on amazon.fr.

Output STRICT JSON only:
{
  "searchKeyword": "french search query (e.g. ruban cuivre anti limaces, brosse rotative electrique, piege a mites alimentaire, etc.)",
  "category": "nettoyage | jardin | cuisine | bricolage | beaute | maison"
}`;

    try {
        const raw = await ai.chat([
            { role: 'system', content: 'You output strictly valid JSON.' },
            { role: 'user', content: prompt }
        ], true, provider);

        const cleanJson = raw.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
        const parsed = JSON.parse(cleanJson);
        return {
            searchKeyword: parsed.searchKeyword || topic.slice(0, 30),
            category: parsed.category || 'maison'
        };
    } catch (e) {
        return {
            searchKeyword: topic.slice(0, 30),
            category: 'maison'
        };
    }
}

/**
 * Main Entry Point: Automatically sources, parses, downloads image, and registers product
 */
async function sourceProductForLifehack(topic, options = {}, onProgress = null) {
    const { provider, projectFolder } = options;

    if (onProgress) onProgress({ status: '🧠 ИИ анализирует тему и подбирает идеальный инструмент...', progress: 15 });
    const { searchKeyword, category } = await deduceSearchQuery(topic, provider);
    console.log(`[AmazonSourcing] Deduced query: "${searchKeyword}" (Category: ${category})`);

    if (onProgress) onProgress({ status: `🔍 Ищу бестселлеры на Amazon.fr по запросу: "${searchKeyword}"...`, progress: 30 });
    let candidates = await searchAmazonFrDirect(searchKeyword);

    if (!candidates || candidates.length === 0) {
        if (onProgress) onProgress({ status: '🌐 Пробую резервный поиск по каталогу Amazon.fr...', progress: 45 });
        candidates = await searchAmazonFrFallback(searchKeyword);
    }

    // Pick best candidate (highest rating / review score)
    let bestCandidate = null;
    if (candidates && candidates.length > 0) {
        bestCandidate = candidates.sort((a, b) => (b.rating * Math.log10(b.reviews || 10)) - (a.rating * Math.log10(a.reviews || 10)))[0];
    }

    if (!bestCandidate) {
        throw new Error(`Не удалось найти подходящий товар на Amazon.fr по запросу "${searchKeyword}". Попробуйте уточнить тему или указать прямую ссылку на товар.`);
    }

    if (onProgress) onProgress({ status: `📦 Найден товар: "${bestCandidate.title.slice(0, 40)}...". Собираю детали...`, progress: 60 });
    const detailedProduct = await scrapeProductPage(bestCandidate.asin, bestCandidate);

    if (onProgress) onProgress({ status: '✍️ ИИ упаковывает карточку товара и формулу лайфхака...', progress: 75 });
    const formattedCard = await aiFormatProductCard(detailedProduct, topic, provider);

    const nextCode = amazonManager.getNextCode();
    const localImgRelPath = `img/prod_${nextCode}.jpg`;
    const localImgAbsPath = path.join(AMAZON_IMG_DIR, `prod_${nextCode}.jpg`);

    // Download image
    if (detailedProduct.img) {
        if (onProgress) onProgress({ status: '📸 Скачиваю оригинальное HD-фото товара для витрины и референсов...', progress: 85 });
        await downloadImageToFile(detailedProduct.img, localImgAbsPath);

        // Also copy into projectFolder if provided
        if (projectFolder) {
            const projectRefPath = path.join(__dirname, 'SkeletonShorts', projectFolder, 'product_reference.jpg');
            try {
                if (fs.existsSync(localImgAbsPath)) {
                    fs.copyFileSync(localImgAbsPath, projectRefPath);
                }
            } catch (_) {}
        }
    }

    // Register product in products.json
    const registered = amazonManager.registerProduct({
        code: nextCode,
        title: formattedCard.title,
        category: formattedCard.category || category,
        featured: false,
        img: localImgRelPath,
        hackMethod: formattedCard.hackMethod,
        quote: formattedCard.quote,
        verdict: formattedCard.verdict,
        features: formattedCard.features,
        asin: detailedProduct.asin,
        amazonUrl: `https://www.amazon.fr/dp/${detailedProduct.asin}?tag=bertranna-21`
    });

    console.log(`[AmazonSourcing] Successfully registered product #${registered.code}: "${registered.title}"`);
    if (onProgress) onProgress({ status: `✅ Товар #${registered.code} зарегистрирован в витрине!`, progress: 100 });

    return {
        success: true,
        product: registered,
        searchKeyword
    };
}

/**
 * Direct entry point: scrape by specific Amazon URL or ASIN
 */
async function sourceProductByUrlOrAsin(urlOrAsin, options = {}, onProgress = null) {
    const { provider, projectFolder } = options;
    const asin = await resolveUrlAndExtractAsin(urlOrAsin);
    if (!asin) {
        throw new Error('Не удалось распознать ASIN или ссылку на Amazon.');
    }

    if (onProgress) onProgress({ status: `📦 Извлекаю данные товара ASIN: ${asin} с Amazon.fr...`, progress: 30 });
    let detailedProduct = await scrapeProductPage(asin);
    const fallbackTitleFromUrl = extractTitleFromUrl(urlOrAsin);

    // If direct HTTP request was blocked or empty, try headless Chromium browser
    if (!detailedProduct.title || detailedProduct.title.trim().length === 0) {
        if (onProgress) onProgress({ status: `🌐 Открываю страницу товара через браузер...`, progress: 45 });
        const browserData = await scrapeViaHiddenBrowser(asin);
        if (browserData && browserData.title) {
            detailedProduct.title = browserData.title;
            if (browserData.img) detailedProduct.img = getHighResImageUrl(browserData.img);
            if (browserData.bullets && browserData.bullets.length > 0) {
                detailedProduct.features = browserData.bullets.map(b => `✓ ${b.slice(0, 100)}`);
            }
        }
    }

    // Fallback to title extracted from URL slug
    if ((!detailedProduct.title || detailedProduct.title.trim().length === 0) && fallbackTitleFromUrl) {
        detailedProduct.title = fallbackTitleFromUrl;
    }

    if (!detailedProduct.title || detailedProduct.title.trim().length === 0) {
        throw new Error(`Товар с ASIN ${asin} не найден на Amazon.fr (страница товара недоступна или пуста). Проверьте правильность ссылки.`);
    }

    // Fallback to canonical Amazon CDN thumbnail if image was missing
    if (!detailedProduct.img) {
        detailedProduct.img = `https://m.media-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX500_.jpg`;
    }

    if (onProgress) onProgress({ status: '✍️ ИИ очищает название и формулирует карточку...', progress: 65 });
    const formattedCard = await aiFormatProductCard(detailedProduct, detailedProduct.title, provider);

    const nextCode = amazonManager.getNextCode();
    const localImgRelPath = `img/prod_${nextCode}.jpg`;
    const localImgAbsPath = path.join(AMAZON_IMG_DIR, `prod_${nextCode}.jpg`);

    if (detailedProduct.img) {
        if (onProgress) onProgress({ status: '📸 Скачиваю фото товара...', progress: 85 });
        await downloadImageToFile(detailedProduct.img, localImgAbsPath);

        if (projectFolder) {
            const projectRefPath = path.join(__dirname, 'SkeletonShorts', projectFolder, 'product_reference.jpg');
            try {
                if (fs.existsSync(localImgAbsPath)) {
                    fs.copyFileSync(localImgAbsPath, projectRefPath);
                }
            } catch (_) {}
        }
    }

    if (onProgress) onProgress({ status: '☁️ Синхронизирую витрину с GitHub Pages...', progress: 92 });

    const registered = amazonManager.registerProduct({
        code: nextCode,
        title: formattedCard.title,
        category: formattedCard.category,
        featured: false,
        img: localImgRelPath,
        hackMethod: formattedCard.hackMethod,
        quote: formattedCard.quote,
        verdict: formattedCard.verdict,
        features: formattedCard.features,
        asin: detailedProduct.asin,
        amazonUrl: `https://www.amazon.fr/dp/${detailedProduct.asin}?tag=bertranna-21`
    });

    if (onProgress) onProgress({ status: `✅ Товар #${registered.code} добавлен!`, progress: 100 });
    return {
        success: true,
        product: registered
    };
}

module.exports = {
    sourceProductForLifehack,
    sourceProductByUrlOrAsin,
    extractAsin,
    searchAmazonFrDirect,
    searchAmazonFrFallback,
    scrapeProductPage
};
