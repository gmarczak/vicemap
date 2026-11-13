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
const DZIS_PL = DZIS.split("-").reverse().join(".");

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
const zmiany = existsSync(join(DANE, "zmiany.json")) ? await wczytaj("zmiany.json") : null;
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
  if (z.odpowiednikGps !== undefined && !(Array.isArray(z.odpowiednikGps) && z.odpowiednikGps.length === 2 && z.odpowiednikGps.every(Number.isFinite) && Math.abs(z.odpowiednikGps[0]) <= 90 && Math.abs(z.odpowiednikGps[1]) <= 180)) {
    bledy.push(`${gdzie}: "odpowiednikGps" musi być parą liczb [szerokość -90..90, długość -180..180], np. [25.78, -80.13].`);
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
// zmiany.json (opcjonalny): [{data: RRRR-MM-DD, tytul, opis}], najnowsze na górze
if (zmiany !== null) {
  if (!Array.isArray(zmiany)) bledy.push("zmiany.json: oczekiwana tablica [{data, tytul, opis}].");
  else zmiany.forEach((w, i) => {
    const gdzie = `zmiany.json, pozycja ${i + 1} ("${w?.tytul ?? "?"}")`;
    if (!w || typeof w !== "object") return bledy.push(`${gdzie}: wpis musi być obiektem {data, tytul, opis}.`);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(w.data ?? "") ? new Date(w.data + "T00:00:00Z") : null;
    if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== w.data) bledy.push(`${gdzie}: "data" musi być poprawną datą RRRR-MM-DD.`);
    else {
      if (i > 0 && typeof zmiany[i - 1]?.data === "string" && zmiany[i - 1].data < w.data) bledy.push(`${gdzie}: wpisy mają być od najnowszego (data ${w.data} jest nowsza niż poprzedni wpis).`);
      if (w.data > DZIS) bledy.push(`${gdzie}: data ${w.data} jest w przyszłości.`);
    }
    if (typeof w.tytul !== "string" || w.tytul.trim().length < 5 || w.tytul.length > 80) bledy.push(`${gdzie}: "tytul" ma mieć 5-80 znaków.`);
    if (typeof w.opis !== "string" || w.opis.trim().length < 30 || w.opis.length > 400) bledy.push(`${gdzie}: "opis" ma mieć 30-400 znaków.`);
  });
}
if (Array.isArray(regiony)) regiony.forEach((r, i) => {
  if (r?.dopasuj !== undefined && (!Array.isArray(r.dopasuj) || !r.dopasuj.every((t) => typeof t === "string" && t.trim()))) bledy.push(`regiony.json, pozycja ${i + 1} ("${r.id}"): "dopasuj" to tablica niepustych tekstów (człony pola "region" znaczników).`);
  if (r?.opis !== undefined && typeof r.opis !== "string") bledy.push(`regiony.json, pozycja ${i + 1} ("${r.id}"): "opis" musi być tekstem.`);
});
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

function strona({ sciezka, tytul, opis, tresc, ld, glowa = "", skrypty = "", typOg = "article", noindex = false }) {
  const url = DOMENA + "/" + sciezka.replace(/index\.html$/, "");
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(tytul)}</title>
  <meta name="description" content="${esc(opis)}">
  <link rel="canonical" href="${url}">${noindex ? '\n  <meta name="robots" content="noindex,follow">' : ""}
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
      <a href="/poradniki/regiony.html">Regiony</a>
      <a href="/kategorie/">Kategorie</a>
      <a href="/o-projekcie.html">O projekcie</a>
      <a href="/zglos.html">Zgłoś</a>
    </nav>
  </header>

  <main id="tresc" tabindex="-1">
