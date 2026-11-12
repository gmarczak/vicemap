// Generator stron pod Google: jedna strona na znacznik, jedna na kategorię, plus sitemap.xml.
// Uruchom po każdej zmianie w data/*.json:   node scripts/build.mjs
// Bez zależności – wystarczy Node 18+.
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOMENA = "https://vicemap.pl";
const DZIS = new Date().toISOString().slice(0, 10);

const kategorie = JSON.parse(await readFile(join(ROOT, "data/kategorie.json"), "utf8"));
const znaczniki = JSON.parse(await readFile(join(ROOT, "data/znaczniki.json"), "utf8"));

// --- Walidacja danych: lepiej zatrzymać build niż wypuścić zepsutą mapę ---
const bledy = [];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const katPoId = new Map();
for (const k of kategorie) {
  if (!ID.test(k.id)) bledy.push(`Kategoria: niepoprawne id "${k.id}" (małe litery, cyfry, myślniki)`);
  if (katPoId.has(k.id)) bledy.push(`Kategoria: powtórzone id "${k.id}"`);
  katPoId.set(k.id, k);
}
const widziane = new Set();
for (const z of znaczniki) {
  const gdzie = `Znacznik "${z.id || z.nazwa || "?"}"`;
  if (!z.id || !ID.test(z.id)) bledy.push(`${gdzie}: niepoprawne id (małe litery, cyfry, myślniki, bez polskich znaków)`);
  if (widziane.has(z.id)) bledy.push(`${gdzie}: powtórzone id`);
  widziane.add(z.id);
  if (!katPoId.has(z.kategoria)) bledy.push(`${gdzie}: nieznana kategoria "${z.kategoria}"`);
  if (!z.nazwa) bledy.push(`${gdzie}: brak nazwy`);
  if (!Number.isFinite(z.x) || !Number.isFinite(z.y)) bledy.push(`${gdzie}: x i y muszą być liczbami`);
}
if (bledy.length) {
  console.error("Błędy w danych:\n- " + bledy.join("\n- "));
  process.exit(1);
}

