"""Builds the Church Merch static site into ../churchmerch-site.
Shared header/footer live here so every page stays in sync.
Set CM_EMAIL and CM_PHONE in the environment to fill the contact details."""
import json, os, pathlib, re

OUT = pathlib.Path(__file__).resolve().parent.parent / "site"
OUT.mkdir(exist_ok=True)
SITE = "https://churchmerch.store"
EMAIL = os.environ.get("CM_EMAIL", "")
PHONE = os.environ.get("CM_PHONE", "")
EMAIL_SHOW = EMAIL or "<em class='tbd'>[contact email]</em>"
EMAIL_HREF = f"mailto:{EMAIL}" if EMAIL else "quote.html"
PHONE_SHOW = PHONE or "<em class='tbd'>[phone]</em>"
PHONE_HREF = "tel:+1" + re.sub(r"\D", "", PHONE) if PHONE else "quote.html"

LOGO = """<svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
<defs><linearGradient id="g{n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB600"/><stop offset="1" stop-color="#FFDB00"/></linearGradient></defs>
<rect width="48" height="48" rx="13" fill="url(#g{n})"/>
<text x="24" y="31" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="17" fill="#141414">CM</text></svg>"""

def tee(text, fill, ink):
    return f"""<svg viewBox="0 0 300 300" aria-hidden="true">
<path d="M104 38 L58 56 L16 104 L52 138 L78 118 L78 274 L222 274 L222 118 L248 138 L284 104 L242 56 L196 38 Q150 78 104 38 Z" fill="{fill}" stroke="#141414" stroke-width="5" stroke-linejoin="round"/>
<text x="150" y="168" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="26" fill="{ink}">{text}</text>
<text x="150" y="196" text-anchor="middle" font-family="DM Sans, sans-serif" font-weight="700" font-size="13" letter-spacing="3" fill="{ink}">EST. SUNDAY</text></svg>"""

NAV = [("order.html", "Design yours"), ("index.html#make", "What we make"), ("boxes.html", "Welcome boxes"), ("work.html", "Our work"), ("faq.html", "FAQ"), ("promo.html", "Promo store")]

def header(n):
    links = "".join(f'<a href="{h}">{t}</a>' for h, t in NAV)
    return f"""<header class="site-header"><div class="wrap">
<a class="brand" href="index.html" aria-label="Church Merch home">{LOGO.format(n=n)}<span class="brand-name">Church Merch</span></a>
<button class="nav-toggle" aria-label="Menu" aria-expanded="false" onclick="var n=document.querySelector('.nav');n.classList.toggle('open');this.setAttribute('aria-expanded',n.classList.contains('open'))">&#9776;</button>
<nav class="nav">{links}<a class="btn btn-ink" href="quote.html">Get a quote</a></nav>
</div></header>"""

FOOTER = f"""<footer class="site-footer"><div class="wrap">
<div class="cols">
<div><a class="brand" href="index.html">{LOGO.format(n='f')}<span class="brand-name">Church Merch</span></a>
<p style="margin-top:16px;max-width:26em">Custom shirts, hoodies, swag boxes and promo products for churches and ministries. Printed in Durham, NC. Shipped anywhere in the US.</p></div>
<div><h4>Explore</h4><a href="index.html#make">What we make</a><a href="work.html">Our work</a><a href="boxes.html">Welcome boxes</a><a href="faq.html">FAQ</a><a href="promo.html">Promo store</a><a href="quote.html">Get a quote</a></div>
<div><h4>Say hey</h4><a href="{EMAIL_HREF}">{EMAIL_SHOW}</a><a href="{PHONE_HREF}">{PHONE_SHOW}</a><a href="https://www.instagram.com/churchmrch">Instagram</a><a href="https://www.facebook.com/churchmrch">Facebook</a><span>Durham, North Carolina</span></div>
</div>
<div class="legal"><span>&copy; 2026 Church Merch. A Moody Capital LLC company.</span><span>Made for the Church.</span></div>
</div></footer>"""

