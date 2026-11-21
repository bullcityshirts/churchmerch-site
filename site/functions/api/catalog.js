// GET /api/catalog
// Pulls the order-form lineup from S&S Activewear and returns colors, photos, sizes and stock (never your cost).
// Needs two Cloudflare settings (Pages > Settings > Variables and Secrets):
//   SS_ACCOUNT  = your S&S account number
//   SS_API_KEY  = your S&S API key (add it as an encrypted secret)
// Results are cached at Cloudflare for 6 hours so S&S isn't called on every visit.

const STYLES = {
  "64000": "Gildan 64000",
  "3600": "Next Level 3600",
  "1717": "Comfort Colors 1717",
  "18000": "Gildan 18000",
  "18500": "Gildan 18500",
};
const CACHE_SECONDS = 6 * 60 * 60;
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

const img = (path) => (path ? "/img/" + path.replace(/^\/+/, "").replace(/_fm\./, "_fl.") : null);

function shapeStyle(rows) {
  const colors = new Map();
  for (const r of rows) {
    let c = colors.get(r.colorName);
    if (!c) {
      c = {
        name: r.colorName,
        hex: r.color1 || null,
        hex2: r.color2 || null,
        swatch: img(r.colorSwatchImage),
        front: img(r.colorFrontImage),
        back: img(r.colorBackImage),
        sizes: [],
      };
      colors.set(r.colorName, c);
    }
    // Your S&S cost (customerPrice) is deliberately NOT sent to the browser: this endpoint is public.
    c.sizes.push({ size: r.sizeName, order: r.sizeOrder, qty: r.qty ?? 0 });
  }
  return [...colors.values()]
    .map((c) => {
      c.sizes.sort((a, b) => String(a.order).localeCompare(String(b.order)) || SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size));
      c.sizes.forEach((s) => delete s.order);
      c.inStock = c.sizes.some((s) => s.qty > 0);
      return c;
    })
    .filter((c) => c.front && c.inStock);
}

async function fetchStyle(name, env) {
  const url = "https://api.ssactivewear.com/v2/products/?style=" + encodeURIComponent(name) + "&mediatype=json";
  const res = await fetch(url, {
    headers: { Authorization: "Basic " + btoa(env.SS_ACCOUNT + ":" + env.SS_API_KEY), Accept: "application/json" },
  });
  if (!res.ok) throw new Error("S&S " + res.status + " for " + name);
  return res.json();
}

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.SS_ACCOUNT || !env.SS_API_KEY) {
    return Response.json({ ok: false, error: "S&S credentials are not set" }, { status: 503 });
  }
  const cache = caches.default;
  const key = new Request(new URL("/api/catalog?v=1", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const out = { ok: true, updated: new Date().toISOString(), styles: {} };
  const errors = [];
  await Promise.all(
    Object.entries(STYLES).map(async ([id, name]) => {
      try {
        out.styles[id] = shapeStyle(await fetchStyle(name, env));
      } catch (e) {
        errors.push(String(e.message || e));
      }
    })
  );
  if (errors.length) out.errors = errors;
  const res = Response.json(out, {
    headers: { "Cache-Control": "public, max-age=" + (errors.length ? 300 : CACHE_SECONDS) },
  });
  if (Object.keys(out.styles).length) waitUntil(cache.put(key, res.clone()));
  return res;
}

export { shapeStyle }; // for tests