// --- Szablon strony ---
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function strona({ sciezka, tytul, opis, tresc, ld, glowa = "", skrypty = "" }) {
  const url = DOMENA + "/" + sciezka;
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(tytul)}</title>
  <meta name="description" content="${esc(opis)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="ViceMap">
  <meta property="og:title" content="${esc(tytul)}">
  <meta property="og:description" content="${esc(opis)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${DOMENA}/img/og.png">
  <meta name="theme-color" content="#12101c">
  <link rel="icon" href="/img/ikona.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/img/ikona-180.png">
  <link rel="manifest" href="/manifest.webmanifest">${glowa}
  <link rel="stylesheet" href="/style.css">
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body>
  <!-- Plik wygenerowany przez scripts/build.mjs – zmiany rób w data/*.json, nie tutaj. -->
  <header class="naglowek">
    <a class="logo" href="/">Vice<span>Map</span></a>
    <nav>
      <a href="/">Mapa</a>
      <a href="/poradniki/">Poradniki</a>
      <a href="/zglos.html">Zgłoś</a>
    </nav>
  </header>

  <main>
${tresc}
  </main>

  <footer class="stopka">
    <p>Nieoficjalna strona fanowska, niepowiązana z Rockstar Games ani Take-Two Interactive. Grand Theft Auto jest znakiem towarowym Take-Two Interactive.</p>
    <p>
      <a href="/polityka-prywatnosci.html">Polityka prywatności</a> ·
      <a href="/zglos.html">Zgłoś znacznik</a> ·
      <a href="#" data-zmien-zgode>Ustawienia cookie</a>
      <a href="#" data-wsparcie hidden> · Postaw kawę ☕</a>
    </p>
  </footer>

  <script src="/js/config.js"></script>${skrypty}
  <script src="/js/strona.js"></script>
</body>
</html>
`;
}

const okruszki = (...elementy) =>
  `    <div class="okruszki">${elementy.map(([h, t]) => (h ? `<a href="${h}">${esc(t)}</a>` : esc(t))).join(" › ")}</div>`;

const breadcrumbLd = (elementy) => ({
  "@type": "BreadcrumbList",
  itemListElement: elementy.map(([h, t], i) => ({ "@type": "ListItem", position: i + 1, name: t, item: DOMENA + h }))
});

// Strony powstają tylko dla prawdziwych danych: bez przykładów i bez kategorii ze spoilerami.
const publiczne = znaczniki.filter((z) => !z.przyklad && !katPoId.get(z.kategoria).spoiler);
const wygenerowane = [];

// --- Strony znaczników ---
await mkdir(join(ROOT, "znaczniki"), { recursive: true });
for (const z of publiczne) {
  const kat = katPoId.get(z.kategoria);
  const sciezka = `znaczniki/${z.id}.html`;
  const opis = `${z.nazwa} w GTA 6: ${z.opis ? z.opis.replace(/\s+/g, " ").slice(0, 120) : kat.liczbaPojedyncza + " na mapie Leonidy"}. Zobacz lokalizację na interaktywnej mapie.`;
  const inne = publiczne.filter((o) => o.kategoria === z.kategoria && o.id !== z.id).slice(0, 8);
  const sciezkaOkr = [["/", "Mapa"], [`/kategorie/${kat.id}.html`, kat.nazwa], [null, z.nazwa]];
  const tresc = `${okruszki(...sciezkaOkr)}
    <article>
      <h1>GTA 6: ${esc(z.nazwa)} – gdzie jest</h1>
      <p class="stan">${esc(kat.nazwa)}${z.region ? " · " + esc(z.region) : ""}</p>
      ${z.opis ? `<p>${esc(z.opis)}</p>` : ""}
      <div id="mini-mapa" class="mini-mapa" data-x="${z.x}" data-y="${z.y}" data-kolor="${esc(kat.kolor)}" data-znak="${esc(kat.znak)}"></div>
      <p><a class="przycisk przycisk--glowny" href="/#z=${encodeURIComponent(z.id)}">Pokaż na pełnej mapie</a>
         <a class="przycisk" href="/zglos.html?z=${encodeURIComponent(z.id)}">Zgłoś poprawkę</a></p>
${inne.length ? `      <h2>Inne: ${esc(kat.nazwa.toLowerCase())}</h2>
      <ul>
${inne.map((o) => `        <li><a href="/znaczniki/${o.id}.html">${esc(o.nazwa)}</a></li>`).join("\n")}
      </ul>` : ""}
    </article>`;
  await writeFile(join(ROOT, sciezka), strona({
    sciezka, tytul: `GTA 6: ${z.nazwa} – gdzie jest | ViceMap`, opis, tresc,
    ld: { "@context": "https://schema.org", "@graph": [
      { "@type": "Article", headline: `GTA 6: ${z.nazwa} – gdzie jest`, inLanguage: "pl", dateModified: DZIS, mainEntityOfPage: DOMENA + "/" + sciezka },
      breadcrumbLd(sciezkaOkr.map(([h, t]) => [h || "/" + sciezka, t]))
    ] },
    glowa: `\n  <link rel="stylesheet" href="/vendor/leaflet/leaflet.css">`,
    skrypty: `\n  <script src="/vendor/leaflet/leaflet.js"></script>\n  <script src="/js/mini-mapa.js"></script>`
  }));
  wygenerowane.push(sciezka);
}

// --- Strony kategorii (tylko te, które mają prawdziwe znaczniki) ---
await mkdir(join(ROOT, "kategorie"), { recursive: true });
for (const kat of kategorie) {
  const lista = publiczne.filter((z) => z.kategoria === kat.id);
  if (!lista.length) continue;
  const sciezka = `kategorie/${kat.id}.html`;
  const sciezkaOkr = [["/", "Mapa"], [null, kat.nazwa]];
  const tresc = `${okruszki(...sciezkaOkr)}
    <h1>GTA 6: ${esc(kat.nazwa.toLowerCase())} – mapa i lista (${lista.length})</h1>
    <p>${esc(kat.opis || "")} Na mapie ViceMap zaznaczysz każde miejsce jako zaliczone i sprawdzisz, ile brakuje do 100%.</p>
    <p><a class="przycisk przycisk--glowny" href="/">Otwórz mapę</a></p>
    <table>
      <thead><tr><th>Nazwa</th><th>Opis</th></tr></thead>
      <tbody>
${lista.map((z) => `        <tr><td><a href="/znaczniki/${z.id}.html">${esc(z.nazwa)}</a></td><td>${esc(z.opis || "")}</td></tr>`).join("\n")}
      </tbody>
    </table>`;
  await writeFile(join(ROOT, sciezka), strona({
    sciezka, tytul: `GTA 6 ${kat.nazwa.toLowerCase()} – wszystkie lokalizacje na mapie | ViceMap`,
    opis: `Wszystkie ${kat.nazwa.toLowerCase()} w GTA 6 (${lista.length}) na interaktywnej mapie po polsku. ${kat.opis || ""}`.trim(),
    tresc,
    ld: { "@context": "https://schema.org", "@graph": [
      { "@type": "CollectionPage", name: `GTA 6 – ${kat.nazwa}`, inLanguage: "pl", url: DOMENA + "/" + sciezka },
      breadcrumbLd(sciezkaOkr.map(([h, t]) => [h || "/" + sciezka, t]))
    ] }
  }));
  wygenerowane.push(sciezka);
}

// --- Sprzątanie stron po usuniętych znacznikach i kategoriach ---
for (const folder of ["znaczniki", "kategorie"]) {
  for (const plik of await readdir(join(ROOT, folder))) {
    if (plik.endsWith(".html") && !wygenerowane.includes(`${folder}/${plik}`)) {
      await rm(join(ROOT, folder, plik));
      console.log("Usunięto nieaktualną stronę:", `${folder}/${plik}`);
    }
  }
}

// --- sitemap.xml: strony ręczne (bez noindex) + wygenerowane ---
const reczne = ["", "poradniki/", "zglos.html"];
for (const plik of (await readdir(join(ROOT, "poradniki"))).sort()) {
  if (!plik.endsWith(".html") || plik === "index.html") continue;
  const html = await readFile(join(ROOT, "poradniki", plik), "utf8");
  if (!/name="robots"[^>]*noindex/.test(html)) reczne.push("poradniki/" + plik);
}
const adresy = [...reczne, ...wygenerowane];
await writeFile(join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${adresy.map((a) => `  <url><loc>${DOMENA}/${a}</loc><lastmod>${DZIS}</lastmod></url>`).join("\n")}
</urlset>
`);

const przyklady = znaczniki.length - znaczniki.filter((z) => !z.przyklad).length;
console.log(`OK: ${znaczniki.length} znaczników (${przyklady} przykładowych), ${wygenerowane.length} stron wygenerowanych, ${adresy.length} adresów w sitemap.xml.`);
if (existsSync(join(ROOT, "sw.js"))) console.log("Pamiętaj: po zmianie plików statycznych podbij WERSJA w sw.js.");