ORG = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": SITE + "/#org",
    "name": "Church Merch",
    "url": SITE,
    "logo": SITE + "/logo.png",
    "description": "Custom shirts, hoodies, swag boxes and promo products for churches and ministries. full color printing, screen printing and embroidery from our Durham, NC shop, shipping nationwide.",
    "address": {"@type": "PostalAddress", "addressLocality": "Durham", "addressRegion": "NC", "addressCountry": "US"},
    "areaServed": "United States",
    "knowsAbout": ["church shirts", "church merchandise", "full color printing", "screen printing", "embroidery",
                   "youth group shirts", "mission trip shirts", "church welcome boxes", "promotional products"],
    "sameAs": ["https://www.instagram.com/churchmrch", "https://www.facebook.com/churchmrch"],
}
if EMAIL: ORG["email"] = EMAIL
if PHONE: ORG["telephone"] = PHONE

def page(slug, title, desc, body, extra_ld=None, n="h"):
    lds = [ORG] + ([extra_ld] if extra_ld else [])
    ld = "\n".join(f'<script type="application/ld+json">{json.dumps(x)}</script>' for x in lds)
    canon = SITE + ("/" if slug == "index" else "/" + slug)
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{canon}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{canon}">
<meta property="og:type" content="website">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Unbounded:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
{ld}
</head>
<body>
{header(n)}
<main>
{body}
</main>
{FOOTER}
</body>
</html>
"""
    (OUT / f"{slug}.html").write_text(html)

# ---------------- FAQ content (shared by home + FAQ page + schema) ----------------
FAQ = [
    ("What's the minimum order?",
     "There isn't one on apparel. Order a handful of shirts or a few hundred. Welcome boxes start at 24, and some promo products have their own minimums, listed right on each product in our <a href='promo.html'>promo store</a>."),
    ("How long does an order take?",
     "Most orders are ready in 10–14 days after you approve the mockup. Have a hard deadline? Tell us up front and we'll tell you straight whether we can hit it."),
    ("How much do custom church shirts cost?",
     "It depends on the shirt, the number of colors and how many you order, but most one-color tee orders land between $8 and $12 per shirt. 2XL runs two dollars more and 3XL three dollars more. Tell us what you need and we'll send a real price the same day."),
    ("Can you help with the design?",
     "We can help with minor design adjustments, like resizing, recoloring or cleaning up your logo for print. Send us your logo or artwork and we'll send a mockup so you can see exactly what you're getting before anything prints."),
    ("Which print method should we use?",
     "Full color printing is great for full-color designs, photos and smaller runs. Screen printing is the best value for bigger orders with a few solid colors. Embroidery is the move for hats, polos, jackets and staff gear that should look sharp for years. Not sure? We'll recommend the right one for your design and budget."),
    ("Do your prices include shipping?",
     "On promo products, yes. The price you see includes every setup fee and shipping, period. On apparel, shipping is quoted separately so you see exactly what it costs. We ship with UPS anywhere in the US."),
    ("Where are you located?",
     "Our shop is in Durham, North Carolina. We work with churches across the Triangle and ship nationwide."),
    ("Can you do mission trip, camp or VBS shirts on a deadline?",
     "Absolutely. That's a big part of what we do. Give us your date and we'll work backward from it. The earlier you reach out, the more options you'll have, but we'll always tell you straight whether we can hit it."),
    ("Do you make welcome boxes for first-time guests?",
     "We do. Every item in the box is branded with your church's logo. Pick a tier, choose what goes inside and how you want it delivered in our <a href='boxes.html'>welcome box builder</a>. Boxes start at 24."),
    ("What does \"we give back\" mean?",
     "We believe in biblical tithing. A tenth of what Church Merch earns goes right back into the Church, so every order you place helps more than one ministry."),
]

def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s)

def faq_html(items):
    return "".join(f"<details><summary>{q}</summary><div class='answer'><p>{a}</p></div></details>" for q, a in items)

# ---------------- Home ----------------
MAKE = [
    ("👕", "Staff & Dream Team shirts", "Matching tees, polos and hoodies so your volunteers are easy to spot and proud to wear it."),
    ("⛺", "Youth, camp & VBS", "Bright, bold shirts for students and kids. Built to survive camp, color wars and the washing machine."),
    ("✈️", "Mission trip shirts", "Team shirts with your destination and dates. A uniform on the trip, a keepsake when you're home."),
    ("🧢", "Hoodies, hats & more", "Embroidered hats, crewnecks, quarter-zips and jackets for staff, worship teams and your merch table."),
    ("🎁", "First-time guest boxes", "Welcome boxes for new guests and volunteers, every item branded with your logo. <a href='boxes.html'>Build yours &rarr;</a>"),
    ("📦", "Promo products", "Stickers, bottles, notebooks, wristbands, banners and tents. Every price includes setup and shipping."),
]
make_cards = "".join(f'<div class="card"><div class="icon" aria-hidden="true">{i}</div><h3>{t}</h3><p>{d}</p></div>' for i, t, d in MAKE)

STEPS = [
    ("Tell us what you need", "Fill out a quick quote form. Shirts, boxes, a date. No minimums."),
    ("Get a mockup + price", "Same day, you'll see exactly how it looks and what it costs."),
    ("Approve and we print", "We source the blanks and print, embroider and pack everything in our Durham shop."),
    ("Shipped to your door", "Boxed, sorted by size and shipped UPS to your church. Done."),
]
step_cards = "".join(f'<div class="step"><h3>{t}</h3><p>{d}</p></div>' for t, d in STEPS)

home = f"""
<section class="hero"><div class="wrap">
  <div>
    <div class="eyebrow">Custom merch for churches &amp; ministries</div>
    <h1>Your church deserves <span class="gold-text">good merch.</span></h1>
    <p class="lede">Church Merch makes custom shirts, hoodies, swag boxes and promo products for churches and ministries. We print, embroider, pack and ship it all from our shop in Durham, North Carolina, so you can get back to ministry.</p>
    <div class="btn-row"><a class="btn btn-gold" href="order.html">Design your shirt &rarr;</a><a class="btn btn-ghost" href="quote.html">Get a quote</a></div>
  </div>
  <div class="hero-art" aria-hidden="true">
    <div class="blob"></div>
    <div class="tee one">{tee("GRACE", "#141414", "#FFB600")}</div>
    <div class="tee two">{tee("YOUTH", "#FAF7F0", "#141414")}</div>
    <div class="badge">Simple. Fast. Fairly priced.</div>
  </div>
