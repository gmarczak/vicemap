// Masowe dodawanie znaczników:  node scripts/dodaj-znaczniki.mjs plik.csv|plik.json [--zapisz]
// Domyślnie próba na sucho (raport, nic nie jest zapisywane). Z --zapisz dopisuje wpisy na końcu data/znaczniki.json,
// ale tylko gdy w pliku wejściowym nie ma żadnego błędu. Istniejące wpisy i ich id nigdy nie są zmieniane.
// Wejście:
//   CSV  – pierwszy wiersz to nagłówek, separator przecinek lub średnik, cudzysłowy jak w RFC 4180 ("" = cudzysłów).
//   JSON – tablica obiektów albo pojedynczy obiekt (tak, jak wypluwa „Kopiuj" w trybie ?edytor mapy).
// Pola: nazwa, kategoria, x, y, opis (wymagane); region, odpowiednik, zrodlo (gtadb | zgloszenie | gra), id (opcjonalne).
// x: 0-3200 (od lewej), y: 0-4357 (od dołu, jak w ?edytor). Puste id => "wlasny-<slug-nazwy>" (z sufiksem -2, -3 przy kolizji).
// Przykład CSV:
//   nazwa;kategoria;x;y;opis;region
//   Moja knajpa;jedzenie;2300;2100;"Mała knajpa przy plaży, widoczna w trailerze.";"Ocean Beach, Vice Beach"
// Test bez ruszania repo:  VICEMAP_DANE=<katalog z kategorie.json, regiony.json, znaczniki.json> node scripts/dodaj-znaczniki.mjs ...
// Po zapisie uruchom:  node scripts/kontrola-danych.mjs  a potem  node scripts/build.mjs
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const plik = args.find((a) => !a.startsWith("--"));
if (!plik || args.includes("--help") || args.includes("-h")) {
  console.log("Użycie: node scripts/dodaj-znaczniki.mjs plik.csv|plik.json [--zapisz]\n  bez --zapisz: próba na sucho (raport)\n  CSV (nagłówek, ; lub ,) albo JSON (tablica lub jeden obiekt z ?edytor)\n  Pola: nazwa, kategoria, x, y, opis [, region, odpowiednik, zrodlo, id]\nZmienna VICEMAP_DANE wskazuje inny katalog z danymi (do testów).");
  process.exit(plik ? 0 : 1);
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DANE = process.env.VICEMAP_DANE ? resolve(process.env.VICEMAP_DANE) : join(ROOT, "data");
const SCIEZKA = join(DANE, "znaczniki.json");
const SZER = 3200, WYS = 4357, ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, ZRODLA = ["gtadb", "zgloszenie", "gra"];

// --- wczytanie wejścia ---
function csv(tekst) {
  tekst = tekst.replace(/^﻿/, "");
  const sep = (tekst.split(/\r?\n/, 1)[0].match(/;/g) ?? []).length > (tekst.split(/\r?\n/, 1)[0].match(/,/g) ?? []).length ? ";" : ",";
  const wiersze = []; let w = [], p = "", wCudz = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (wCudz) { if (c === '"') { if (tekst[i + 1] === '"') { p += '"'; i++; } else wCudz = false; } else p += c; }
    else if (c === '"') wCudz = true;
    else if (c === sep) { w.push(p); p = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && tekst[i + 1] === "\n") i++; w.push(p); p = ""; wiersze.push(w); w = []; }
    else p += c;
  }
  if (wCudz) throw new Error("niedomknięty cudzysłów w CSV");
  if (p !== "" || w.length) { w.push(p); wiersze.push(w); }
  const [naglowek, ...reszta] = wiersze.filter((r) => r.some((k) => k.trim() !== ""));
  if (!naglowek) throw new Error("pusty plik CSV");
  const kol = naglowek.map((k) => k.trim().toLowerCase().replace(/^﻿/, ""));
  return { sep, obiekty: reszta.map((r) => Object.fromEntries(kol.map((k, i) => [k, (r[i] ?? "").trim()]))) };
}
let wejscie, sep = ",";
try {
  const tekst = await readFile(resolve(plik), "utf8");
  if (extname(plik).toLowerCase() === ".json") { const j = JSON.parse(tekst); wejscie = Array.isArray(j) ? j : [j]; }
  else ({ obiekty: wejscie, sep } = csv(tekst));
} catch (e) { console.error(`Nie da się wczytać ${plik}: ${e.message}`); process.exit(1); }

const kategorie = JSON.parse(await readFile(join(DANE, "kategorie.json"), "utf8"));
const regiony = existsSync(join(DANE, "regiony.json")) ? JSON.parse(await readFile(join(DANE, "regiony.json"), "utf8")) : [];
const surowy = await readFile(SCIEZKA, "utf8");
const istniejace = JSON.parse(surowy);

const kat = new Set(kategorie.map((k) => k.id));
const nazwyRegionow = new Set(regiony.flatMap((r) => [r.id, r.nazwa]));
const uzyte = new Set(istniejace.map((z) => z.id));
const slug = (n) => String(n).toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "znacznik";
const norm = (n) => slug(n).replace(/-?\d+$/, "");
const liczba = (v) => { const t = typeof v === "string" ? v.replace(sep === ";" ? "," : "\0", ".") : v; return t === "" || t === null || t === undefined ? NaN : Number(t); };

