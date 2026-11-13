// Tryb offline: strony i znaczniki najpierw z sieci (zawsze świeże), reszta z pamięci podręcznej.
// Po zmianie listy plików poniżej podbij numer wersji.
const WERSJA = "vicemap-v12";
// Bez tych plików instalacja SW się nie uda (mapa i jej zależności).
const PODSTAWOWE = [
  "/",
  "/style.css",
  "/js/config.js",
  "/js/map.js",
  "/js/strona.js",
  "/data/kategorie.json",
  "/data/znaczniki.json",
  "/mapa.webp",
  "/vendor/leaflet/leaflet.js",
  "/vendor/leaflet/leaflet.css",
  "/vendor/leaflet.markercluster-1.5.3/leaflet.markercluster.js",
  "/vendor/leaflet.markercluster-1.5.3/MarkerCluster.css",
  "/vendor/leaflet.fullscreen-5.3.3/Control.FullScreen.umd.js",
  "/vendor/leaflet.fullscreen-5.3.3/Control.FullScreen.css",
  "/vendor/leaflet-minimap-3.6.1/Control.MiniMap.min.js",
  "/vendor/leaflet-minimap-3.6.1/Control.MiniMap.min.css",
  "/img/ikona.svg"
];
// Dodatki: błąd pobrania jednego z nich nie blokuje instalacji.
const DODATKOWE = [
  "/404.html", "/o-projekcie.html", "/kategorie/", "/dziennik-zmian.html", "/data/regiony.json", "/poradniki/", "/zglos.html", "/js/zglos.js", "/js/mini-mapa.js", "/manifest.webmanifest", "/img/podglad-mapy.webp", "/vendor/leaflet-minimap-3.6.1/images/toggle.svg",
  "/vendor/leaflet/images/layers.png", "/vendor/leaflet/images/layers-2x.png",
  "/vendor/leaflet/images/marker-icon.png", "/vendor/leaflet/images/marker-icon-2x.png", "/vendor/leaflet/images/marker-shadow.png"
];
// Pliki, które się nie zmieniają: raz zapisane nie są pobierane ponownie (mapa.webp ma ok. 900 KB).
const NIEZMIENNE = ["/mapa.webp", "/vendor/"];
const KAFELKI = "vicemap-kafelki"; // osobny cache kafelków mapy (nie jest prekaszowany, wypełnia się w locie)
const LIMIT_KAFELKOW = 800;
let zapisanoKafelkow = 0;
const LIMIT_WPISOW = 120; // ponad tyle usuwamy najstarsze odwiedzone strony

// Klucz bez ?query i #hash: stan mapy w URL (?x=..&y=..) nie mnoży wpisów i dopasowuje się do zapisanej strony.
const klucz = (url) => { const u = new URL(url); return u.origin + u.pathname; };
const zCache = (zadanie) => caches.match(klucz(zadanie.url));

async function zapisz(zadanie, odp) {
  try {
    const c = await caches.open(WERSJA);
    await c.put(klucz(zadanie.url), odp);
    const wpisy = await c.keys();
    let nadmiar = wpisy.length - LIMIT_WPISOW;
    if (nadmiar <= 0) return;
    const rdzen = new Set([...PODSTAWOWE, ...DODATKOWE].map((p) => location.origin + p));
    for (const w of wpisy) { // keys() zwraca od najstarszych
      if (nadmiar <= 0) break;
      if (!rdzen.has(w.url)) { await c.delete(w); nadmiar--; }
    }
  } catch (err) { /* brak miejsca (quota) – działamy dalej bez zapisu */ }
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(WERSJA)
      .then((c) => c.addAll(PODSTAWOWE).then(() => Promise.allSettled(DODATKOWE.map((u) => c.add(u)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((klucze) => Promise.all(klucze.filter((k) => k !== WERSJA && k !== KAFELKI).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Kafelki: z pamięci, a gdy brak – z sieci i zapis w locie. Ponad LIMIT_KAFELKOW usuwamy najstarsze. Bez sieci i bez wpisu: błąd,
// a mapa zostaje na podkładzie mapa.webp.
async function kafelek(e) {
  const zadanie = e.request;
  const c = await caches.open(KAFELKI);
  const zapisane = await c.match(zadanie.url);
  if (zapisane) return zapisane;
  const odp = await fetch(zadanie);
  if (odp.status === 200) {
    e.waitUntil((async () => {
      try {
        await c.put(zadanie.url, odp.clone());
        if (++zapisanoKafelkow % 25 !== 0) return;
        const wpisy = await c.keys();
        for (const w of wpisy.slice(0, Math.max(0, wpisy.length - LIMIT_KAFELKOW))) await c.delete(w);
      } catch (err) { /* brak miejsca (quota) – działamy dalej bez zapisu */ }
    })());
  }
  return odp;
}

self.addEventListener("fetch", (e) => {
  const zadanie = e.request;
  const url = new URL(zadanie.url);
  if (zadanie.method !== "GET" || url.origin !== location.origin) return;
  if (zadanie.headers.has("range")) return; // odpowiedzi 206 nie nadają się do cache

  if (url.pathname.startsWith("/tiles/") && url.pathname.endsWith(".jpg")) { e.respondWith(kafelek(e).catch(() => Response.error())); return; }

  const nawigacja = zadanie.mode === "navigate";
  if (nawigacja || url.pathname.startsWith("/data/")) {
    // Najpierw sieć, a bez internetu ostatnia zapisana wersja (nieodwiedzona strona: mapa).
    e.respondWith(
      fetch(zadanie)
        .then((odp) => {
          if (odp.ok) e.waitUntil(zapisz(zadanie, odp.clone()));
          return odp;
        })
        .catch(async () => (await zCache(zadanie)) || (nawigacja && (await caches.match(location.origin + "/"))) || Response.error())
    );
    return;
  }

  const niezmienny = NIEZMIENNE.some((p) => url.pathname.startsWith(p));
  e.respondWith(
    zCache(zadanie).then((zapisane) => {
      if (zapisane && niezmienny) return zapisane;
      // Reszta statyków: od razu z pamięci, w tle odświeżenie.
      const zSieci = fetch(zadanie)
        .then((odp) => {
          if (odp.status === 200) e.waitUntil(zapisz(zadanie, odp.clone()));
          return odp;
        })
        .catch(() => zapisane || Response.error());
      return zapisane || zSieci;
    })
  );
});
