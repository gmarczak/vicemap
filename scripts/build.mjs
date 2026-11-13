// Generator stron pod Google: jedna strona na znacznik, jedna na kategorię, plus sitemap.xml.
// Uruchom po każdej zmianie w data/*.json:   node scripts/build.mjs
// Bez zależności – wystarczy Node 18+.
// Test na kopii danych (nie rusza repo):  VICEMAP_DANE=<katalog z kategorie.json i znaczniki.json> VICEMAP_WYJSCIE=<katalog> node scripts/build.mjs
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DANE = process.env.VICEMAP_DANE ? resolve(process.env.VICEMAP_DANE) : join(ROOT, "data");
const OUT = process.env.VICEMAP_WYJSCIE ? resolve(process.env.VICEMAP_WYJSCIE) : ROOT;
const DOMENA = "https://vicemap.pl";
const DZIS = new Date().toISOString().slice(0, 10);

async function wczytaj(nazwa) {
  try {
    return JSON.parse(await readFile(join(DANE, nazwa), "utf8"));
  } catch (e) {
    console.error(`Nie da się wczytać ${nazwa}: ${e.message}\nPodpowiedź: sprawdź przecinki, cudzysłowy i nawiasy w pliku.`);
    process.exit(1);
  }
}
const kategorie = await wczytaj("kategorie.json");
const znaczniki = await wczytaj("znaczniki.json");
const regiony = existsSync(join(DANE, "regiony.json")) ? await wczytaj("regiony.json") : null;

// Wymiary mapy z js/config.js (znaczniki muszą mieścić się w obrazie).
const cfg = await readFile(join(ROOT, "js/config.js"), "utf8");
const SZER = Number(/szerokosc:\s*(\d+)/.exec(cfg)?.[1]);
const WYS = Number(/wysokosc:\s*(\d+)/.exec(cfg)?.[1]);

