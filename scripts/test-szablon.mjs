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
const znaczniki = [
  ...JSON.parse(await readFile(join(ROOT, "data/znaczniki.json"), "utf8")),
  z("test-kryjowka-1", "kryjowki", "Kryjówka testowa jeden", 1000, 1000),
  z("test-kryjowka-2", "kryjowki", "Kryjówka testowa dwa z bardzo długą nazwą, która nie mieści się w tytule", 1100, 1050, dlugi),
  z("test-kryjowka-3", "kryjowki", "Kryjówka testowa trzy", 1500, 1500),
  z("test-sklep-1", "sklepy", "Sklep testowy", 1020, 1010),
  z("test-sklep-2", "sklepy", "Drugi sklep testowy", 2000, 2000),
  z("test-bron-1", "bron", "Sklep z bronią testowy", 1200, 1200),
  z("test-bron-2", "bron", "Drugi sklep z bronią testowy", 2500, 2500),
  z("test-przyklad", "sklepy", "Przykład nie dostaje strony", 300, 300),
];
znaczniki.at(-1).przyklad = true;
await writeFile(join(dane, "kategorie.json"), JSON.stringify(kat, null, 1));
await writeFile(join(dane, "znaczniki.json"), JSON.stringify(znaczniki, null, 1));

const uruchom = () => spawnSync(process.execPath, [BUILD], { encoding: "utf8", env: { ...process.env, VICEMAP_DANE: dane, VICEMAP_WYJSCIE: wyj } });
let porazki = 0;
const ok = (warunek, opis) => { if (!warunek) { porazki++; console.error("BŁĄD:", opis); } };

const r = uruchom();
ok(r.status === 0, "build na poprawnych danych: " + r.stderr);
const pZn = await readdir(join(wyj, "znaczniki")), pKat = await readdir(join(wyj, "kategorie"));
const pliki = [...pZn.map((p) => "znaczniki/" + p), ...pKat.map((p) => "kategorie/" + p)];
ok(pZn.length === 7 + 25 && pKat.length === 4 && !pZn.includes("test-przyklad.html"), `liczba stron (${pZn.length} znaczników, ${pKat.length} kategorii) lub strona przykładu`);

const sprawdz = async (rel) => {
  const html = await readFile(join(wyj, rel), "utf8");
  const dek = (t) => t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const tytul = dek(/<title>(.*?)<\/title>/.exec(html)?.[1] || "");
  const opis = dek(/<meta name="description" content="(.*?)"/.exec(html)?.[1] || "");
  ok(tytul && tytul.length <= 60, `${rel}: title ${tytul.length} znaków: ${tytul}`);
  ok(opis && opis.length <= 160, `${rel}: description ${opis.length} znaków`);
  ok(!/…\.|\.\.\.|……/.test(opis + html), `${rel}: przycięty tekst z "…."`);
  ok(html.includes(`<link rel="canonical" href="https://vicemap.pl/${rel}">`), `${rel}: canonical`);
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

// Walidacja: wszystkie błędy naraz, kod != 0
const zle = [
  z("Zły ID", "kryjowki", "", 1, 1, "krótki"), z("test-kryjowka-1", "nie-ma", "Nazwa", 99999, -5),
  z("test-kryjowka-1", "bron", "Duplikat id", 5, 5), { id: "bez-xy", kategoria: "bron", nazwa: "x", opis: "Opis bez współrzędnych, długi na tyle by przejść.", x: "1", y: 2 },
];
await writeFile(join(dane, "znaczniki.json"), JSON.stringify(zle));
const rz = uruchom();
ok(rz.status !== 0, "walidacja powinna zwrócić kod != 0");
for (const fragment of ["niepoprawne id", "brak nazwy", "zbyt krótki", "nieznana kategoria", "poza mapą", "id powtórzone", "muszą być liczbami"]) ok(rz.stderr.includes(fragment), `walidacja: brak komunikatu "${fragment}"`);

console.log(porazki ? `\nNie przeszło: ${porazki} problemów. Pliki testowe: ${tmp}` : `Test szablonu i walidacji: OK (${pliki.length} stron, katalog tymczasowy ${tmp})`);
process.exit(porazki ? 1 : 0);
