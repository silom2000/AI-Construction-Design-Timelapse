'use strict';

/**
 * Amazon Manager — connects the Amazon Affiliate showcase (D:\Open_Project\amazon)
 * to AISTUDIO video generators (GenieTalk / skeleton-handlers.cjs).
 *
 * Source of truth: D:\Open_Project\amazon\products.json
 * Showcase URL: https://silom2000.github.io/mes-trouvailles/
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// GitHub repository sync configuration for automatic showcase deployment
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'silom2000/mes-trouvailles';

// Primary path to products.json in neighboring amazon repo
const AMAZON_DIR = path.resolve(__dirname, '..', 'amazon');
const PRIMARY_PRODUCTS_FILE = path.join(AMAZON_DIR, 'products.json');
// Local fallback cache in AISTUDIO if amazon folder is moved
const FALLBACK_PRODUCTS_FILE = path.join(__dirname, 'amazon_products_cache.json');

// ── CTA Variations for Outro in French (18-22 words, natural, high retention) ──
// 3-step sequence: (1) go to profile link → (2) enter number on site → (3) land on Amazon to buy
const OUTRO_CTA_TEMPLATES_FR = [
    (code) => `Clique le lien dans mon profil, tape le numéro ${code} sur le site et tu arrives directement sur Amazon !`,
    (code) => `Va sur le lien en bio, entre le ${code} sur la page et commande ce produit directement sur Amazon !`,
    (code) => `Ouvre le lien dans ma bio, tape juste le ${code} et tu atterris direct sur la page Amazon pour commander !`,
    (code) => `Clique mon lien en bio @bertranna, tape le numéro ${code} sur le site et accède au produit sur Amazon !`,
    (code) => `Un clic sur mon lien en bio, entre le numéro ${code} et retrouve ce produit directement sur Amazon pour l'acheter !`
];

function getProductsFilePath() {
    if (fs.existsSync(PRIMARY_PRODUCTS_FILE)) {
        return PRIMARY_PRODUCTS_FILE;
    }
    if (fs.existsSync(FALLBACK_PRODUCTS_FILE)) {
        return FALLBACK_PRODUCTS_FILE;
    }
    return PRIMARY_PRODUCTS_FILE;
}

function loadProducts() {
    const targetFile = getProductsFilePath();
    if (!fs.existsSync(targetFile)) {
        return [];
    }
    try {
        const raw = fs.readFileSync(targetFile, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
            // Also update fallback cache for offline safety
            try {
                if (targetFile === PRIMARY_PRODUCTS_FILE) {
                    fs.writeFileSync(FALLBACK_PRODUCTS_FILE, raw, 'utf8');
                }
            } catch (_) {}
            return data;
        }
        return [];
    } catch (e) {
        console.error('[AmazonManager] Failed to load products:', e.message);
        return [];
    }
}

function saveProducts(products) {
    const targetFile = getProductsFilePath();
    try {
        const jsonStr = JSON.stringify(products, null, 2);
        fs.writeFileSync(targetFile, jsonStr, 'utf8');
        try {
            fs.writeFileSync(FALLBACK_PRODUCTS_FILE, jsonStr, 'utf8');
        } catch (_) {}
        return true;
    } catch (e) {
        console.error('[AmazonManager] Failed to save products:', e.message);
        return false;
    }
}

function getAll() {
    return loadProducts();
}

function getByCode(code) {
    const products = loadProducts();
    const numCode = parseInt(code, 10);
    return products.find(p => p.code === numCode) || null;
}

function getNextCode() {
    const products = loadProducts();
    if (!products || products.length === 0) return 1;
    const maxCode = products.reduce((max, p) => Math.max(max, parseInt(p.code, 10) || 0), 0);
    return maxCode + 1;
}

function deleteProduct(code) {
    const products = loadProducts();
    const numCode = parseInt(code, 10);
    const updated = products.filter(p => p.code !== numCode && String(p.code) !== String(code));
    saveProducts(updated);

    // Auto-sync in background to GitHub Pages showcase
    syncToShowcaseGitHub([
        'products.json',
        'index.html'
    ]).catch(err => {
        console.warn('[AmazonManager] Background GitHub sync notice after delete:', err.message);
    });

    return updated;
}

function registerProduct(productData) {
    const products = loadProducts();
    const code = productData.code || getNextCode();
    const decodedUrl = decodeURIComponent(productData.amazonUrl || '');
    const asinMatch = decodedUrl.match(/(?:\/dp\/|\/gp\/product\/|\/d\/|\/product\/|\/asin\/)([B0-9][A-Z0-9]{8,9})(?:[/?&#]|$)/i)
        || decodedUrl.match(/\b(B0[A-Z0-9]{8})\b/i);
    const asin = productData.asin || (asinMatch ? asinMatch[1].toUpperCase() : '');
    const cleanUrl = asin ? `https://www.amazon.fr/dp/${asin}?tag=bertranna-21` : (productData.amazonUrl || '');

    const newProduct = {
        code,
        title: productData.title || `Produit #${code}`,
        category: productData.category || 'nettoyage',
        featured: Boolean(productData.featured),
        img: productData.img || `img/prod_${code}.jpg`,
        hackMethod: productData.hackMethod || '',
        quote: productData.quote || '',
        verdict: productData.verdict || '',
        features: Array.isArray(productData.features) ? productData.features : [],
        amazonUrl: cleanUrl
    };

    // Check if existing by code or asin
    const existingIndex = products.findIndex(p => p.code === code || (asin && p.amazonUrl && p.amazonUrl.includes(asin)));
    if (existingIndex >= 0) {
        products[existingIndex] = { ...products[existingIndex], ...newProduct };
    } else {
        products.push(newProduct);
    }

    saveProducts(products);

    // Auto-sync in background to GitHub Pages showcase
    syncToShowcaseGitHub([
        'products.json',
        'index.html',
        newProduct.img
    ]).catch(err => {
        console.warn('[AmazonManager] Background GitHub sync notice:', err.message);
    });

    return newProduct;
}

/**
 * Uploads a file buffer or text directly to GitHub Pages repository via GitHub REST API
 */
