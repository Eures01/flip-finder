# Flip Finder v2

Mobile-first retail-arbitrage sourcing app for comparing Amazon and eBay economics before buying an item.

## Included
- UPC / GTIN entry and camera barcode scanning where `BarcodeDetector` is supported
- Manual calculations that work with no API account
- Optional eBay Browse API lookup by GTIN
- Optional Keepa product-code lookup for Amazon product data
- Purchase sales-tax allowance, quantity, editable marketplace fees, shipping and prep costs
- GOOD FLIP / MAYBE / SKIP rules with editable profit and ROI thresholds
- Max-buy-price calculation at your target ROI
- Saved Buy List in local browser storage
- Duplicate replacement by UPC + store
- CSV export
- Installable web-app manifest and offline shell cache
- Server-side API secrets so credentials are not exposed in browser JavaScript

## Run locally
Requires Node 18+.

```bash
cd flip-finder
node server.mjs
```
Open `http://localhost:3000`.

Camera access generally requires HTTPS when opened from a phone, so deploy behind HTTPS for real in-store scanning.

## Optional API credentials

```bash
export EBAY_CLIENT_ID="your_client_id"
export EBAY_CLIENT_SECRET="your_client_secret"
export KEEPA_API_KEY="your_keepa_key"
node server.mjs
```

The eBay lookup uses current fixed-price listings and the median asking price. Asking price is not the same as completed/sold comps.

The Keepa integration searches by product code. Keepa's product/stat fields can vary by product and offer state, so verify the returned Amazon price before buying inventory.

## Next production steps
- Add a more universal barcode-scanning library for iPhone/Safari fallback.
- Add authentication + cloud sync if multiple devices will share a Buy List.
- Add real sold-comps data if an approved source is available.
- Add retailer feeds/inventory only where the retailer or licensed data provider permits it.
- Deploy to an HTTPS host and store credentials as host environment variables.
