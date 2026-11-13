// Kontrola jakości danych: node scripts/kontrola-danych.mjs   (opcje: --bez-wody, --promien=5, --help)
// Sprawdza data/*.json i wypisuje raport. Kod wyjścia 1 przy błędach, 0 gdy są tylko ostrzeżenia.
//   BŁĘDY:        id (format, unikalność), pola wymagane, kategoria istnieje, x/y w mapie, długość opisu,
//                 brak zdania „Odpowiednik w prawdziwym świecie" w opisie (to pokazuje osobno pole `odpowiednik`),
//                 punkt w wodzie (poza przystaniami, jeziorami itp. – lista wyjątków niżej), regiony.json.
//   OSTRZEŻENIA:  duplikaty i quasi-duplikaty (ta sama nazwa lub ten sam odpowiednik < 40 px), kategoria niepasująca
//                 do typu/nazwy, brak regionu, region inny niż wszyscy sąsiedzi.
// Test wody wymaga Pythona z Pillow (pip install pillow): node nie dekoduje WebP, więc skrypt woła
// `python -I` i próbkuje piksele mapa.webp (woda = niebiesko-turkusowa; ląd = zielony/szary/żółty).
// Bez Pythona/Pillow test wody jest pomijany z ostrzeżeniem. Bez zależności npm – wystarczy Node 18+.
// Test na kopii danych:  VICEMAP_DANE=<katalog z kategorie.json, znaczniki.json, regiony.json> node scripts/kontrola-danych.mjs
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Użycie: node scripts/kontrola-danych.mjs [--bez-wody] [--promien=5]\n  --bez-wody    pomiń test wody (nie wymaga Pythona)\n  --promien=N   tolerancja brzegu w px (domyślnie 5): punkt w wodzie, gdy w promieniu N px nie ma lądu\nZmienna VICEMAP_DANE wskazuje inny katalog z JSON-ami.");
  process.exit(0);
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DANE = process.env.VICEMAP_DANE ? resolve(process.env.VICEMAP_DANE) : join(ROOT, "data");
const PROMIEN = Number(args.find((a) => a.startsWith("--promien="))?.split("=")[1] ?? 5);
const BLISKO_PX = 40, OPIS_MIN = 30, OPIS_MAX = 400, ODP_MAX = 150;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ZRODLA = ["gtadb", "zgloszenie", "gra"];
// Punkty, które mogą leżeć w wodzie: po typie z opisu albo po id (sprawdzone wzrokiem na mapie).
const WODA_TYP = /Przystań|Nabrzeże|^Port\b|Molo|Wyspa|Jezioro|Rzeka|Źródła|Latarnia/i;
const WODA_ID = new Set(["gtadb-l430" /* Cape Romano Dome House – dom na wodzie */, "gtadb-l734" /* Submerged Tank – zatopiony zbiornik */]);

const wczytaj = async (n) => JSON.parse((await readFile(join(DANE, n), "utf8")));
const kategorie = await wczytaj("kategorie.json");
const znaczniki = await wczytaj("znaczniki.json");
const regiony = existsSync(join(DANE, "regiony.json")) ? await wczytaj("regiony.json") : [];
const cfg = await readFile(join(ROOT, "js/config.js"), "utf8");
const SZER = Number(/szerokosc:\s*(\d+)/.exec(cfg)?.[1]) || 3200;
const WYS = Number(/wysokosc:\s*(\d+)/.exec(cfg)?.[1]) || 4357;

