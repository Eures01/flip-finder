# Flip Finder v3

Retail arbitrage helper for Amazon/Keepa and eBay.

## v3 changes
- Barcode scanner now uses html5-qrcode for broader iPhone/Android browser support, with native BarcodeDetector fallback.
- eBay lookup first searches exact UPC/GTIN, then falls back to the product name returned by Keepa if UPC returns no listings.
- Service worker cache bumped to v3 so deployed updates replace old cached app files.

## Render
Start command: `node server.mjs`
Build command: `echo "No build needed"`

Environment variables:
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `KEEPA_API_KEY`