${tresc}
  </main>

  <footer class="stopka">
    <p>Nieoficjalna strona fanowska, niepowiązana z Rockstar Games ani Take-Two Interactive. Grand Theft Auto jest znakiem towarowym Take-Two Interactive.</p>
    <p class="atrybucja">Mapa, kafelki i punkty orientacyjne: <a href="https://map.gtadb.org" rel="noopener">GTADB</a> / Yanis V17, <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a> (zmieniono: przycięcie obszaru i zmniejszenie obrazu).</p>
    <p>
      <a href="/polityka-prywatnosci.html">Polityka prywatności</a> ·
      <a href="/o-projekcie.html">O projekcie i źródłach danych</a> ·
      <a href="/dziennik-zmian.html">Dziennik zmian</a> ·
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
// Strona kategorii powstaje od MIN_STRONA punktów; mniejsze kategorie linkują do mapy z filtrem.
const MIN_STRONA = 5;
const katHref = (id) => (znaczniki.filter((z) => z.kategoria === id && !z.przyklad).length >= MIN_STRONA ? `/kategorie/${id}.html` : `/#k=${encodeURIComponent(id)}`);
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
  const sciezkaOkr = [["/", "Mapa"], [katHref(kat.id), kat.nazwa], [null, z.nazwa]];
  const tresc = `${okruszki(...sciezkaOkr)}
    <article>
      <h1>GTA 6: ${esc(z.nazwa)} – gdzie jest</h1>
      <p class="stan">${esc(kat.nazwa)}${z.region ? " · " + esc(z.region) : ""}</p>
      ${z.opis ? `<p>${esc(z.opis)}</p>` : ""}
${z.zrodlo === "gtadb" || z.odpowiednik ? `      <ul class="fakty">
${z.zrodlo === "gtadb" ? `        <li>Pewność: zidentyfikowane przez społeczność GTADB, niepotwierdzone przed premierą.</li>
` : ""}${z.odpowiednik ? `        <li>Prawdziwy odpowiednik: ${esc(z.odpowiednik)}${z.odpowiednikGps ? ` (<a href="https://www.openstreetmap.org/?mlat=${z.odpowiednikGps[0]}&amp;mlon=${z.odpowiednikGps[1]}#map=17/${z.odpowiednikGps[0]}/${z.odpowiednikGps[1]}" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>)` : ""}</li>
` : ""}      </ul>` : ""}
      <div id="mini-mapa" class="mini-mapa" role="img" aria-label="Mini mapa: ${esc(z.nazwa)}" data-x="${z.x}" data-y="${z.y}" data-kolor="${esc(kat.kolor)}" data-znak="${esc(kat.znak)}"></div>
      <p><a class="przycisk przycisk--glowny" href="/#z=${encodeURIComponent(z.id)}">Pokaż na pełnej mapie</a>
         <a class="przycisk" href="/zglos.html?z=${encodeURIComponent(z.id)}">Zgłoś poprawkę</a></p>
${inne.length ? `      <h2>Najbliższe: ${esc(kat.nazwa.toLowerCase())}</h2>
${lista(inne)}
      <p><a href="${katHref(kat.id)}">Wszystkie: ${esc(kat.nazwa.toLowerCase())}</a></p>` : ""}
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

// --- Strony kategorii, regionów, spis kategorii, dziennik zmian ---
// Dane tu liczą wszystkie prawdziwe znaczniki (także z kategorii bezStron: te nie mają własnych stron, więc linkują do mapy).
const zDanymi = znaczniki.filter((z) => !z.przyklad && !katPoId.get(z.kategoria).spoiler);
const plKolacja = (n, a, b, c) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
const punktow = (n) => `${n} ${plKolacja(n, "punkt", "punkty", "punktów")}`;
const sortPl = (a, b) => a.nazwa.localeCompare(b.nazwa, "pl");
const czlony = (z) => String(z.region || "").split(",").map((t) => t.trim()).filter(Boolean);
const okolica = (z) => (z.region ? z.region : "–");
const liczPo = (tab, f) => { const m = new Map(); for (const e of tab) { const k = f(e); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pl")); };
const regionDlaZ = (z) => (regiony || []).find((r) => (r.dopasuj || []).some((d) => czlony(z).includes(d)));
const wRegionie = (r) => zDanymi.filter((z) => regionDlaZ(z) === r);
const hashMapyKat = (id) => `/#k=${encodeURIComponent(id)}`;
const linkZnacznika = (z) => (katPoId.get(z.kategoria).bezStron ? `/#z=${encodeURIComponent(z.id)}` : `/znaczniki/${z.id}.html`);
const gtadb = (tab) => tab.some((z) => z.zrodlo === "gtadb");
const ostrzezenie = `<p class="stan">Uwaga: przed premierą 19.11.2026 położenie i nazwy punktów z GTADB są niepotwierdzone. Społeczność zidentyfikowała je na podstawie zwiastunów, więc w grze mogą się różnić. Po premierze porównamy dane z grą i poprawimy to, co się nie zgadza. Pole „Odpowiednik” to dopasowanie społeczności do prawdziwego miejsca, nie informacja od Rockstar.</p>`;
const wierszeTabeli = (tab, kolumny) => tab.slice().sort(sortPl).map((z) => {
  const komorki = kolumny.map((k) => {
    if (k === "nazwa") return katPoId.get(z.kategoria).bezStron ? `<td>${esc(z.nazwa)}</td>` : `<td><a href="${linkZnacznika(z)}">${esc(z.nazwa)}</a></td>`;
    if (k === "kategoria") return `<td>${esc(katPoId.get(z.kategoria).nazwa)}</td>`;
    if (k === "okolica") return `<td>${esc(okolica(z))}</td>`;
    if (k === "odpowiednik") return `<td>${esc(z.odpowiednik || "–")}</td>`;
    return `<td><a href="/#z=${encodeURIComponent(z.id)}">Na mapie</a></td>`;
  });
  return `        <tr>${komorki.join("")}</tr>`;
}).join("\n");
const naglowkiTabeli = { nazwa: "Nazwa", kategoria: "Kategoria", okolica: "Okolica", odpowiednik: "Odpowiednik", mapa: "Mapa" };
const tabela = (tab, kolumny) => `    <table>
      <thead><tr>${kolumny.map((k) => `<th scope="col">${naglowkiTabeli[k]}</th>`).join("")}</tr></thead>
      <tbody>
${wierszeTabeli(tab, kolumny)}
      </tbody>
    </table>`;
