// Test szablonu i walidacji: node scripts/test-szablon.mjs
// Tworzy KOPIĘ danych w katalogu tymczasowym (zmyślone wpisy tylko na test, nic nie trafia do repo),
// buduje strony i sprawdza meta, JSON-LD, linki wewnętrzne i walidację. Kod wyjścia != 0 przy porażce.
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(ROOT, "scripts/build.mjs");
const tmp = await mkdtemp(join(tmpdir(), "vicemap-test-"));
const dane = join(tmp, "data"), wyj = join(tmp, "out");
const { mkdir } = await import("node:fs/promises");
await mkdir(dane); await mkdir(wyj);

const kat = JSON.parse(await readFile(join(ROOT, "data/kategorie.json"), "utf8"));
for (const k of kat) delete k.bezStron;
const dlugi = "To jest bardzo długi, zmyślony opis testowy, który ma przekroczyć limit meta description i musi zostać ucięty na granicy słowa, a nie w środku wyrazu. Drugie zdanie dopełnia całość.";
const z = (id, kategoria, nazwa, x, y, opis = "Zmyślony wpis testowy – kryjówka z widokiem na zatokę, tylko na potrzeby testu.", region = "Test County") => ({ id, kategoria, nazwa, opis, x, y, region });
const prawdziwe = JSON.parse(await readFile(join(ROOT, "data/znaczniki.json"), "utf8"));
const znaczniki = [
  ...prawdziwe,
  z("test-kryjowka-1", "kryjowki", "Kryjówka testowa jeden", 1000, 1000),
  z("test-kryjowka-2", "kryjowki", "Kryjówka testowa dwa z bardzo długą nazwą, która nie mieści się w tytule", 1100, 1050, dlugi),
  z("test-kryjowka-3", "kryjowki", "Kryjówka testowa trzy", 1500, 1500),
  z("test-kryjowka-4", "kryjowki", "Kryjówka testowa cztery", 1600, 1600),
  z("test-sklep-1", "sklepy", "Sklep testowy", 1020, 1010),
  z("test-sklep-2", "sklepy", "Drugi sklep testowy", 2000, 2000),
  z("test-bron-1", "bron", "Sklep z bronią testowy", 1200, 1200),
  z("test-bron-2", "bron", "Drugi sklep z bronią testowy", 2500, 2500),
  z("test-przyklad", "sklepy", "Przykład nie dostaje strony", 300, 300),
  z("test-gtadb", "kryjowki", "Kryjówka z GTADB", 1300, 1300),
  // Pary do ostrzeżeń o duplikatach (poza zasięgiem innych znaczników): różne nazwy = cisza, ta sama nazwa / te same x,y = ostrzeżenie.
  z("test-pasaz-a", "sklepy", "Pasaż Kwiaty", 2900, 4300), z("test-pasaz-b", "sklepy", "Pasaż Buty", 2903, 4300),
  z("test-dup-a", "sklepy", "Café Łódź (1)", 2950, 4300), z("test-dup-b", "sklepy", "Cafe lodz 2", 2954, 4300),
  z("test-dup-c", "sklepy", "Zupełnie Inny", 3000, 4300), z("test-dup-d", "sklepy", "Zupełnie Inna Nazwa", 3000, 4300),
];
znaczniki.find((m) => m.id === "test-przyklad").przyklad = true;
Object.assign(znaczniki.find((m) => m.id === "test-gtadb"), { zrodlo: "gtadb", odpowiednik: 'Ocean <b>Drive</b> & "Co", Miami' });
const regiony = [{ id: "test-region", nazwa: "Region testowy", x: 100, y: 100, zrodlo: "test", opis: "Zmyślony region testowy.", dopasuj: ["Test County"] }, { id: "test-pusty", nazwa: "Region pusty", x: 200, y: 200, zrodlo: "test", opis: "Zmyślony region bez punktów.", dopasuj: [] }];
const zmiany = [{ data: "2026-11-13", tytul: "Nowszy wpis testowy", opis: "Zmyślony wpis dziennika zmian, tylko na potrzeby testu szablonu." }, { data: "2026-11-12", tytul: "Starszy wpis testowy", opis: "Drugi zmyślony wpis dziennika zmian, tylko na potrzeby testu szablonu." }];
await writeFile(join(dane, "kategorie.json"), JSON.stringify(kat, null, 1));
await writeFile(join(dane, "znaczniki.json"), JSON.stringify(znaczniki, null, 1));
await writeFile(join(dane, "regiony.json"), JSON.stringify(regiony));
await writeFile(join(dane, "zmiany.json"), JSON.stringify(zmiany));

