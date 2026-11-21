// POST /api/order
// Turns a submitted order into a Square invoice with a 10% deposit and emails it to the customer.
//   1. Re-prices every item from catalog.json (the browser's prices are never trusted)
//   2. Finds or creates the customer in Square
//   3. Creates the order (line items + volume discount) at the Church Merch location
//   4. Creates the invoice: 10% deposit due today, balance due later
//   5. Attaches the mockups (and the customer's art files when Square accepts the file type)
//   6. Publishes it, so Square emails the invoice to the customer
//
// Cloudflare settings (Pages > Settings > Variables and Secrets):
//   SQUARE_ACCESS_TOKEN  (encrypted secret) production access token from developer.squareup.com
//   SQUARE_LOCATION_ID   Church Merch location: L5P1AJ2DQET64
//   SQUARE_ENV           "production" (default) or "sandbox" for testing
//   BALANCE_DUE_DAYS     days after the order the balance is due (default 21)
//   DEPOSIT_PERCENT      default 10

const PRICING = { print: { front: 6, both: 8 }, emb: { first: 12, back: 8 }, up2xl: 2, up3xl: 3 };
const DISCOUNTS = [[300, 1.75], [200, 1.5], [100, 1]];
const DECO = { tee: ["print"], longsleeve: ["print"], womens: ["print"], youth: ["print"], tank: ["print"],
  crew: ["print", "emb"], hoodie: ["print", "emb"], qz: ["print", "emb"], polo: ["print", "emb"], jacket: ["emb"], hat: ["emb"] };
const METHOD_LABEL = { print: "Full color print", emb: "Embroidery" };
const SQUARE_VERSION = "2025-01-23";
const MAX_PIECES = 5000;

const cents = (d) => Math.round(d * 100);
const money = (c) => ({ amount: c, currency: "USD" });
const sizeUp = (s) => (/^2XL$/i.test(s) ? PRICING.up2xl : /^[3-6]XL$/i.test(s) ? PRICING.up3xl : 0);
const discountFor = (n) => (DISCOUNTS.find(([min]) => n >= min) || [0, 0])[1];

function ymd(date, tz = "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function fail(status, error) { return Response.json({ ok: false, error }, { status }); }

async function sq(env, path, body, method = "POST") {
  const base = env.SQUARE_ENV === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: "Bearer " + env.SQUARE_ACCESS_TOKEN, "Square-Version": SQUARE_VERSION, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(path + ": " + (data.errors || []).map((e) => e.detail || e.code).join("; "));
  return data;
}

function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || "");
  if (!m) return null;
  const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

async function attach(env, invoiceId, file, name, description) {
  const base = env.SQUARE_ENV === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  const fd = new FormData();
  fd.append("request", new Blob([JSON.stringify({ idempotency_key: crypto.randomUUID(), description })], { type: "application/json" }));
  fd.append("image_file", file, name);
  const res = await fetch(base + "/v2/invoices/" + invoiceId + "/attachments", {
    method: "POST", headers: { Authorization: "Bearer " + env.SQUARE_ACCESS_TOKEN, "Square-Version": SQUARE_VERSION }, body: fd,
  });
  return res.ok;
}