const bledy = [], ostrz = [];
const kat = new Set(kategorie.map((k) => k.id));
const typ = (z) => String(z.opis ?? "").split(" – ")[0].trim();
const nazwaZ = (z) => `"${z.id}" (${z.nazwa})`;
const liczba = (v) => typeof v === "number" && Number.isFinite(v);
const odl = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = (n) => String(n ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l")
  .replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").replace(/[\s\d]+$/, "").trim();

// --- pola, id, opisy ---
const ids = new Map();
for (const z of znaczniki) {
  const g = nazwaZ(z);
  if (!z.id || !ID.test(z.id)) bledy.push(`${g}: niepoprawne id.`);
  else if (ids.has(z.id)) bledy.push(`${g}: id powtórzone.`);
  ids.set(z.id, true);
  if (!kat.has(z.kategoria)) bledy.push(`${g}: nieznana kategoria "${z.kategoria}".`);
  if (!String(z.nazwa ?? "").trim()) bledy.push(`${g}: brak nazwy.`);
  if (!liczba(z.x) || !liczba(z.y)) bledy.push(`${g}: x i y muszą być liczbami.`);
  else if (z.x < 0 || z.x > SZER || z.y < 0 || z.y > WYS) bledy.push(`${g}: x=${z.x}, y=${z.y} poza mapą (0-${SZER}, 0-${WYS}).`);
  const opis = typeof z.opis === "string" ? z.opis : "";
  if (opis.trim().length < OPIS_MIN || opis.length > OPIS_MAX) bledy.push(`${g}: opis ma ${opis.trim().length} znaków (wymagane ${OPIS_MIN}-${OPIS_MAX}).`);
  if (/Odpowiednik w prawdziwym świecie/i.test(opis)) bledy.push(`${g}: opis zawiera zdanie „Odpowiednik w prawdziwym świecie" – to samo pokazuje pole "odpowiednik". Usuń je z opisu.`);
  if (/\s{2}|^\s|\s$| ,|\.\./.test(opis)) ostrz.push(`${g}: opis ma nadmiarowe spacje lub interpunkcję.`);
  if (z.odpowiednik !== undefined && (typeof z.odpowiednik !== "string" || !z.odpowiednik.trim() || z.odpowiednik.length > ODP_MAX)) bledy.push(`${g}: "odpowiednik" musi być niepustym tekstem do ${ODP_MAX} znaków.`);
  if (z.zrodlo !== undefined && !ZRODLA.includes(z.zrodlo)) bledy.push(`${g}: nieznane "zrodlo" (${JSON.stringify(z.zrodlo)}).`);
  if (!z.region) ostrz.push(`${g}: brak regionu.`);
}

// --- duplikaty i quasi-duplikaty ---
for (let i = 0; i < znaczniki.length; i++) for (let j = i + 1; j < znaczniki.length; j++) {
  const a = znaczniki[i], b = znaczniki[j];
  if (!liczba(a.x + a.y + b.x + b.y)) continue;
  const d = odl(a, b);
  if (d >= BLISKO_PX) continue;
  const na = norm(a.nazwa), nb = norm(b.nazwa);
  const tak = na && na === nb ? "ta sama nazwa" : a.odpowiednik && a.odpowiednik === b.odpowiednik && (na.includes(nb) || nb.includes(na)) ? "ten sam odpowiednik i podobna nazwa" : "";
  if (tak || (a.x === b.x && a.y === b.y)) ostrz.push(`duplikat? ${nazwaZ(a)} i ${nazwaZ(b)}: ${tak || "identyczne współrzędne"}, ${Math.round(d)} px.`);
}

// --- spójność kategorii (typ z opisu i nazwa) ---
const TYP_KAT = [[/^Stacja benzynowa/, "stacje-paliw"], [/^(Hotel|Motel)\b/, "hotele"], [/^(Restauracja|Kawiarnia|Bar\b|Lokal gastronomiczny|Delikatesy)/, "jedzenie"],
  [/^(Posterunek|Remiza|Szpital|Klinika|Więzienie|Biuro szeryfa|Ośrodek społeczny|Baza straży)/, "sluzby"], [/^Sklep z bronią/, "bron"],
  [/^(Lotnisko|Stacja (metra|kolejowa)|Most|Przystań|Dworzec|Hangar|Tunel|Stacja rozrządowa)/, "transport"]];
const NAZWA_ZLA = { hotele: /seafood|restaurant|grill|cafe|diner|gas\b/i, jedzenie: /hotel|motel|gas (station|stop)/i, sklepy: /gas (station|stop)|hotel|motel|restaurant/i,
  "stacje-paliw": /hotel|motel|restaurant|shop|store/i, sluzby: /gas (station|stop)|hotel|motel/i };
for (const z of znaczniki) {
  for (const [re, k] of TYP_KAT) if (re.test(typ(z)) && z.kategoria !== k && kat.has(k)) ostrz.push(`kategoria? ${nazwaZ(z)}: typ „${typ(z)}" zwykle należy do „${k}", jest w „${z.kategoria}".`);
  if (NAZWA_ZLA[z.kategoria]?.test(z.nazwa)) ostrz.push(`kategoria? ${nazwaZ(z)}: nazwa nie pasuje do kategorii „${z.kategoria}" (typ: ${typ(z)}).`);
}

// --- regiony: sąsiedzi (≤6 najbliższych w 120 px) – żaden nie ma tego samego regionu, a ≥2 zgodnych sąsiadów ma inny ---
for (const a of znaczniki) {
  const sas = znaczniki.filter((b) => b !== a).map((b) => [odl(a, b), b]).sort((p, q) => p[0] - q[0]).slice(0, 6).filter(([d]) => d < 120).map(([, b]) => b);
  const licz = new Map();
  for (const b of sas) licz.set(b.region ?? "", (licz.get(b.region ?? "") ?? 0) + 1);
  const [top, n] = [...licz.entries()].sort((p, q) => q[1] - p[1])[0] ?? ["", 0];
  if (a.region && n >= 2 && top !== a.region && !licz.has(a.region)) ostrz.push(`region? ${nazwaZ(a)}: „${a.region}", a sąsiedzi mają „${top}" (${n} z ${sas.length}).`);
}

// --- regiony.json ---
const rid = new Set();
for (const r of regiony) {
  if (!r.id || !ID.test(r.id) || rid.has(r.id)) bledy.push(`regiony.json "${r.id}": niepoprawne lub powtórzone id.`);
  rid.add(r.id);
  if (!String(r.nazwa ?? "").trim()) bledy.push(`regiony.json "${r.id}": brak nazwy.`);
  if (!liczba(r.x) || !liczba(r.y) || r.x < 0 || r.x > SZER || r.y < 0 || r.y > WYS) bledy.push(`regiony.json "${r.id}": x/y poza mapą lub nie liczby.`);
}

// --- woda (Python + Pillow) ---
const PY = `
import sys, json
from PIL import Image
d = json.load(sys.stdin); R = d["r"]
im = Image.open(d["mapa"]).convert("RGB"); W, H = im.size; px = im.load()
woda = lambda p: p[2] - p[0] >= 50 and p[2] >= p[1] - 15
out = []
for x, y in d["p"]:
    cx = min(W - 1, max(0, round(x))); cy = min(H - 1, max(0, round(H - y)))
    c = woda(px[cx, cy])
    land = c and any(not woda(px[i, j]) for i in range(max(0, cx - R), min(W, cx + R + 1)) for j in range(max(0, cy - R), min(H, cy + R + 1)) if (i - cx) ** 2 + (j - cy) ** 2 <= R * R)
    out.append(0 if not c else 1 if land else 2)
print(json.dumps(out))
`;
let wodaInfo = "pominięty (--bez-wody)";
if (!args.includes("--bez-wody")) {
  const wszystkie = [...znaczniki.map((z) => ({ z, kind: "znacznik" })), ...regiony.map((z) => ({ z, kind: "region" }))].filter(({ z }) => liczba(z.x) && liczba(z.y));
  const mapa = join(ROOT, "mapa.webp");
  let wynik = null;
  for (const py of ["python", "python3", "py"]) {
    const r = spawnSync(py, ["-I", "-c", PY], { input: JSON.stringify({ mapa, r: PROMIEN, p: wszystkie.map(({ z }) => [z.x, z.y]) }), encoding: "utf8", maxBuffer: 1 << 26 });
    if (r.status === 0) { try { wynik = JSON.parse(r.stdout); break; } catch { /* spróbuj dalej */ } }
  }
  if (!wynik) {
    wodaInfo = "NIE WYKONANY (brak Pythona z Pillow – pip install pillow)";
    ostrz.push("test wody pominięty: potrzebny Python 3 z Pillow (python -I -c \"import PIL\").");
  } else {
    let wWodzie = 0, naBrzegu = 0, dozwolone = 0;
    wynik.forEach((w, i) => {
      const { z, kind } = wszystkie[i];
      if (w === 1) naBrzegu++;
      if (w !== 2) return;
      wWodzie++;
      const ok = kind === "znacznik" && (WODA_ID.has(z.id) || WODA_TYP.test(typ(z)) || WODA_TYP.test(z.nazwa));
      if (ok) { dozwolone++; ostrz.push(`woda (dozwolone): ${nazwaZ(z)} – ${typ(z)}, (${z.x}, ${z.y}).`); }
      else bledy.push(`${kind === "region" ? `region "${z.id}"` : nazwaZ(z)} leży w wodzie (promień ${PROMIEN} px bez lądu) przy (${z.x}, ${z.y}).`);
    });
    wodaInfo = `${wszystkie.length} punktów: ${wWodzie} w wodzie (w tym ${dozwolone} dozwolonych), ${naBrzegu} na brzegu (tolerowane)`;
  }
}

console.log(`Znaczniki: ${znaczniki.length}, kategorie: ${kategorie.length}, regiony: ${regiony.length}. Test wody: ${wodaInfo}.`);
if (ostrz.length) console.log(`\nOstrzeżenia (${ostrz.length}):\n- ${ostrz.join("\n- ")}`);
if (bledy.length) { console.error(`\nBŁĘDY (${bledy.length}):\n- ${bledy.join("\n- ")}`); process.exit(1); }
console.log("\nOK: brak błędów.");