const zOdp = (tab) => tab.filter((z) => z.odpowiednik).length;

await mkdir(join(OUT, "kategorie"), { recursive: true });
const kategorieZeStrona = kategorie.filter((k) => zDanymi.filter((z) => z.kategoria === k.id).length >= MIN_STRONA);
for (const kat of kategorieZeStrona) {
  const pozycje = zDanymi.filter((z) => z.kategoria === kat.id);
  const okolice = liczPo(pozycje, (z) => z.region);
  const wRegionach = liczPo(pozycje, (z) => regionDlaZ(z)?.nazwa);
  const poza = pozycje.filter((z) => !regionDlaZ(z)).length;
  const inneKat = kategorieZeStrona.filter((k) => k.id !== kat.id);
  const sciezka = `kategorie/${kat.id}.html`;
  const sciezkaOkr = [["/", "Mapa"], ["/kategorie/", "Kategorie"], [null, kat.nazwa]];
  const nazwaMala = kat.nazwa.toLowerCase();
  const tresc = `${okruszki(...sciezkaOkr)}
    <h1>GTA 6: ${esc(nazwaMala)} – mapa i lista (${pozycje.length})</h1>
    <p>${esc(kat.opis || "")}</p>
    <p>Na mapie ViceMap jest ${punktow(pozycje.length)} z tej kategorii${okolice.length ? `, rozmieszczonych w ${okolice.length} ${plKolacja(okolice.length, "okolicy", "okolicach", "okolicach")}` : ""}. Najwięcej w okolicach: ${okolice.slice(0, 3).map(([n, c]) => `${esc(n)} (${c})`).join("; ")}.${wRegionach.length ? ` Wśród sześciu regionów Leonidy: ${wRegionach.map(([n, c]) => `${esc(n)} (${c})`).join(", ")}${poza ? `. Reszta (${poza}) leży w innych hrabstwach i dzielnicach, których nie przypisaliśmy do żadnego z tych regionów` : ""}.` : ""}${zOdp(pozycje) ? ` ${zOdp(pozycje) === pozycje.length ? `Dla wszystkich ${pozycje.length} punktów` : `Dla ${zOdp(pozycje)} z ${pozycje.length} punktów`} społeczność GTADB wskazała prawdziwy odpowiednik, np. ${esc(pozycje.find((z) => z.odpowiednik).odpowiednik)}.` : ""}</p>
${gtadb(pozycje) ? `    ${ostrzezenie}\n` : ""}    <h2>Jak korzystać z mapy</h2>
    <p>Przycisk poniżej otwiera mapę z włączoną wyłącznie tą kategorią. Kliknij pinezkę, żeby zobaczyć nazwę, okolicę i pewność danych, oznacz miejsce jako zaliczone albo dodaj je do ulubionych. Postęp i notatki zapisują się wyłącznie w Twojej przeglądarce. Błąd w danych możesz <a href="/zglos.html">zgłosić w formularzu</a>.</p>
    <p><a class="przycisk przycisk--glowny" href="${hashMapyKat(kat.id)}">Pokaż na mapie</a></p>
    <h2>Lista miejsc (${pozycje.length})</h2>
${tabela(pozycje, ["nazwa", "okolica", "odpowiednik", "mapa"])}
    <h2>Inne kategorie</h2>
    <ul>
${inneKat.map((k) => `      <li><a href="/kategorie/${k.id}.html">${esc(k.nazwa)}</a></li>`).join("\n")}
      <li><a href="/kategorie/">Wszystkie kategorie</a></li>
    </ul>
    <p class="zrodla">Zobacz też <a href="/poradniki/">poradniki do GTA 6</a>, <a href="/poradniki/regiony.html">opis regionów Leonidy</a> i <a href="/o-projekcie.html">skąd mamy dane</a>.</p>`;
  const opisMeta = skroc(`${kat.nazwa} w GTA 6: ${punktow(pozycje.length)} z okolicą${zOdp(pozycje) ? " i prawdziwym odpowiednikiem" : ""} na mapie po polsku. Dane GTADB (CC BY 4.0), niepotwierdzone przed premierą.`, 155);
  await writeFile(join(OUT, sciezka), strona({
    sciezka, tytul: tytulDo60(`GTA 6: ${nazwaMala} – lista i mapa | ViceMap`, `GTA 6: ${nazwaMala} – lista i mapa`, `${kat.nazwa} w GTA 6`),
    opis: opisMeta, tresc, typOg: "website",
    ld: { "@context": "https://schema.org", "@graph": [
      { "@type": "CollectionPage", name: `GTA 6 – ${kat.nazwa}`, inLanguage: "pl", url: DOMENA + "/" + sciezka, description: opisMeta },
      { "@type": "ItemList", numberOfItems: pozycje.length, itemListElement: pozycje.map((z, i) => ({ "@type": "ListItem", position: i + 1, name: z.nazwa })) },
      breadcrumbLd(sciezkaOkr.map(([h, t]) => [h || "/" + sciezka, t]))
    ] }
  }));
  wygenerowane.push(sciezka);
}

