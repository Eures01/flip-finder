import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { URL } from 'node:url';

const PORT = process.env.PORT || 3000;
const ROOT = new URL('.', import.meta.url).pathname;
let ebayCache = { token: null, expires: 0 };

function cleanText(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function ebayToken() {
  const id = String(process.env.EBAY_CLIENT_ID || '').trim();
  const secret = String(process.env.EBAY_CLIENT_SECRET || '').trim();
  if (!id || !secret) return null;
  if (ebayCache.token && Date.now() < ebayCache.expires) return ebayCache.token;

  const auth = Buffer.from(`${id}:${secret}`, 'utf8').toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope'
  });
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body
  });
  const raw = await r.text();
  let d = {};
  try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
  if (!r.ok) {
    const detail = cleanText(d.error_description || d.message || d.error || raw).slice(0, 180);
    if (r.status === 401) {
      throw new Error(`eBay Production credentials were rejected (401)${detail ? `: ${detail}` : ''}. Use the Production App ID as EBAY_CLIENT_ID and Production Cert ID as EBAY_CLIENT_SECRET; Sandbox keys will not work with api.ebay.com.`);
    }
    throw new Error(`eBay token failed (${r.status})${detail ? `: ${detail}` : ''}`);
  }
  if (!d.access_token) throw new Error('eBay token response did not include an access token.');
  ebayCache = {
    token: d.access_token,
    expires: Date.now() + Math.max(60, (d.expires_in || 7200) - 120) * 1000
  };
  return ebayCache.token;
}

async function ebaySearch({ upc = null, query = null }) {
  const token = await ebayToken();
  if (!token) return null;

  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  if (upc) url.searchParams.set('gtin', upc);
  else if (query) url.searchParams.set('q', query);
  else return null;

  url.searchParams.set('limit', '50');
  url.searchParams.set('fieldgroups', 'EXTENDED');
  url.searchParams.set('filter', 'buyingOptions:{FIXED_PRICE}');

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
    }
  });
  if (!r.ok) throw new Error(`eBay lookup failed (${r.status})`);
  const d = await r.json();

  const items = (d.itemSummaries || [])
    .filter(x => x.price?.value)
    .map(x => ({
      title: x.title,
      price: Number(x.price.value),
      image: x.image?.imageUrl || x.thumbnailImages?.[0]?.imageUrl || null,
      shortDescription: cleanText(x.shortDescription),
      condition: x.condition || null,
      itemWebUrl: x.itemWebUrl || null
    }))
    .filter(x => Number.isFinite(x.price) && x.price > 0);

  if (!items.length) return null;
  const prices = items.map(x => x.price).sort((a, b) => a - b);
  const trim = prices.length >= 8
    ? prices.slice(Math.floor(prices.length * 0.1), Math.ceil(prices.length * 0.9))
    : prices;
  const median = trim[Math.floor(trim.length / 2)];

  return {
    name: items[0].title,
    price: median,
    low: prices[0],
    high: prices[prices.length - 1],
    count: items.length,
    method: upc ? 'UPC' : 'keyword',
    image: items.find(x => x.image)?.image || null,
    shortDescription: items.find(x => x.shortDescription)?.shortDescription || null,
    condition: items[0].condition,
    sampleUrl: items[0].itemWebUrl || null
  };
}