const bledy = [], ostrz = [], nowe = [];
wejscie.forEach((w, i) => {
  const g = `wpis ${i + 1} ("${w?.nazwa || "?"}")`;
  const b = (t) => bledy.push(`${g}: ${t}`);
  if (!w || typeof w !== "object" || Array.isArray(w)) return b("oczekiwano obiektu z polami nazwa, kategoria, x, y, opis.");
  const tekst = (k) => (w[k] === undefined || w[k] === null ? "" : String(w[k]).trim());
  const nazwa = tekst("nazwa"), kategoria = tekst("kategoria"), opis = tekst("opis"), region = tekst("region"), odp = tekst("odpowiednik"), zrodlo = tekst("zrodlo");
  const x = liczba(w.x), y = liczba(w.y);
  if (!nazwa) b("brak nazwy.");
  if (!kat.has(kategoria)) b(`nieznana kategoria "${kategoria}". Dozwolone: ${[...kat].join(", ")}.`);
  if (!Number.isFinite(x) || !Number.isFinite(y)) b("x i y muszą być liczbami.");
  else if (x < 0 || x > SZER || y < 0 || y > WYS) b(`x=${x}, y=${y} poza mapą (x: 0-${SZER}, y: 0-${WYS}).`);
  if (opis.length < 30 || opis.length > 400) b(`opis ma ${opis.length} znaków (wymagane 30-400).`);
  if (/Odpowiednik w prawdziwym świecie/i.test(opis)) ostrz.push(`${g}: opis zawiera „Odpowiednik w prawdziwym świecie" – przenieś to do pola "odpowiednik".`);
  if (region && regiony.length && !nazwyRegionow.has(region)) {
    // regiony.json to tylko skróty (id, nazwa); w znacznikach region to tekst z adresu, więc to nie błąd, jeśli pasuje do użytych już wartości.
    if (!istniejace.some((z) => z.region === region)) b(`region "${region}" nie występuje w regiony.json ani w żadnym istniejącym znaczniku. Dostępne w regiony.json: ${[...nazwyRegionow].filter((n) => !ID.test(n)).join(", ")}.`);
  }
  if (odp.length > 150) b(`odpowiednik dłuższy niż 150 znaków.`);
  if (zrodlo && !ZRODLA.includes(zrodlo)) b(`nieznane zrodlo "${zrodlo}". Dozwolone: ${ZRODLA.join(", ")}.`);
  let id = tekst("id");
  if (id) {
    if (!ID.test(id)) b(`niepoprawne id "${id}" (małe litery, cyfry, myślniki).`);
    else if (uzyte.has(id)) b(`id "${id}" już istnieje – istniejących id nie zmieniamy.`);
  } else if (nazwa) {
    const baza = "wlasny-" + slug(nazwa); id = baza;
    for (let n = 2; uzyte.has(id); n++) id = `${baza}-${n}`;
  }
  if (id && ID.test(id)) uzyte.add(id);
  if (nazwa && Number.isFinite(x + y)) {
    for (const z of [...istniejace, ...nowe]) {
      const d = Math.hypot(z.x - x, z.y - y);
      if (norm(z.nazwa) === norm(nazwa) && d < 40) ostrz.push(`${g}: możliwy duplikat "${z.id}" (${z.nazwa}), ${Math.round(d)} px.`);
      else if (d < 5) ostrz.push(`${g}: bardzo blisko "${z.id}" (${z.nazwa}), ${Math.round(d)} px.`);
    }
  }
  // Kolejność pól jak w istniejących wpisach.
  const wpis = { id, kategoria, nazwa, ...(odp && { odpowiednik: odp }), opis, ...(region && { region }), x: Math.round(x), y: Math.round(y), ...(zrodlo && { zrodlo }) };
  nowe.push(wpis);
});

const zapisz = args.includes("--zapisz");
console.log(`Wczytano ${wejscie.length} wpisów z ${plik}; w bazie jest ${istniejace.length} znaczników.`);
if (ostrz.length) console.log(`\nOstrzeżenia (${ostrz.length}):\n- ${ostrz.join("\n- ")}`);
if (bledy.length) { console.error(`\nBŁĘDY (${bledy.length}) – nic nie zapisano:\n- ${bledy.join("\n- ")}`); process.exit(1); }
console.log(`\nDo dopisania (${nowe.length}):\n${nowe.map((z) => `  ${z.id}: ${z.nazwa} [${z.kategoria}] (${z.x}, ${z.y})`).join("\n")}`);
if (!zapisz) { console.log("\nPróba na sucho – nic nie zapisano. Dodaj --zapisz, żeby dopisać do data/znaczniki.json."); process.exit(0); }
// Dopisanie tekstem, w formacie istniejącego pliku: jeden obiekt na linię, „klucz": wartość, separator „, ".
const fmt = (o) => "{" + Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ") + "}";
const eol = surowy.includes("\r\n") ? "\r\n" : "\n";
const bezKonca = surowy.replace(/\s*\]\s*$/, "");
const linie = nowe.map((z) => "  " + fmt(z)).join("," + eol);
const wynik = (istniejace.length ? bezKonca + "," + eol : "[" + eol) + linie + eol + "]" + eol;
JSON.parse(wynik); // zabezpieczenie: nie zapisujemy zepsutego JSON-a
await writeFile(SCIEZKA, wynik, "utf8");
console.log(`\nZapisano ${nowe.length} znaczników do ${SCIEZKA}. Teraz: node scripts/kontrola-danych.mjs, potem node scripts/build.mjs.`);