// --- Walidacja danych: lepiej zatrzymać build niż wypuścić zepsutą mapę. Zbieramy WSZYSTKIE błędy naraz. ---
const bledy = [];
const ostrzezenia = [];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OPIS_MIN = 30, OPIS_MAX = 400, ODP_MAX = 150, BLISKO_PX = 8;
const ZRODLA = ["gtadb", "zgloszenie", "gra"];
const katPoId = new Map();
kategorie.forEach((k, i) => {
  const gdzie = `kategorie.json, pozycja ${i + 1} ("${k.id ?? "?"}")`;
  if (!k.id || !ID.test(k.id)) bledy.push(`${gdzie}: niepoprawne id. Użyj małych liter, cyfr i myślników, np. "sklepy".`);
  if (katPoId.has(k.id)) bledy.push(`${gdzie}: powtórzone id. Każda kategoria musi mieć inne id.`);
  for (const pole of ["nazwa", "liczbaPojedyncza", "kolor", "znak"]) if (!k[pole]) bledy.push(`${gdzie}: brak pola "${pole}".`);
  katPoId.set(k.id, k);
});
const widziane = new Map();
znaczniki.forEach((z, i) => {
  const gdzie = `znaczniki.json, pozycja ${i + 1} ("${z.id || z.nazwa || "?"}")`;
  if (!z.id || !ID.test(z.id)) bledy.push(`${gdzie}: niepoprawne id. Użyj małych liter, cyfr i myślników, bez polskich znaków, np. "sklep-ocean-beach".`);
  else if (widziane.has(z.id)) bledy.push(`${gdzie}: id powtórzone (pierwszy raz na pozycji ${widziane.get(z.id)}). Id musi być unikalne.`);
  else widziane.set(z.id, i + 1);
  if (!katPoId.has(z.kategoria)) bledy.push(`${gdzie}: nieznana kategoria "${z.kategoria}". Dozwolone: ${[...katPoId.keys()].join(", ")}.`);
  if (!z.nazwa || !String(z.nazwa).trim()) bledy.push(`${gdzie}: brak nazwy. Dodaj pole "nazwa".`);
  const opis = typeof z.opis === "string" ? z.opis.trim() : "";
  if (!opis) bledy.push(`${gdzie}: brak opisu. Dodaj pole "opis" (${OPIS_MIN}-${OPIS_MAX} znaków).`);
  else if (opis.length < OPIS_MIN) bledy.push(`${gdzie}: opis zbyt krótki (${opis.length} znaków, minimum ${OPIS_MIN}). Dopisz, co to za miejsce i jak je rozpoznać.`);
  else if (opis.length > OPIS_MAX) bledy.push(`${gdzie}: opis zbyt długi (${opis.length} znaków, maksimum ${OPIS_MAX}). Skróć go.`);
  if (typeof z.x !== "number" || typeof z.y !== "number" || !Number.isFinite(z.x) || !Number.isFinite(z.y)) {
    bledy.push(`${gdzie}: x i y muszą być liczbami (bez cudzysłowów). Skopiuj wpis z trybu ?edytor.`);
  } else if (SZER && WYS && (z.x < 0 || z.x > SZER || z.y < 0 || z.y > WYS)) {
    bledy.push(`${gdzie}: x=${z.x}, y=${z.y} poza mapą (x: 0-${SZER}, y: 0-${WYS}). Przelicz współrzędne albo skopiuj je ponownie z ?edytor.`);
  }
  if (z.odpowiednik !== undefined && (typeof z.odpowiednik !== "string" || !z.odpowiednik.trim() || z.odpowiednik.length > ODP_MAX)) {
    bledy.push(`${gdzie}: "odpowiednik" musi być niepustym tekstem do ${ODP_MAX} znaków (prawdziwe miejsce, np. "Ocean Drive, Miami"). Usuń pole, jeśli nie znasz odpowiednika.`);
  }
  if (z.zrodlo !== undefined && !ZRODLA.includes(z.zrodlo)) bledy.push(`${gdzie}: nieznane "zrodlo" (${JSON.stringify(z.zrodlo)}). Dozwolone: ${ZRODLA.join(", ")}.`);
  if (z.region !== undefined && typeof z.region !== "string") bledy.push(`${gdzie}: "region" musi być tekstem, np. "Vice City".`);
  if (z.przyklad) ostrzezenia.push(`${gdzie}: znacznik przykładowy ("przyklad": true) – nie dostanie strony ani wpisu w sitemap. Po premierze usuń go albo zamień na prawdziwy.`);
});
// Duplikaty: bliskie znaczniki (<8 px) ostrzegają tylko przy tej samej (prawie) nazwie albo identycznych x,y.
// Różne lokale w jednym pasażu leżą blisko siebie zupełnie zgodnie z prawdą, więc nie są alarmem.
const normNazwa = (n) => String(n ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l")
  .replace(/\([^)]*\)/g, "").replace(/[()]/g, "").replace(/[\s\d]+$/, "").replace(/\s+/g, " ").trim();
