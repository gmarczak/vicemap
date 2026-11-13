"""Generuje grafiki z lokalnych kafelków mapy GTADB (CC BY 4.0), bez żadnych materiałów Rockstara.

Zależność: Pillow (pip install Pillow). Uruchomienie z katalogu głównego repozytorium:
    python -I scripts/generuj-grafiki.py

Wejście: tiles/yanis-17/{z}/{x}_{y}.jpg, mapa.webp, data/regiony.json, data/znaczniki.json, data/kategorie.json.
Wyjście (img/, WebP 20-50 KB, deterministyczne - dwa uruchomienia dają identyczne pliki):
  baner-<region>.webp   1200x420 - kadr z kafelków wokół regionu + ciemny gradient pod tytuł (bez tekstu)
  baner-poradniki.webp  1200x420 - kadr Vice City + gradient #ff5fa2 / #4fc3f7 i winieta
  kat-<kategoria>.webp  600x400  - wyciszona mapa wyspy z pinezkami znaczników kategorii
"""
import json, io, os
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
PX3 = 3760 / 3200          # piksele z=3 na jednostkę mapy
H = 4357                   # wysokość obrazu mapy w jednostkach (y liczone od dołu)
BG = (0x12, 0x10, 0x1C)
MIN3, MAX_X3, MAX_Y3 = 1280, 5040, 6400   # zakres pikseli bezwzględnych z=3 (poza nim kafelki przycięte)
wczytaj = lambda f: json.load(open(P("data", f), encoding="utf-8"))


def abs3(x, y):
    return MIN3 + x * PX3, MIN3 + (H - y) * PX3


def zapisz(im, nazwa, max_kb=48):
    """Najwyższa jakość WebP mieszcząca się w limicie (deterministyczne wyszukiwanie)."""
    for q in range(98, 29, -2):
        b = io.BytesIO()
        im.save(b, "WEBP", quality=q, method=6)
        if len(b.getvalue()) <= max_kb * 1024:
            break
    open(P("img", nazwa), "wb").write(b.getvalue())
    return nazwa, len(b.getvalue()), q


