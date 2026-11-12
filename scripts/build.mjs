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
const regiony = existsSync(join(ROOT, "data/regiony.json"))
  ? JSON.parse(await readFile(join(ROOT, "data/regiony.json"), "utf8")).map((r) => r.nazwa)
  : [];

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
  if (z.region && regiony.length && !regiony.includes(z.region)) bledy.push(`${gdzie}: nieznany region "${z.region}" – użyj nazwy z data/regiony.json (${regiony.join(", ")})`);
  if (z.status && !["potwierdzone", "spolecznosc"].includes(z.status)) bledy.push(`${gdzie}: status to "potwierdzone" albo "spolecznosc"`);
  if (z.dodano && !/^\d{4}-\d{2}-\d{2}$/.test(z.dodano)) bledy.push(`${gdzie}: dodano w formacie RRRR-MM-DD`);
  if (z.zrodlo && !/^https?:\/\//.test(z.zrodlo)) bledy.push(`${gdzie}: zrodlo musi być adresem http(s)`);
}
if (bledy.length) {
  console.error("Błędy w danych:\n- " + bledy.join("\n- "));
  process.exit(1);
}

// --- Szablon strony ---
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function strona({ sciezka, tytul, opis, tresc, ld, glowa = "", skrypty = "", noindex = false }) {
  const url = DOMENA + "/" + sciezka;
  if (noindex) glowa = `\n  <meta name="robots" content="noindex">` + glowa;
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
  <meta name="theme-color" content="#0c1c2b">
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
    <nav class="stopka__linki" aria-label="Stopka">
      <a href="/poradniki/">Poradniki</a>
      <a href="/lista-100.html">Lista 100%</a>
      <a href="/zglos.html">Zgłoś znacznik</a>
      <a href="/polityka-prywatnosci.html">Polityka prywatności</a>
      <a href="#" data-zmien-zgode>Ustawienia cookie</a>
      <a href="#" data-wsparcie hidden>Postaw kawę</a>
    </nav>
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
      <div class="meta">
        <span class="etykieta${z.status === "potwierdzone" ? " etykieta--ok" : ""}">${z.status === "potwierdzone" ? "Potwierdzone" : "Od społeczności"}</span>
        <span>${esc(kat.nazwa)}</span>${z.region ? `\n        <span>${esc(z.region)}</span>` : ""}${z.autor ? `\n        <span>Znalazł: ${esc(z.autor)}</span>` : ""}${z.dodano ? `\n        <span>Dodano ${esc(z.dodano)}</span>` : ""}
      </div>
      ${z.opis ? `<p>${esc(z.opis)}</p>` : ""}
      <div id="mini-mapa" class="mini-mapa" data-x="${z.x}" data-y="${z.y}" data-kolor="${esc(kat.kolor)}" data-znak="${esc(kat.znak)}"></div>
${/^https?:\/\//.test(z.zrodlo || "") ? `      <p class="zrodla">Źródło: <a href="${esc(z.zrodlo)}" rel="nofollow noopener">${esc(new URL(z.zrodlo).hostname)}</a></p>\n` : ""}      <p><a class="przycisk przycisk--glowny" href="/#z=${encodeURIComponent(z.id)}">Pokaż na pełnej mapie</a>
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
    <p><a class="przycisk przycisk--glowny" href="/?kategoria=${kat.id}">Pokaż ${esc(kat.nazwa.toLowerCase())} na mapie</a> <a class="przycisk" href="/lista-100.html">Lista 100%</a></p>
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

// --- Lista 100%: wszystkie nie-spoilerowe znaczniki, odhaczanie zsynchronizowane z mapą ---
{
  const naLiscie = znaczniki.filter((z) => !katPoId.get(z.kategoria).spoiler);
  const sekcje = kategorie.filter((k) => !k.spoiler).map((kat) => {
    const lista = naLiscie.filter((z) => z.kategoria === kat.id).sort((a, b) => a.nazwa.localeCompare(b.nazwa, "pl"));
    if (!lista.length) return "";
    return `    <h2 id="${kat.id}">${esc(kat.nazwa)} <span class="lista-licznik" data-kategoria="${kat.id}"></span></h2>
    <table class="lista-100">
      <thead><tr><th><span class="ukryta-etykieta">Zaliczone</span></th><th>Nazwa</th><th>Region</th><th>Opis</th></tr></thead>
      <tbody>
${lista.map((z) => `        <tr data-id="${esc(z.id)}" data-kategoria="${kat.id}"><td><input type="checkbox" aria-label="Zaliczone: ${esc(z.nazwa)}"></td><td><a href="${z.przyklad ? "/#z=" + encodeURIComponent(z.id) : "/znaczniki/" + z.id + ".html"}">${esc(z.nazwa)}</a>${z.przyklad ? ' <span class="etykieta etykieta--przyklad">przykład</span>' : ""}</td><td>${esc(z.region || "")}</td><td>${esc(z.opis || "")}</td></tr>`).join("\n")}
      </tbody>
    </table>`;
  }).filter(Boolean).join("\n\n");
  const prawdziwe = publiczne.length > 0;
  await writeFile(join(ROOT, "lista-100.html"), strona({
    sciezka: "lista-100.html",
    tytul: "GTA 6 – lista do 100%: wszystkie znajdźki i miejsca | ViceMap",
    opis: "Lista wszystkich miejsc w GTA 6 do zaliczenia na 100%: znajdźki, kryjówki, sklepy, aktywności. Odhaczaj po polsku, postęp synchronizuje się z mapą.",
    noindex: !prawdziwe,
    tresc: `${okruszki(["/", "Mapa"], [null, "Lista 100%"])}
    <h1>GTA 6 – lista do 100%</h1>
    <p>Odhacz miejsca, które masz już zaliczone – lista korzysta z tego samego zapisu co <a href="/">mapa</a>, więc postęp widać w obu miejscach. Misje fabularne pominęliśmy, żeby nie zdradzać fabuły.</p>
    <div class="ramka"><strong id="lista-postep">Zaliczone: 0 z 0</strong><div class="stan" id="lista-profil"></div></div>
${sekcje || "    <p>Pierwsze miejsca dodamy w dniu premiery, 19 listopada 2026.</p>"}`,
    ld: { "@context": "https://schema.org", "@type": "CollectionPage", name: "GTA 6 – lista do 100%", inLanguage: "pl", url: DOMENA + "/lista-100.html" },
    skrypty: `\n  <script src="/js/postep.js"></script>\n  <script src="/js/lista.js"></script>`
  }));
  if (prawdziwe) wygenerowane.push("lista-100.html");
}

// --- Ranking odkrywców (podpisy z zatwierdzonych zgłoszeń) ---
{
  const ranking = new Map();
  for (const z of publiczne) if (z.autor) ranking.set(z.autor, (ranking.get(z.autor) || 0) + 1);
  const sciezka = "odkrywcy.html";
  if (ranking.size) {
    const wiersze = [...ranking].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pl"));
    await writeFile(join(ROOT, sciezka), strona({
      sciezka, noindex: true,
      tytul: "Ranking odkrywców | ViceMap",
      opis: "Gracze, którzy zgłosili najwięcej miejsc na mapę GTA 6 ViceMap.",
      tresc: `${okruszki(["/", "Mapa"], [null, "Ranking odkrywców"])}
    <h1>Ranking odkrywców</h1>
    <p>Dziękujemy wszystkim, którzy zgłaszają miejsca na mapę. <a href="/zglos.html">Zgłoś swoje znalezisko</a> i podpisz je nickiem.</p>
    <table>
      <thead><tr><th>#</th><th>Odkrywca</th><th>Dodane miejsca</th></tr></thead>
      <tbody>
${wiersze.map(([kto, ile], i) => `        <tr><td>${i + 1}</td><td>${esc(kto)}</td><td>${ile}</td></tr>`).join("\n")}
      </tbody>
    </table>`,
      ld: { "@context": "https://schema.org", "@type": "WebPage", name: "Ranking odkrywców", inLanguage: "pl" }
    }));
  } else if (existsSync(join(ROOT, sciezka))) {
    await rm(join(ROOT, sciezka));
  }
}

// Polska odmiana: 1 miejsce, 2–4 miejsca, 5+ miejsc (ale 12–14 miejsc).
function odmienMiejsca(n) {
  if (n === 1) return "jest 1 sprawdzone miejsce";
  const d = n % 10, s = n % 100;
  if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return `są ${n} sprawdzone miejsca`;
  return `jest ${n} sprawdzonych miejsc`;
}

// --- Nowe znaleziska na stronie głównej (statycznie, żeby widział je też Google) ---
{
  const nowe = publiczne.filter((z) => z.dodano).sort((a, b) => b.dodano.localeCompare(a.dodano) || a.nazwa.localeCompare(b.nazwa, "pl")).slice(0, 10);
  const ostatnia = nowe.length ? nowe[0].dodano : null;
  const blok = nowe.length
    ? `    <h2>Nowe znaleziska</h2>
    <p class="stan">Ostatnia aktualizacja mapy: ${ostatnia}. Na mapie ${odmienMiejsca(publiczne.length)}.${existsSync(join(ROOT, "odkrywcy.html")) ? ' Zobacz <a href="/odkrywcy.html">ranking odkrywców</a>.' : ""}</p>
    <ul class="nowosci">
${nowe.map((z) => { const k = katPoId.get(z.kategoria); return `      <li><span class="pin pin--maly" style="--kolor:${k.kolor}">${esc(k.znak)}</span><a href="/znaczniki/${z.id}.html">${esc(z.nazwa)}</a><time datetime="${z.dodano}">${z.dodano}</time></li>`; }).join("\n")}
    </ul>`
    : `    <h2>Nowe znaleziska</h2>
    <p>Pierwsze prawdziwe miejsca dodamy w dniu premiery, 19 listopada 2026. Zajrzyj wtedy albo <a href="/zglos.html">zgłoś własne znalezisko</a>.</p>`;
  const plik = join(ROOT, "index.html");
  const html = await readFile(plik, "utf8");
  const nowy = html.replace(/<!-- NOWOSCI:START -->[\s\S]*?<!-- NOWOSCI:END -->/, `<!-- NOWOSCI:START -->\n${blok}\n    <!-- NOWOSCI:END -->`);
  if (nowy === html && !html.includes("NOWOSCI:START")) console.warn("Uwaga: w index.html brak znaczników NOWOSCI:START/END.");
  await writeFile(plik, nowy);
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