for (let i = 0; i < znaczniki.length; i++) {
  for (let j = i + 1; j < znaczniki.length; j++) {
    const a = znaczniki[i], b = znaczniki[j];
    if (!Number.isFinite(a.x + a.y + b.x + b.y) || Math.hypot(a.x - b.x, a.y - b.y) >= BLISKO_PX) continue;
    const to = a.x === b.x && a.y === b.y ? "mają identyczne współrzędne" : normNazwa(a.nazwa) && normNazwa(a.nazwa) === normNazwa(b.nazwa) ? `leżą w odległości mniejszej niż ${BLISKO_PX} px i mają tę samą nazwę ("${a.nazwa}" / "${b.nazwa}")` : "";
    if (to) ostrzezenia.push(`znaczniki.json: "${a.id}" (pozycja ${i + 1}) i "${b.id}" (pozycja ${j + 1}) ${to} – to może być duplikat.`);
  }
}
// regiony.json (opcjonalny): [{id, nazwa, x, y, zrodlo}]
if (regiony !== null) {
  if (!Array.isArray(regiony)) bledy.push(`regiony.json: oczekiwana tablica [{id, nazwa, x, y}], jest ${typeof regiony}.`);
  else {
    const rid = new Set();
    regiony.forEach((r, i) => {
      const gdzie = `regiony.json, pozycja ${i + 1} ("${r?.id ?? r?.nazwa ?? "?"}")`;
      if (!r || typeof r !== "object") return bledy.push(`${gdzie}: wpis musi być obiektem {id, nazwa, x, y}.`);
      if (!r.id || !ID.test(r.id)) bledy.push(`${gdzie}: niepoprawne id. Użyj małych liter, cyfr i myślników, np. "vice-city".`);
      else if (rid.has(r.id)) bledy.push(`${gdzie}: id powtórzone. Id regionu musi być unikalne.`);
      else rid.add(r.id);
      if (!r.nazwa || !String(r.nazwa).trim()) bledy.push(`${gdzie}: brak nazwy. Dodaj pole "nazwa".`);
      if (typeof r.x !== "number" || typeof r.y !== "number" || !Number.isFinite(r.x) || !Number.isFinite(r.y)) bledy.push(`${gdzie}: x i y muszą być liczbami (bez cudzysłowów).`);
      else if (SZER && WYS && (r.x < 0 || r.x > SZER || r.y < 0 || r.y > WYS)) bledy.push(`${gdzie}: x=${r.x}, y=${r.y} poza mapą (x: 0-${SZER}, y: 0-${WYS}).`);
    });
  }
}
if (ostrzezenia.length) console.warn(`Ostrzeżenia (${ostrzezenia.length}):\n- ${ostrzezenia.join("\n- ")}\n`);
if (bledy.length) {
  console.error(`Znaleziono błędy w danych (${bledy.length}). Popraw je i uruchom build ponownie:\n- ${bledy.join("\n- ")}`);
  process.exit(1);
}

