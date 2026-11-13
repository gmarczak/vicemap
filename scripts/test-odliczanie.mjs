// Test odliczania do premiery w kilku strefach czasowych: node scripts/test-odliczanie.mjs
// Logika (stanOdliczania) jest wycinana z js/map.js między markerami ODLICZANIE-START/END.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.argv[2] === "--dziecko") {
  const src = readFileSync(new URL("../js/map.js", import.meta.url), "utf8");
  const kod = src.split("// ODLICZANIE-START")[1].replace(/^[^\n]*\n/, "").split("// ODLICZANIE-END")[0];
  const stanOdliczania = new Function(kod + "; return stanOdliczania;")();
  const cel = new Date(2026, 10, 19, 0, 0, 0);
  const t = cel.getTime();
  console.log(JSON.stringify({
    celUtc: cel.toISOString(),
    lokalnie: [cel.getHours(), cel.getDate(), cel.getMonth()],
    przed: stanOdliczania(t - 1, t),
    po: stanOdliczania(t, t),
    godzinaPrzed: stanOdliczania(t - 3600000, t),
  }));
  process.exit(0);
}

// Oczekiwane chwile UTC lokalnej północy 19.11.2026 w danej strefie.
const strefy = {
  "Europe/Warsaw": "2026-11-18T23:00:00.000Z",
  "America/New_York": "2026-11-19T05:00:00.000Z",
  "Pacific/Auckland": "2026-11-18T11:00:00.000Z",
  "UTC": "2026-11-19T00:00:00.000Z",
  "Pacific/Kiritimati": "2026-11-18T10:00:00.000Z",
};
let bledy = 0;
const sprawdz = (ok, opis) => { if (!ok) { bledy++; console.error("  BŁĄD:", opis); } };
for (const [tz, oczekiwany] of Object.entries(strefy)) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--dziecko"], { env: { ...process.env, TZ: tz }, encoding: "utf8" });
  if (r.status !== 0) { bledy++; console.error(tz, "proces zakończył się błędem:", r.stderr); continue; }
  const w = JSON.parse(r.stdout);
  console.log(tz.padEnd(20), "cel", w.celUtc, "| 1 ms przed:", w.przed.juz ? "JUŻ" : `${w.przed.dni}d ${w.przed.godzin}h`, "| o północy:", w.po.juz ? "JUŻ" : "jeszcze nie");
  sprawdz(w.celUtc === oczekiwany, `${tz}: cel ${w.celUtc}, oczekiwano ${oczekiwany}`);
  sprawdz(w.lokalnie.join() === "0,19,10", `${tz}: cel nie jest lokalną północą 19.11`);
  sprawdz(w.przed.juz === false && w.przed.dni === 0 && w.przed.godzin === 0, `${tz}: tuż przed północą powinno być „jeszcze nie”, 0d 0h`);
  sprawdz(w.po.juz === true, `${tz}: o północy powinno być „już jest”`);
  sprawdz(w.godzinaPrzed.juz === false && w.godzinaPrzed.godzin === 1, `${tz}: godzinę przed powinno być 1 godz.`);
}
if (bledy) { console.error(`\nNie przeszło: ${bledy}`); process.exit(1); }
console.log("\nOdliczanie: wszystkie strefy OK.");
