"""Pobiera kafelki mapy GTADB (CC BY 4.0, zestaw yanis,17, poziomy 0-4) do tiles/yanis-17/{z}/{x}_{y}.jpg.

Użycie:  python -I scripts/pobierz-kafelki.py [--odswiez]
Wymaga Pillow (pip install pillow). Tylko obszar mapy: x od 0 do 3760 px obrazu z=3 (5376x5120 px, kafelki x=5..25, y=5..24).
Na prawo od tej granicy kafelki GTADB mają panel z legendą, listą autorów i zrzutami z trailerów Rockstara - NIE wolno go
publikować, więc kafelki graniczne są przycinane (prawa część odrzucona), a kafelki całkiem za granicą nie są pobierane.
Źródło: https://raw.githubusercontent.com/rolux/gtadb.org/main/maps/tiles/6/yanis%2C17/{z}/{z}%2C{y}%2C{x}.jpg
Układ: kafelek (z, x, y) -> piksele bezwzględne abs = (1280 + X/f) * 2^(z-3), gdzie X to piksele obrazu z=3 od jego lewego
górnego rogu (kafelek 5,5), a granica obszaru mapy to X = 3760 (czyli 3200 jednostek mapy * 3760/3200).
"""
import io, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

BAZA = "https://raw.githubusercontent.com/rolux/gtadb.org/main/maps/tiles/6/yanis%2C17/{z}/{z}%2C{y}%2C{x}.jpg"
CEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tiles", "yanis-17")
# zakresy indeksów źródła (x, y) włącznie
ZAKRES = {0: ((0, 0), (3, 3)), 1: ((1, 1), (6, 6)), 2: ((2, 2), (12, 12)), 3: ((5, 5), (25, 24)), 4: ((10, 10), (51, 49))}
GRANICA_Z3 = 5040  # bezwzględny piksel x (z=3), na prawo od niego jest panel: 1280 + 3760
Y_Z3 = (1280, 1280 + 5120)  # bezwzględne piksele y obszaru mapy (z=3)


def potrzebne():
    for z, ((x0, y0), (x1, y1)) in ZAKRES.items():
        s = 2 ** (z - 3)
        gr_x = GRANICA_Z3 * s
        ya, yb = Y_Z3[0] * s, Y_Z3[1] * s
        for x in range(x0, x1 + 1):
            if x * 256 >= gr_x:
                continue
            for y in range(y0, y1 + 1):
                if y * 256 >= yb or (y + 1) * 256 <= ya:
                    continue
                yield z, x, y, int(min(256, gr_x - x * 256))  # szerokość części do zachowania


def pobierz(t):
    z, x, y, szer = t
    plik = os.path.join(CEL, str(z), f"{x}_{y}.jpg")
    if os.path.exists(plik) and "--odswiez" not in sys.argv:
        return 0
    for proba in range(4):
        try:
            with urllib.request.urlopen(BAZA.format(z=z, x=x, y=y), timeout=30) as r:
                dane = r.read()
            break
        except Exception as e:  # noqa: BLE001
            if proba == 3:
                print("BŁĄD", z, x, y, e)
                return 0
    os.makedirs(os.path.dirname(plik), exist_ok=True)
    if szer < 256:  # kafelek graniczny: odcinamy prawą część z panelem
        im = Image.open(io.BytesIO(dane)).convert("RGB").crop((0, 0, szer, 256))
        im.save(plik, "JPEG", quality=88, optimize=True)
    else:
        with open(plik, "wb") as f:
            f.write(dane)
    return 1


if __name__ == "__main__":
    lista = list(potrzebne())
    print(len(lista), "kafelków do sprawdzenia")
    with ThreadPoolExecutor(8) as ex:
        nowe = sum(ex.map(pobierz, lista))
    print("pobrano", nowe)