async function uploadFileToGitHub(remotePath, contentBuffer) {
    if (!GITHUB_TOKEN || !GITHUB_REPO) return false;
    const b64 = contentBuffer.toString('base64');
    const headers = {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'AISTUDIO-AutoSync',
        'Accept': 'application/vnd.github+json'
    };

    let sha = null;
    try {
        const getRes = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/contents/${remotePath}`, {
            headers,
            timeout: 8000
        });
        if (getRes.data && getRes.data.sha) {
            sha = getRes.data.sha;
        }
    } catch (_) {}

    const body = {
        message: `Auto-sync ${remotePath} from AI Studio`,
        content: b64,
        branch: 'main'
    };
    if (sha) body.sha = sha;

    try {
        const putRes = await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/${remotePath}`, body, {
            headers,
            timeout: 15000
        });
        console.log(`[AmazonManager] ✅ Successfully synced ${remotePath} to GitHub Pages!`);
        return putRes.status === 200 || putRes.status === 201;
    } catch (e) {
        console.warn(`[AmazonManager] ⚠️ Error syncing ${remotePath} to GitHub:`, e.response?.data?.message || e.message);
        return false;
    }
}

/**
 * Syncs multiple showcase files (products.json, index.html, product images) to GitHub repository
 */
async function syncToShowcaseGitHub(relativeFiles = ['products.json', 'index.html']) {
    console.log('[AmazonManager] Starting automated background sync to GitHub Pages...');
    for (const relFile of relativeFiles) {
        if (!relFile) continue;
        const normalizedRel = relFile.replace(/\\/g, '/');
        const localPath = path.join(AMAZON_DIR, normalizedRel);
        if (!fs.existsSync(localPath)) continue;

        try {
            const fileBuf = fs.readFileSync(localPath);
            await uploadFileToGitHub(normalizedRel, fileBuf);
        } catch (e) {
            console.warn(`[AmazonManager] Failed reading ${localPath} for sync:`, e.message);
        }
    }
}

function getRandomCta(code) {
    const template = OUTRO_CTA_TEMPLATES_FR[Math.floor(Math.random() * OUTRO_CTA_TEMPLATES_FR.length)];
    return template(code);
}

/**
 * Builds a structured, high-context topic prompt for LLM script generation
 * following the Pixar Scientist formula (Problem -> Science -> Hack -> Result -> CTA).
 */
function buildTopicForProduct(product) {
    if (!product) return '';
    const code = product.code;
    const title = product.title || '';
    const category = product.category || 'Maison & Astuces';
    const quote = product.quote || '';
    const verdict = product.verdict || '';
    const hackMethod = product.hackMethod || '';
    const features = Array.isArray(product.features) ? product.features.join('; ') : '';

    return `PRODUIT TESTÉ & APPROUVÉ AMAZON #${code}: "${title}" (Catégorie: ${category}).
PROBLÈME DU QUOTIDIEN: ${quote}
${hackMethod ? `MÉTHODE / ASTUCE INTELLIGENTE DU QUOTIDIEN: ${hackMethod}\n` : ''}PRINCIPE SCIENTIFIQUE / ASTUCE: ${verdict}
POINTS FORTS & CARACTÉRISTIQUES: ${features}
OUTRO OBLIGATOIRE: Mentionner explicitement le code #${code} à taper sur le site en bio (@bertranna).`;
}

/**
 * Resolves the local path or downloads the product reference image.
 * Checks local filesystem, project folder override, and remote fallback.
 * Returns { path: string, data: string, mimeType: string } or null.
 */
