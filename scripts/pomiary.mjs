// Rozmiary zasobów strony mapy (surowe i gzip): node scripts/pomiary.mjs
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";

const pliki = [
  "index.html", "mapa.webp", "style.css", "js/config.js", "js/map.js", "js/strona.js",
  "data/kategorie.json", "data/znaczniki.json", "data/regiony.json",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "vendor/leaflet.markercluster-1.5.3/leaflet.markercluster.js", "vendor/leaflet.markercluster-1.5.3/MarkerCluster.css",
];
let surowe = 0, gz = 0;
console.log("plik".padEnd(62), "surowy".padStart(9), "gzip".padStart(9));
for (const p of pliki) {
  if (!existsSync(p)) continue;
  const b = readFileSync(p), z = gzipSync(b, { level: 9 }).length;
  surowe += b.length; gz += z;
  console.log(p.padEnd(62), String(b.length).padStart(9), String(z).padStart(9));
}
console.log("RAZEM".padEnd(62), String(surowe).padStart(9), String(gz).padStart(9));
console.log("Żądań strony mapy: policz w przeglądarce (performance.getEntriesByType('resource')) – ok. 13.");
