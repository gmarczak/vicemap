# ViceMap – interaktywna mapa GTA 6 po polsku

Statyczna strona (HTML + JavaScript, bez frameworka). Mapa działa na [Leaflet](https://leafletjs.com/) dołączonym lokalnie w `vendor/leaflet`, a grupowanie znaczników na [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) 1.5.3 (licencja MIT) w `vendor/leaflet.markercluster-1.5.3`.

## Podgląd na własnym komputerze

Mapa wczytuje dane przez `fetch`, więc nie zadziała po dwukliku na `index.html`. Uruchom prosty serwer w folderze projektu:

```bash
npx serve -l 3000 .          # albo: python -m http.server 3000
```

i otwórz http://localhost:3000.

## Struktura

| Ścieżka | Co to jest |
| --- | --- |
| `index.html` | Strona z mapą |
| `data/kategorie.json` | Kategorie: nazwa, kolor, litera na pinezce, `spoiler: true` = domyślnie ukryta, `bezStron: true` = bez własnych stron w Google |
| `data/znaczniki.json` | Wszystkie znaczniki na mapie |
| `data/regiony.json` | Sześć regionów Leonidy: `id`, `nazwa`, `x`, `y`, `zrodlo` (skąd wzięto środek), `opis` (krótki, z rockstargames.com/VI) i `dopasuj` (człony pola `region` znaczników, które należą do regionu; puste = brak punktów). Podstawa linków `#v=x,y,zoom` w poradniku o regionach |
| `js/config.js` | Ustawienia: obraz mapy, Supabase, AdSense, wsparcie, linki partnerskie |
| `js/map.js` | Mapa: filtry, grupowanie, wyszukiwarka, tracker postępu, ulubione, prywatne notatki, eksport/import postępu, linki `#z=id` i `#v=x,y,zoom`, tryb edytora |
| `js/strona.js` | Wspólne dla wszystkich stron: baner zgód, reklamy po zgodzie, linki partnerskie |
| `js/zglos.js`, `zglos.html` | Formularz zgłoszeń znaczników |
| `poradniki/` | Poradniki (pisane ręcznie) |
| `data/zmiany.json` | Dziennik zmian: `[{data, tytul, opis}]`, najnowsze na górze; build waliduje i generuje `dziennik-zmian.html` |
| `o-projekcie.html` | Strona „O projekcie i źródłach danych” (ręczna) |
| `scripts/build.mjs` | Generuje `znaczniki/*.html`, `kategorie/*.html` (od 5 punktów, plus spis `kategorie/`), `regiony/*.html` (noindex poniżej 5 punktów), `dziennik-zmian.html`, sekcję na stronie głównej (między `<!-- BUILD:glowna -->`) i `sitemap.xml` |
| `scripts/sprawdz-linki.mjs` | Sprawdza linki wewnętrzne, fragmenty `#id` i zgodność sitemap ze stronami |
| `supabase/zgloszenia.sql` | Tabela na zgłoszenia |
| `sw.js`, `manifest.webmanifest` | Tryb offline i „Dodaj do ekranu głównego”. Kafelki mapy (`/tiles/`) mają osobny cache `vicemap-kafelki` (w locie, limit 800, nie są prekaszowane) |
| `tiles/yanis-17/{z}/{x}_{y}.jpg` | Kafelki mapy GTADB (CC BY 4.0), poziomy 0-4, 1624 pliki, ok. 8 MB, tylko obszar mapy (bez panelu z legendą i zrzutami Rockstara). Licencja i opis zmian: `tiles/LICENSE-TILES.txt`. Pobranie/odświeżenie: `python -I scripts/pobierz-kafelki.py` (Pillow). `mapa.webp` zostaje jako podkład offline pod kafelkami |
| `scripts/aktualizuj-gtadb.mjs`, `data/gtadb-wybor.json` | Synchronizacja z GTADB: `node scripts/aktualizuj-gtadb.mjs [--plik landmarks.json]` wypisuje nowe punkty z nazwą z gry (po filtrze szumu), przesunięte, zmienione i usunięte u źródła. `--zapisz` dopisuje tylko nowe punkty z `data/gtadb-wybor.json` (ręcznie przejrzone: kategoria + etykieta), `--uzupelnij-gps` dopisuje `odpowiednikGps`, `--przesun` przesuwa istniejące (domyślnie nigdy). Nigdy nie zmienia istniejących `id` |
| `scripts/pobierz-kafelki.py` | Pobiera i przycina kafelki GTADB do `tiles/` |
| `vendor/leaflet.fullscreen-5.3.3`, `vendor/leaflet-minimap-3.6.1` | Wtyczki Leaflet: pełny ekran ([leaflet.fullscreen](https://github.com/brunob/leaflet.fullscreen), MIT) i minimapa ([Leaflet-MiniMap](https://github.com/Norkart/Leaflet-MiniMap), BSD-2-Clause); sumy kontrolne tarballi zgodne z registry.npmjs.org. Miniatura mapy dla minimapy: `img/podglad-mapy.webp` (320 px, z `mapa.webp`) |

## Jak dodać znacznik

1. Otwórz mapę z dopiskiem `?edytor`, np. http://localhost:3000/?edytor
2. Kliknij miejsce na mapie – dostaniesz gotowy wpis z `x` i `y`. Kliknij „Kopiuj”.
3. Wklej go do `data/znaczniki.json` i uzupełnij (opcjonalnie `odpowiednikGps: [lat, lon]` – wtedy popup ma link „Zobacz prawdziwe miejsce (OpenStreetMap)”, zwykły odnośnik, nic z OSM się nie ładuje):
   - `id` – unikalny, małe litery, cyfry i myślniki, bez polskich znaków (np. `sklep-z-bronia-ocean-beach`). **Nie zmieniaj go później** – na nim opiera się zapisany postęp graczy i adres strony znacznika.
   - `kategoria` – `id` z `data/kategorie.json`
   - `nazwa`, `opis`, opcjonalnie `region`
   - opcjonalnie `odpowiednik` (prawdziwe miejsce, np. „Ocean Drive, Miami”; niepusty tekst do 150 znaków) i `zrodlo` (`gtadb`, `zgloszenie` albo `gra`). Znacznik z `zrodlo: "gtadb"` dostaje na swojej stronie (jeśli ją ma) dopisek „zidentyfikowane przez społeczność GTADB, niepotwierdzone przed premierą”
4. Uruchom `npm run build` (albo `node scripts/build.mjs`). Skrypt sprawdzi dane, a przy błędzie się zatrzyma i napisze, co poprawić.

Znaczniki z `"przyklad": true` widać na mapie, ale nie dostają własnych stron ani wpisu w sitemap. **Po premierze usuń przykładowe znaczniki** z `data/znaczniki.json`.

Znaczniki z kategorii ze spoilerami (misje) też nie dostają stron, żeby nie zdradzać fabuły w Google. Kategorie z `bezStron: true` (m.in. punkty orientacyjne, sklepy, hotele, transport – setki punktów z GTADB) są na mapie, ale bez własnych stron, żeby nie zalać Google cienkimi podstronami.

## Po premierze: szybkie dodawanie znaczników

1. Otwórz mapę z `?edytor`, kliknij miejsce, kliknij „Kopiuj”.
2. Wklej wpis do `data/znaczniki.json`, uzupełnij `kategoria`, `nazwa`, `opis` (30-400 znaków), `region`.
3. Usuń `"przyklad": true` (z przykładów, które zamieniasz na prawdziwe) i w razie potrzeby `bezStron` z kategorii w `data/kategorie.json` (kategorie z danymi z GTADB mają je do premiery).
4. `npm run build` – popraw wszystko, co wypisze walidacja (patrz niżej).
5. Sprawdź kilka wygenerowanych `znaczniki/*.html` w przeglądarce (`npx serve`) oraz `node scripts/test-szablon.mjs`.
6. Podbij `WERSJA` w `sw.js`, zrób commit.

Zasady:
- Tylko jawnie otwarte źródła (np. GTADB, CC BY 4.0) z atrybucją w stopce; nic z przecieków, nic cudzego bez licencji.
- Stan danych: 403 znaczniki (z GTADB, CC BY 4.0). Atrybucja kafelków: „GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org” (stopka, mapa, O projekcie, `tiles/LICENSE-TILES.txt`). Po dodaniu znaczników zaktualizuj liczbę w meta description `index.html` i wpis w `data/zmiany.json`.
- Hosting: dla `/tiles/` warto dodać w `vercel.json` nagłówek `Cache-Control: public, max-age=2592000, stale-while-revalidate=86400` (kafelki są statyczne; zmieniając je, zmień też ścieżkę katalogu).
- Dane z GTADB (CC BY 4.0) są oznaczone jako niepotwierdzone przed premierą. Sklepy, hotele i transport mają punkty z GTADB; kategoria `bron` tylko sklepy z bronią nazwane w GTADB; `kryjowki` i `znajdzki` zostają puste do premiery.
- `id` raz nadane się nie zmienia (postęp graczy i adres strony).

Walidacja w `scripts/build.mjs` wypisuje **wszystkie** błędy naraz (plik, numer pozycji, id, podpowiedź) i kończy się kodem != 0: powtórzone lub niepoprawne `id`, nieznana kategoria, brak nazwy lub opisu, opis krótszy niż 30 albo dłuższy niż 400 znaków, `x`/`y` nie będące liczbami lub poza wymiarami mapy z `js/config.js`. Sprawdza też pola opcjonalne: `odpowiednik` (niepusty tekst do 150 znaków), `zrodlo` (jedna z: `gtadb`, `zgloszenie`, `gra`), `region` (tekst), oraz `data/regiony.json` (tablica, unikalne `id`, nazwa, `x`/`y` w granicach mapy). **Ostrzeżenia** (nie przerywają builda): znaczniki z `przyklad: true` oraz dwa znaczniki leżące bliżej niż 8 px, które mają tę samą lub prawie tę samą nazwę (bez wielkości liter, ogonków, nawiasów i cyfr na końcu) albo identyczne `x`,`y`. Różne lokale blisko siebie (np. w jednym pasażu) nie dają ostrzeżenia.

Test: `node scripts/test-szablon.mjs` buduje strony na tymczasowej kopii danych (ze zmyślonymi wpisami, tylko na test; repo zostaje nietknięte), sprawdza title/description, JSON-LD, canonical, linki wewnętrzne, walidację (w tym nowe pola, regiony i reguły ostrzeżeń) oraz dopiski „Pewność” i „Prawdziwy odpowiednik” na stronie znacznika. Generator czyta też zmienne `VICEMAP_DANE` (katalog z JSON-ami) i `VICEMAP_WYJSCIE` (katalog wyjściowy).

## Dane gracza (tylko w przeglądarce)

Zaliczone znaczniki, ulubione (gwiazdka), prywatne notatki (do 500 znaków na znacznik) i filtry trafiają do `localStorage` pod kluczami `vicemap.*` – nic nie jest wysyłane na serwer. Przycisk eksportu zapisuje plik `vicemap-postep.json` (format postępu **v2**: `zaliczone`, `ulubione`, `notatki`), a import wczytuje go z powrotem, także starszą wersję 1 (tylko `zaliczone`). Zmieniając format, podbij `WERSJA_POSTEPU` w `js/map.js` i zachowaj odczyt starych wersji.

## Podmiana mapy po premierze

1. Przygotuj obraz mapy (najlepiej **własny, przerysowany** – nie zrzut z gry, patrz „Ryzyka” niżej).
2. Wrzuć go np. jako `mapa.webp` i ustaw w `js/config.js`: `mapa: { obraz: "/mapa.webp", szerokosc: <px>, wysokosc: <px> }`.
3. Przy zmianie wymiarów przelicz `x`/`y` istniejących znaczników.
4. W `sw.js` dopisz nowy plik do listy `PODSTAWOWE` i podbij `WERSJA`.

## Zgłoszenia przez Supabase

1. W Supabase: SQL Editor → wklej `supabase/zgloszenia.sql` → Run.
2. W `js/config.js` ustaw `supabaseUrl` i `supabaseAnonKey` (klucz publiczny **anon/publishable**, nigdy `service_role`).
3. Zgłoszenia czytasz w Table Editor → `zgloszenia`. Odwiedzający mogą je tylko dodawać – nie mogą ich czytać ani zmieniać.

Bez Supabase formularz otwiera program pocztowy z gotową wiadomością na adres `kontaktEmail`.

## Monetyzacja

- **Reklamy:** wpisz `adsenseClient` w `js/config.js`. Skrypt AdSense ładuje się dopiero po zgodzie w banerze. Baner pojawia się tylko wtedy, gdy reklamy są włączone.
- **Wsparcie:** `wsparcieUrl` (np. buycoffee.to) pokazuje link w stopce.
- **Linki partnerskie:** linki z atrybutem `data-sklep="ceneo"` (albo `eneba`, `amazon`) dostaną adres z `afiliacja` w configu i oznaczenie `rel="sponsored"`.

## Przed startem uzupełnij

- [ ] `polityka-prywatnosci.html` – administrator danych, e-mail, hosting (miejsca oznaczone `UZUPEŁNIJ`)
- [ ] `js/config.js` – `kontaktEmail`, potem Supabase, AdSense, wsparcie
- [ ] `poradniki/jak-zarobic.html` – ma `noindex`, dopóki nie ma prawdziwej treści; po uzupełnieniu usuń ten meta tag i uruchom build

## Wdrożenie

Na Vercelu `vercel.json` uruchamia `node scripts/build.mjs` przy każdym deployu. Na innym hostingu uruchom build lokalnie i wypchnij wygenerowane pliki. Strona zarabiająca na reklamach wymaga planu Vercel Pro (plan Hobby jest tylko do użytku niekomercyjnego).

## Ryzyka

Strona jest nieoficjalna. Rockstar toleruje niekomercyjne użycie materiałów z gier i może zażądać usunięcia w każdej chwili. Dlatego: bez logo GTA i Rockstar, bez przecieków, bez spoilerów, a mapa bazowa najlepiej własna.

## Dzień premiery (19.11.2026) – checklista

Kolejność, od treści do wdrożenia:

1. **Odliczanie i teksty „niepotwierdzone”.** Odliczanie (`js/map.js`, `stanOdliczania`) samo zmienia się na „Gra jest już dostępna” o lokalnej północy 19.11.2026 użytkownika, bez przeładowania. Po premierze usuń z danych i tekstów sformułowania „niepotwierdzone przed premierą” (popup: `blokDowodu` w `js/map.js`, opisy kategorii, strona główna) tam, gdzie punkt potwierdzono w grze.
2. **Poradnik premiery:** `poradniki/premiera.html` (godziny odblokowania, preload, platformy), `poradniki/preload-i-rozmiar*.html` (rozmiar po instalacji), poradnik o cenach (ceny/edycje), PC – jeśli padnie ogłoszenie.
3. **Tabela kodów** w `kody.html` – odkomentuj szablon i wpisz sprawdzone w grze kody. **`poradniki/jak-zarobic.html`** – uzupełnij prawdziwą treścią, usuń `noindex`. **Regiony wg gry** – popraw `data/regiony.json` (nazwy, środki `x`/`y`) i linki `#v=x,y,zoom` w poradniku o regionach.
4. **Znaczniki:** `node scripts/dodaj-znaczniki.mjs plik.csv --zapisz` (CSV lub JSON z polami `nazwa`, `kategoria`, `x`, `y`, `opis`, `region`, opcjonalnie `odpowiednik`, `zrodlo`). Pojedyncze wpisy: mapa z `?edytor` → „Kopiuj wpis”. Usuń znaczniki z `przyklad: true`.
5. **Kontrola danych:** `node scripts/kontrola-danych.mjs`, potem `npm run build` (waliduje dane, generuje strony i sitemap), `node scripts/test-szablon.mjs`.
6. **Testy i pomiary:** `node scripts/test-odliczanie.mjs`, `node scripts/pomiary.mjs` (poniżej).
7. **`sw.js`:** podbij `WERSJA` (i dopisz nowe pliki do cache).
8. `git checkout sitemap.xml`, jeśli build zmienił w nim tylko daty.
9. **Wdrożenie:** commit → push do `main` → Vercel buduje sam; sprawdź na produkcji mapę, popup, odliczanie i `/poradniki/premiera.html`.

## Pomiary i testy

- `node scripts/test-odliczanie.mjs` – uruchamia logikę odliczania (wycinaną z `js/map.js`) w procesach z `TZ` = Europe/Warsaw, America/New_York, Pacific/Auckland, UTC, Pacific/Kiritimati i sprawdza stan 1 ms przed i w chwili lokalnej północy 19.11.2026.
- `node scripts/pomiary.mjs` – rozmiary zasobów strony mapy (surowe i gzip).

Pomiary z 13.11.2026 (Chrome w panelu, emulacja telefonu 375x812, serwer lokalny, bez throttlingu sieci i CPU – wartości orientacyjne):

| Metryka | Wynik |
| --- | --- |
| Żądania strony mapy | 13 (HTML, 3 CSS, 5 JS, `mapa.webp`, 3 JSON, ikona) |
| Waga zasobów (transfer) | ok. 1,3 MB; `mapa.webp` 903 kB (nie kompresuje się), `znaczniki.json` 159 kB / 17 kB gzip, `leaflet.js` 148 kB / 42 kB gzip, `map.js` 46 kB / 14 kB gzip, `style.css` 18,5 kB / 5 kB gzip |
| DOMContentLoaded / load | ok. 180 ms |
| Czas do pierwszych znaczników | ok. 80 ms po starcie ładowania ramki |
| Elementy DOM / znaczniki na starcie | 458 / 44 (reszta w klastrach) |
| Long tasks | 0 |

Wniosek: bez wąskich gardeł, optymalizacji (lazy-init, chunkowanie) nie wprowadzano. Po dodaniu setek znaczników zmierz ponownie.
