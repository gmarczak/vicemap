// Tryb offline: strony i znaczniki najpierw z sieci (zawsze świeże), reszta z pamięci podręcznej.
// Po zmianie listy plików poniżej podbij numer wersji.
const WERSJA = "vicemap-v5";
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
  "/img/ikona.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(WERSJA).then((c) => c.addAll(PODSTAWOWE)).then(() => self.skipWaiting()));
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

  const swieze = zadanie.mode === "navigate" || url.pathname.startsWith("/data/");
  if (swieze) {
    // Najpierw sieć, a bez internetu ostatnia zapisana wersja.
    e.respondWith(
      fetch(zadanie)
        .then((odp) => {
          const kopia = odp.clone();
          caches.open(WERSJA).then((c) => c.put(zadanie, kopia));
          return odp;
        })
        .catch(() => caches.match(zadanie).then((z) => z || caches.match("/")))
    );
    return;
  }

  // Pliki statyczne: od razu z pamięci, w tle odświeżenie.
  e.respondWith(
    caches.match(zadanie).then((zapisane) => {
      const zSieci = fetch(zadanie)
        .then((odp) => {
          if (odp.ok) {
            const kopia = odp.clone();
            caches.open(WERSJA).then((c) => c.put(zadanie, kopia));
          }
          return odp;
        })
        .catch(() => zapisane);
      return zapisane || zSieci;
    })
  );
});