</div></section>

<div class="strip"><div class="wrap">
  <span>Printed in Durham, NC</span><span>No minimums</span><span>Ready in 10–14 days</span><span>Ships nationwide via UPS</span>
</div></div>

<section class="section" id="make"><div class="wrap">
  <div class="section-head">
    <div><div class="eyebrow">What we make</div><h2>Merch for every ministry.</h2></div>
    <p>From your Sunday crew to your summer camp, we handle the sourcing, printing and shipping so you're not stuck juggling vendors.</p>
  </div>
  <div class="grid grid-3">{make_cards}</div>
</div></section>

<section class="section" style="padding-top:0"><div class="wrap">
  <div class="section-head"><div><div class="eyebrow">How it works</div><h2>Four steps. Zero headaches.</h2></div></div>
  <div class="grid grid-4 steps">{step_cards}</div>
</div></section>

<section class="section dark"><div class="wrap">
  <div class="section-head">
    <div><div class="eyebrow">How we print</div><h2>The right method for your design.</h2></div>
    <p style="color:#cfc9bc">Not sure which one you need? Send your design and we'll recommend the best fit for the look and the budget.</p>
  </div>
  <div class="grid grid-3">
    <div class="card"><span class="tag">Any colors</span><h3>Full color printing</h3><p>Vivid, detailed, full-color prints with no color limits. Great for photos, gradients and smaller runs.</p></div>
    <div class="card"><span class="tag">Best value</span><h3>Screen printing</h3><p>The classic. Soft, durable prints and the lowest price per shirt on bigger orders with a few solid colors.</p></div>
    <div class="card"><span class="tag">Premium</span><h3>Embroidery</h3><p>Stitched logos for hats, polos, jackets and staff gear that look sharp for years.</p></div>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="giveback">
    <div><div class="eyebrow" style="color:#5a4a00">We give back</div><div class="big">Merch with a mission.</div></div>
    <div><p style="font-size:1.1rem">We believe in biblical tithing. A tenth of what Church Merch earns goes right back into the Church.</p><p>So every order you place helps more than one ministry: yours, and the next one.</p></div>
  </div>
</div></section>

