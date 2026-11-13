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

function strona({ sciezka, tytul, opis, tresc, ld, glowa = "", skrypty = "", typOg = "article" }) {
  const url = DOMENA + "/" + sciezka;
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(tytul)}</title>
  <meta name="description" content="${esc(opis)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="${typOg}">
  <meta property="og:site_name" content="ViceMap">
  <meta property="og:title" content="${esc(tytul)}">
  <meta property="og:description" content="${esc(opis)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${DOMENA}/img/og.png">
  <meta property="og:locale" content="pl_PL">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#12101c">
  <link rel="icon" href="/img/ikona.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/img/ikona-180.png">
  <link rel="manifest" href="/manifest.webmanifest">${glowa}
  <link rel="stylesheet" href="/style.css">
  <style>.pomin-nawigacje{position:absolute;left:8px;top:-60px;z-index:1000;padding:8px 14px;background:#fff;color:#12101c;font-weight:600;border-radius:6px}.pomin-nawigacje:focus{top:8px}</style>
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body>
  <!-- Plik wygenerowany przez scripts/build.mjs – zmiany rób w data/*.json, nie tutaj. -->
  <a class="pomin-nawigacje" href="#tresc">Przejdź do treści</a>
  <header class="naglowek">
    <a class="logo" href="/">Vice<span>Map</span></a>
    <nav aria-label="Główna">
      <a href="/">Mapa</a>
      <a href="/poradniki/">Poradniki</a>
      <a href="/zglos.html">Zgłoś</a>
    </nav>
  </header>

  <main id="tresc" tabindex="-1">
${tresc}
  </main>

  <footer class="stopka">
    <p>Nieoficjalna strona fanowska, niepowiązana z Rockstar Games ani Take-Two Interactive. Grand Theft Auto jest znakiem towarowym Take-Two Interactive.</p>
    <p class="atrybucja">Mapa i punkty orientacyjne: <a href="https://map.gtadb.org" rel="noopener">GTADB</a> / Yanis V17, <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a> (zmieniono: przycięcie i zmniejszenie).</p>
    <p>
      <a href="/polityka-prywatnosci.html">Polityka prywatności</a> ·
      <a href="/zglos.html">Zgłoś znacznik</a> ·
      <a href="#" data-zmien-zgode>Ustawienia cookie</a>
      <a href="#" data-wsparcie hidden> · Postaw kawę ☕</a>
    </p>
  </footer>

  <script src="/js/config.js" defer></script>${skrypty}
  <script src="/js/strona.js" defer></script>
</body>
</html>
`;
}

const okruszki = (...elementy) =>
  `    <nav class="okruszki" aria-label="Okruszki">${elementy.map(([h, t]) => (h ? `<a href="${h}">${esc(t)}</a>` : esc(t))).join(" › ")}</nav>`;

const breadcrumbLd = (elementy) => ({
  "@type": "BreadcrumbList",
  itemListElement: elementy.map(([h, t], i) => ({ "@type": "ListItem", position: i + 1, name: t, item: DOMENA + h }))
});

// Strony powstają tylko dla prawdziwych danych: bez przykładów i bez kategorii ze spoilerami.
const publiczne = znaczniki.filter((z) => !z.przyklad && !katPoId.get(z.kategoria).spoiler && !katPoId.get(z.kategoria).bezStron);
const wygenerowane = [];
const odl = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lista = (items) => `      <ul>\n${items.map((o) => `        <li><a href="/znaczniki/${o.id}.html">${esc(o.nazwa)}</a></li>`).join("\n")}\n      </ul>`;

// --- Strony znaczników ---
await mkdir(join(ROOT, "znaczniki"), { recursive: true });
for (const z of publiczne) {
  const kat = katPoId.get(z.kategoria);
  const sciezka = `znaczniki/${z.id}.html`;
  const opis = `${z.nazwa} w GTA 6 (${kat.liczbaPojedyncza}${z.region ? ", " + z.region : ""}): ${z.opis ? z.opis.replace(/\s+/g, " ").replace(/^(.{0,110})\s.{1,}$/, (m, g) => (m.length > 110 ? g + "…" : m)) : "lokalizacja na mapie Leonidy"}. Zobacz miejsce na interaktywnej mapie.`;
  const inne = publiczne.filter((o) => o.kategoria === z.kategoria && o.id !== z.id).sort((a, b) => odl(a, z) - odl(b, z)).slice(0, 6);
  const wRegionie = z.region ? publiczne.filter((o) => o.region === z.region && o.kategoria !== z.kategoria && o.id !== z.id).sort((a, b) => odl(a, z) - odl(b, z)).slice(0, 6) : [];
  const sciezkaOkr = [["/", "Mapa"], [`/kategorie/${kat.id}.html`, kat.nazwa], [null, z.nazwa]];
  const tresc = `${okruszki(...sciezkaOkr)}
    <article>
      <h1>GTA 6: ${esc(z.nazwa)} – gdzie jest</h1>
      <p class="stan">${esc(kat.nazwa)}${z.region ? " · " + esc(z.region) : ""}</p>
      ${z.opis ? `<p>${esc(z.opis)}</p>` : ""}
      <div id="mini-mapa" class="mini-mapa" role="img" aria-label="Mini mapa: ${esc(z.nazwa)}" data-x="${z.x}" data-y="${z.y}" data-kolor="${esc(kat.kolor)}" data-znak="${esc(kat.znak)}"></div>
      <p><a class="przycisk przycisk--glowny" href="/#z=${encodeURIComponent(z.id)}">Pokaż na pełnej mapie</a>
         <a class="przycisk" href="/zglos.html?z=${encodeURIComponent(z.id)}">Zgłoś poprawkę</a></p>
${inne.length ? `      <h2>Najbliższe: ${esc(kat.nazwa.toLowerCase())}</h2>
${lista(inne)}
      <p><a href="/kategorie/${kat.id}.html">Wszystkie: ${esc(kat.nazwa.toLowerCase())}</a></p>` : ""}
${wRegionie.length ? `      <h2>Też w okolicy: ${esc(z.region)}</h2>
${lista(wRegionie)}` : ""}
      <p class="zrodla">Więcej o regionach Leonidy znajdziesz w <a href="/poradniki/regiony.html">poradniku po regionach</a>.</p>
    </article>`;
  await writeFile(join(ROOT, sciezka), strona({
    sciezka, tytul: `GTA 6: ${z.nazwa} – gdzie jest | ViceMap`, opis, tresc,
    ld: { "@context": "https://schema.org", "@graph": [
      { "@type": "Article", headline: `GTA 6: ${z.nazwa} – gdzie jest`, description: opis, inLanguage: "pl", dateModified: DZIS, mainEntityOfPage: DOMENA + "/" + sciezka,
        image: DOMENA + "/img/og.png", author: { "@type": "Organization", name: "ViceMap" }, publisher: { "@type": "Organization", name: "ViceMap", url: DOMENA } },
      breadcrumbLd(sciezkaOkr.map(([h, t]) => [h || "/" + sciezka, t]))
    ] },
    glowa: `\n  <link rel="stylesheet" href="/vendor/leaflet/leaflet.css">\n  <link rel="preload" href="/mapa.webp" as="image" type="image/webp">`,
    skrypty: `\n  <script src="/vendor/leaflet/leaflet.js" defer></script>\n  <script src="/js/mini-mapa.js" defer></script>`
  }));
  wygenerowane.push(sciezka);
}

// --- Strony kategorii (tylko te, które mają prawdziwe znaczniki) ---
await mkdir(join(ROOT, "kategorie"), { recursive: true });
for (const kat of kategorie) {
  const pozycje = publiczne.filter((z) => z.kategoria === kat.id);
  if (!pozycje.length) continue;
  const inneKat = kategorie.filter((k) => k.id !== kat.id && publiczne.some((z) => z.kategoria === k.id));
  const sciezka = `kategorie/${kat.id}.html`;
  const sciezkaOkr = [["/", "Mapa"], [null, kat.nazwa]];
  const tresc = `${okruszki(...sciezkaOkr)}
    <h1>GTA 6: ${esc(kat.nazwa.toLowerCase())} – mapa i lista (${pozycje.length})</h1>
    <p>${esc(kat.opis || "")} Na mapie ViceMap zaznaczysz każde miejsce jako zaliczone i sprawdzisz, ile brakuje do 100%.</p>
    <p><a class="przycisk przycisk--glowny" href="/">Otwórz mapę</a></p>
    <table>
      <thead><tr><th scope="col">Nazwa</th><th scope="col">Opis</th></tr></thead>
      <tbody>
${pozycje.map((z) => `        <tr><td><a href="/znaczniki/${z.id}.html">${esc(z.nazwa)}</a></td><td>${esc(z.opis || "")}</td></tr>`).join("\n")}
      </tbody>
    </table>
${inneKat.length ? `    <h2>Inne kategorie</h2>
    <ul>
${inneKat.map((k) => `      <li><a href="/kategorie/${k.id}.html">${esc(k.nazwa)}</a></li>`).join("\n")}
    </ul>` : ""}
    <p class="zrodla">Zobacz też <a href="/poradniki/">poradniki do GTA 6</a> i <a href="/poradniki/regiony.html">opis regionów Leonidy</a>.</p>`;
  await writeFile(join(ROOT, sciezka), strona({
    sciezka, tytul: `GTA 6 ${kat.nazwa.toLowerCase()} – wszystkie lokalizacje na mapie | ViceMap`,
    opis: `Wszystkie ${kat.nazwa.toLowerCase()} w GTA 6 (${pozycje.length}) na interaktywnej mapie po polsku. ${kat.opis || ""}`.trim(),
    tresc, typOg: "website",
    ld: { "@context": "https://schema.org", "@graph": [
      { "@type": "CollectionPage", name: `GTA 6 – ${kat.nazwa}`, inLanguage: "pl", url: DOMENA + "/" + sciezka, description: kat.opis || undefined },
      { "@type": "ItemList", numberOfItems: pozycje.length, itemListElement: pozycje.map((z, i) => ({ "@type": "ListItem", position: i + 1, name: z.nazwa, url: `${DOMENA}/znaczniki/${z.id}.html` })) },
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