export async function onRequestPost({ request, env }) {
  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) return fail(503, "Ordering isn't connected to Square yet.");
  let body;
  try { body = await request.json(); } catch { return fail(400, "Bad request"); }
  const c = body.contact || {};
  if (body.website) return Response.json({ ok: true });                       // honeypot: bots fill this
  if (!c.name || !c.church || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email || "")) return fail(400, "Name, church and a valid email are required.");
  if (!Array.isArray(body.items) || !body.items.length) return fail(400, "No items in the order.");

  // ---- Re-price from the catalog ----
  const catRes = await env.ASSETS.fetch(new URL("/catalog.json", request.url));
  const catalog = await catRes.json();
  const byId = Object.fromEntries(catalog.products.map((p) => [p.id, p]));
  const lines = []; let pieces = 0;
  for (const it of body.items) {
    const p = byId[it.pid]; if (!p) return fail(400, "Unknown product.");
    const color = p.colors.find((x) => x.name === it.color); if (!color) return fail(400, "Unknown color for " + p.style + ".");
    const allowed = p.deco || DECO[p.cat] || ["print"];
    if (!allowed.includes(it.method)) return fail(400, METHOD_LABEL[it.method] + " isn't available on " + p.style + ".");
    const sides = (it.sides || []).filter((s) => s && (s.side === "front" || s.side === "back"));
    if (!sides.length) return fail(400, "An item is missing artwork.");
    const both = sides.length === 2;
    const deco = it.method === "emb" ? PRICING.emb.first + (both ? PRICING.emb.back : 0) : (both ? PRICING.print.both : PRICING.print.front);
    const isWhite = /^white$/i.test(color.name);
    const blank = p.cost ? (isWhite && p.cost.white != null ? p.cost.white : (p.cost.color != null ? p.cost.color : p.cost.white)) : null;
    if (blank == null) return fail(400, p.style + " needs a custom quote.");
    const where = sides.map((s) => `${s.placement} (${s.width_in}" × ${s.height_in}")`).join(" + ");
    const groups = {};                                                            // one Square line per price tier
    for (const [size, qtyRaw] of Object.entries(it.sizes || {})) {
      const qty = Math.floor(+qtyRaw || 0);
      if (qty <= 0) continue;
      if (!p.sizes.includes(size)) return fail(400, "Size " + size + " isn't offered for " + p.style + ".");
      const up = sizeUp(size); (groups[up] = groups[up] || []).push([size, qty]); pieces += qty;
    }
    for (const [up, list] of Object.entries(groups)) {
      const qty = list.reduce((t, [, q]) => t + q, 0);
      lines.push({
        name: `${p.brand} ${p.style} ${p.name} — ${color.name}`.slice(0, 500),
        variation_name: `${METHOD_LABEL[it.method]}: ${where}`.slice(0, 255),
        note: list.map(([s, q]) => `${s} × ${q}`).join(", ").slice(0, 2000),
        quantity: String(qty),
        base_price_money: money(cents(blank + deco + +up)),
      });
    }
  }
  if (!pieces) return fail(400, "No sizes entered.");
  if (pieces > MAX_PIECES) return fail(400, "That's a big order! Please call us so we can quote it.");
  const per = discountFor(pieces);

  try {
    // ---- Customer ----
    const email = c.email.trim().toLowerCase();
    const found = await sq(env, "/v2/customers/search", { query: { filter: { email_address: { exact: email } } }, limit: 1 });
    let customerId = found.customers && found.customers[0] && found.customers[0].id;
    if (!customerId) {
      const [given, ...rest] = String(c.name).trim().split(/\s+/);
      const cust = { idempotency_key: crypto.randomUUID(), given_name: given, family_name: rest.join(" ") || undefined, company_name: c.church, email_address: email,
        note: "Created by churchmerch.store order form" };
      const digits = String(c.phone || "").replace(/\D/g, "");
      if (digits.length === 10) cust.phone_number = "+1" + digits;
      customerId = (await sq(env, "/v2/customers", cust)).customer.id;
    }

    // ---- Order ----
    const ref = "CM-" + Date.now().toString(36).toUpperCase();
    const order = { location_id: env.SQUARE_LOCATION_ID, customer_id: customerId, reference_id: ref, line_items: lines };
    if (per) order.discounts = [{ uid: "volume", name: `Volume discount (${pieces} pieces, $${per.toFixed(2)} off each)`, type: "FIXED_AMOUNT", amount_money: money(cents(per * pieces)), scope: "ORDER" }];
    const created = await sq(env, "/v2/orders", { idempotency_key: crypto.randomUUID(), order });
    const orderId = created.order.id;
    const totalCents = created.order.total_money.amount;

    // ---- Invoice: deposit today, balance later ----
    const pct = String(env.DEPOSIT_PERCENT || "10");
    const days = parseInt(env.BALANCE_DUE_DAYS || "21", 10);
    const today = ymd(new Date());
    const balanceDue = ymd(new Date(Date.now() + days * 864e5));
    const description = [
      `Thanks for your order, ${String(c.name).split(" ")[0]}! Your ${pct}% deposit locks in your order.`,
      `We'll email your proof today. Nothing prints until you approve it.`,
      c.need_by ? `Need-by date: ${c.need_by}` : "",
      c.notes ? `Your notes: ${c.notes}` : "",
      `Order ref: ${ref}`,
    ].filter(Boolean).join("\n").slice(0, 65536);
    const inv = await sq(env, "/v2/invoices", {
      idempotency_key: crypto.randomUUID(),
      invoice: {
        location_id: env.SQUARE_LOCATION_ID, order_id: orderId, primary_recipient: { customer_id: customerId },
        payment_requests: [
          { request_type: "DEPOSIT", percentage_requested: pct, due_date: today },
          { request_type: "BALANCE", due_date: balanceDue, reminders: [{ relative_scheduled_days: -3, message: "Your Church Merch balance is due in 3 days." }] },
        ],
        delivery_method: "EMAIL",
        accepted_payment_methods: { card: true, bank_account: true },
        title: `Church Merch order for ${c.church}`.slice(0, 255),
        description,
      },
    });
    let invoice = inv.invoice;

    // ---- Attachments (Square allows up to 10; PNG/JPEG/GIF/TIFF/BMP/PDF) ----
    let n = 0;
    for (const m of body.mockups || []) {
      if (n >= 10) break;
      const blob = dataUrlToBlob(m.data); if (!blob) continue;
      if (await attach(env, invoice.id, blob, (m.name || "mockup") + ".jpg", "Mockup: " + (m.label || ""))) n++;
    }
    for (const a of body.art || []) {
      if (n >= 10) break;
      const blob = dataUrlToBlob(a.data); if (!blob || !/^image\/(png|jpeg|gif|tiff|bmp)$|^application\/pdf$/.test(blob.type)) continue;
      if (await attach(env, invoice.id, blob, a.name || "artwork", "Your artwork")) n++;
    }
    if (n) invoice = (await sq(env, "/v2/invoices/" + invoice.id, null, "GET")).invoice;   // fresh version after attachments

    // ---- Publish: Square emails the invoice ----
    const pub = await sq(env, "/v2/invoices/" + invoice.id + "/publish", { version: invoice.version, idempotency_key: crypto.randomUUID() });
    return Response.json({
      ok: true, ref, invoice_number: pub.invoice.invoice_number, public_url: pub.invoice.public_url || null,
      total: totalCents / 100, deposit: Math.round(totalCents * +pct / 100) / 100, pieces, email,
    });
  } catch (e) {
    console.log("order error", e && e.message);
    return fail(502, "We couldn't create your invoice automatically.");
  }
}