<section class="section" style="padding-top:0"><div class="wrap">
  <div class="section-head"><div><div class="eyebrow">Questions</div><h2>Good to know.</h2></div><a class="btn btn-ghost" href="faq.html">All FAQs &rarr;</a></div>
  <div class="faq-list">{faq_html([FAQ[0], FAQ[1], FAQ[2]])}</div>
</div></section>

<section class="section dark cta-band"><div class="wrap">
  <div class="eyebrow">Let's make something</div>
  <h2>Ready when you are.</h2>
  <p class="lede" style="color:#cfc9bc">Tell us what you're dreaming up. We'll send a mockup and a real price, no pressure.</p>
  <div class="btn-row"><a class="btn btn-gold" href="quote.html">Get a quote &rarr;</a><a class="btn btn-ghost" style="color:var(--bone);border-color:var(--bone)" href="work.html">See our work</a></div>
</div></section>
"""
page("index", "Church Merch | Custom Church Shirts, Hoodies & Swag · Durham, NC",
     "Custom shirts, hoodies, swag boxes and promo products for churches and ministries. full color printing, screen printing and embroidery from our Durham, NC shop. Shipping nationwide.",
     home)

# ---------------- FAQ page ----------------
faq_ld = {"@context": "https://schema.org", "@type": "FAQPage",
          "mainEntity": [{"@type": "Question", "name": q,
                          "acceptedAnswer": {"@type": "Answer", "text": strip_tags(a)}} for q, a in FAQ]}
faq_body = f"""
<section class="page-hero"><div class="wrap">
  <div class="eyebrow">FAQ</div>
  <h1>Questions churches ask us.</h1>
  <p class="lede">Straight answers on minimums, pricing, turnaround and how it all works. Don't see yours? <a href="quote.html">Just ask.</a></p>
</div></section>
<section class="section" style="padding-top:20px"><div class="wrap"><div class="faq-list">{faq_html(FAQ)}</div></div></section>
<section class="section dark cta-band"><div class="wrap">
  <h2>Still have a question?</h2>
  <p class="lede" style="color:#cfc9bc">Send a quote request with your question and we'll get back to you fast.</p>
  <div class="btn-row"><a class="btn btn-gold" href="quote.html">Ask us &rarr;</a></div>
</div></section>
"""
page("faq", "FAQ: Custom Church Shirts & Merch | Church Merch",
     "Minimums, pricing, turnaround, print methods and shipping for custom church shirts, hoodies, welcome boxes and promo products from Church Merch in Durham, NC.",
     faq_body, faq_ld)

# ---------------- Our work ----------------
WORK = [
    ("[Church name]", "[City, ST]", "[150] staff tees", ["[Full color print]", "[2-color]", "[6 days]"]),
    ("[Church name]", "[City, ST]", "[80] mission trip shirts", ["[Screen print]", "[1-color]", "[8 days]"]),
    ("[Church name]", "[City, ST]", "[200] VBS shirts", ["[Screen print]", "[Youth sizes]", "[10 days]"]),
    ("[Church name]", "[City, ST]", "[40] embroidered hats", ["[Embroidery]", "[Staff gear]"]),
    ("[Church name]", "[City, ST]", "[100] first-time guest boxes", ["[Swag box]", "[Tee + sticker + bottle]"]),
    ("[Church name]", "[City, ST]", "[60] worship team hoodies", ["[Full color print]", "[Full color]"]),
]
work_cards = "".join(
    f"""<article class="card work-card"><div class="work-photo">Photo coming soon</div>
<div class="work-body"><h3><em class="tbd">{c}</em></h3><p><em class="tbd">{city}</em> · <em class="tbd">{what}</em></p>
<div class="work-meta">{''.join(f'<span>{m}</span>' for m in meta)}</div></div></article>"""
    for c, city, what, meta in WORK)
work_body = f"""
<section class="page-hero"><div class="wrap">
  <div class="eyebrow">Our work</div>
  <h1>Shirts we've made.</h1>
  <p class="lede">Real orders for real churches. Here's a look at what we've printed, embroidered and packed lately.</p>
</div></section>
<section class="section" style="padding-top:20px"><div class="wrap"><div class="grid grid-3">{work_cards}</div></div></section>
<section class="section dark cta-band"><div class="wrap">
  <h2>Your church could be next.</h2>
  <div class="btn-row"><a class="btn btn-gold" href="quote.html">Get a quote &rarr;</a></div>
