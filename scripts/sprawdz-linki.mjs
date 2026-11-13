// Sprawdza linki wewnętrzne statycznej strony ViceMap oraz spójność sitemap.xml.
// Użycie: node scripts/sprawdz-linki.mjs   (VICEMAP_WYJSCIE nadpisuje katalog główny)
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.VICEMAP_WYJSCIE || join(dirname(fileURLToPath(import.meta.url)), '..'));
const POMIN = new Set(['node_modules', 'vendor', '.claude', '.git', 'supabase']);
const bledy = [];
const blad = (plik, link, problem) => bledy.push(`${plik}: ${link} → ${problem}`);
const rel = (p) => relative(ROOT, p).split(sep).join('/');

function zbierz(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!POMIN.has(e.name)) zbierz(join(dir, e.name), out); }
    else if (e.name.endsWith('.html')) out.push(join(dir, e.name));
  }
  return out;
}

const czytaj = (p) => readFileSync(p, 'utf8');
const jestPlik = (p) => existsSync(p) && statSync(p).isFile();

// Zwraca ścieżkę istniejącego pliku albo null.
function znajdz(sciezka) {
  if (sciezka.endsWith('/') || (existsSync(sciezka) && statSync(sciezka).isDirectory())) {
    const idx = join(sciezka, 'index.html');
    return jestPlik(idx) ? idx : null;
  }
  if (jestPlik(sciezka)) return sciezka;
  if (!extname(sciezka) && jestPlik(sciezka + '.html')) return sciezka + '.html';
  return null;
}

const cacheId = new Map();
function maId(plik, id) {
  if (!cacheId.has(plik)) {
    const ids = new Set();
    for (const m of czytaj(plik).matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) ids.add(m[1]);
    cacheId.set(plik, ids);
  }
  return cacheId.get(plik).has(id);
}

const pliki = zbierz(ROOT);
let linki = 0;

for (const plik of pliki) {
  const html = czytaj(plik);
  const nazwa = rel(plik);
  for (const m of html.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/g)) {
    const link = m[1].trim();
    if (!link || /^(https?:|\/\/|mailto:|tel:|data:|javascript:)/i.test(link)) continue;
    if (link.startsWith('#') && link.length === 1) continue;
    linki++;
    const h = link.indexOf('#');
    const frag = h >= 0 ? link.slice(h + 1) : '';
    let sciezka = (h >= 0 ? link.slice(0, h) : link).split('?')[0];

    let cel = plik;
    if (sciezka) {
      const abs = sciezka.startsWith('/') ? join(ROOT, sciezka) + (sciezka.endsWith('/') ? '/' : '')
        : join(dirname(plik), sciezka) + (sciezka.endsWith('/') ? '/' : '');
      cel = znajdz(abs);
      if (!cel) { blad(nazwa, link, 'brak pliku docelowego'); continue; }
    }
    if (frag && !/^(z=|v=|k=)/.test(frag) && !frag.includes('=') && cel.endsWith('.html')) {
      if (!maId(cel, frag)) blad(nazwa, link, `brak id="${frag}" w ${rel(cel)}`);
    }
  }
}

// --- sitemap ---
const smPlik = join(ROOT, 'sitemap.xml');
const wSitemap = new Set();
const noindex = (p) => /<meta[^>]+name\s*=\s*["']robots["'][^>]*noindex/i.test(czytaj(p))
  || /<meta[^>]+noindex[^>]*name\s*=\s*["']robots["']/i.test(czytaj(p));
if (jestPlik(smPlik)) {
  for (const m of czytaj(smPlik).matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    const loc = m[1];
    if (!loc.startsWith('https://vicemap.pl/')) { blad('sitemap.xml', loc, 'adres spoza https://vicemap.pl/'); continue; }
    const cel = znajdz(join(ROOT, loc.slice('https://vicemap.pl/'.length)) + (loc.endsWith('/') ? '/' : ''));
    if (!cel) { blad('sitemap.xml', loc, 'brak pliku docelowego'); continue; }
    wSitemap.add(cel);
    if (cel.endsWith('.html') && noindex(cel)) blad('sitemap.xml', loc, 'strona ma meta robots noindex');
  }
  for (const k of ['znaczniki', 'kategorie', 'regiony', 'poradniki']) {
    const d = join(ROOT, k);
    if (!existsSync(d)) continue;
    for (const p of zbierz(d)) {
      if (!wSitemap.has(p) && !noindex(p)) blad(rel(p), '(sitemap.xml)', 'brak w sitemap');
    }
  }
} else {
  blad('sitemap.xml', '-', 'plik nie istnieje');
}

for (const b of bledy) console.log(b);
console.log(`\nPliki HTML: ${pliki.length}, linki: ${linki}, wpisy sitemap: ${wSitemap.size}, błędy: ${bledy.length}`);
process.exit(bledy.length ? 1 : 0);