// Spis kategorii (/kategorie/)
{
  const sciezka = "kategorie/index.html";
  const sciezkaOkr = [["/", "Mapa"], [null, "Kategorie"]];
  const opisMeta = "Kategorie miejsc na mapie GTA 6: sklepy, jedzenie, hotele, transport, służby i inne, z liczbą punktów. Wszystko po polsku, dane społeczności GTADB.";
  const wiersze = kategorie.map((k) => ({ k, n: zDanymi.filter((z) => z.kategoria === k.id).length })).filter((e) => !e.k.spoiler);
  const tresc = `${okruszki(...sciezkaOkr)}
    <h1>GTA 6: kategorie miejsc na mapie</h1>
    <p>ViceMap dzieli miejsca z Leonidy na kategorie. Poniżej lista z liczbą punktów według stanu na ${DZIS_PL}. Kategorie bez punktów (kryjówki, znajdźki i inne) uzupełnimy po premierze, gdy będzie można sprawdzić je w grze. Dane z GTADB są niepotwierdzone przed premierą 19.11.2026.</p>
    <ul>
${wiersze.map(({ k, n }) => `      <li>${n >= MIN_STRONA ? `<a href="/kategorie/${k.id}.html">${esc(k.nazwa)}</a>` : esc(k.nazwa)} – ${n ? punktow(n) : "jeszcze brak punktów"}${n && n < MIN_STRONA ? ` (<a href="${hashMapyKat(k.id)}">zobacz na mapie</a>)` : ""}</li>`).join("\n")}
    </ul>
    <p><a class="przycisk przycisk--glowny" href="/">Otwórz mapę</a></p>
    <p class="zrodla">Zobacz też <a href="/poradniki/regiony.html">regiony Leonidy</a> i <a href="/o-projekcie.html">źródła danych</a>.</p>`;
  await writeFile(join(OUT, sciezka), strona({
    sciezka, tytul: "GTA 6: kategorie miejsc na mapie | ViceMap", opis: opisMeta, tresc, typOg: "website",
    ld: { "@context": "https://schema.org", "@graph": [
      { "@type": "CollectionPage", name: "GTA 6 – kategorie miejsc", inLanguage: "pl", url: DOMENA + "/kategorie/", description: opisMeta },
      { "@type": "ItemList", itemListElement: wiersze.filter((e) => e.n >= MIN_STRONA).map(({ k }, i) => ({ "@type": "ListItem", position: i + 1, name: k.nazwa, url: `${DOMENA}/kategorie/${k.id}.html` })) },
      breadcrumbLd(sciezkaOkr.map(([h, t]) => [h || "/kategorie/", t]))
    ] }
  }));
  wygenerowane.push(sciezka);
}