</div></section>
"""
page("work", "Our Work: Custom Church Shirts We've Made | Church Merch",
     "Custom church shirts, mission trip tees, VBS shirts, embroidered hats and welcome boxes Church Merch has made for churches and ministries.",
     work_body)

# ---------------- Quote ----------------
NEEDS = ["T-shirts", "Hoodies / crewnecks", "Hats", "Polos / staff gear", "Welcome / swag boxes", "Promo products", "Something else"]
chips = "".join(f'<label class="chip"><input type="checkbox" name="needs" value="{x}"><span>{x}</span></label>' for x in NEEDS)
quote_body = f"""
<section class="page-hero"><div class="wrap">
  <div class="eyebrow">Get a quote</div>
  <h1>Let's make your merch.</h1>
  <p class="lede">Tell us a little about what you need. We'll send back a mockup and a real price the same day.</p>
</div></section>
<section class="section" style="padding-top:20px"><div class="wrap" style="max-width:860px">
  <form class="form" id="quote-form">
    <div class="form-grid">
      <div class="field"><label for="name">Your name</label><input id="name" name="name" required autocomplete="name"></div>
      <div class="field"><label for="church">Church or ministry</label><input id="church" name="church" required></div>
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label for="phone">Phone (optional)</label><input id="phone" name="phone" type="tel" autocomplete="tel"></div>
      <div class="field full"><span class="label">What do you need?</span><div class="chips">{chips}</div></div>
      <div class="field"><label for="qty">About how many?</label><select id="qty" name="qty"><option>Under 25</option><option>25–50</option><option>50–100</option><option>100–250</option><option>250+</option><option>Not sure yet</option></select></div>
      <div class="field"><label for="date">Need it by</label><input id="date" name="date" type="date"></div>
      <div class="field full"><label for="details">Tell us about it</label><textarea id="details" name="details" placeholder="Event, design ideas, colors, anything helpful. Have a logo? Mention it and we'll grab it from you by email."></textarea></div>
    </div>
    <div class="btn-row"><button class="btn btn-gold" type="submit">Send my request &rarr;</button></div>
    <p class="form-note">We'll only use your info to reply about your order.</p>
  </form>
  <div class="form thanks" id="thanks"><h2>Got it. Thank you!</h2><p class="lede" style="margin:0 auto">We'll be in touch soon with next steps. Keep an eye on your inbox.</p></div>
</div></section>
<script>
/* DRAFT: on the live site this posts to the form handler (Jotform or a Cloudflare function). */
document.getElementById('quote-form').addEventListener('submit', function (e) {{
  e.preventDefault();
  this.style.display = 'none';
  document.getElementById('thanks').classList.add('show');
  window.scrollTo({{ top: 0, behavior: 'smooth' }});
}});
</script>
"""
page("quote", "Get a Quote: Custom Church Shirts & Merch | Church Merch",
     "Request a quote for custom church shirts, hoodies, hats, welcome boxes and promo products. Church Merch sends a mockup and a real price fast.",
     quote_body)

# ---------------- Promo store (existing promo order app, posts to Jotform) ----------------
PROMO_APP = (pathlib.Path(__file__).resolve().parent / "promo-embed.html").read_text()
page("promo", "Church Promo Products: Stickers, Bottles, Banners & More | Church Merch",
     "Custom promo products for churches: stickers, bottles, notebooks, wristbands, banners, tents and more. Every price includes setup and shipping. From Church Merch in Durham, NC.",
     f"""<section style="padding:24px 0 40px">{PROMO_APP}</section>""")

# ---------------- Welcome boxes (existing order app, posts to Jotform) ----------------
BOX_APP = (pathlib.Path(__file__).resolve().parent / "box-embed.html").read_text()
boxes_body = f"""
<section class="page-hero" style="padding-bottom:0"><div class="wrap">
  <div class="eyebrow">Welcome boxes</div>
  <h1>Make a great first impression.</h1>
  <p class="lede">Branded welcome boxes for first-time guests and new volunteers. Every item carries your church's logo. Pick a tier, choose what goes inside and how it gets delivered, and we'll handle the rest.</p>