// Skraca tekst do max znaków: najchętniej na końcu zdania, inaczej na granicy słowa z jednym wielokropkiem.
function skroc(tekst, max) {
  const t = String(tekst ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const okno = t.slice(0, max);
  const koniecZdania = Math.max(okno.lastIndexOf(". "), okno.lastIndexOf("! "), okno.lastIndexOf("? "));
  if (koniecZdania >= max * 0.5) return okno.slice(0, koniecZdania + 1);
  const spacja = okno.lastIndexOf(" ");
  const ciecie = (spacja > max * 0.5 ? okno.slice(0, spacja) : okno.slice(0, max - 1)).replace(/[\s,;:–—-]+$/, "").replace(/[.…]+$/, "");
  return ciecie + "…";
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

// Tytuł do ~60 znaków: bierze pierwszy wariant, który się mieści.
const tytulDo60 = (...warianty) => warianty.find((w) => w.length <= 60) || skroc(warianty[warianty.length - 1], 60);

// --- Strony znaczników ---
await mkdir(join(OUT, "znaczniki"), { recursive: true });
for (const z of publiczne) {
  const kat = katPoId.get(z.kategoria);
  const sciezka = `znaczniki/${z.id}.html`;
  const wstep = `${z.nazwa} w GTA 6 (${kat.liczbaPojedyncza}${z.region ? ", " + z.region : ""}). `;
  const opis = wstep + (z.opis ? skroc(z.opis, 155 - wstep.length) : "Lokalizacja na interaktywnej mapie Leonidy.");
  const tytul = tytulDo60(`GTA 6: ${z.nazwa} – gdzie jest | ViceMap`, `GTA 6: ${z.nazwa} – gdzie jest`, `${z.nazwa} w GTA 6 | ViceMap`, `${z.nazwa} – GTA 6`);
  const wKat = publiczne.filter((o) => o.kategoria === z.kategoria);
  const idx = wKat.indexOf(z);
  const poprz = wKat[idx - 1], nast = wKat[idx + 1];
  const inne = publiczne.filter((o) => o.kategoria === z.kategoria && o.id !== z.id).sort((a, b) => odl(a, z) - odl(b, z)).slice(0, 6);
  const wRegionie = z.region ? publiczne.filter((o) => o.region === z.region && o.kategoria !== z.kategoria && o.id !== z.id).sort((a, b) => odl(a, z) - odl(b, z)).slice(0, 6) : [];
  const sciezkaOkr = [["/", "Mapa"], [`/kategorie/${kat.id}.html`, kat.nazwa], [null, z.nazwa]];
  const tresc = `${okruszki(...sciezkaOkr)}
    <article>
      <h1>GTA 6: ${esc(z.nazwa)} – gdzie jest</h1>
      <p class="stan">${esc(kat.nazwa)}${z.region ? " · " + esc(z.region) : ""}</p>
      ${z.opis ? `<p>${esc(z.opis)}</p>` : ""}
${z.zrodlo === "gtadb" || z.odpowiednik ? `      <ul class="fakty">
${z.zrodlo === "gtadb" ? `        <li>Pewność: zidentyfikowane przez społeczność GTADB, niepotwierdzone przed premierą.</li>
` : ""}${z.odpowiednik ? `        <li>Prawdziwy odpowiednik: ${esc(z.odpowiednik)}</li>
` : ""}      </ul>` : ""}
      <div id="mini-mapa" class="mini-mapa" role="img" aria-label="Mini mapa: ${esc(z.nazwa)}" data-x="${z.x}" data-y="${z.y}" data-kolor="${esc(kat.kolor)}" data-znak="${esc(kat.znak)}"></div>
      <p><a class="przycisk przycisk--glowny" href="/#z=${encodeURIComponent(z.id)}">Pokaż na pełnej mapie</a>
         <a class="przycisk" href="/zglos.html?z=${encodeURIComponent(z.id)}">Zgłoś poprawkę</a></p>
${inne.length ? `      <h2>Najbliższe: ${esc(kat.nazwa.toLowerCase())}</h2>
${lista(inne)}
      <p><a href="/kategorie/${kat.id}.html">Wszystkie: ${esc(kat.nazwa.toLowerCase())}</a></p>` : ""}
${wRegionie.length ? `      <h2>Też w okolicy: ${esc(z.region)}</h2>
${lista(wRegionie)}` : ""}
${poprz || nast ? `      <nav class="poprzedni-nastepny" aria-label="Poprzedni i następny w kategorii">
${poprz ? `        <a rel="prev" href="/znaczniki/${poprz.id}.html">← ${esc(poprz.nazwa)}</a>` : ""}
${nast ? `        <a rel="next" href="/znaczniki/${nast.id}.html">${esc(nast.nazwa)} →</a>` : ""}
      </nav>` : ""}
      <p class="zrodla">Więcej o regionach Leonidy znajdziesz w <a href="/poradniki/regiony.html">poradniku po regionach</a>.</p>
    </article>`;
  await writeFile(join(OUT, sciezka), strona({
    sciezka, tytul, opis, tresc,
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
await mkdir(join(OUT, "kategorie"), { recursive: true });
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
  await writeFile(join(OUT, sciezka), strona({
    sciezka, tytul: tytulDo60(`GTA 6: ${kat.nazwa.toLowerCase()} – lista i mapa | ViceMap`, `GTA 6: ${kat.nazwa.toLowerCase()} – lista i mapa`, `${kat.nazwa} w GTA 6`),
    opis: skroc(`${kat.nazwa} w GTA 6: lista miejsc (${pozycje.length}) na interaktywnej mapie po polsku. ${kat.opis || ""}`, 155),
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
  for (const plik of await readdir(join(OUT, folder))) {
    if (plik.endsWith(".html") && !wygenerowane.includes(`${folder}/${plik}`)) {
      await rm(join(OUT, folder, plik));
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
await writeFile(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${adresy.map((a) => `  <url><loc>${DOMENA}/${a}</loc><lastmod>${DZIS}</lastmod></url>`).join("\n")}
</urlset>
`);

const przyklady = znaczniki.length - znaczniki.filter((z) => !z.przyklad).length;
console.log(`OK: ${znaczniki.length} znaczników (${przyklady} przykładowych), ${wygenerowane.length} stron wygenerowanych, ${adresy.length} adresów w sitemap.xml.`);
if (existsSync(join(ROOT, "sw.js"))) console.log("Pamiętaj: po zmianie plików statycznych podbij WERSJA w sw.js.");