// Strony regionów: tylko region z listą punktów; poniżej MIN_STRONA punktów strona ma noindex i nie trafia do sitemap.
const regionySitemap = [];
await mkdir(join(OUT, "regiony"), { recursive: true });
for (const r of regiony || []) {
  const pozycje = wRegionie(r);
  const indeks = pozycje.length >= MIN_STRONA;
  const sciezka = `regiony/${r.id}.html`;
  const sciezkaOkr = [["/", "Mapa"], ["/poradniki/regiony.html", "Regiony"], [null, r.nazwa]];
  const kategoriaLicz = liczPo(pozycje, (z) => katPoId.get(z.kategoria).nazwa);
  const okolice = liczPo(pozycje, (z) => z.region);
  const inneReg = (regiony || []).filter((x) => x.id !== r.id);
  const hash = `/#v=${r.x},${r.y},1`;
  const opisMeta = skroc(`${r.nazwa} – region w GTA 6. ${r.opis || "Region stanu Leonida."} ${pozycje.length ? `Mapa i lista miejsc: ${punktow(pozycje.length)}, po polsku.` : "Położenie na mapie ViceMap, po polsku."}`, 155);
  const tresc = `${okruszki(...sciezkaOkr)}
    <h1>GTA 6: ${esc(r.nazwa)} – region na mapie${pozycje.length ? ` i lista miejsc (${pozycje.length})` : ""}</h1>
    <p class="stan">Stan na ${DZIS_PL}. Rockstar nie opublikował pełnej mapy, więc granice regionów poznamy dopiero po premierze 19.11.2026.</p>
    ${r.opis ? `<p>${esc(r.opis)} Rockstar zalicza ${esc(r.nazwa)} do sześciu regionów stanu Leonida (<a href="/poradniki/regiony.html">wszystkie regiony</a>).</p>` : ""}
    <p>Środek regionu na naszej mapie to punkt wyznaczony przez ViceMap, nie oficjalna granica. Źródło: ${esc(r.zrodlo || "dane ViceMap")}.</p>
${pozycje.length ? `    <p>Do regionu przypisaliśmy ${punktow(pozycje.length)} z mapy, rozmieszczonych w ${okolice.length} ${plKolacja(okolice.length, "okolicy", "okolicach", "okolicach")} (najwięcej: ${okolice.slice(0, 3).map(([n, c]) => `${esc(n)} (${c})`).join("; ")}). Według kategorii: ${kategoriaLicz.map(([n, c]) => `${esc(n)} (${c})`).join(", ")}. Punkty przypisujemy do regionu po nazwie okolicy z gry, którą podaje GTADB (${esc((r.dopasuj || []).join(", "))}), dlatego punkty z sąsiednich dzielnic mogą nie trafić na tę listę.</p>
${gtadb(pozycje) ? `    ${ostrzezenie}\n` : ""}` : `    <p>Na mapie nie ma jeszcze punktów przypisanych do tego regionu. Pojawią się po premierze, gdy sprawdzimy je w grze.</p>
`}    <p><a class="przycisk przycisk--glowny" href="${hash}">Pokaż na mapie</a></p>
${pozycje.length ? `    <h2>Lista miejsc (${pozycje.length})</h2>
${tabela(pozycje, ["nazwa", "kategoria", "okolica", "odpowiednik", "mapa"])}
` : ""}    <h2>Pozostałe regiony</h2>
    <ul>
${inneReg.map((x) => `      <li>${wRegionie(x).length >= MIN_STRONA ? `<a href="/regiony/${x.id}.html">${esc(x.nazwa)}</a>` : `<a href="/#v=${x.x},${x.y},1">${esc(x.nazwa)} (na mapie)</a>`}</li>`).join("\n")}
    </ul>
    <p class="zrodla">Zobacz też <a href="/kategorie/">kategorie miejsc</a>, <a href="/poradniki/regiony.html">poradnik po regionach</a> i <a href="/o-projekcie.html">źródła danych</a>.</p>`;
  await writeFile(join(OUT, sciezka), strona({
    sciezka, tytul: tytulDo60(`GTA 6: ${r.nazwa} – region, mapa i lista | ViceMap`, `GTA 6: ${r.nazwa} – region i mapa`, `${r.nazwa} w GTA 6`),
    opis: opisMeta, tresc, typOg: "website", noindex: !indeks,
    ld: { "@context": "https://schema.org", "@graph": [
      { "@type": "CollectionPage", name: `GTA 6 – ${r.nazwa}`, inLanguage: "pl", url: DOMENA + "/" + sciezka, description: opisMeta },
      ...(pozycje.length ? [{ "@type": "ItemList", numberOfItems: pozycje.length, itemListElement: pozycje.slice().sort(sortPl).map((z, i) => ({ "@type": "ListItem", position: i + 1, name: z.nazwa })) }] : []),
      breadcrumbLd(sciezkaOkr.map(([h, t]) => [h || "/" + sciezka, t]))
    ] }
  }));
  wygenerowane.push(sciezka);
  if (indeks) regionySitemap.push(sciezka);
}