</div></section>
<section style="padding:24px 0 40px">{BOX_APP}</section>
"""
page("boxes", "Church Welcome Boxes for First-Time Guests | Church Merch",
     "Branded welcome boxes for church first-time guests and new volunteers. Choose a tier, items and delivery. Every item carries your church logo. From Church Merch in Durham, NC.",
     boxes_body)

# ---------------- Design & order (live mockup form) ----------------
order_body = """
<section class="page-hero" style="padding-bottom:28px"><div class="wrap">
  <div class="eyebrow">Design &amp; order</div>
  <h1>See it before we print it.</h1>
  <p class="lede">Pick a product and color, drop in your logo and drag it where you want it. You'll see your price as you go, and we'll send your proof the same day. No minimums.</p>
</div></section>
<section class="section" style="padding-top:0"><div class="wrap">
<div id="cmd-app">
<form id="cmd-form" novalidate>
<div class="cmd">
  <div class="cmd-stage-wrap">
    <div class="cmd-stage" id="cmd-stage">
      <svg id="cmd-svg" viewBox="0 0 500 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Live mockup">
        <defs><filter id="cmd-stitch" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter></defs>
        <g id="cmd-garment"></g>
        <g id="cmd-art"></g>
        <text id="cmd-empty" x="250" y="215" text-anchor="middle" fill="#8A8479">Drop your logo here</text>
      </svg>
    </div>
    <div class="cmd-views">
      <button type="button" class="cmd-view on" data-v="front">Front<small>No art</small></button>
      <button type="button" class="cmd-view" data-v="back">Back<small>No art</small></button>
    </div>
    <p class="cmd-hint">Drag your logo anywhere on the front or back. Use the slider to resize it.</p>
  </div>

  <div class="cmd-panel">
    <div class="cmd-step"><h3><i>1</i>Pick your product</h3><div class="cmd-chips cmd-cats" id="cmd-cats"></div><div class="cmd-prods" id="cmd-products"></div></div>
    <div class="cmd-step"><h3><i>2</i>Pick a color</h3><div class="cmd-colors" id="cmd-colors"></div>
      <div class="cmd-color-name">Color: <strong id="cmd-color-name"></strong></div></div>
    <div class="cmd-step"><h3><i>3</i>How should we decorate it?</h3><div class="cmd-chips" id="cmd-methods"></div>
      <p class="cmd-note" id="cmd-method-note"></p></div>
    <div class="cmd-step"><h3><i>4</i>Add your art: <span id="cmd-view-label" style="margin-left:4px">Front</span></h3>
      <label class="cmd-upload"><input type="file" id="cmd-file" accept="image/png,image/jpeg,image/svg+xml,image/webp"><span>&#8679;</span><span id="cmd-upload-label">Upload front art</span></label>
      <div class="cmd-chips" id="cmd-placements"></div>
      <div class="cmd-sizing" id="cmd-sizing" style="display:none">
        <input type="range" id="cmd-scale" min="10" max="200" value="85" aria-label="Logo size">
        <div class="cmd-sizing-row"><span id="cmd-inches"></span><span><button type="button" class="cmd-link" id="cmd-center">Center it</button> &nbsp;·&nbsp; <button type="button" class="cmd-link" id="cmd-remove">Remove</button></span></div>
      </div>
      <p class="cmd-note">PNG with a transparent background works best. Want art on the back too? Tap <strong>Back</strong> under the preview.</p>
      <div class="cmd-err" id="cmd-err-art"></div></div>
    <div class="cmd-step"><h3><i>5</i>How many of each size?</h3><div class="cmd-sizes" id="cmd-sizes"></div>
      <p class="cmd-note" id="cmd-size-note">2XL adds two dollars a piece; 3XL and up add three.</p>
      <div class="cmd-err" id="cmd-err-sizes">Add at least one piece.</div>
      <div class="cmd-sum-mini"><div id="cmd-sum"></div><div class="cmd-total" id="cmd-total"></div></div>
      <button type="button" class="btn btn-ink cmd-add" id="cmd-add">+ Add to order</button>
      <p class="cmd-note">Need youth sizes, hoodies or another color too? Add this item, then pick the next product. Your art comes with you.</p>
      <div class="cmd-flash" id="cmd-flash" role="status"></div></div>
    <div class="cmd-step"><h3><i>6</i>Where should we send your proof?</h3>
      <div class="cmd-fields">
        <div class="field"><label for="o-name">Your name</label><input id="o-name" name="name" required autocomplete="name"></div>
        <div class="field"><label for="o-church">Church or ministry</label><input id="o-church" name="church" required></div>
        <div class="field"><label for="o-email">Email</label><input id="o-email" name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label for="o-phone">Phone</label><input id="o-phone" name="phone" type="tel" autocomplete="tel"></div>
        <div class="field full"><label for="o-date">Need it by</label><input id="o-date" name="need_by" type="date"></div>
        <div class="field full"><label for="o-notes">Anything else?</label><textarea id="o-notes" name="notes" style="min-height:90px" placeholder="Event, ink colors, a second design, questions..."></textarea></div>
      </div></div>
    <div class="cmd-step">
      <div class="cmd-summary cmd-cart" id="cmd-cart" style="display:none"></div>
      <p class="cmd-note" style="margin:0 0 14px">Volume pricing: 100+ pieces save $1 each, 200+ save $1.50, 300+ save $1.75. Every item in your order counts.</p>
      <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">
      <button class="btn btn-gold" type="submit" id="cmd-submit" style="width:100%;justify-content:center">Send for my proof &rarr;</button>
      <div class="cmd-err" id="cmd-err-submit"></div>
      <p class="form-note" style="text-align:center">You'll get an emailed invoice with a 10% deposit to lock in your order. Prices include tax. Nothing prints until you approve your proof.</p>
    </div>
  </div>