async function getProductImage(productOrCode, projectFolder = null) {
    if (!productOrCode) return null;
    let product = typeof productOrCode === 'object' ? productOrCode : getByCode(productOrCode);
    if (!product) return null;

    const imgField = product.img || `img/prod_${product.code}.jpg`;
    const fileName = path.basename(imgField);

    // 1. Check project-specific override in SkeletonShorts/{projectFolder}
    if (projectFolder) {
        const skeletonDir = path.join(__dirname, 'SkeletonShorts');
        const projectDir = path.join(skeletonDir, projectFolder);
        const candidates = [
            path.join(projectDir, 'product_reference.jpg'),
            path.join(projectDir, 'product_reference.png'),
            path.join(projectDir, 'product_reference.webp'),
            path.join(projectDir, fileName)
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                try {
                    const ext = path.extname(p).toLowerCase();
                    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                    const data = `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
                    console.log(`[AmazonManager] Found project-specific product image: ${p}`);
                    return { path: p, data, mimeType: mime };
                } catch (_) {}
            }
        }
    }

    // 2. Check local locations in amazon repo / AISTUDIO
    const localCandidates = [
        path.resolve(AMAZON_DIR, imgField),
        path.join(AMAZON_DIR, 'img', fileName),
        path.join(__dirname, 'amazon_images', fileName),
        path.join(__dirname, 'SkeletonShorts', 'product_references', fileName)
    ];

    for (const p of localCandidates) {
        if (fs.existsSync(p)) {
            try {
                const ext = path.extname(p).toLowerCase();
                const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                const data = `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
                console.log(`[AmazonManager] Found local product image: ${p}`);
                return { path: p, data, mimeType: mime };
            } catch (_) {}
        }
    }

    // 3. Fallback: try remote URLs if running online in Electron
    const remoteUrls = [];
    if (typeof imgField === 'string' && imgField.startsWith('http')) {
        remoteUrls.push(imgField);
    } else {
        const cleanName = imgField.replace(/^\/+/, '');
        remoteUrls.push(`https://raw.githubusercontent.com/silom2000/mes-trouvailles/main/${cleanName}`);
        remoteUrls.push(`https://silom2000.github.io/mes-trouvailles/${cleanName}`);
    }

    for (const url of remoteUrls) {
        try {
            const https = require('https');
            const http = require('http');
            const client = url.startsWith('https') ? https : http;
            const buffer = await new Promise((resolve, reject) => {
                const req = client.get(url, { timeout: 8000 }, (res) => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const chunks = [];
                        res.on('data', chunk => chunks.push(chunk));
                        res.on('end', () => resolve(Buffer.concat(chunks)));
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
                req.on('error', reject);
                req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
            });

            if (buffer && buffer.length > 500) {
                // Save locally to cache so next time it's instant
                const saveTarget = path.resolve(AMAZON_DIR, imgField);
                try {
                    const saveDir = path.dirname(saveTarget);
                    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
                    fs.writeFileSync(saveTarget, buffer);
                    console.log(`[AmazonManager] Cached remote product image to ${saveTarget}`);
                } catch (_) {}

                const ext = path.extname(fileName).toLowerCase();
                const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                return {
                    path: saveTarget,
                    data: `data:${mime};base64,${buffer.toString('base64')}`,
                    mimeType: mime
                };
            }
        } catch (_) {
            // continue
        }
    }

    return null;
}

function registerAmazonHandlers(ipcMain) {
    ipcMain.handle('amazon-products-list', async () => {
        return getAll();
    });

    ipcMain.handle('amazon-product-by-code', async (event, { code }) => {
        return getByCode(code);
    });

    ipcMain.handle('amazon-product-build-topic', async (event, { product }) => {
        return buildTopicForProduct(product);
    });

    ipcMain.handle('amazon-product-get-cta', async (event, { code }) => {
        return getRandomCta(code);
    });

    ipcMain.handle('amazon-product-get-image', async (event, { product, code, projectFolder }) => {
        return await getProductImage(product || code, projectFolder);
    });

    ipcMain.handle('amazon-product-register', async (event, { productData }) => {
        return registerProduct(productData);
    });

    ipcMain.handle('amazon-product-delete', async (event, { code }) => {
        return deleteProduct(code);
    });

    ipcMain.handle('amazon-source-product', async (event, { topic, options }) => {
        const amazonSourcing = require('./amazon-sourcing.cjs');
        return await amazonSourcing.sourceProductForLifehack(topic, options, (p) => {
            if (event && event.sender) {
                try { event.sender.send('amazon-source-progress', p); } catch (_) {}
            }
        });
    });

    ipcMain.handle('amazon-source-by-url', async (event, { urlOrAsin, options }) => {
        const amazonSourcing = require('./amazon-sourcing.cjs');
        return await amazonSourcing.sourceProductByUrlOrAsin(urlOrAsin, options, (p) => {
            if (event && event.sender) {
                try { event.sender.send('amazon-source-progress', p); } catch (_) {}
            }
        });
    });

    console.log('[AmazonManager] IPC handlers registered.');
}

module.exports = {
    registerAmazonHandlers,
    getAll,
    getByCode,
    getNextCode,
    registerProduct,
    deleteProduct,
    saveProducts,
    getRandomCta,
    buildTopicForProduct,
    getProductImage,
    OUTRO_CTA_TEMPLATES_FR
};
