# Flip Finder v4.1

Patch release for live API diagnostics and barcode lookup reliability.

## Changes
- Keepa UPC/EAN/GTIN lookup uses the documented `code` product endpoint with `code-limit`, `stats`, and smaller responses.
- Keepa errors now include the API response detail instead of only HTTP 400.
- eBay OAuth trims accidental whitespace from Render environment variables.
- eBay 401 errors now clearly identify a likely Production-vs-Sandbox credential mismatch.
- Version/cache bumped to v4.1 so iPhone Home Screen installs refresh.

## Upload these files to the existing GitHub repo
Replace:
- `server.mjs`
- `index.html`
- `sw.js`

Then commit. Render should redeploy automatically. Your existing Render environment variables stay in place.