</div>
</form>
</div>
<div class="cmd-done form" id="cmd-done">
  <h2>We've got your design!</h2>
  <p class="lede" style="margin:0 auto" id="cmd-done-text"></p>
  <div class="btn-row" style="justify-content:center" id="cmd-done-pay"></div>
  <div class="cmd-done-shots" id="cmd-done-shots"></div>
  <div class="btn-row" style="justify-content:center"><button type="button" class="btn btn-ghost" id="cmd-again">Start another design</button><a class="btn btn-ink" href="index.html">Back home</a></div>
</div>
</div></section>
<script src="order.js"></script>
"""
page("order", "Design Your Church Shirt: Live Mockup & Order | Church Merch",
     "Pick a shirt and color, upload your church logo and see a live mockup. Same-day proof and price, no minimums. From Church Merch in Durham, NC.",
     order_body)

# ---------------- 404 ----------------
page("404", "Page not found | Church Merch", "That page wandered off.",
     """<section class="section cta-band"><div class="wrap"><div class="eyebrow">404</div><h1>This page wandered off.</h1>
<p class="lede">Like the one sheep. We'll get you back to the ninety-nine.</p>
<div class="btn-row"><a class="btn btn-gold" href="index.html">Back home</a><a class="btn btn-ghost" href="quote.html">Get a quote</a></div></div></section>""")

# ---------------- Static extras ----------------
(OUT / "favicon.svg").write_text(LOGO.format(n="i").replace('class="brand-mark" ', 'xmlns="http://www.w3.org/2000/svg" '))
(OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")
urls = ["/", "/order", "/boxes", "/work", "/faq", "/quote", "/promo"]
(OUT / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join(f"  <url><loc>{SITE}{u}</loc><lastmod>2026-11-21</lastmod></url>\n" for u in urls)
    + "</urlset>\n")
# Old Squarespace URLs -> new pages, so existing links and search results keep working
(OUT / "_redirects").write_text(
    "/order-shirts   /quote   301\n/sign-up-form   /quote   301\n/contact   /quote   301\n"
    "/aboutus   /   301\n/about   /   301\n/blog   /   302\n/cart   /quote   301\n")
(OUT / "llms.txt").write_text(
    "# Church Merch\n\n> Custom shirts, hoodies, swag boxes and promo products for churches and ministries. "
    "Designed, printed (full color printing, screen printing), embroidered, packed and shipped from Durham, North Carolina. Ships nationwide via UPS.\n\n"
    f"- [What we make]({SITE}/#make)\n- [Our work]({SITE}/work)\n- [FAQ]({SITE}/faq)\n- [Get a quote]({SITE}/quote)\n- [Promo store]({SITE}/promo)\n")
print("built", sorted(p.name for p in OUT.iterdir()))
