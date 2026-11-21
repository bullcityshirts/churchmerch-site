/* Church Merch — live mockup order form
   Products, colors, photos, sizes and blank costs come from catalog.json (pulled from S&S).
   Photos are served from /img/... on the live site (Cloudflare function → S&S image CDN).
   If photos can't load (e.g. a claude.ai preview), packed copies load from preview-photos/<id>.json.
   If the catalog can't load at all, a small built-in lineup with drawn garments is used. */
(function () {
  "use strict";

  // ---------- Pricing rules ----------
  var PRICING = {
    print: { front: 6, both: 8 },          // Full color print: blank + $6 one side, + $8 front & back
    emb: { first: 12, back: 8 },           // Embroidery: blank + $12, + $8 more for a back spot
    up2xl: 2, up3xl: 3                     // 2XL +$2, 3XL and up +$3
  };
  var CATS = [
    ["tee", "Tees"], ["longsleeve", "Long sleeve"], ["womens", "Women's"], ["youth", "Youth"], ["tank", "Tanks"],
    ["crew", "Crewnecks"], ["hoodie", "Hoodies"], ["qz", "Quarter-zips"], ["polo", "Polos"], ["jacket", "Jackets"], ["hat", "Hats"]
  ];
  // Which decoration each category allows
  var DECO = {
    tee: ["print"], longsleeve: ["print"], womens: ["print"], youth: ["print"], tank: ["print"],
    crew: ["print", "emb"], hoodie: ["print", "emb"], qz: ["print", "emb"], polo: ["print", "emb"],
    jacket: ["emb"], hat: ["emb"]
  };
  var METHODS = {
    print: { label: "Full color print", note: "Vivid, full color prints with no color limits." },
    emb: { label: "Embroidery", note: "Stitched logo. Left chest or center chest, plus an optional back spot." }
  };

  // ---------- Fallback lineup (only if catalog.json can't load) ----------
  var C = function (name, hex) { return { name: name, hex: hex }; };
  var FALLBACK = [
    { id: "64000", cat: "tee", brand: "Gildan", style: "64000", name: "Softstyle T-Shirt", shape: "tee",
      sizes: ["S", "M", "L", "XL", "2XL", "3XL"], colors: [C("White", "#FFFFFF"), C("Black", "#1A1A1A"), C("Navy", "#1F2A44"), C("Sport Grey", "#A7A9AC"), C("Royal", "#1D4F9A"), C("Red", "#C8102E")] },
    { id: "18500", cat: "hoodie", brand: "Gildan", style: "18500", name: "Heavy Blend Hooded Sweatshirt", shape: "hoodie",
      sizes: ["S", "M", "L", "XL", "2XL", "3XL"], colors: [C("White", "#FFFFFF"), C("Black", "#1A1A1A"), C("Navy", "#1F2A44"), C("Sport Grey", "#A7A9AC"), C("Maroon", "#5C1F2B"), C("Forest", "#2F4A3A")] }
  ];
  var PRODUCTS = FALLBACK;
  var PHOTOS = {};

  // ---------- Geometry ----------
  var PPI = 13;                // drawn garments: units per inch (viewBox 500x560)
  var PX = 0.448, OX = 26;     // S&S photos are 1000x1250, drawn at x=26 y=0 w=448 h=560
  var AREAS = {
    front: { full: { label: "Full front", x: 172, y: 112, w: 156, h: 200 }, center: { label: "Center chest", x: 204, y: 104, w: 92, h: 52 }, left: { label: "Left chest", x: 282, y: 108, w: 52, h: 52 } },
    back: { full: { label: "Full back", x: 172, y: 92, w: 156, h: 210 }, upper: { label: "Upper back", x: 190, y: 78, w: 120, h: 40 } }
  };
  // [label, offset from center (in), top below collar/crown (in), width (in), height (in)]
  var SPECS = {
    tee: { front: { full: ["Full front", 0, 4, 12, 14], center: ["Center chest", 0, 4, 8, 4], left: ["Left chest", 4, 4, 4, 4] },
           back: { full: ["Full back", 0, 3, 12, 14], upper: ["Upper back", 0, 1.5, 10, 3] } },
    hoodie: { front: { full: ["Full front", 0, 9, 11, 8.5], center: ["Center chest", 0, 9, 8, 4], left: ["Left chest", 4, 8.5, 4, 4] },
              back: { full: ["Full back", 0, 9.5, 12, 12], upper: ["Upper back", 0, 8.5, 10, 3] } },
    hat: { front: { center: ["Front", 0, 0, 4.25, 2.25] }, back: { upper: ["Back", 0, 0, 3, 1.25] } }
  };
  var PLACE = {  // placements offered per method
    print: { front: ["full", "center", "left"], back: ["full", "upper"] },
    emb: { front: ["left", "center"], back: ["upper"] },
    hat: { front: ["center"], back: ["upper"] }
  };

  // ---------- State ----------
  var state = { cat: "tee", product: null, color: null, view: "front", method: "print", art: { front: null, back: null }, sizes: {} };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var NS = "http://www.w3.org/2000/svg";
  var money = function (n) { return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  function lum(hex) {
    var n = parseInt((hex || "#cccccc").slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), f = function (c) { return Math.max(0, Math.min(255, Math.round(c + amt * 255))); };
    return "#" + ((1 << 24) + (f(n >> 16 & 255) << 16) + (f(n >> 8 & 255) << 8) + f(n & 255)).toString(16).slice(1);
  }
  function shapeOf(p) { return p.shape || (p.cat === "hoodie" ? "hoodie" : p.cat === "hat" ? "hat" : "tee"); }
  function specKind() { var s = shapeOf(state.product); return s === "hoodie" ? "hoodie" : s === "hat" ? "hat" : "tee"; }
  function methods() { return state.product.deco || DECO[state.product.cat] || ["print"]; }

  // ---------- Preview photo packs ----------
  var PREVIEW = null, previewLoading = {};
  function photoSrc(u) { return PREVIEW ? PREVIEW[u] : u; }
  function photoMode(view) {
    view = view || state.view;
    var p = state.product, u = state.color && state.color[view];
    return !!(PHOTOS[p.id] && p.cal && p.cal[view] && u && !state.color["bad_" + view] && (!PREVIEW || PREVIEW[u]));
  }
  function loadPreview(id) {
    if (!PREVIEW || previewLoading[id]) return;
    previewLoading[id] = fetch("preview-photos/" + id + ".json").then(function (r) { return r.ok ? r.json() : {}; }).then(function (m) {
      Object.keys(m).forEach(function (k) { PREVIEW[k] = m[k]; });
      PHOTOS[id] = true;
      if (state.product.id === id) { recenterAll(); renderAll(); }
    }).catch(function () {});
  }

  // ---------- Areas ----------
  function area(view, key) {
    var p = state.product, kind = specKind();
    var spec = (SPECS[kind][view] || {})[key] || SPECS.tee[view][key] || SPECS.tee[view].full;
    if (photoMode(view)) {
      var cal = p.cal, v = cal[view], ppi = cal.ppi;
      var w = spec[3] * ppi, h = spec[4] * ppi, cx = v.cx + spec[1] * ppi;
      return { label: spec[0], x: OX + (cx - w / 2) * PX, y: (v.ct + spec[2] * ppi) * PX, w: w * PX, h: h * PX };
    }
    var a = AREAS[view][key] || AREAS[view][Object.keys(AREAS[view])[0]];
    return { label: spec[0], x: a.x, y: a.y + (kind === "hoodie" ? 60 : 0), w: a.w, h: a.h };
  }
  function unitsPerInch(view) { return photoMode(view) ? state.product.cal.ppi * PX : PPI; }
  function placementKeys(view) {
    view = view || state.view;
    if (state.product.cat === "hat") return PLACE.hat[view];
    return PLACE[state.method][view];
  }

  // ---------- Garment drawing ----------
  function garmentPaths(shape, view) {
    var body, extra = "", neck = "", deep = view === "front" ? 74 : 52;
    if (shape === "hat") {
      body = "M110 330 C110 170 390 170 390 330 Z";
      extra = view === "front" ? '<path d="M90 330 C150 400 350 400 410 330 C350 352 150 352 90 330 Z" fill="{c2}"/>' : '<rect x="200" y="300" width="100" height="22" rx="8" fill="{c3}"/>';
      return { body: body, neck: "", extra: extra };
    }
    if (shape === "tee") {
      body = "M180 40 C205 " + deep + " 295 " + deep + " 320 40 L400 64 L472 152 L426 194 L396 168 L396 522 L104 522 L104 168 L74 194 L28 152 L100 64 Z";
    } else {
      body = "M180 40 C205 " + deep + " 295 " + deep + " 320 40 L400 64 L452 150 L488 448 L442 458 L398 214 L398 498 L102 498 L102 214 L58 458 L12 448 L48 150 L100 64 Z";
      extra += '<rect x="102" y="496" width="296" height="30" rx="6" fill="{c2}"/>' +
        '<rect x="439" y="446" width="50" height="28" rx="6" transform="rotate(-7 464 460)" fill="{c2}"/>' +
        '<rect x="11" y="446" width="50" height="28" rx="6" transform="rotate(7 36 460)" fill="{c2}"/>';
    }
    if (shape === "hoodie") {
      if (view === "front") {
        extra += '<path d="M168 52 C150 -8 350 -8 332 52 C318 96 182 96 168 52 Z" fill="{c2}"/>' +
          '<path d="M196 54 C200 92 300 92 304 54 C290 80 210 80 196 54 Z" fill="{c3}"/>' +
          '<path d="M170 368 L330 368 L360 470 L140 470 Z" fill="{c1}" stroke="{c3}" stroke-opacity=".35" stroke-width="2"/>';
      } else {
        extra += '<path d="M172 48 C150 150 350 150 328 48 C300 30 200 30 172 48 Z" fill="{c2}" stroke="{c3}" stroke-opacity=".5" stroke-width="2"/>';
      }
    } else {
      neck = view === "front"
        ? '<path d="M180 40 C205 ' + deep + ' 295 ' + deep + ' 320 40 C300 52 200 52 180 40 Z" fill="{c3}"/><path d="M180 40 C205 ' + deep + ' 295 ' + deep + ' 320 40" fill="none" stroke="{c2}" stroke-width="9"/>'
        : '<path d="M180 40 C205 ' + deep + ' 295 ' + deep + ' 320 40" fill="none" stroke="{c2}" stroke-width="9"/>';
    }
    return { body: body, neck: neck, extra: extra };
  }
  function drawGarment() {
    var g = $("#cmd-garment"), p = state.product, v = state.view;
    if (photoMode(v)) {
      g.innerHTML = '<rect width="500" height="560" fill="#fff"/><image href="' + photoSrc(state.color[v]) + '" x="26" y="0" width="448" height="560" preserveAspectRatio="xMidYMid meet"/>';
      var col = state.color;
      g.querySelector("image").addEventListener("error", function () {
        col["bad_" + v] = true;
        if (state.color === col) { var a = state.art[v]; if (a && state.view === v) centerArt(a); drawGarment(); drawArt(); syncScale(); }
      });
      return;
    }
    var hex = state.color.hex || "#cccccc", light = lum(hex) > 0.82;
    var c1 = hex, c2 = shade(hex, light ? -0.06 : -0.07), c3 = shade(hex, light ? -0.16 : -0.15);
    var shape = shapeOf(p) === "hat" ? "hat" : (["hoodie"].indexOf(shapeOf(p)) > -1 ? "hoodie" : (["crew", "qz", "jacket"].indexOf(p.cat) > -1 || p.cat === "longsleeve" ? "crew" : "tee"));
    var gp = garmentPaths(shape, v), stroke = light ? "#CFC8B8" : "rgba(0,0,0,.25)";
    var sub = function (s) { return s.replace(/\{c1\}/g, c1).replace(/\{c2\}/g, c2).replace(/\{c3\}/g, c3); };
    g.innerHTML =
      '<defs><linearGradient id="cmd-shade" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset=".22" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset=".5" stop-color="#fff" stop-opacity=".07"/><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>' +
      '<clipPath id="cmd-clip"><path d="' + gp.body + '"/></clipPath></defs>' +
      '<path d="' + gp.body + '" fill="' + c1 + '" stroke="' + stroke + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<g clip-path="url(#cmd-clip)"><rect width="500" height="560" fill="url(#cmd-shade)"/></g>' + sub(gp.neck) + sub(gp.extra);
  }

  // ---------- Art ----------
  function fitArt(a) {
    var ar = area(state.view, a.placement);
    var w = ar.w * a.scale, h = w / a.ratio;
    if (h > ar.h * a.scale * 1.6) { h = ar.h * a.scale * 1.6; w = h * a.ratio; }
    if (w > 480) { w = 480; h = w / a.ratio; }
    if (h > 540) { h = 540; w = h * a.ratio; }
    a.w = w; a.h = h;
    a.x = Math.min(Math.max(a.x, 0), 500 - w);
    a.y = Math.min(Math.max(a.y, 0), 560 - h);
  }
  function centerArt(a) {
    var ar = area(state.view, a.placement);
    fitArt(a);
    a.x = ar.x + (ar.w - a.w) / 2;
    a.y = ar.y + (a.placement === "full" ? 0 : (ar.h - a.h) / 2);
  }
  function forEachView(fn) { ["front", "back"].forEach(function (v) { var cv = state.view; state.view = v; fn(v, state.art[v]); state.view = cv; }); }
  function recenterAll() {
    forEachView(function (v, a) {
      if (!a) return;
      var keys = placementKeys(v);
      if (keys.indexOf(a.placement) === -1) { a.placement = keys[0]; a.scale = 0.85; }
      centerArt(a);
    });
  }
  function drawArt() {
    var a = state.art[state.view], layer = $("#cmd-art");
    layer.innerHTML = "";
    if (!a) { $("#cmd-empty").style.display = ""; return; }
    $("#cmd-empty").style.display = "none";
    var img = document.createElementNS(NS, "image");
    img.setAttribute("href", a.src);
    img.setAttribute("x", a.x); img.setAttribute("y", a.y);
    img.setAttribute("width", a.w); img.setAttribute("height", a.h);
    img.setAttribute("preserveAspectRatio", "xMidYMid meet");
    img.style.cursor = "grab";
    if (state.method === "emb") img.setAttribute("filter", "url(#cmd-stitch)");
    layer.appendChild(img);
    enableDrag(img, a);
  }
  function enableDrag(img, a) {
    var svg = $("#cmd-svg"), start = null;
    function pt(e) { var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
    img.addEventListener("pointerdown", function (e) {
      e.preventDefault(); img.setPointerCapture(e.pointerId); img.style.cursor = "grabbing";
      var p = pt(e); start = { px: p.x, py: p.y, x: a.x, y: a.y };
    });
    img.addEventListener("pointermove", function (e) {
      if (!start) return;
      var p = pt(e); a.x = start.x + p.x - start.px; a.y = start.y + p.y - start.py;
      fitArt(a); img.setAttribute("x", a.x); img.setAttribute("y", a.y);
    });
    var end = function () { start = null; img.style.cursor = "grab"; };
    img.addEventListener("pointerup", end); img.addEventListener("pointercancel", end);
  }

  // ---------- Pricing ----------
  function blankCost(color) {
    var c = state.product.cost;
    if (!c) return null;
    var isWhite = /^(white)$/i.test(color.name);
    return isWhite && c.white != null ? c.white : (c.color != null ? c.color : c.white);
  }
  function decoCost() {
    var f = !!state.art.front, b = !!state.art.back;
    if (state.method === "emb") return PRICING.emb.first + (f && b ? PRICING.emb.back : 0);
    return f && b ? PRICING.print.both : PRICING.print.front;
  }
  function sizeUp(s) {
    if (/^2XL$/i.test(s)) return PRICING.up2xl;
    if (/^[3-6]XL$/i.test(s)) return PRICING.up3xl;
    return 0;
  }
  function pricePer(size) {
    var b = blankCost(state.color);
    if (b == null) return null;
    return b + decoCost() + sizeUp(size);
  }

  // ---------- UI ----------
  function renderCats() {
    var present = CATS.filter(function (c) { return PRODUCTS.some(function (p) { return p.cat === c[0]; }); });
    $("#cmd-cats").innerHTML = present.map(function (c) {
      return '<button type="button" class="cmd-chip' + (c[0] === state.cat ? " on" : "") + '" data-c="' + c[0] + '">' + c[1] + '</button>';
    }).join("");
    $$("#cmd-cats .cmd-chip").forEach(function (b) {
      b.addEventListener("click", function () { state.cat = b.dataset.c; renderCats(); renderProducts(); });
    });
  }
  function fromPrice(p) {
    if (!p.cost) return "";
    var b = p.cost.white != null ? Math.min(p.cost.white, p.cost.color != null ? p.cost.color : p.cost.white) : p.cost.color;
    var d = (p.deco || DECO[p.cat] || ["print"])[0] === "emb" ? PRICING.emb.first : PRICING.print.front;
    return "from " + money(b + d);
  }
  function renderProducts() {
    var list = PRODUCTS.filter(function (p) { return p.cat === state.cat; });
    $("#cmd-products").innerHTML = list.map(function (p) {
      return '<button type="button" class="cmd-prod' + (p === state.product ? " on" : "") + '" data-id="' + p.id + '">' +
        '<strong>' + p.name + '</strong><span>' + p.brand + " " + p.style + (fromPrice(p) ? " · " + fromPrice(p) : "") + '</span></button>';
    }).join("");
    $$(".cmd-prod").forEach(function (b) {
      b.addEventListener("click", function () { selectProduct(PRODUCTS.filter(function (x) { return x.id === b.dataset.id; })[0]); });
    });
  }
  function selectProduct(p) {
    var same = p.colors.filter(function (c) { return state.color && c.name === state.color.name; })[0];
    state.product = p; state.cat = p.cat; state.color = same || p.colors[0];
    if (methods().indexOf(state.method) === -1) state.method = methods()[0];
    Object.keys(state.sizes).forEach(function (s) { if (p.sizes.indexOf(s) === -1) delete state.sizes[s]; });
    loadPreview(p.id);
    recenterAll(); renderSizes(); renderAll();
  }
  function renderColors() {
    $("#cmd-colors").innerHTML = state.product.colors.map(function (c) {
      return '<button type="button" class="cmd-sw' + (c === state.color ? " on" : "") + '" title="' + c.name + '" aria-label="' + c.name + '" data-n="' + c.name + '" style="background:' + c.hex + '"></button>';
    }).join("");
    $("#cmd-color-name").textContent = state.color.name + " (" + state.product.colors.length + " colors)";
    $$(".cmd-sw").forEach(function (b) {
      b.addEventListener("click", function () {
        state.color = state.product.colors.filter(function (c) { return c.name === b.dataset.n; })[0];
        recenterAll(); renderColors(); drawGarment(); drawArt(); syncScale(); renderSummary();
      });
    });
  }
  function renderMethods() {
    var ms = methods();
    if (ms.indexOf(state.method) === -1) state.method = ms[0];
    $("#cmd-methods").innerHTML = ms.map(function (k) {
      return '<button type="button" class="cmd-chip' + (state.method === k ? " on" : "") + '" data-m="' + k + '">' + METHODS[k].label + '</button>';
    }).join("");
    $("#cmd-method-note").textContent = ms.length === 1 && ms[0] === "emb"
      ? "This item is embroidery only. " + METHODS.emb.note : METHODS[state.method].note;
    $$("#cmd-methods .cmd-chip").forEach(function (b) {
      b.addEventListener("click", function () { state.method = b.dataset.m; recenterAll(); renderAll(); });
    });
  }
  function renderPlacements() {
    var a = state.art[state.view], keys = placementKeys();
    $("#cmd-placements").innerHTML = keys.map(function (k) {
      return '<button type="button" class="cmd-chip' + (a && a.placement === k ? " on" : "") + '" data-k="' + k + '"' + (a ? "" : " disabled") + '>' + area(state.view, k).label + '</button>';
    }).join("");
    $$("#cmd-placements .cmd-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        var a = state.art[state.view]; if (!a) return;
        a.placement = b.dataset.k; a.scale = a.placement === "full" ? 0.85 : 1; centerArt(a); syncScale(); renderPlacements(); drawArt(); renderSummary();
      });
    });
    $("#cmd-view-label").textContent = state.view === "front" ? "Front" : "Back";
    $("#cmd-remove").style.display = a ? "" : "none";
    $("#cmd-sizing").style.display = a ? "" : "none";
    $("#cmd-upload-label").textContent = a ? "Replace " + state.view + " art" : "Upload " + state.view + " art";
  }
  function syncScale() {
    var a = state.art[state.view]; if (!a) return;
    $("#cmd-scale").value = Math.round(a.scale * 100);
    var u = unitsPerInch(state.view);
    $("#cmd-inches").textContent = (a.w / u).toFixed(1) + '" wide × ' + (a.h / u).toFixed(1) + '" tall';
  }
  function renderViews() {
    $$(".cmd-view").forEach(function (b) {
      b.classList.toggle("on", b.dataset.v === state.view);
      b.querySelector("small").textContent = state.art[b.dataset.v] ? "Art added" : "No art";
    });
  }
  function renderSizes() {
    $("#cmd-sizes").innerHTML = state.product.sizes.map(function (s) {
      return '<label class="cmd-size"><span>' + s + '</span><input type="number" min="0" inputmode="numeric" data-s="' + s + '" value="' + (state.sizes[s] || "") + '" placeholder="0"></label>';
    }).join("");
    $$("#cmd-sizes input").forEach(function (i) {
      i.addEventListener("input", function () { state.sizes[i.dataset.s] = Math.max(0, parseInt(i.value, 10) || 0); renderSummary(); });
    });
    var up = state.product.sizes.some(function (s) { return sizeUp(s); });
    $("#cmd-size-note").style.display = up ? "" : "none";
  }
  function total() { return state.product.sizes.reduce(function (t, s) { return t + (state.sizes[s] || 0); }, 0); }
  function orderTotal() {
    var sum = 0, ok = true;
    state.product.sizes.forEach(function (s) { var q = state.sizes[s] || 0; if (!q) return; var p = pricePer(s); if (p == null) ok = false; else sum += q * p; });
    return ok ? sum : null;
  }
  function renderSummary() {
    var t = total(), locs = ["front", "back"].filter(function (v) { return state.art[v]; });
    var base = pricePer(state.product.sizes.filter(function (s) { return !sizeUp(s); })[0] || state.product.sizes[0]);
    var ot = orderTotal();
    $("#cmd-sum").innerHTML =
      row("Item", state.product.brand + " " + state.product.style) + row("Color", state.color.name) + row("Method", METHODS[state.method].label) +
      row("Art", locs.length ? locs.map(function (v) { return area(v, state.art[v].placement).label; }).join(" + ") : "Add your art") +
      (base != null ? row("Price each", money(base) + (state.product.sizes.some(sizeUp) ? " <small>(+ larger sizes)</small>" : "")) : "") +
      row("Pieces", t || "Add sizes");
    $("#cmd-total").innerHTML = t ? (ot != null ? "Total " + money(ot) : t + " piece" + (t === 1 ? "" : "s")) : "";
    function row(k, v) { return '<div class="cmd-row"><span>' + k + '</span><strong>' + v + '</strong></div>'; }
  }
  // ---------- Cart (multiple products in one order) ----------
  var DISCOUNTS = [[300, 1.75], [200, 1.5], [100, 1]];   // total pieces in the order -> $ off every piece
  var CART = [];
  var clone = function (o) { return o ? JSON.parse(JSON.stringify(o)) : null; };
  function discountFor(n) { for (var i = 0; i < DISCOUNTS.length; i++) if (n >= DISCOUNTS[i][0]) return DISCOUNTS[i][1]; return 0; }
  function nextTier(n) { for (var i = DISCOUNTS.length - 1; i >= 0; i--) if (n < DISCOUNTS[i][0]) return DISCOUNTS[i]; return null; }
  function snapItem() {
    var sizes = {}; Object.keys(state.sizes).forEach(function (k) { if (state.sizes[k] > 0) sizes[k] = state.sizes[k]; });
    return { pid: state.product.id, color: state.color.name, method: state.method,
             art: { front: clone(state.art.front), back: clone(state.art.back) }, sizes: sizes };
  }
  function applyItem(it) {
    var p = PRODUCTS.filter(function (x) { return x.id === it.pid; })[0];
    if (!p) return false;
    state.product = p; state.cat = p.cat;
    state.color = p.colors.filter(function (c) { return c.name === it.color; })[0] || p.colors[0];
    state.method = it.method; state.art = { front: clone(it.art.front), back: clone(it.art.back) }; state.sizes = clone(it.sizes) || {};
    return true;
  }
  function saveState() { return { product: state.product, cat: state.cat, color: state.color, method: state.method, art: state.art, sizes: state.sizes, view: state.view }; }
  function restoreState(sv) { Object.keys(sv).forEach(function (k) { state[k] = sv[k]; }); }
  function withItem(it, fn) { var sv = saveState(); applyItem(it); try { return fn(); } finally { restoreState(sv); } }
  function itemPieces(it) { return Object.keys(it.sizes).reduce(function (t, k) { return t + it.sizes[k]; }, 0); }
  function itemSubtotal(it) { return withItem(it, orderTotal); }
  function itemLabel(it) { return withItem(it, function () { return state.product.brand + " " + state.product.style; }); }
  function itemName(it) { return withItem(it, function () { return state.product.name; }); }
  function persistCart() {
    try { localStorage.setItem("cm_cart", JSON.stringify(CART)); } catch (e) {
      try { localStorage.setItem("cm_cart", JSON.stringify(CART.map(function (it) { var c = clone(it); delete c.thumb; return c; }))); } catch (e2) {}
    }
  }
  function restoreCart() {
    try {
      var saved = JSON.parse(localStorage.getItem("cm_cart") || "[]");
      CART = saved.filter(function (it) { return PRODUCTS.some(function (p) { return p.id === it.pid; }); });
    } catch (e) { CART = []; }
  }
  function thumbOf(it) {
    var sv = saveState(); applyItem(it);
    var view = it.art.front ? "front" : "back";
    var pr = snapshot(view);            // captures the drawing synchronously
    restoreState(sv); drawGarment(); drawArt();
    return pr.then(function (png) {
      if (!png) return null;
      return new Promise(function (res) {
        var im = new Image();
        im.onload = function () {
          var c = document.createElement("canvas"); c.width = 160; c.height = 179;
          c.getContext("2d").drawImage(im, 0, 0, 160, 179);
          try { res(c.toDataURL("image/jpeg", 0.8)); } catch (e) { res(null); }
        };
        im.onerror = function () { res(null); };
        im.src = png;
      });
    });
  }
  function sizesText(it) { return Object.keys(it.sizes).map(function (k) { return k + " " + it.sizes[k]; }).join(", "); }
  function cartTotals() {
    var pieces = 0, sub = 0, ok = true;
    CART.forEach(function (it) { pieces += itemPieces(it); var st = itemSubtotal(it); if (st == null) ok = false; else sub += st; });
    var d = discountFor(pieces);
    return { pieces: pieces, sub: sub, perPiece: d, discount: d * pieces, total: sub - d * pieces, ok: ok };
  }
  function renderCart() {
    var box = $("#cmd-cart");
    if (!CART.length) { box.innerHTML = ""; box.style.display = "none"; $("#cmd-submit").textContent = "Send for my proof →"; return; }
    box.style.display = "";
    var t = cartTotals(), nt = nextTier(t.pieces);
    box.innerHTML = '<div class="cmd-cart-head">Your order <span>' + CART.length + ' item' + (CART.length === 1 ? "" : "s") + '</span></div>' +
      CART.map(function (it, i) {
        var st = itemSubtotal(it);
        return '<div class="cmd-line">' + (it.thumb ? '<img src="' + it.thumb + '" alt="">' : '<div class="cmd-line-ph"></div>') +
          '<div class="cmd-line-main"><strong>' + itemLabel(it) + '</strong><span>' + it.color + ' · ' + METHODS[it.method].label + '</span><span>' + sizesText(it) + '</span>' +
          '<span class="cmd-line-acts"><button type="button" class="cmd-link" data-edit="' + i + '">Edit</button> · <button type="button" class="cmd-link" data-del="' + i + '">Remove</button></span></div>' +
          '<div class="cmd-line-price">' + itemPieces(it) + ' pcs<br><strong>' + (st != null ? money(st) : "Quote") + '</strong></div></div>';
      }).join("") +
      '<div class="cmd-cart-sum">' +
      '<div class="cmd-row"><span>Pieces</span><strong>' + t.pieces + '</strong></div>' +
      '<div class="cmd-row"><span>Subtotal</span><strong>' + money(t.sub) + '</strong></div>' +
      (t.perPiece ? '<div class="cmd-row cmd-save"><span>Volume discount (' + money(t.perPiece) + ' off each)</span><strong>−' + money(t.discount) + '</strong></div>' : "") +
      '<div class="cmd-cart-total"><span>Order total</span><strong>' + money(t.total) + '</strong></div>' +
      (nt ? '<div class="cmd-nudge">Add ' + (nt[0] - t.pieces) + ' more piece' + (nt[0] - t.pieces === 1 ? "" : "s") + ' to save ' + money(nt[1]) + ' on every piece.</div>' : "") +
      '</div>';
    $$("#cmd-cart [data-del]").forEach(function (b) { b.addEventListener("click", function () { CART.splice(+b.dataset.del, 1); persistCart(); renderCart(); }); });
    $$("#cmd-cart [data-edit]").forEach(function (b) {
      b.addEventListener("click", function () {
        var it = CART.splice(+b.dataset.edit, 1)[0]; persistCart();
        applyItem(it); state.view = it.art.front ? "front" : "back";
        loadPreview(state.product.id); renderSizes(); renderAll(); renderCart();
        flash("Editing this item. Make your changes, then tap Add to order.");
        window.scrollTo({ top: $("#cmd-app").offsetTop - 90, behavior: "smooth" });
      });
    });
    $("#cmd-submit").textContent = "Send my order (" + t.pieces + " pcs) →";
  }
  function flash(msg) { var n = $("#cmd-flash"); n.textContent = msg; n.classList.add("show"); clearTimeout(flash.t); flash.t = setTimeout(function () { n.classList.remove("show"); }, 4500); }
  function currentReady(showErrors) {
    var ok = true;
    if (!state.art.front && !state.art.back) { if (showErrors) alertBox("Add your logo or artwork to the front or back first."); ok = false; }
    if (!total()) { if (showErrors) $("#cmd-err-sizes").classList.add("show"); ok = false; } else { $("#cmd-err-sizes").classList.remove("show"); }
    return ok;
  }
  function addToOrder() {
    if (!currentReady(true)) return;
    var it = snapItem();
    CART.push(it); persistCart(); renderCart();
    state.sizes = {}; renderSizes(); renderSummary();
    flash("Added! Pick another product (your art comes with you), or send your order.");
    thumbOf(it).then(function (th) { it.thumb = th; persistCart(); renderCart(); });
    var cats = $("#cmd-cats"); if (cats) window.scrollTo({ top: cats.getBoundingClientRect().top + window.scrollY - 110, behavior: "smooth" });
  }

  function renderAll() { renderCats(); renderProducts(); renderColors(); renderMethods(); renderViews(); renderPlacements(); drawGarment(); drawArt(); syncScale(); renderSummary(); }

  // ---------- Upload ----------
  function loadFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) { alertBox("Please upload a PNG, JPG, SVG or WebP file."); return; }
    if (file.size > 15 * 1024 * 1024) { alertBox("That file is over 15 MB. Try a smaller version."); return; }
    var r = new FileReader();
    r.onload = function () {
      var im = new Image();
      im.onload = function () {
        var keys = placementKeys();
        var def = keys.indexOf("full") > -1 ? "full" : keys[0];
        var a = { src: r.result, name: file.name, ratio: (im.naturalWidth || 400) / (im.naturalHeight || 400), placement: def, scale: def === "full" ? 0.85 : 1, x: 0, y: 0, w: 0, h: 0 };
        state.art[state.view] = a; centerArt(a);
        renderViews(); renderPlacements(); drawArt(); syncScale(); renderSummary();
        $("#cmd-err-art").classList.remove("show");
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  }
  function alertBox(msg) { var e = $("#cmd-err-art"); e.textContent = msg; e.classList.add("show"); }

  // ---------- Export mockups ----------
  var inlined = {};
  function inlineImages(svg) {
    var imgs = Array.prototype.slice.call(svg.querySelectorAll("image")).filter(function (i) { return !/^data:/.test(i.getAttribute("href")); });
    return Promise.all(imgs.map(function (i) {
      var u = i.getAttribute("href");
      var p = inlined[u] || (inlined[u] = fetch(u).then(function (r) { return r.blob(); }).then(function (b) {
        return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); });
      }).catch(function () { return u; }));
      return p.then(function (d) { i.setAttribute("href", d); });
    }));
  }
  function snapshot(view) {
    return new Promise(function (resolve) {
      var cv = state.view; state.view = view; drawGarment(); drawArt();
      var svg = $("#cmd-svg").cloneNode(true);
      state.view = cv; drawGarment(); drawArt();
      var e = svg.querySelector("#cmd-empty"); if (e) e.remove();
      svg.setAttribute("width", 1000); svg.setAttribute("height", 1120);
      inlineImages(svg).then(function () {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement("canvas"); c.width = 1000; c.height = 1120;
          var x = c.getContext("2d"); x.fillStyle = "#FAF7F0"; x.fillRect(0, 0, 1000, 1120); x.drawImage(img, 0, 0, 1000, 1120);
          try { resolve(c.toDataURL("image/png")); } catch (err) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
      });
    });
  }

  // ---------- Submit ----------
  function submit(e) {
    e.preventDefault();
    var form = e.target;
    var items = CART.slice();
    var hasCurrent = (state.art.front || state.art.back) && total() > 0;
    if (hasCurrent) items.push(snapItem());           // a finished design that wasn't added yet still counts
    if (!items.length) { currentReady(true); return; }
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var sv = saveState(), shotsAll = [], seq = Promise.resolve();
    items.forEach(function (it) {
      seq = seq.then(function () {
        applyItem(it);
        var views = ["front", "back"].filter(function (v) { return it.art[v]; });
        return Promise.all(views.map(snapshot)).then(function (shots) { shotsAll.push({ it: it, views: views, shots: shots }); });
      });
    });
    var btn = $("#cmd-submit"), label = btn.textContent;
    btn.disabled = true; btn.textContent = "Sending your order…";
    seq.then(function () {
      restoreState(sv); drawGarment(); drawArt();
      CART = items;
      var t = cartTotals();
      var contact = Object.fromEntries(new FormData(form).entries());
      var payload = {
        items: shotsAll.map(function (x) {
          var it = x.it;
          return withItem(it, function () {
            return { pid: it.pid, color: it.color, method: it.method, sizes: it.sizes,
              sides: x.views.map(function (v) { var a = state.art[v]; return { side: v, placement: area(v, a.placement).label, width_in: +(a.w / unitsPerInch(v)).toFixed(1), height_in: +(a.h / unitsPerInch(v)).toFixed(1), file: a.name }; }) };
          });
        }),
        mockups: [], art: [], contact: contact, website: contact.website || ""
      };
      var jobs = [];
      shotsAll.forEach(function (x) {
        x.shots.forEach(function (png, i) {
          if (!png) return;
          jobs.push(toJpeg(png).then(function (jpg) { payload.mockups.push({ name: itemLabel(x.it).replace(/\s+/g, "-") + "-" + x.it.color.replace(/\s+/g, "-") + "-" + x.views[i], label: itemLabel(x.it) + " · " + x.it.color + " · " + x.views[i], data: jpg }); }));
        });
      });
      var seen = {};
      items.forEach(function (it) { ["front", "back"].forEach(function (v) { var a = it.art[v]; if (a && !seen[a.src]) { seen[a.src] = 1; payload.art.push({ name: a.name, data: a.src }); } }); });
      return Promise.all(jobs).then(function () {
        return fetch("/api/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }, function () { return { status: r.status, j: null }; }); })
          .catch(function () { return { status: 0, j: null }; });
      }).then(function (res) {
        btn.disabled = false; btn.textContent = label;
        var j = res.j;
        if (j && j.ok) return done(t, shotsAll, j, contact);
        if (!j && [0, 404, 405, 501].indexOf(res.status) > -1) return done(t, shotsAll, null, contact);   // preview: no server here
        var err = $("#cmd-err-submit");
        err.innerHTML = ((j && j.error) || "Something went wrong.") + " Your order wasn't lost: text or call (919) 864-1603, or email contact@churchmerch.store.";
        err.classList.add("show");
      });
    });
  }
  function toJpeg(png) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement("canvas"); c.width = 800; c.height = 896;
        var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 800, 896); x.drawImage(im, 0, 0, 800, 896);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      im.onerror = function () { res(png); };
      im.src = png;
    });
  }
  function done(t, shotsAll, j, contact) {
    var deposit = j ? j.deposit : Math.round(t.total * 10) / 100;
    var total = j ? j.total : t.total;
    $("#cmd-done-shots").innerHTML = shotsAll.map(function (x) {
      return x.shots.map(function (s, i) {
        return s ? '<figure><img src="' + s + '" alt=""><figcaption>' + itemLabel(x.it) + ' · ' + x.it.color + ' · ' + x.views[i] + '</figcaption></figure>' : "";
      }).join("");
    }).join("");
    $("#cmd-done-text").innerHTML =
      t.pieces + " pieces, " + money(total) + (t.discount ? " after your " + money(t.discount) + " volume discount" : "") + ".<br>" +
      (j ? "We just emailed your invoice to <strong>" + j.email + "</strong>. Pay the 10% deposit (<strong>" + money(deposit) + "</strong>) to lock in your order. We'll send your proof today, and nothing prints until you approve it."
         : "<em>Preview only: on the live site, this emails an invoice to " + (contact.email || "the customer") + " requesting a 10% deposit (" + money(deposit) + ").</em>");
    $("#cmd-done-pay").innerHTML = j && j.public_url ? '<a class="btn btn-gold" href="' + j.public_url + '">Pay deposit now &rarr;</a>' : "";
    CART = []; persistCart(); renderCart();
    $("#cmd-err-submit").classList.remove("show");
    $("#cmd-app").style.display = "none"; $("#cmd-done").classList.add("show");
    window.scrollTo({ top: $("#cmd-done").offsetTop - 100, behavior: "smooth" });
  }

  // ---------- Wire up ----------
  $$(".cmd-view").forEach(function (b) {
    b.addEventListener("click", function () { state.view = b.dataset.v; renderViews(); renderPlacements(); drawGarment(); drawArt(); syncScale(); });
  });
  $("#cmd-file").addEventListener("change", function (e) { loadFile(e.target.files[0]); e.target.value = ""; });
  var stage = $("#cmd-stage");
  stage.addEventListener("dragover", function (e) { e.preventDefault(); stage.classList.add("drag"); });
  stage.addEventListener("dragleave", function () { stage.classList.remove("drag"); });
  stage.addEventListener("drop", function (e) { e.preventDefault(); stage.classList.remove("drag"); loadFile(e.dataTransfer.files[0]); });
  $("#cmd-scale").addEventListener("input", function (e) {
    var a = state.art[state.view]; if (!a) return;
    var cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    a.scale = e.target.value / 100; fitArt(a);
    a.x = cx - a.w / 2; a.y = cy - a.h / 2; fitArt(a); drawArt(); syncScale();
  });
  $("#cmd-center").addEventListener("click", function () { var a = state.art[state.view]; if (a) { centerArt(a); drawArt(); } });
  $("#cmd-remove").addEventListener("click", function () { state.art[state.view] = null; renderViews(); renderPlacements(); drawArt(); renderSummary(); });
  $("#cmd-form").addEventListener("submit", submit);
  $("#cmd-add").addEventListener("click", addToOrder);
  $("#cmd-again").addEventListener("click", function () { $("#cmd-done").classList.remove("show"); $("#cmd-app").style.display = ""; });

  function start(products) {
    PRODUCTS = products;
    var first = PRODUCTS.filter(function (p) { return p.cat === "tee"; })[0] || PRODUCTS[0];
    state.product = null; state.color = null;
    selectProduct(first);
  }
  start(FALLBACK);

  // ---------- Catalog ----------
  fetch("catalog.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (cat) {
    if (!cat || !cat.products || !cat.products.length) return;
    start(cat.products);
    restoreCart(); renderCart();
    var probe = state.product.colors[0], test = new Image();
    test.onload = function () { PRODUCTS.forEach(function (p) { if (p.cal) PHOTOS[p.id] = true; }); recenterAll(); renderAll(); };
    test.onerror = function () { PREVIEW = PREVIEW || {}; loadPreview(state.product.id); };
    test.src = probe.front;
  }).catch(function () {});
})();