def kadr(cx3, cy3, w3, h3, z=4):
    """Mozaika z kafelków: okno o środku (cx3,cy3) i wymiarach w3 x h3 (piksele z=3), przesunięte do wnętrza mapy."""
    cx3 = min(max(cx3, MIN3 + w3 / 2), MAX_X3 - w3 / 2)
    cy3 = min(max(cy3, MIN3 + h3 / 2), MAX_Y3 - h3 / 2)
    s = 2 ** (z - 3)
    x0, y0, x1, y1 = [round(v * s) for v in (cx3 - w3 / 2, cy3 - h3 / 2, cx3 + w3 / 2, cy3 + h3 / 2)]
    m = Image.new("RGB", (x1 - x0, y1 - y0), BG)
    for tx in range(x0 // 256, (x1 - 1) // 256 + 1):
        for ty in range(y0 // 256, (y1 - 1) // 256 + 1):
            f = P("tiles", "yanis-17", str(z), f"{tx}_{ty}.jpg")
            if os.path.exists(f):
                m.paste(Image.open(f).convert("RGB"), (tx * 256 - x0, ty * 256 - y0))
    return m, (cx3, cy3)


def skaluj(im, size):
    return im.resize(size, Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))


def gradient_tla(w, h):
    """Ciemny gradient od dołu i od lewej w kolorze tła (alfa 0-235)."""
    a = Image.new("L", (w, h))
    px = a.load()
    for y in range(h):
        for x in range(w):
            v = max(((y / h) - 0.25) / 0.75, 0) ** 1.4 * 0.9 + max(1 - x / (w * 0.7), 0) ** 1.6 * 0.6
            px[x, y] = int(min(v, 1) * 235)
    return a


def nakladka(im, alfa):
    return Image.composite(Image.new("RGB", im.size, BG), im, alfa)


# (szerokość okna w pikselach z=3, przesunięcie środka dx,dy w pikselach z=3) - dobrane wizualnie
OKNO = {
    "vice-city": (520, 0, 0), "leonida-keys": (760, 0, 0), "port-gellhorn": (520, 0, 0),
    "ambrosia": (560, 0, 0), "grassrivers": (700, 260, 40), "mount-kalaga": (640, 0, -90),
}


def bannery():
    wyn = []
    A = gradient_tla(1200, 420)
    regiony = wczytaj("regiony.json")
    for r in regiony:
        w3, dx, dy = OKNO[r["id"]]
        cx, cy = abs3(r["x"], r["y"])
        m, _ = kadr(cx + dx, cy + dy, w3, w3 * 420 / 1200)
        wyn.append(zapisz(nakladka(skaluj(m, (1200, 420)), A), f"baner-{r['id']}.webp"))
    # ogólny baner poradników: Vice City w innym kadrze, kolorowy gradient + winieta
    vc = next(r for r in regiony if r["id"] == "vice-city")
    cx, cy = abs3(vc["x"], vc["y"])
    m, _ = kadr(cx + 40, cy + 20, 900, 900 * 420 / 1200)
    im = ImageEnhance.Color(skaluj(m, (1200, 420))).enhance(0.5)
    g = Image.new("RGB", (1200, 420))
    gp = g.load()
    for y in range(420):
        for x in range(1200):
            t = x / 1200 * 0.7 + y / 420 * 0.3
            gp[x, y] = tuple(int(a + (b - a) * t) for a, b in zip((0xff, 0x5f, 0xa2), (0x4f, 0xc3, 0xf7)))
    im = Image.blend(im, g, 0.38)
    vig = Image.new("L", (1200, 420))
    vp = vig.load()
    for y in range(420):
        for x in range(1200):
            d = (((x - 600) / 600) ** 2 + ((y - 210) / 210) ** 2) ** 0.5
            vp[x, y] = int(min(max(d - 0.6, 0) / 0.8, 1) * 200)
    wyn.append(zapisz(nakladka(im, vig), "baner-poradniki.webp"))
    return wyn


def miniatury():
    wyn = []
    kol = {k["id"]: k.get("kolor", "#ffffff") for k in wczytaj("kategorie.json")}
    zn = [m for m in wczytaj("znaczniki.json") if not m.get("przyklad")]
    mapa = Image.open(P("mapa.webp")).convert("RGB")
    # zamalowanie podziałki (skali) z dolnego prawego rogu mapy kolorem oceanu obok
    ImageDraw.Draw(mapa).rectangle((2380, 4030, 3100, 4165), fill=mapa.getpixel((2300, 4250)))
    for kid in kol:
        pts = [(m["x"], H - m["y"]) for m in zn if m["kategoria"] == kid]   # y od góry, piksele mapy
        if not pts:
            continue
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        h = max((max(ys) - min(ys)) * 1.2 + 300, (max(xs) - min(xs)) * 1.2 / 1.5 + 300, 1000)
        w = h * 1.5
        x0, y0 = cx - w / 2, cy - h / 2          # kadr może wyjść poza mapę - wtedy tło w kolorze oceanu
        pl = Image.new("RGB", (round(w), round(h)), mapa.getpixel((5, 5)))
        pl.paste(mapa, (-round(x0), -round(y0)))
        im = pl.resize((1200, 800), Image.LANCZOS)
        im = ImageEnhance.Color(im).enhance(0.45)
        im = Image.blend(im, Image.new("RGB", im.size, BG), 0.45)
        k = 1200 / w                                    # piksele płótna 2x na jednostkę mapy
        n = len(pts)
        r = 16 if n < 10 else 11 if n < 40 else 8 if n < 80 else 6
        al = 255 if n < 40 else 170
        c = tuple(int(kol[kid][i:i + 2], 16) for i in (1, 3, 5))
        ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        for x, y in pts:
            px, py = (x - x0) * k, (y - y0) * k
            d.ellipse((px - r, py - r, px + r, py + r), fill=c + (al,), outline=(255, 255, 255, al), width=max(2, r // 4))
        im = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB").resize((600, 400), Image.LANCZOS)
        wyn.append(zapisz(im, f"kat-{kid}.webp"))
    return wyn


if __name__ == "__main__":
    os.makedirs(P("img"), exist_ok=True)
    for n, b, q in bannery() + miniatury():
        print(f"{n}\t{b / 1024:.1f} KB\tq={q}")