// Dziennik zmian z data/zmiany.json
let dziennikAdres = null;
if (Array.isArray(zmiany) && zmiany.length) {
  dziennikAdres = "dziennik-zmian.html";
  const sciezkaOkr = [["/", "Mapa"], [null, "Dziennik zmian"]];
  const opisMeta = "Dziennik zmian ViceMap: co dodaliśmy do mapy GTA 6 i poradników, od najnowszych wpisów. Nieoficjalna strona fanowska, dane społeczności GTADB.";
  const tresc = `${okruszki(...sciezkaOkr)}
    <h1>Dziennik zmian ViceMap</h1>
    <p>Co zmieniło się na mapie i w poradnikach, od najnowszych wpisów. Ostatnia zmiana: ${esc(zmiany[0].data)}. Skąd mamy dane, opisujemy w <a href="/o-projekcie.html">O projekcie i źródłach danych</a>.</p>
${zmiany.map((w) => `    <article>
      <h2>${esc(w.tytul)}</h2>
      <p class="stan"><time datetime="${esc(w.data)}">${esc(w.data.split("-").reverse().join("."))}</time></p>
      <p>${esc(w.opis)}</p>
    </article>`).join("\n")}
    <p><a class="przycisk przycisk--glowny" href="/">Otwórz mapę</a></p>`;
  await writeFile(join(OUT, dziennikAdres), strona({
    sciezka: dziennikAdres, tytul: "Dziennik zmian | ViceMap", opis: opisMeta, tresc, typOg: "website",
    ld: { "@context": "https://schema.org", "@graph": [
      { "@type": "CollectionPage", name: "Dziennik zmian ViceMap", inLanguage: "pl", url: DOMENA + "/" + dziennikAdres, description: opisMeta, dateModified: zmiany[0].data },
      breadcrumbLd(sciezkaOkr.map(([h, t]) => [h || "/" + dziennikAdres, t]))
    ] }
  }));
}