const uruchom = () => spawnSync(process.execPath, [BUILD], { encoding: "utf8", env: { ...process.env, VICEMAP_DANE: dane, VICEMAP_WYJSCIE: wyj } });
let porazki = 0;
const ok = (warunek, opis) => { if (!warunek) { porazki++; console.error("BŁĄD:", opis); } };

const r = uruchom();
ok(r.status === 0, "build na poprawnych danych: " + r.stderr);
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
const pZn = await readdir(join(wyj, "znaczniki")), pKat = await readdir(join(wyj, "kategorie"));
const pReg = await readdir(join(wyj, "regiony"));
const pliki = [...pZn.map((p) => "znaczniki/" + p), ...pKat.map((p) => "kategorie/" + p), ...pReg.map((p) => "regiony/" + p), "dziennik-zmian.html"];
const spoilery = new Set(kat.filter((k) => k.spoiler).map((k) => k.id));
const publ = znaczniki.filter((m) => !m.przyklad && !spoilery.has(m.kategoria));
const MIN = 5; // zgodnie z MIN_STRONA w build.mjs
const oczekKat = new Set(publ.map((m) => m.kategoria).filter((id) => publ.filter((m) => m.kategoria === id).length >= MIN)).size + 1; // + kategorie/index.html
ok(pZn.length === publ.length && pKat.length === oczekKat && !pZn.includes("test-przyklad.html"), `liczba stron (${pZn.length} znaczników, oczekiwano ${publ.length}; ${pKat.length} kategorii, oczekiwano ${oczekKat}) lub strona przykładu`);

