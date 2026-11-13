// Tryb offline: strony i znaczniki najpierw z sieci (zawsze świeże), reszta z pamięci podręcznej.
// Po zmianie listy plików poniżej podbij numer wersji.
const WERSJA = "vicemap-v9";
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
  "/img/ikona.svg"
];
// Dodatki: błąd pobrania jednego z nich nie blokuje instalacji.
const DODATKOWE = [
  "/404.html", "/data/regiony.json", "/poradniki/", "/zglos.html", "/js/zglos.js", "/js/mini-mapa.js", "/manifest.webmanifest",
  "/vendor/leaflet/images/layers.png", "/vendor/leaflet/images/layers-2x.png",
  "/vendor/leaflet/images/marker-icon.png", "/vendor/leaflet/images/marker-icon-2x.png", "/vendor/leaflet/images/marker-shadow.png"
];
// Pliki, które się nie zmieniają: raz zapisane nie są pobierane ponownie (mapa.webp ma ok. 900 KB).
const NIEZMIENNE = ["/mapa.webp", "/vendor/"];
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
      .then((klucze) => Promise.all(klucze.filter((k) => k !== WERSJA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const zadanie = e.request;
  const url = new URL(zadanie.url);
  if (zadanie.method !== "GET" || url.origin !== location.origin) return;
  if (zadanie.headers.has("range")) return; // odpowiedzi 206 nie nadają się do cache

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
