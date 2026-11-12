# ViceMap – interaktywna mapa GTA 6 po polsku

Statyczna strona (HTML + JavaScript, bez frameworka). Mapa działa na [Leaflet](https://leafletjs.com/) dołączonym lokalnie w `vendor/leaflet`.

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
| `data/kategorie.json` | Kategorie: nazwa, kolor, litera na pinezce, `spoiler: true` = domyślnie ukryta |
| `data/znaczniki.json` | Wszystkie znaczniki na mapie |
| `js/config.js` | Ustawienia: obraz mapy, Supabase, AdSense, wsparcie, linki partnerskie |
| `js/map.js` | Mapa: filtry, regiony, wyszukiwarka, tracker, notatki, własne pinezki, profile, karta postępu, tryb edytora |
| `js/postep.js` | Zapis postępu w przeglądarce (profile, zaliczone, notatki, pinezki, kopia zapasowa) |
| `js/lista.js` | Odhaczanie na liście 100% |
| `js/strona.js` | Wspólne dla wszystkich stron: baner zgód, reklamy po zgodzie, linki partnerskie |
| `js/zglos.js`, `zglos.html` | Formularz zgłoszeń znaczników |
| `poradniki/` | Poradniki (pisane ręcznie) |
| `scripts/build.mjs` | Generuje `znaczniki/*.html`, `kategorie/*.html` i `sitemap.xml` z danych |
| `supabase/zgloszenia.sql` | Tabela na zgłoszenia |
| `sw.js`, `manifest.webmanifest` | Tryb offline i „Dodaj do ekranu głównego” |

## Jak dodać znacznik

1. Otwórz mapę z dopiskiem `?edytor`, np. http://localhost:3000/?edytor
2. Kliknij miejsce na mapie – dostaniesz gotowy wpis z `x` i `y`. Kliknij „Kopiuj”.
3. Wklej go do `data/znaczniki.json` i uzupełnij:
   - `id` – unikalny, małe litery, cyfry i myślniki, bez polskich znaków (np. `sklep-z-bronia-ocean-beach`). **Nie zmieniaj go później** – na nim opiera się zapisany postęp graczy i adres strony znacznika.
   - `kategoria` – `id` z `data/kategorie.json`
   - `nazwa`, `opis`
   - opcjonalnie:
     - `region` – np. `Vice City`; z tych wartości powstaje filtr regionów na mapie
     - `status` – `potwierdzone` (sprawdzone osobiście) albo `spolecznosc` (ze zgłoszenia, jeszcze niesprawdzone)
     - `dodano` – data `RRRR-MM-DD`; najnowsze trafiają do sekcji „Nowe znaleziska” na stronie głównej
     - `autor` – podpis ze zgłoszenia; pokazuje się przy znaczniku i w rankingu odkrywców (`odkrywcy.html`)
     - `zrodlo` – adres `https://…`, jeśli informacja pochodzi z innego miejsca
4. Uruchom `npm run build` (albo `node scripts/build.mjs`). Skrypt sprawdzi dane, a przy błędzie się zatrzyma i napisze, co poprawić. Odświeży też „Nowe znaleziska” w `index.html`, `lista-100.html`, `odkrywcy.html` i `sitemap.xml`.

Znaczniki z `"przyklad": true` widać na mapie, ale nie dostają własnych stron ani wpisu w sitemap. **Po premierze usuń przykładowe znaczniki** z `data/znaczniki.json`.

Znaczniki z kategorii ze spoilerami (misje) też nie dostają stron, żeby nie zdradzać fabuły w Google.

## Co potrafi mapa (dla graczy)

- filtry kategorii i regionów, wyszukiwarka (też po własnych notatkach), skrót `/`
- „Zaliczone” przy każdym miejscu, licznik postępu, „Ukryj zaliczone”, strzałka › do najbliższego niezaliczonego
- własne notatki do znaczników i własne pinezki
- do 5 profili przejść, kopia zapasowa postępu do pliku i wczytywanie kopii
- „Udostępnij postęp” – obrazek z wynikiem do wrzucenia na social media
- lista 100% (`lista-100.html`) zsynchronizowana z mapą
- linki do miejsc (`/#z=id`) i do widoku kategorii (`/?kategoria=bron` albo `/?kategoria=bron,sklepy`)
- odliczanie do premiery, które znika samo 19 listopada o północy

Wszystko zapisuje się tylko w przeglądarce gracza – bez kont i bez wysyłania danych.

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