// Strona główna: sekcja z danymi między znacznikami <!-- BUILD:glowna --> (tylko gdy budujemy w repo).
if (OUT === ROOT && existsSync(join(ROOT, "index.html"))) {
  const indeksHtml = (await readFile(join(ROOT, "index.html"), "utf8")).replace(/\r\n/g, "\n");
  const poczatek = "<!-- BUILD:glowna -->", koniec = "<!-- /BUILD:glowna -->";
  if (indeksHtml.includes(poczatek) && indeksHtml.includes(koniec)) {
    const NAJNOWSZE = ["gta-6-checklista-przed-premiera", "gta-6-faq", "premiera", "preload-i-rozmiar", "ceny-i-edycje"];
    const poradniki = [];
    for (const slug of NAJNOWSZE) {
      const p = join(ROOT, "poradniki", slug + ".html");
      if (!existsSync(p)) { console.error(`Strona główna: brak poradnika poradniki/${slug}.html (lista NAJNOWSZE w build.mjs).`); process.exit(1); }
      poradniki.push([slug, /<h1[^>]*>([^<]+)<\/h1>/.exec(await readFile(p, "utf8"))?.[1]?.trim() || slug]);
    }
    const blok = `${poczatek}
    <h2>Co to jest ViceMap</h2>
    <p>ViceMap to nieoficjalna, polskojęzyczna mapa GTA 6, zbudowana na otwartych danych społeczności GTADB (CC BY 4.0). Na mapie jest ${zDanymi.length} ${plKolacja(zDanymi.length, "miejsce", "miejsca", "miejsc")} z Leonidy, z okolicą i prawdziwym odpowiednikiem tam, gdzie społeczność go wskazała. Przed premierą 19.11.2026 położenie punktów jest niepotwierdzone: po premierze porównamy je z grą. <a href="/o-projekcie.html">Skąd mamy dane i jak oznaczamy pewność</a> · <a href="/dziennik-zmian.html">Dziennik zmian</a>.</p>
    <h2>Kategorie miejsc</h2>
    <ul class="lista-poradnikow">
${kategorie.filter((k) => !k.spoiler).map((k) => ({ k, n: zDanymi.filter((z) => z.kategoria === k.id).length })).filter((e) => e.n).map(({ k, n }) => `      <li>${n >= MIN_STRONA ? `<a href="/kategorie/${k.id}.html">${esc(k.nazwa)}</a>` : `<a href="${hashMapyKat(k.id)}">${esc(k.nazwa)}</a>`} – ${punktow(n)}</li>`).join("\n")}
      <li><a href="/kategorie/">Wszystkie kategorie</a></li>
    </ul>
    <h2>Regiony Leonidy</h2>
    <ul class="lista-poradnikow">
${(regiony || []).map((r) => `      <li>${wRegionie(r).length >= MIN_STRONA ? `<a href="/regiony/${r.id}.html">${esc(r.nazwa)}</a> – ${punktow(wRegionie(r).length)}` : `<a href="/#v=${r.x},${r.y},1">${esc(r.nazwa)}</a> – pokaż na mapie`}</li>`).join("\n")}
      <li><a href="/poradniki/regiony.html">Opis wszystkich regionów</a></li>
    </ul>
    <h2>Najnowsze poradniki</h2>
    <ul class="lista-poradnikow">
${poradniki.map(([slug, t]) => `      <li><a href="/poradniki/${slug}.html">${esc(t)}</a></li>`).join("\n")}
      <li><a href="/poradniki/">Wszystkie poradniki</a></li>
    </ul>
    ${koniec}`;
    const nowy = indeksHtml.slice(0, indeksHtml.indexOf(poczatek)) + blok + indeksHtml.slice(indeksHtml.indexOf(koniec) + koniec.length);
    if (nowy !== indeksHtml) await writeFile(join(ROOT, "index.html"), nowy);
  }
}

// --- Sprzątanie stron po usuniętych znacznikach i kategoriach ---
for (const folder of ["znaczniki", "kategorie", "regiony"]) {
  for (const plik of await readdir(join(OUT, folder))) {
    if (plik.endsWith(".html") && !wygenerowane.includes(`${folder}/${plik}`)) {
      await rm(join(OUT, folder, plik));
      console.log("Usunięto nieaktualną stronę:", `${folder}/${plik}`);
    }
  }
}

// --- sitemap.xml: strony ręczne (bez noindex) + wygenerowane ---
const reczne = ["", "poradniki/", "zglos.html"];
if (existsSync(join(ROOT, "o-projekcie.html"))) reczne.push("o-projekcie.html");
if (dziennikAdres) reczne.push(dziennikAdres);
for (const plik of (await readdir(join(ROOT, "poradniki"))).sort()) {
  if (!plik.endsWith(".html") || plik === "index.html") continue;
  const html = await readFile(join(ROOT, "poradniki", plik), "utf8");
  if (!/name="robots"[^>]*noindex/.test(html)) reczne.push("poradniki/" + plik);
}
const adresy = [...reczne, ...wygenerowane.filter((a) => !a.startsWith("regiony/") || regionySitemap.includes(a))].map((a) => (a === "kategorie/index.html" ? "kategorie/" : a));
await writeFile(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${adresy.map((a) => `  <url><loc>${DOMENA}/${a}</loc><lastmod>${DZIS}</lastmod></url>`).join("\n")}
</urlset>
`);

const przyklady = znaczniki.length - znaczniki.filter((z) => !z.przyklad).length;
console.log(`OK: ${znaczniki.length} znaczników (${przyklady} przykładowych), ${wygenerowane.length} stron wygenerowanych, ${adresy.length} adresów w sitemap.xml.`);
if (existsSync(join(ROOT, "sw.js"))) console.log("Pamiętaj: po zmianie plików statycznych podbij WERSJA w sw.js.");
