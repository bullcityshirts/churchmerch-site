"""Turns the S&S crawl (crawl.json + titles.json) into the site's catalog.json, measures print-area
calibration from each style's black photo, samples swatch colors, and packs preview photos.
Photos come from S&S's image CDN (cdn.ssactivewear.com)."""
import json, os, subprocess, base64, io, re
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "site")
CACHE = "/home/claude/sscache"          # fm (500x625) photos
PACKS = "/home/claude/preview-photos"
os.makedirs(CACHE, exist_ok=True); os.makedirs(PACKS, exist_ok=True)

crawl = json.load(open(os.path.join(HERE, "crawl.json")))
titles = json.load(open(os.path.join(HERE, "titles.json"))) if os.path.exists(os.path.join(HERE, "titles.json")) else {}
CHEST = {"tee": 20.5, "longsleeve": 20.5, "womens": 18, "youth": 16, "tank": 19, "crew": 22, "hoodie": 22,
         "qz": 22, "polo": 21.5, "jacket": 23}
ORDER = ["tee", "longsleeve", "womens", "youth", "tank", "crew", "hoodie", "qz", "polo", "jacket", "hat"]

def fetch(fn):
    p = os.path.join(CACHE, fn)
    if not (os.path.exists(p) and os.path.getsize(p) > 1000):
        subprocess.run(["curl", "-s", "-f", "-o", p, "https://cdn.ssactivewear.com/Images/Color/" + fn])
    return p if os.path.exists(p) and os.path.getsize(p) > 1000 else None

def sample_hex(p, cat):
    im = Image.open(p).convert("RGB"); w, h = im.size
    box = (int(w*.40), int(h*.30), int(w*.60), int(h*.40)) if cat == "hat" else (int(w*.40), int(h*.50), int(w*.60), int(h*.60))
    px = list(im.crop(box).get_flattened_data()) if hasattr(im, "get_flattened_data") else list(im.crop(box).getdata()); n = len(px)
    return "#%02x%02x%02x" % tuple(round(sum(c[i] for c in px) / n) for i in range(3))

def measure(p):
    """Return garment geometry in 1000x1250 photo pixels (fm photos are half size)."""
    im = Image.open(p).convert("RGB"); w, h = im.size; s = 1000 / w
    px = im.load(); bg = px[2, 2]
    g = lambda x, y: sum(abs(px[x, y][i] - bg[i]) for i in range(3)) > 60
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if g(x, y): xs.append(x); ys.append(y)
    if not xs: return None
    top, bot, left, right = min(ys), max(ys), min(xs), max(xs)
    cx = w // 2; ct = next((y for y in range(h) if g(cx, y)), top)
    def run(frac):
        yy = int(top + (bot - top) * frac); l = r = cx
        while l > 0 and g(l, yy): l -= 1
        while r < w - 1 and g(r, yy): r += 1
        return l, r
    l, r = run(.85); l4, r4 = run(.45)
    return {"top": top*s, "bot": bot*s, "left": left*s, "right": right*s, "ct": ct*s, "cx": (l + r) / 2 * s, "w85": (r - l) * s,
            "cx45": (l4 + r4) / 2 * s, "w45": (r4 - l4) * s}

def base_price(prices):
    if not prices: return None
    for k in ("L", "M", "S", "OSFA", "XL"):
        if k in prices and prices[k][0]: return prices[k][0]
    vals = [v[0] for v in prices.values() if v and v[0]]
    return min(vals) if vals else None

