# churchmerch.store

Static site + Cloudflare Pages Functions for Church Merch.

- `site/` — what Cloudflare deploys (set **Root directory = `site`**, no build command, output directory `.`)
  - `functions/api/order.js` — submitted orders → Square invoice with 10% deposit
  - `functions/api/catalog.js` — live S&S stock (optional, needs SS_ACCOUNT / SS_API_KEY)
  - `functions/img/[[path]].js` — serves S&S product photos from churchmerch.store
  - `catalog.json` — 100 products pulled from S&S (colors, photos, sizes, blank cost, print-area calibration)
- `tools/` — `build.py` regenerates the HTML pages; `make_catalog.py` rebuilds catalog.json from an S&S pull

Cloudflare variables: SQUARE_ACCESS_TOKEN (secret), SQUARE_LOCATION_ID=L5P1AJ2DQET64, optional SQUARE_ENV=sandbox, BALANCE_DUE_DAYS, DEPOSIT_PERCENT.