async function keepaLookup(upc) {
  const key = String(process.env.KEEPA_API_KEY || '').trim();
  if (!key) return null;

  const code = String(upc || '').replace(/\D/g, '');
  const url = new URL('https://api.keepa.com/product');
  url.searchParams.set('key', key);
  url.searchParams.set('domain', '1');
  url.searchParams.set('code', code);
  url.searchParams.set('code-limit', '5');
  url.searchParams.set('stats', '90');
  url.searchParams.set('history', '0');

  const r = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip' } });
  const raw = await r.text();
  let d = {};
  try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
  if (!r.ok) {
    const detail = cleanText(d.error?.message || d.error || d.message || raw).slice(0, 220);
    throw new Error(`Keepa lookup failed (${r.status})${detail ? `: ${detail}` : ''}`);
  }
  if (d.error) {
    const detail = cleanText(d.error?.message || d.error).slice(0, 220);
    throw new Error(`Keepa API error${detail ? `: ${detail}` : ''}`);
  }
  const products = Array.isArray(d.products) ? d.products : [];
  if (!products.length) return null;

  // A product code can map to multiple ASINs. Prefer a listing with a usable current price,
  // otherwise use the first returned product.
  const priceCandidates = [18, 0, 1, 10]; // Buy Box, Amazon, New, New FBA
  const scoreProduct = p => {
    const current = p?.stats?.current;
    if (!Array.isArray(current)) return 0;
    return priceCandidates.some(i => Number.isFinite(current[i]) && current[i] > 0) ? 1 : 0;
  };
  const p = [...products].sort((a, b) => scoreProduct(b) - scoreProduct(a))[0];

  const current = p.stats?.current;
  let price = null;
  let priceType = null;
  if (Array.isArray(current)) {
    const candidates = [
      [18, 'Buy Box'],
      [0, 'Amazon'],
      [1, 'New'],
      [10, 'New FBA']
    ];
    for (const [idx, label] of candidates) {
      const v = current[idx];
      if (Number.isFinite(v) && v > 0) {
        price = v / 100;
        priceType = label;
        break;
      }
    }
  }

  const imageName = String(p.imagesCSV || '').split(',').map(s => s.trim()).find(Boolean) || null;
  const image = imageName ? `https://images-na.ssl-images-amazon.com/images/I/${imageName}` : null;
  const features = Array.isArray(p.features) ? p.features.filter(Boolean).map(cleanText).filter(Boolean) : [];
  const description = cleanText(p.description) || features.slice(0, 3).join(' • ') || null;
  const salesRank = Number.isFinite(current?.[3]) && current[3] > 0 ? current[3] : null;

  return {
    name: cleanText(p.title) || null,
    price,
    priceType,
    asin: p.asin || null,
    brand: cleanText(p.brand) || cleanText(p.manufacturer) || null,
    model: cleanText(p.model) || null,
    category: cleanText(p.productGroup) || null,
    description,
    features: features.slice(0, 5),
    image,
    salesRank,
    matchedProducts: products.length,
    tokensLeft: d.tokensLeft
  };
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function handleLookup(res, upc) {
  if (!/^\d{8,14}$/.test(upc)) {
    return json(res, 400, { message: 'Enter a valid 8–14 digit UPC/GTIN.' });
  }

  const out = {
    upc,
    name: null,
    brand: null,
    model: null,
    category: null,
    description: null,
    image: null,
    asin: null,
    amazonPrice: null,
    amazonPriceType: null,
    amazonSalesRank: null,
    ebayPrice: null,
    ebayLow: null,
    ebayHigh: null,
    ebayListings: null,
    ebaySearchMethod: null,
    message: '',
    sources: {}
  };

  const msgs = [];
  let keepa = null;
  let ebay = null;

  try {
    keepa = await keepaLookup(upc);
    if (keepa) {
      Object.assign(out, {
        name: keepa.name,
        brand: keepa.brand,
        model: keepa.model,
        category: keepa.category,
        description: keepa.description,
        image: keepa.image,
        asin: keepa.asin,
        amazonPrice: keepa.price,
        amazonPriceType: keepa.priceType,
        amazonSalesRank: keepa.salesRank
      });
      out.sources.keepa = { asin: keepa.asin, tokensLeft: keepa.tokensLeft, matchedProducts: keepa.matchedProducts };
      msgs.push(keepa.price
        ? `Amazon/Keepa matched this product and returned a ${keepa.priceType || 'current'} price.`
        : 'Amazon/Keepa matched the product, but no usable current price was returned.');
    } else if (process.env.KEEPA_API_KEY) {
      msgs.push('No Amazon/Keepa product match for this barcode.');
    }
  } catch (e) {
    msgs.push(`Keepa error: ${e.message}`);
  }

  try {
    ebay = await ebaySearch({ upc });
    if (!ebay && out.name) ebay = await ebaySearch({ query: out.name });
    if (ebay) {
      out.name = out.name || ebay.name;
      out.description = out.description || ebay.shortDescription;
      out.image = out.image || ebay.image;
      out.ebayPrice = ebay.price;
      out.ebayLow = ebay.low;
      out.ebayHigh = ebay.high;
      out.ebayListings = ebay.count;
      out.ebaySearchMethod = ebay.method;
      out.sources.ebay = { listings: ebay.count, method: ebay.method, sampleUrl: ebay.sampleUrl };
      msgs.push(`eBay found ${ebay.count} active fixed-price listings by ${ebay.method === 'UPC' ? 'UPC' : 'product-name fallback'}; the app is using the median asking price.`);
    } else if (process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) {
      msgs.push('No eBay match by UPC or product-name fallback.');
    }
  } catch (e) {
    msgs.push(`eBay error: ${e.message}`);
  }

  out.message = msgs.join(' ') || 'No live APIs are connected yet.';
  return json(res, 200, out);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  if (u.pathname === '/api/config') {
    return json(res, 200, {
      ebay: !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
      keepa: !!process.env.KEEPA_API_KEY,
      version: '4.1'
    });
  }
  if (u.pathname === '/api/lookup') {
    return handleLookup(res, (u.searchParams.get('upc') || '').trim());
  }

  let path = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
  if (path.includes('..')) {
    res.writeHead(400);
    return res.end('Bad request');
  }

  try {
    const data = await readFile(join(ROOT, path));
    res.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Cache-Control': path === 'index.html' || path === 'sw.js' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`Flip Finder v4.1 running at http://localhost:${PORT}`));