const sprawdz = async (rel) => {
  const html = await readFile(join(wyj, rel), "utf8");
  const dek = (t) => t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const tytul = dek(/<title>(.*?)<\/title>/.exec(html)?.[1] || "");
  const opis = dek(/<meta name="description" content="(.*?)"/.exec(html)?.[1] || "");
  ok(tytul && tytul.length <= 60, `${rel}: title ${tytul.length} znaków: ${tytul}`);
  ok(opis && opis.length <= 160, `${rel}: description ${opis.length} znaków`);
  ok(!/…\.|\.\.\.|……/.test(opis + html), `${rel}: przycięty tekst z "…."`);
  ok(html.includes(`<link rel="canonical" href="https://vicemap.pl/${rel.replace(/index\.html$/, "")}">`), `${rel}: canonical`);
  ok(html.includes("map.gtadb.org") && html.includes("CC BY 4.0"), `${rel}: atrybucja GTADB w stopce`);
  ok(/<h1>/.test(html) && /class="okruszki"/.test(html), `${rel}: h1 / okruszki`);
  const ld = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)?.[1];
  try { const o = JSON.parse(ld); ok(o["@graph"]?.some((e) => e["@type"] === "BreadcrumbList"), `${rel}: JSON-LD bez BreadcrumbList`); } catch { ok(false, `${rel}: JSON-LD nie jest poprawnym JSON`); }
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (/^(https?:|#|mailto:)/.test(href)) continue;
    const sciezka = decodeURIComponent(href.split(/[#?]/)[0]);
    const cel = sciezka.endsWith("/") ? sciezka + "index.html" : sciezka;
    if (!cel) continue;
    ok(existsSync(join(wyj, cel)) || existsSync(join(ROOT, cel)), `${rel}: martwy href ${href}`);
  }
  return html;
};
for (const p of pliki) await sprawdz(p);

const s2 = await readFile(join(wyj, "znaczniki/test-kryjowka-2.html"), "utf8");
ok(s2.includes('href="/znaczniki/test-kryjowka-1.html"') && s2.includes('rel="prev"') && s2.includes('rel="next"'), "poprzedni/następny w kategorii");
ok(s2.includes('href="/#z=test-kryjowka-2"') && s2.includes('href="/kategorie/kryjowki.html"') && s2.includes('id="mini-mapa"'), "link do mapy / kategorii / mini-mapa");
ok(s2.includes("Test County"), "pokrewne w regionie (sklep)");
const kk = await readFile(join(wyj, "kategorie/kryjowki.html"), "utf8");
ok(kk.includes("<table>") && kk.includes('href="/znaczniki/test-kryjowka-3.html"'), "lista na stronie kategorii");
ok(existsSync(join(wyj, "kategorie/orientacyjne.html")), "kategoria orientacyjne (bez bezStron) ma stronę");
ok(!existsSync(join(wyj, "kategorie/bron.html")), "kategoria z mniej niż 5 punktami nie ma strony");
ok(kk.includes('href="/#k=kryjowki"') && kk.includes("niepotwierdzone"), "strona kategorii: link do mapy z filtrem i ostrzeżenie o pewności");
ok(/<script type="application\/ld\+json">[^<]*"ItemList"/.test(kk), "strona kategorii: ItemList w JSON-LD");
const spis = await readFile(join(wyj, "kategorie/index.html"), "utf8");
ok(spis.includes('href="/kategorie/kryjowki.html"') && !spis.includes('href="/kategorie/bron.html"') && spis.includes('href="/#k=bron"'), "spis kategorii: linki do stron i do mapy dla małych kategorii");

// Regiony: strona z punktami jest indeksowana, pusta ma noindex; dziennik zmian; sitemap
const rg = await readFile(join(wyj, "regiony/test-region.html"), "utf8");
ok(!rg.includes("noindex") && rg.includes('href="/#v=100,100,1"') && rg.includes("<table>") && rg.includes("Test County"), "strona regionu z punktami");
const rp = await readFile(join(wyj, "regiony/test-pusty.html"), "utf8");
ok(rp.includes('content="noindex,follow"') && !rp.includes("<table>"), "pusty region: noindex i brak tabeli");
const dz = await readFile(join(wyj, "dziennik-zmian.html"), "utf8");
ok(dz.indexOf("Nowszy wpis testowy") > 0 && dz.indexOf("Nowszy wpis testowy") < dz.indexOf("Starszy wpis testowy") && dz.includes('datetime="2026-11-13"'), "dziennik zmian: kolejność i data");
const mapa = await readFile(join(wyj, "sitemap.xml"), "utf8");
ok(mapa.includes("/regiony/test-region.html") && !mapa.includes("/regiony/test-pusty.html") && mapa.includes("/kategorie/</loc>") && mapa.includes("/dziennik-zmian.html"), "sitemap: regiony z punktami, spis kategorii, dziennik; bez pustego regionu");
for (const p of ["kategorie/index.html", "dziennik-zmian.html"]) ok(/href="\/o-projekcie\.html">O projekcie i źródłach danych/.test(await readFile(join(wyj, p), "utf8")), p + ": stopka z linkiem O projekcie");

// (d) Pewność i odpowiednik na stronie znacznika (escapowane); zwykły znacznik bez tych linii
const sg = await readFile(join(wyj, "znaczniki/test-gtadb.html"), "utf8");
ok(sg.includes("Pewność: zidentyfikowane przez społeczność GTADB, niepotwierdzone przed premierą"), "strona gtadb: brak linii Pewność");
ok(sg.includes("Prawdziwy odpowiednik: Ocean &lt;b&gt;Drive&lt;/b&gt; &amp; &quot;Co&quot;, Miami") && !sg.includes("<b>Drive"), "strona gtadb: odpowiednik niezescapowany");
ok(!s2.includes("Pewność:") && !s2.includes("Prawdziwy odpowiednik"), "zwykły znacznik nie powinien mieć linii Pewność/odpowiednik");

// (a) ostrzeżenia o duplikatach: tylko ta sama (prawie) nazwa albo identyczne x,y
const ostrz = r.stderr;
ok(!ostrz.includes("test-pasaz-a") && !ostrz.includes("test-pasaz-b"), "różne lokale w pasażu nie powinny dawać ostrzeżenia");
ok(/"test-dup-a".*"test-dup-b".*tę samą nazwę/.test(ostrz), "brak ostrzeżenia dla tej samej nazwy (bez wielkości liter, ogonków, nawiasów i cyfr na końcu)");
ok(/"test-dup-c".*"test-dup-d".*identyczne współrzędne/.test(ostrz), "brak ostrzeżenia dla identycznych x,y");
ok(/przykładowy/.test(ostrz), "brak ostrzeżenia o znaczniku przykładowym");

// Walidacja: wszystkie błędy naraz, kod != 0
const zle = [
  z("Zły ID", "kryjowki", "", 1, 1, "krótki"), z("test-kryjowka-1", "nie-ma", "Nazwa", 99999, -5),
  z("test-kryjowka-1", "bron", "Duplikat id", 5, 5), { id: "bez-xy", kategoria: "bron", nazwa: "x", opis: "Opis bez współrzędnych, długi na tyle by przejść.", x: "1", y: 2 },
];
await writeFile(join(dane, "znaczniki.json"), JSON.stringify(zle));
const rz = uruchom();
ok(rz.status !== 0, "walidacja powinna zwrócić kod != 0");
for (const fragment of ["niepoprawne id", "brak nazwy", "zbyt krótki", "nieznana kategoria", "poza mapą", "id powtórzone", "muszą być liczbami"]) ok(rz.stderr.includes(fragment), `walidacja: brak komunikatu "${fragment}"`);

// (b) opcjonalne pola znacznika
const dobry = z("test-ok", "kryjowki", "Dobry", 10, 10);
const zleOpt = [
  { ...dobry, id: "o-1", odpowiednik: "" }, { ...dobry, id: "o-2", odpowiednik: "x".repeat(151) }, { ...dobry, id: "o-3", odpowiednik: 5 },
  { ...dobry, id: "o-4", zrodlo: "wikipedia" }, { ...dobry, id: "o-5", region: 7 },
  { ...dobry, id: "o-ok", odpowiednik: "Miami", zrodlo: "gtadb" },
];
await writeFile(join(dane, "znaczniki.json"), JSON.stringify(zleOpt));
const rb = uruchom();
ok(rb.status !== 0, "złe pola odpowiednik/zrodlo/region powinny zatrzymać build");
ok((rb.stderr.match(/"odpowiednik" musi być/g) || []).length === 3, "odpowiednik: oczekiwano 3 błędów (pusty, za długi, nie tekst)");
ok(rb.stderr.includes('nieznane "zrodlo"') && rb.stderr.includes('"region" musi być tekstem') && !rb.stderr.includes(`pozycja 6 ("o-ok")`), "zrodlo/region: komunikaty lub fałszywy błąd dla poprawnego wpisu");

// zmiany.json: walidacja
await writeFile(join(dane, "znaczniki.json"), JSON.stringify([dobry]));
const zleZm = [{ data: "2026-11-01", tytul: "Starszy", opis: "Opis wystarczająco długi, żeby przejść walidację długości." }, { data: "2026-11-05", tytul: "Nowszy po starszym", opis: "krótki" }, { data: "2026-13-45", tytul: "Zła data", opis: "Opis wystarczająco długi, żeby przejść walidację długości." }];
await writeFile(join(dane, "zmiany.json"), JSON.stringify(zleZm));
const rzm = uruchom();
ok(rzm.status !== 0 && rzm.stderr.includes("poprawną datą") && rzm.stderr.includes("od najnowszego") && rzm.stderr.includes('"opis" ma mieć'), "zmiany.json: walidacja daty, kolejności i opisu");
await writeFile(join(dane, "zmiany.json"), JSON.stringify(zmiany));

// (c) regiony.json
await writeFile(join(dane, "znaczniki.json"), JSON.stringify([dobry]));
const zleReg = [
  { id: "Zły Id", nazwa: "A", x: 1, y: 1 }, { id: "r-1", nazwa: "", x: 1, y: 1 }, { id: "r-2", nazwa: "B", x: "1", y: 1 },
  { id: "r-3", nazwa: "C", x: 99999, y: 1 }, { id: "r-3", nazwa: "D", x: 1, y: 1 }, { id: "r-ok", nazwa: "E", x: 1, y: 1 },
];
await writeFile(join(dane, "regiony.json"), JSON.stringify(zleReg));
const rr = uruchom();
ok(rr.status !== 0, "złe regiony powinny zatrzymać build");
for (const fragment of ["regiony.json, pozycja 1", "niepoprawne id", "brak nazwy", "muszą być liczbami", "poza mapą", "id powtórzone"]) ok(rr.stderr.includes(fragment), `regiony: brak komunikatu "${fragment}"`);
ok(!rr.stderr.includes(`pozycja 6 ("r-ok")`), "regiony: fałszywy błąd dla poprawnego wpisu");
await writeFile(join(dane, "regiony.json"), JSON.stringify({ id: "a" }));
ok(uruchom().stderr.includes("oczekiwana tablica"), "regiony: obiekt zamiast tablicy");
await writeFile(join(dane, "regiony.json"), JSON.stringify(regiony));
ok(uruchom().status === 0, "poprawny regiony.json nie powinien blokować builda");

console.log(porazki ? `\nNie przeszło: ${porazki} problemów. Pliki testowe: ${tmp}` : `Test szablonu i walidacji: OK (${pliki.length} stron, katalog tymczasowy ${tmp})`);
process.exit(porazki ? 1 : 0);
