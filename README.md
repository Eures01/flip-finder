# Flip Finder v4 — Scan & Auto-Fill

Changes in v4:
- Scanning a UPC automatically runs live lookup.
- Auto-fills product name, brand, model, category, description, product image and ASIN when Keepa supplies them.
- Auto-fills Amazon price and sales rank when available.
- Searches eBay by UPC, then falls back to the product name.
- Shows eBay median active asking price, listing count and price range.
- Automatically analyzes the flip if a store price is already entered.
- Uses a new service-worker cache so iPhone Home Screen installs receive the update more reliably.

## Update the existing Render deployment
Replace these files in the existing GitHub `flip-finder` repo:
- `index.html`
- `server.mjs`
- `sw.js`

Commit the changes. Render should redeploy automatically. No new environment variables are required.

## iPhone after deployment
Open the web version once in Safari and refresh. Then fully close the Home Screen Flip Finder app and reopen it. If the old interface still appears, remove the Home Screen icon, open the Render URL in Safari, then Add to Home Screen again.
