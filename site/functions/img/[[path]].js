// GET /img/Images/Color/xxxx_f_fl.jpg
// Serves S&S product photos from churchmerch.store (cached at Cloudflare for 30 days),
// so the order form can draw them and turn them into mockup images.

const DAYS_30 = 30 * 24 * 60 * 60;

export async function onRequestGet({ request, params, waitUntil }) {
  const path = (params.path || []).join("/");
  if (!/^Images\/[A-Za-z0-9_\-\/]+\.(jpg|jpeg|png)$/i.test(path)) {
    return new Response("Not found", { status: 404 });
  }
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const upstream = await fetch("https://cdn.ssactivewear.com/" + path, {
    cf: { cacheTtl: DAYS_30, cacheEverything: true },
  });
  if (!upstream.ok) return new Response("Not found", { status: 404 });

  const res = new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "image/jpeg",
      "Cache-Control": "public, max-age=" + DAYS_30 + ", immutable",
    },
  });
  waitUntil(cache.put(request, res.clone()));
  return res;
}