products = []
for slug, d in crawl.items():
    if d.get("err") or not d.get("colors"): print("SKIP", slug, d.get("err")); continue
    cat = d["cat"]; brand, style = slug.split("/")
    t = titles.get(slug, {})
    brand_name = t.get("brand") or (d.get("title", "|").split("|")[0] or brand.replace("_", " ").title())
    style_code = t.get("style") or style.upper()
    name = t.get("name") or d.get("title", "|").split("|")[-1]
    first = (d.get("first") or "").strip()
    cost_first = base_price(d.get("prices"))
    cost_black = base_price((d.get("black") or {}).get("prices"))
    cost = {"white": cost_first if re.fullmatch(r"white", first, re.I) else None,
            "color": cost_black if cost_black else (None if re.fullmatch(r"white", first, re.I) else cost_first)}
    if cost["white"] is None and cost["color"] is None: cost = None
    sizes = d.get("sizes") or ["S", "M", "L", "XL", "2XL", "3XL"]
    jobs = []
    for nm, cid, has_back in d["colors"]:
        jobs.append(f"{cid}_f_fm.jpg")
        if has_back: jobs.append(f"{cid}_b_fm.jpg")
    with ThreadPoolExecutor(12) as ex: list(ex.map(fetch, jobs))
    colors = []
    for nm, cid, has_back in d["colors"]:
        fp = os.path.join(CACHE, f"{cid}_f_fm.jpg")
        if not os.path.exists(fp): continue
        bp = os.path.join(CACHE, f"{cid}_b_fm.jpg")
        colors.append({"name": nm, "hex": sample_hex(fp, cat), "front": f"img/Images/Color/{cid}_f_fl.jpg",
                       "back": f"img/Images/Color/{cid}_b_fl.jpg" if has_back and os.path.exists(bp) else None, "_id": cid})
    if not colors: print("NO COLORS", slug); continue
    ref = next((c for c in colors if c["name"].lower() == "black"), None) or min(colors, key=lambda c: sum(int(c["hex"][i:i+2], 16) for i in (1, 3, 5)))
    mf = measure(os.path.join(CACHE, f"{ref['_id']}_f_fm.jpg"))
    mb = measure(os.path.join(CACHE, f"{ref['_id']}_b_fm.jpg")) if ref["back"] else None
    cal = None
    if mf:
        if cat == "hat":
            beanie = "beanie" in (titles.get(slug, {}).get("name", "") or "").lower()
            ppi = mf["w45"] / (9.0 if beanie else 8.0)
            h = mf["bot"] - mf["top"]
            # ct here = top of the logo spot itself (hat specs use a 0 offset)
            cal = {"ppi": round(ppi, 2), "front": {"cx": round(mf["cx45"]), "ct": round(mf["top"] + h * (0.62 if beanie else 0.22))}}
            if mb and not beanie: cal["back"] = {"cx": round(mb["cx45"]), "ct": round(mb["top"] + (mb["bot"] - mb["top"]) * 0.38)}
        else:
            ppi = mf["w85"] / CHEST.get(cat, 21)
            cal = {"ppi": round(ppi, 2), "front": {"cx": round(mf["cx"]), "ct": round(mf["ct"])}}
            if mb: cal["back"] = {"cx": round(mb["cx"]), "ct": round(mb["ct"])}
    pid = slug.replace("/", "-")
    nm_l = (name or "").lower()
    shape = "hoodie" if (cat == "hoodie" or "hood" in nm_l) else ("hat" if cat == "hat" else None)
    if cat in ("jacket", "hat"): deco = ["emb"]
    elif cat in ("hoodie", "crew", "qz", "polo") or "hood" in nm_l or "crewneck" in nm_l or "sweatshirt" in nm_l: deco = ["print", "emb"]
    else: deco = ["print"]
    products.append({"id": pid, "cat": cat, "brand": brand_name, "style": style_code, "name": name, "shape": shape,
                     "sizes": sizes, "cost": cost, "cal": cal, "deco": deco,
                     "colors": [{k: v for k, v in c.items() if k != "_id"} for c in colors]})
    # preview pack (medium photos as data URIs)
    pack = {}
    for c in colors:
        for k in ("front", "back"):
            if c.get(k):
                fp = os.path.join(CACHE, c[k].split("/")[-1].replace("_fl.jpg", "_fm.jpg"))
                if os.path.exists(fp): pack[c[k]] = "data:image/jpeg;base64," + base64.b64encode(open(fp, "rb").read()).decode()
    json.dump(pack, open(os.path.join(PACKS, pid + ".json"), "w"), separators=(",", ":"))
    print(f"{pid:40s} {cat:10s} colors={len(colors):3d} cost={cost} cal={cal and cal['ppi']}")

products.sort(key=lambda p: ORDER.index(p["cat"]))
json.dump({"source": "S&S Activewear product pages", "updated": "2026-11-21", "products": products},
          open(os.path.join(SITE, "catalog.json"), "w"), separators=(",", ":"))
print("products:", len(products), "colors:", sum(len(p["colors"]) for p in products))
