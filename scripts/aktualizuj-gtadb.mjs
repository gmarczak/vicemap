// Synchronizacja z GTADB:  node scripts/aktualizuj-gtadb.mjs [--plik landmarks.json] [--zapisz] [--przesun] [--uzupelnij-gps] [--help]
// Źródło: https://raw.githubusercontent.com/rolux/gtadb.org/main/map/data/6/landmarks.json (CC BY 4.0, GTADB).
// Domyślnie TYLKO RAPORT (nic nie jest zapisywane): nowe punkty z nazwą z gry (do dodania / do przeglądu),
// przesunięte, zmienione nazwy i odpowiedniki, usunięte u źródła.
//   --zapisz          dopisuje na końcu data/znaczniki.json WYŁĄCZNIE nowe punkty, które przeszły filtr jakości
//                     ORAZ są w data/gtadb-wybor.json (ręcznie przejrzone: kategoria, etykieta typu). Nie zmienia istniejących.
//   --uzupelnij-gps   istniejącym punktom GTADB bez pola odpowiednikGps dopisuje [lat, lon] z źródła (nic poza tym polem).
//   --przesun         przesuwa istniejące punkty, których położenie różni się od źródła o > 2 px (domyślnie tylko raport).
//   --plik <ścieżka>  praca offline na pobranym wcześniej pliku.
// Przeliczenie współrzędnych (obraz mapy 3200×4357, wycięty z kafelków z=3, zestaw yanis,17):
//   x = ((wx+16384)/4 − 1280)·(3200/3760),  y_od_dołu = 4357 − ((16384 − wy)/4 − 1280)·(3200/3760)
// Test na kopii danych:  VICEMAP_DANE=<katalog z kategorie.json, znaczniki.json, gtadb-wybor.json> node scripts/aktualizuj-gtadb.mjs ...
// Po zapisie:  node scripts/kontrola-danych.mjs  i  node scripts/build.mjs
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Użycie: node scripts/aktualizuj-gtadb.mjs [--plik landmarks.json] [--zapisz] [--przesun] [--uzupelnij-gps]\n  bez flag: sam raport. --zapisz: dopisuje nowe, przejrzone punkty (data/gtadb-wybor.json). Zmienna VICEMAP_DANE: inny katalog z danymi.");
  process.exit(0);
}
const flaga = (n) => args.includes(n);
const plikArg = args.indexOf("--plik") >= 0 ? args[args.indexOf("--plik") + 1] : null;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DANE = process.env.VICEMAP_DANE ? resolve(process.env.VICEMAP_DANE) : join(ROOT, "data");
const URL_ZRODLA = "https://raw.githubusercontent.com/rolux/gtadb.org/main/map/data/6/landmarks.json";
const SZER = 3200, WYS = 4357, F = 3200 / 3760;

export const przelicz = ([wx, wy]) => ({ x: Math.round(((wx + 16384) / 4 - 1280) * F), y: Math.round(WYS - ((16384 - wy) / 4 - 1280) * F) });

