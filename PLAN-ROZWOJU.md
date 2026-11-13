# Plan rozwoju ViceMap

Stan na 13.11.2026. Premiera GTA 6: **19.11.2026** (wg `poradniki/premiera.html`).
Strona ma już: mapę z filtrami, wyszukiwarką i trackerem, zgłoszenia znaczników, 7 poradników, SEO (canonical, OG, sitemap), PWA, build i konfigurację Vercela. Opis techniczny jest w [README.md](README.md) – ten plik mówi tylko, **co zostało do zrobienia**.

## Etap 0 – do 18.11 (blokery startu)

Nic tu nie wymaga programowania, ale bez tego strona nie istnieje dla Google.

- [ ] **Wdrożenie na vicemap.pl** – projekt na Vercelu, domena, HTTPS. Sprawdzić, czy build (`node scripts/build.mjs`) przechodzi na Vercelu.
- [ ] **`js/config.js`: `kontaktEmail`** – bez niego formularz zgłoszeń nie ma dokąd pisać.
- [ ] **`polityka-prywatnosci.html`** – dwa miejsca oznaczone `UZUPEŁNIJ` (administrator danych, e-mail, hosting).
- [ ] **Supabase** – uruchomić `supabase/zgloszenia.sql`, wpisać `supabaseUrl` i klucz **anon** (nigdy `service_role`).
- [ ] **Google Search Console** – zweryfikować domenę, zgłosić `sitemap.xml`. Indeksacja trwa kilka dni, więc to najpilniejsze po wdrożeniu.
- [ ] **Analityka** – cokolwiek lekkiego, żeby po premierze wiedzieć, które strony ciągną ruch.
- [ ] **Test na telefonie** – mapa, filtry, tracker i „Dodaj do ekranu głównego" (większość ruchu będzie z mobile).

## Etap 1 – tydzień premiery (19–26.11)

Tu wygrywa treść, nie kod.

- [ ] **Własna mapa bazowa** zamiast `mapa.svg` – przerysowana, nie zrzut z gry (ryzyko DMCA). Potem: `js/config.js`, przeliczyć `x`/`y`, dopisać plik do `sw.js` i podbić `WERSJA`.
- [ ] **Prawdziwe znaczniki** w `data/znaczniki.json`; usunąć wszystkie z `"przyklad": true`. Zacząć od tego, czego szukają najpierw: sklepy z bronią, kryjówki, sklepy z ubraniami.
- [ ] **Poradnik `kody.html`** – tabela kodów po premierze.
- [ ] **`premiera.html`, `regiony.html`** – zaktualizować o fakty z gry, poprawić „Stan na …".
- [ ] **`jak-zarobic.html`** – ma `noindex` do czasu prawdziwej treści; po uzupełnieniu zdjąć tag i uruchomić build.
- [ ] **Promocja** – agenci `marketing` i `wideo` (patrz niżej).
- [ ] Po każdej zmianie plików statycznych: **podbić `WERSJA` w `sw.js`**, inaczej gracze z PWA zobaczą starą wersję.

## Etap 2 – pierwszy miesiąc

- [ ] **Moderacja zgłoszeń** – zgłoszenia z Supabase czytać regularnie (Table Editor → `zgloszenia`), dobre przenosić do `znaczniki.json`.
- [ ] **Kafelki zamiast jednego obrazka** – pełna mapa jako jeden plik będzie ciężka; przejść na `L.tileLayer`.
- [ ] **Grupowanie znaczników** – dopiero gdy pinezki się zlewają.
- [ ] **Poradniki pod frazy z Search Console** – brać tematy z tego, na co strona już się wyświetla.
- [ ] **Strony kategorii i znaczników** – build je generuje; sprawdzić w Search Console, czy są indeksowane.
- [ ] **Własne zdjęcie podglądu** (`img/og.png`) dopasowane do prawdziwej mapy.

## Etap 3 – tylko jeśli jest ruch

- [ ] **Monetyzacja** – `adsenseClient`, `wsparcieUrl`, linki afiliacyjne (`js/config.js`). Reklamy ładują się dopiero po zgodzie. **Strona zarabiająca wymaga planu Vercel Pro** – Hobby jest tylko niekomercyjny.
- [ ] **Dane strukturalne** (`Article`, `FAQPage`) w poradnikach.
- [ ] **Kolejne języki** – tylko jeśli polski rynek się nasyci.

## Promocja – agenci

Agenci leżą lokalnie w `.claude/agents/` (nie są w repo). Pracują na szkicach w `robocze/`, **nic nie publikują** – publikujesz Ty, ze swoich kont.

| Agent | Kiedy |
|---|---|
| `marketing` | Przed premierą: plan kanałów i szkice postów (Reddit, Discord, Facebook, Wykop, fora). Najpierw sprawdza zasady autopromocji każdego kanału |
| `wideo` | Scenariusze TikTok / Reels / Shorts. Przed premierą: data i platformy; po: konkretne lokalizacje |
| `opiekun-strony` | Dodawanie znaczników i poradników, build, drobne poprawki |

Ważne: dopóki wszystkie znaczniki są przykładowe, agenci mają zakaz obiecywania „pełnej mapy". Realna promocja mapy zaczyna się dopiero po Etapie 1.

## Ryzyka

| Ryzyko | Co z tym zrobić |
|---|---|
| **Prawa autorskie do mapy i grafik** (Take-Two) | Własna, przerysowana mapa; bez logo GTA/Rockstar; zastrzeżenie w stopce zostaje |
| **Przesunięcie premiery** | Daty są w `premiera.html`, `kody.html` i ich `description` – sprawdzić przed publikacją |
| **Spoilery** | Kategoria „Misje fabularne" jest domyślnie ukryta i bez własnych stron – nie zmieniać tego |
| **Stara wersja w PWA** | Zawsze podbijać `WERSJA` w `sw.js` |
| **Zmiana `id` znacznika** | Psuje zapisany postęp graczy i adres strony – nigdy nie zmieniać |
| **Konkurencja** | Nie ścigać się na liczbę znaczników; przewaga to polski język, szybkość i poradniki pod polskie frazy |