// --- filtr jakości ---
const SZUM = /^(fence|parking( lot| garage)?|car park|covered parking lot|construction site|water (tower|tank)|cell tower( lot)?|radio (tower|mast)|broadcast tower|bridge|train (bridge|tunnel)|footbridge|drawbridge|tunnel( entrance)?|bus (stop|parking lot)|lake|river|canal|reservoir|tank|silo|warehouse|pier|park|church|pool|tennis court|lifeguard tower|container crane.*|prison (building|tower).*|guard( booth|house)|cabin|lock|runway|grandstands|covered grandstands|public restrooms|intersection|interchange|boat ramp|breakwater|cove|peninsula|sandbars|riverbank|berth|stage|empty lot|gate building|main gate|service gate|hangars?|gas station|metro station|golf carts|pet cemetery|beach volleyball|electric(al| substation)|transformer station|weather radar|radar tower|control tower|office building|quarry|turn \d+\w*|[\w ]+ ?\(\d\))$/i;
const TYPY_ODRZUC = /^(unconfirmed|events|\/\/(.*exist.*|duplicate.*|.*not-here.*))$/;
const DOM_BOHATERA = /('s (house|home|apartment)\b|\bmanor\b)/i;
function odrzuc(l) {
  const n = l.nazwa;
  if (!n || n === "?" || n.includes("?")) return "brak nazwy z gry (?)";
  if (/^["„]/.test(n)) return "nazwa w cudzysłowie (robocza nazwa społeczności)";
  if (n.length < 3 || /\.\.\.$/.test(n) || /^\d+$/.test(n)) return "zbyt krótka lub urwana nazwa";
  if (SZUM.test(n)) return "szum (nazwa ogólna)";
  if (l.typy.some((t) => TYPY_ODRZUC.test(t))) return "typ unconfirmed/events/nie istnieje/duplikat";
  if (l.typy.some((t) => t.startsWith("@")) || DOM_BOHATERA.test(n) || (l.typy.includes("#safehouse") && l.typy.includes("residential"))) return "dom lub miejsce bohatera";
  return null;
}
// Podpowiedź kategorii dla punktów spoza wyboru (do przeglądu); ostateczna kategoria jest w data/gtadb-wybor.json.
function kategoriaReguly(t, n) {
  const m = (...r) => r.some((x) => t.includes(x));
  if (m("#gas") || /gas station/i.test(n)) return "stacje-paliw";
  if (m("#guns")) return "bron";
  if (m("hotel") || /\b(motel|hotel|inn|suites)\b/i.test(n)) return "hotele";
  if (m("restaurant", "#bar", "#food", "#fastfood", "#drinks", "#nightclub", "#stripclub") || /\b(bar|grill|tavern|roadhouse|club|restaurant|cafe|diner)\b/i.test(n)) return "jedzenie";
  if (m("#hair", "#carwash", "#pharmacy", "#modshop", "#tattoos") || /\b(pharmacy|salon|car wash)\b/i.test(n)) return "uslugi";
  if (m("retail", "#supermarket", "#clothes", "#shoes", "#electronics") || /\b(mall|market|shop|store|supermarket)\b/i.test(n)) return "sklepy";
  if (m("leisure", "#tennis", "#golf", "#racetrack", "#cinema", "#gym") || /\b(museum|oceanarium|stadium|cultural|arena|casino)\b/i.test(n)) return "rozrywka";
  if (m("government", "#police", "#jail", "#hospital")) return "sluzby";
  if (m("transportation", "#airport", "#train", "#metro", "#marina") || /\b(garage|tunnel|airport)\b/i.test(n)) return "transport";
  return "orientacyjne";
}

// --- pomocnicze ---
const norm = (n) => String(n ?? "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").replace(/[\s\d]+$/, "").trim();
const ULICA = /\b(Blvd|Ave|Dr|Rd|St|Cswy|Ct|Hwy|Route \d+|Way|Pkwy|Ln|Pl|Terrace)\b/;
const STANY = { Florida: "FL", Georgia: "GA", California: "CA", Alabama: "AL" };
function odpowiednik(rl) {
  const p = String(rl ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  while (p.length && /^(USA|United States)$/.test(p[p.length - 1])) p.pop();
  if (p.length < 2 || p.some((s) => s.includes("?"))) return null;
  const stanIdx = p.findIndex((s, i) => i > 0 && /^[A-Z]{2}( \d{5})?$/.test(s));
  let stan, miasto, nazwa = p[0];
  const bezKodu = (s) => s.replace(/^[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}\s*/, "");
  if (stanIdx > 0) { stan = p[stanIdx].slice(0, 2); miasto = bezKodu(p[stanIdx - 1]); if (stanIdx === 1) { const m = bezKodu(p[0]); return m !== p[0] ? `miasto ${m} (${stan})` : `${m} (${stan})`; } }
  else { // „Plus+Code Miasto, Florida, USA" albo „Nazwa, Miasto, Florida"
    const s = STANY[p[p.length - 1].replace(/ \d+$/, "")];
    if (!s) return null;
    stan = s; miasto = bezKodu(p.length === 2 ? p[0] : p[p.length - 2]); nazwa = p.length === 2 && miasto === p[0] ? miasto : "";
    if (nazwa) return `${nazwa} (${stan})`;
  }
  if (!miasto || /^\d/.test(miasto) || miasto.length > 40 || miasto === "USA") return null;
  const takaNazwa = nazwa && !/^\d/.test(nazwa) && !/^[A-Z0-9]{4,8}\+/.test(nazwa) && !ULICA.test(nazwa) && nazwa !== miasto;
  return takaNazwa ? `${nazwa}, ${miasto} (${stan})` : `miasto ${miasto} (${stan})`;
}
const gps = (ll) => Array.isArray(ll) && ll.length === 2 && Math.abs(ll[0]) <= 90 && Math.abs(ll[1]) <= 180 ? [+Number(ll[0]).toFixed(6), +Number(ll[1]).toFixed(6)] : null;

// --- wczytanie ---
const czytaj = async (n) => JSON.parse(await readFile(join(DANE, n), "utf8"));
let surowe;
try {
  surowe = JSON.parse(plikArg ? await readFile(resolve(plikArg), "utf8") : await (await fetch(URL_ZRODLA)).text());
} catch (e) { console.error(`Nie udało się wczytać źródła (${plikArg || URL_ZRODLA}): ${e.message}`); process.exit(1); }
const znaczniki = await czytaj("znaczniki.json");
const kategorie = await czytaj("kategorie.json");
const wybor = existsSync(join(DANE, "gtadb-wybor.json")) ? await czytaj("gtadb-wybor.json") : {};
const kat = new Set(kategorie.map((k) => k.id));

const zrodlo = new Map();
for (const [k, v] of Object.entries(surowe)) {
  const [ig, w, , rl, ll, , typy] = v;
  const czesci = String(ig).split(",").map((s) => s.trim());
  zrodlo.set(`gtadb-${k.toLowerCase()}`, { L: k, nazwa: czesci[0], okolica: czesci.slice(1), w, rl: rl || "", ll, typy: typy || [], ...przelicz(w) });
}
const istnieje = new Map(znaczniki.map((z) => [z.id, z]));

// --- porównanie z istniejącymi ---
const przesuniete = [], zmNazwy = [], zmOdp = [], usuniete = [];
for (const z of znaczniki) {
  if (!z.id.startsWith("gtadb-")) continue;
  const s = zrodlo.get(z.id);
  if (!s) { usuniete.push(z); continue; }
  const d = Math.hypot(s.x - z.x, s.y - z.y);
  if (d > 2) przesuniete.push({ z, s, d });
  if (s.nazwa !== "?" && norm(s.nazwa) !== norm(z.nazwa) && !norm(z.nazwa).startsWith(norm(s.nazwa))) zmNazwy.push({ z, s });
  const o = odpowiednik(s.rl);
  if (o && z.odpowiednik && o !== z.odpowiednik) zmOdp.push({ z, s, o });
}

// --- nowe punkty ---
const odrzucone = new Map(), kandydaci = [];
const juz = znaczniki.map((z) => ({ n: norm(z.nazwa), x: z.x, y: z.y }));
for (const [id, s] of zrodlo) {
  if (istnieje.has(id) || s.nazwa === "?") continue;
  const nazwa = s.nazwa.replace(/\s*\((S|\d)\)$/, "");
  const powod = !Number.isFinite(s.x + s.y) ? "brak współrzędnych w grze" : odrzuc({ nazwa, typy: s.typy }) || (juz.some((j) => j.n === norm(nazwa) && Math.hypot(j.x - s.x, j.y - s.y) < 200) ? "duplikat (ta sama nazwa blisko)" : null);
  if (powod) { odrzucone.set(powod, (odrzucone.get(powod) || 0) + 1); continue; }
  juz.push({ n: norm(nazwa), x: s.x, y: s.y });
  kandydaci.push({ id, s, nazwa });
}
const doDodania = kandydaci.filter((c) => wybor[c.s.L]);
const doPrzegladu = kandydaci.filter((c) => !wybor[c.s.L]);

const linia = (c) => `${c.s.L.padEnd(6)} ${c.nazwa} [${c.s.typy.join(",") || "-"}] ${c.s.okolica.join(", ")} @${c.s.x},${c.s.y}`;
console.log(`Źródło: ${Object.keys(surowe).length} punktów, w tym ${[...zrodlo.values()].filter((s) => s.nazwa !== "?").length} z nazwą z gry. W ViceMap: ${znaczniki.length} znaczników.`);
console.log(`\nNOWE z nazwą z gry, po filtrze jakości: ${kandydaci.length} (w wyborze: ${doDodania.length}, do przeglądu: ${doPrzegladu.length}).`);
console.log(`  odrzucone filtrem: ${[...odrzucone].map(([p, n]) => `${n}× ${p}`).join("; ") || "–"}`);
if (doDodania.length) console.log(`  DO DODANIA (--zapisz):\n    ${doDodania.map((c) => `${linia(c)} -> ${wybor[c.s.L].kategoria}`).join("\n    ")}`);
if (doPrzegladu.length) console.log(`  DO PRZEGLĄDU (dopisz do data/gtadb-wybor.json, jeśli sensowne):\n    ${doPrzegladu.map((c) => `${linia(c)} ~ ${kategoriaReguly(c.s.typy, c.nazwa)}`).join("\n    ")}`);
console.log(`\nPRZESUNIĘTE u źródła (> 2 px): ${przesuniete.length}${przesuniete.map(({ z, s, d }) => `\n    ${z.id} ${z.nazwa}: ${z.x},${z.y} -> ${s.x},${s.y} (${Math.round(d)} px)`).join("")}`);
console.log(`ZMIENIONE nazwy: ${zmNazwy.length}${zmNazwy.map(({ z, s }) => `\n    ${z.id}: „${z.nazwa}" vs źródło „${s.nazwa}"`).join("")}`);
console.log(`ZMIENIONE odpowiedniki: ${zmOdp.length}${zmOdp.map(({ z, o }) => `\n    ${z.id}: „${z.odpowiednik}" vs „${o}"`).join("")}`);
console.log(`USUNIĘTE u źródła: ${usuniete.length}${usuniete.map((z) => `\n    ${z.id} ${z.nazwa}`).join("")}`);

// --- zapis ---
const zapis = flaga("--zapisz"), gpsFlaga = flaga("--uzupelnij-gps"), przesun = flaga("--przesun");
if (!zapis && !gpsFlaga && !przesun) { console.log("\n(tylko raport – nic nie zapisano; --zapisz / --uzupelnij-gps / --przesun)"); process.exit(0); }

const hrabstwoDla = new Map(); // dzielnica/miasto -> hrabstwo (uczone z istniejących opisów)
for (const z of znaczniki) {
  const h = /\(hrabstwo ([^)]+)\)/.exec(z.opis || "")?.[1];
  if (h) for (const t of String(z.region || "").split(",").map((s) => s.trim())) if (t) hrabstwoDla.set(t, h);
}
const pelnyRegion = new Map(); // pierwszy człon regionu -> najczęstszy pełny region z istniejących danych
{ const licz = new Map();
  for (const z of znaczniki) if (z.region) { const k = z.region.split(",")[0].trim(); const m = licz.get(k) ?? new Map(); m.set(z.region, (m.get(z.region) ?? 0) + 1); licz.set(k, m); }
  for (const [k, m] of licz) pelnyRegion.set(k, [...m].sort((a, b) => b[1] - a[1])[0][0]); }
let zmieniono = 0;
if (gpsFlaga) for (const z of znaczniki) {
  const s = zrodlo.get(z.id), g = s && s.rl && !s.rl.includes("?") ? gps(s.ll) : null;
  if (z.id.startsWith("gtadb-") && g && !z.odpowiednikGps) { z.odpowiednikGps = g; zmieniono++; }
}
if (przesun) for (const { z, s } of przesuniete) { z.x = s.x; z.y = s.y; zmieniono++; }
let dodano = 0;
if (zapis) for (const c of doDodania) {
  const w = wybor[c.s.L];
  if (!kat.has(w.kategoria) || !w.etykieta) { console.error(`${c.s.L}: wybór wymaga poprawnych pól kategoria i etykieta.`); process.exit(1); }
  const hrabCzesc = c.s.okolica.find((o) => /County$/.test(o));
  const miejsca = c.s.okolica.filter((o) => !/County$/.test(o) && !ULICA.test(o));
  const hrab = (hrabCzesc && hrabCzesc.replace(/ County$/, "")) || w.hrabstwo || [...miejsca].reverse().map((m) => hrabstwoDla.get(m)).find(Boolean);
  const gdzie = miejsca.length ? `${miejsca.join(", ")}${hrab ? ` (hrabstwo ${hrab})` : ""}` : hrab ? `hrabstwo ${hrab}` : "";
  const uwagi = [c.s.typy.includes("demolished") && "Wg GTADB prawdziwy odpowiednik już nie istnieje.", c.s.typy.includes("closed") && "Wg GTADB prawdziwy odpowiednik jest obecnie zamknięty."].filter(Boolean);
  const opis = `${w.etykieta}${gdzie ? ` – ${gdzie}` : ""}. ${uwagi.length ? uwagi.join(" ") + " " : ""}Zidentyfikowane przez społeczność GTADB, niepotwierdzone przed premierą.`;
  const o = odpowiednik(c.s.rl), g = c.s.rl && !c.s.rl.includes("?") ? gps(c.s.ll) : null;
  const wpis = { id: c.id, kategoria: w.kategoria, nazwa: w.nazwa || c.nazwa, opis, x: c.s.x, y: c.s.y };
  const region = miejsca.length > 1 ? miejsca.join(", ") : miejsca.length ? pelnyRegion.get(miejsca[0]) || (hrab ? `${miejsca[0]}, ${hrab} County` : miejsca[0]) : hrabCzesc;
  if (region) wpis.region = region;
  wpis.zrodlo = "gtadb";
  if (o) wpis.odpowiednik = o;
  if (g) wpis.odpowiednikGps = g;
  if (wpis.x < 0 || wpis.x > SZER || wpis.y < 0 || wpis.y > WYS) { console.error(`${c.id}: poza mapą.`); process.exit(1); }
  znaczniki.push(wpis); dodano++;
}
// Zapis: jedna linia na znacznik (jak dotąd), bez zmiany pozostałych wpisów.
await writeFile(join(DANE, "znaczniki.json"), "[\r\n" + znaczniki.map((z) => "  {" + Object.entries(z).map(([k, v]) => JSON.stringify(k) + ": " + JSON.stringify(v)).join(", ") + "}").join(",\r\n") + "\r\n]\r\n", "utf8");
console.log(`\nZapisano: dodano ${dodano} nowych punktów, zmieniono ${zmieniono} istniejących (tylko flagi --uzupelnij-gps / --przesun).`);
