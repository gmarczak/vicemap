// Interaktywna mapa ViceMap: filtry, wyszukiwarka, tracker postępu, linki do znaczników.
(function () {
  "use strict";

  const CFG = window.VICEMAP_CONFIG || {};
  const MAPA = CFG.mapa || { obraz: "/mapa.webp", szerokosc: 3200, wysokosc: 4357 };
  const TRYB_EDYTORA = new URLSearchParams(location.search).has("edytor");
  const MAKS_WYNIKOW = 12;
  const ZOOM_UKRYCIA_ETYKIET = 0.5; // przy większym przybliżeniu nazwy regionów tylko by zasłaniały
  const bezAnimacji = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Pamięć przeglądarki (może być wyłączona, więc zawsze w try/catch) ---
  const pamiec = {
    czytaj(klucz, domyslnie) {
      try {
        const v = localStorage.getItem("vicemap." + klucz);
        return v === null ? domyslnie : JSON.parse(v);
      } catch (e) { return domyslnie; }
    },
    zapisz(klucz, wartosc) {
      try { localStorage.setItem("vicemap." + klucz, JSON.stringify(wartosc)); } catch (e) { /* brak pamięci */ }
    }
  };

  const el = (tag, wlasciwosci, ...dzieci) => {
    const e = Object.assign(document.createElement(tag), wlasciwosci || {});
    for (const d of dzieci) if (d != null) e.append(d);
    return e;
  };
  const bezOgonkow = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
  // 1 znacznik, 2 znaczniki, 5 znaczników, 22 znaczniki
  const odmiana = (n, jeden, kilka, wiele) =>
    n === 1 ? jeden : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? kilka : wiele);

  // --- Stan ---
  const zaliczone = new Set(pamiec.czytaj("zaliczone", []));
  let ukryjZaliczone = pamiec.czytaj("ukryjZaliczone", false);
  let widoczneKategorie = null; // ustawiane po wczytaniu kategorii
  const znacznikiPoId = new Map(); // id -> { dane, marker, szukaj }
  const naMapie = new Set();       // id znaczników dodanych do grupy klastrów
  let wymuszony = null;            // id otwarty z linku/wyszukiwarki mimo filtrów (spoiler, zaliczony)
  let kategorie = [];
  let kategoriePoId = new Map();

  // --- Mapa ---
  const granice = [[0, 0], [MAPA.wysokosc, MAPA.szerokosc]];
  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -4, // zawężane niżej do dopasowania mapy do ekranu
    maxZoom: 3,
    maxBounds: [[-MAPA.wysokosc * 0.25, -MAPA.szerokosc * 0.25], [MAPA.wysokosc * 1.25, MAPA.szerokosc * 1.25]],
    zoomSnap: 0.25,
    attributionControl: true
  });
  map.attributionControl.setPrefix(false).addAttribution(
    'Mapa i punkty: <a href="https://map.gtadb.org" target="_blank" rel="noopener">GTADB</a> / Yanis V17, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> (zmieniono)'
  );
  L.imageOverlay(MAPA.obraz, granice).addTo(map);
  map.fitBounds(granice);
  // Nie pozwalaj oddalić mapy bardziej niż do całości widocznej na ekranie.
  const zoomCalosci = map.getZoom();
  map.setMinZoom(Math.min(-2, zoomCalosci));
  // Telefon: start trochę bliżej, żeby znaczniki nie były mikroskopijne.
  const waskiEkran = window.matchMedia("(max-width: 760px)");
  const paramyStartowe = new URLSearchParams(location.hash.slice(1));
  if (waskiEkran.matches && !paramyStartowe.has("z") && !paramyStartowe.has("v")) map.setView(map.getBounds().getCenter(), zoomCalosci + 0.75, { animate: false });

  // Wszystkie znaczniki w jednej grupie: przy oddaleniu łączą się w klastry z liczbą.
  const grupa = L.markerClusterGroup({
    maxClusterRadius: 50,
    disableClusteringAtZoom: 2, // od zoomu 2 każdy znacznik osobno
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false, // bez chunkedLoading: addLayers jest synchroniczne, więc zoomToShowLayer od razu zna klaster
    animate: !bezAnimacji,
    iconCreateFunction(klaster) {
      const n = klaster.getChildCount();
      const rozmiar = n < 10 ? 44 : n < 100 ? 50 : 58;
      return L.divIcon({
        className: "klaster-ikona",
        html: el("span", { className: "klaster" },
          el("span", { textContent: n, ariaHidden: "true" }),
          el("span", { className: "ukryta-etykieta", textContent: `${n} ${odmiana(n, "znacznik", "znaczniki", "znaczników")} – przybliż` })),
        iconSize: [rozmiar, rozmiar]
      });
    }
  }).addTo(map);

  // Nazwy regionów: sama dekoracja (nazwy są też w tekście strony), nie łapią kliknięć.
  const panelEtykiet = map.createPane("etykiety");
  panelEtykiet.setAttribute("aria-hidden", "true");
  const odswiezEtykiety = () => panelEtykiet.classList.toggle("etykiety--ukryte", map.getZoom() > ZOOM_UKRYCIA_ETYKIET);
  map.on("zoomend", odswiezEtykiety);
  odswiezEtykiety();
  function dodajEtykiety(regiony) {
    if (!Array.isArray(regiony)) return console.warn("regiony.json: oczekiwano tablicy");
    for (const r of regiony) {
      if (!r || typeof r.nazwa !== "string" || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
      L.marker([r.y, r.x], {
        pane: "etykiety", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "etykieta-regionu", html: el("span", { textContent: r.nazwa }), iconSize: null })
      }).addTo(map);
    }
  }

  function ikona(kat, zrobione, nazwa) {
    return L.divIcon({
      className: "",
      html: el("span", { className: "pin-wrap" },
        el("span", { className: "pin" + (zrobione ? " pin--zaliczone" : ""), style: `--kolor:${kat.kolor}`, textContent: zrobione ? "✓" : kat.znak, ariaHidden: "true" }),
        el("span", { className: "ukryta-etykieta", textContent: nazwa + (zrobione ? " (zaliczone)" : "") })),
      iconSize: [44, 44], // pole dotyku 44px, sam pin ma 30px
      iconAnchor: [22, 22],
      popupAnchor: [0, -18]
    });
  }

  // Strony znaczników generuje scripts/build.mjs – tylko dla prawdziwych, jawnych kategorii.
  function maStrone(z) {
    const kat = kategoriePoId.get(z.kategoria);
    return !z.przyklad && !!kat && !kat.spoiler && !kat.bezStron;
  }

  function trescPopupu(z) {
    const kat = kategoriePoId.get(z.kategoria);
    const pole = el("input", { type: "checkbox", checked: zaliczone.has(z.id) });
    pole.setAttribute("role", "switch");
    pole.addEventListener("change", () => ustawZaliczone([z.id], pole.checked));

    const kopiuj = el("button", { type: "button", className: "przycisk przycisk--maly", textContent: "Kopiuj link" });
    let czasKopiowania = 0;
    kopiuj.addEventListener("click", async () => {
      const link = location.origin + location.pathname + "#z=" + encodeURIComponent(z.id);
      try { await navigator.clipboard.writeText(link); kopiuj.textContent = "Skopiowano ✓"; }
      catch (e) { prompt("Skopiuj link:", link); return; }
      clearTimeout(czasKopiowania);
      czasKopiowania = setTimeout(() => { kopiuj.textContent = "Kopiuj link"; }, 2000);
    });

    const linki = el("div", { className: "popup__akcje" }, kopiuj,
      el("a", { className: "przycisk przycisk--maly", href: "/zglos.html?z=" + encodeURIComponent(z.id), textContent: "Zgłoś poprawkę" }));
    if (maStrone(z)) {
      linki.append(el("a", { className: "przycisk przycisk--maly", href: "/znaczniki/" + encodeURIComponent(z.id) + ".html", textContent: "Szczegóły" }));
    }

    return el("div", { className: "popup" },
      el("strong", { className: "popup__nazwa", textContent: z.nazwa }),
      el("div", { className: "popup__kategoria" },
        el("span", { className: "pin pin--maly", style: `--kolor:${kat ? kat.kolor : "#999"}`, textContent: kat ? kat.znak : "•", ariaHidden: "true" }),
        kat ? kat.nazwa : z.kategoria),
      z.region ? el("div", { className: "popup__region", textContent: z.region }) : null,
      z.opis ? el("p", { textContent: z.opis }) : null,
      z.przyklad ? el("p", { className: "popup__uwaga", textContent: "Przykładowy znacznik – prawdziwe lokalizacje dodamy po premierze." }) : null,
      el("label", { className: "popup__zaliczone" }, pole, el("span", { textContent: "Zaliczone" })),
      linki
    );
  }

  // Zmiana postępu dla wielu znaczników naraz – widoczność i liczniki odświeżane raz.
  function ustawZaliczone(ids, wartosc) {
    for (const id of ids) {
      if (wartosc) zaliczone.add(id); else zaliczone.delete(id);
      const wpis = znacznikiPoId.get(id);
      if (!wpis) continue;
      wpis.marker.setIcon(ikona(kategoriePoId.get(wpis.dane.kategoria), wartosc, wpis.dane.nazwa));
      if (ukryjZaliczone && wartosc) wpis.marker.closePopup();
    }
    pamiec.zapisz("zaliczone", [...zaliczone]);
    odswiezWidocznosc();
    odswiezLiczniki();
  }

  function czyWidoczny(z) {
    if (z.id === wymuszony) return true;
    return widoczneKategorie.has(z.kategoria) && !(ukryjZaliczone && zaliczone.has(z.id));
  }

  // Wsadowo: addLayers/removeLayers przeliczają klastry raz, a nie przy każdym znaczniku.
  function odswiezWidocznosc() {
    const dodaj = [], usun = [];
    for (const [id, { dane, marker }] of znacznikiPoId) {
      const pokaz = czyWidoczny(dane) || marker.isPopupOpen();
      if (pokaz && !naMapie.has(id)) { naMapie.add(id); dodaj.push(marker); }
      else if (!pokaz && naMapie.has(id)) { naMapie.delete(id); usun.push(marker); }
    }
    if (usun.length) grupa.removeLayers(usun);
    if (dodaj.length) grupa.addLayers(dodaj);
  }

  // --- Panel: filtry, postęp, wyszukiwarka ---
  const panel = document.getElementById("panel");
  const listaFiltrow = document.getElementById("filtry");
  const postepOgolny = document.getElementById("postep");
  const licznikiKategorii = new Map();
  const przyciskPanelu = document.getElementById("przelacz-panel");
  const panelOtwarty = () => panel.classList.contains("panel--otwarty");
  function zamknijPanel() {
    panel.classList.remove("panel--otwarty");
    przyciskPanelu.setAttribute("aria-expanded", "false");
    przyciskPanelu.textContent = "Filtry i szukaj";
    ustawInert();
  }
  // Zamknięta szuflada na telefonie jest poza kolejnością tabulatora i czytnikiem ekranu.
  function ustawInert() {
    panel.inert = waskiEkran.matches && !panelOtwarty();
  }
  function otworzPanel() {
    panel.classList.add("panel--otwarty");
    przyciskPanelu.setAttribute("aria-expanded", "true");
    przyciskPanelu.textContent = "Pokaż mapę";
    ustawInert();
  }

  function zbudujFiltry() {
    listaFiltrow.replaceChildren();
    for (const kat of kategorie) {
      const pole = el("input", { type: "checkbox", checked: widoczneKategorie.has(kat.id) });
      pole.addEventListener("change", () => {
        if (pole.checked) widoczneKategorie.add(kat.id); else widoczneKategorie.delete(kat.id);
        pamiec.zapisz("filtry", [...widoczneKategorie]);
        odswiezWidocznosc();
        zapiszAdres();
      });
      const licznik = el("span", { className: "filtr__licznik" });
      const dopisek = el("span", { className: "filtr__dopisek", textContent: "uzupełnimy po premierze" });
      licznikiKategorii.set(kat.id, { licznik, dopisek, li: null });
      const li = el("li", null,
        el("label", { className: "filtr" }, pole,
          el("span", { className: "pin pin--maly", style: `--kolor:${kat.kolor}`, textContent: kat.znak, ariaHidden: "true" }),
          el("span", { className: "filtr__nazwa" }, kat.nazwa + (kat.spoiler ? " (spoilery)" : ""), dopisek),
          licznik));
      licznikiKategorii.get(kat.id).li = li;
      listaFiltrow.append(li);
    }
  }

  function odswiezLiczniki() {
    const ile = new Map(kategorie.map((k) => [k.id, { razem: 0, zrobione: 0 }]));
    for (const { dane } of znacznikiPoId.values()) {
      const s = ile.get(dane.kategoria);
      s.razem++;
      if (zaliczone.has(dane.id)) s.zrobione++;
    }
    let wszystkie = 0, zrobione = 0;
    for (const [id, s] of ile) {
      wszystkie += s.razem; zrobione += s.zrobione;
      const w = licznikiKategorii.get(id);
      if (!w) continue;
      w.licznik.textContent = s.razem ? `${s.zrobione}/${s.razem}` : "0";
      w.li.classList.toggle("filtr--puste", !s.razem);
    }
    const procent = wszystkie ? Math.round((zrobione / wszystkie) * 100) : 0;
    postepOgolny.querySelector(".postep__tekst").textContent = `Zaliczone: ${zrobione} z ${wszystkie} (${procent}%)`;
    postepOgolny.querySelector(".postep__pasek span").style.width = procent + "%";
  }

  function ustawPrzelaczniki() {
    const ukryj = document.getElementById("ukryj-zaliczone");
    ukryj.checked = ukryjZaliczone;
    ukryj.addEventListener("change", () => {
      ukryjZaliczone = ukryj.checked;
      pamiec.zapisz("ukryjZaliczone", ukryjZaliczone);
      odswiezWidocznosc();
    });
    document.getElementById("pokaz-wszystkie").addEventListener("click", () => {
      widoczneKategorie = new Set(kategorie.filter((k) => !k.spoiler).map((k) => k.id));
      pamiec.zapisz("filtry", [...widoczneKategorie]);
      zbudujFiltry(); odswiezLiczniki(); odswiezWidocznosc(); zapiszAdres();
    });
    document.getElementById("ukryj-wszystkie").addEventListener("click", () => {
      widoczneKategorie = new Set();
      pamiec.zapisz("filtry", []);
      zbudujFiltry(); odswiezLiczniki(); odswiezWidocznosc(); zapiszAdres();
    });
    document.getElementById("resetuj-postep").addEventListener("click", () => {
      if (!confirm("Wyczyścić cały zapisany postęp na tym urządzeniu?")) return;
      ustawZaliczone([...zaliczone], false);
    });
    document.getElementById("kopiuj-widok").addEventListener("click", kopiujLinkWidoku);
    document.getElementById("pobierz-postep").addEventListener("click", pobierzPostep);
    const plikPostepu = document.getElementById("wczytaj-postep");
    plikPostepu.addEventListener("change", () => {
      if (plikPostepu.files[0]) wczytajPostep(plikPostepu.files[0]);
      plikPostepu.value = ""; // pozwala wybrać ten sam plik jeszcze raz
    });
    przyciskPanelu.addEventListener("click", () => {
      if (panelOtwarty()) zamknijPanel();
      else otworzPanel();
    });
    document.querySelector(".panel__uchwyt").addEventListener("click", () => { zamknijPanel(); przyciskPanelu.focus(); });
    map.on("click", zamknijPanel);
    map.on("popupopen", () => { if (waskiEkran.matches) zamknijPanel(); });
    waskiEkran.addEventListener("change", ustawInert);
    ustawInert();
  }

  // --- Skróty klawiaturowe: "/" szukaj, "f" filtry, Esc zamyka dymek lub szufladę ---
  function ustawSkroty() {
    const pole = document.getElementById("szukaj");
    document.addEventListener("keydown", (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") {
        if (map._popup && map._popup.isOpen()) { map.closePopup(); return; }
        if (waskiEkran.matches && panelOtwarty()) { zamknijPanel(); przyciskPanelu.focus(); }
        return;
      }
      const t = e.target;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "/") {
        e.preventDefault();
        if (waskiEkran.matches) otworzPanel();
        pole.focus();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (waskiEkran.matches && panelOtwarty()) { zamknijPanel(); przyciskPanelu.focus(); return; }
        if (waskiEkran.matches) otworzPanel();
        const pierwszy = listaFiltrow.querySelector("input");
        if (pierwszy) pierwszy.focus();
      }
    });
  }

  function pokazZnacznik(id) {
    const wpis = znacznikiPoId.get(id);
    if (!wpis) return false;
    const kat = kategoriePoId.get(wpis.dane.kategoria);
    // Link do misji pokazuje tylko tę jedną misję – reszta spoilerów zostaje ukryta.
    if (!kat.spoiler && !widoczneKategorie.has(kat.id)) {
      widoczneKategorie.add(kat.id);
      pamiec.zapisz("filtry", [...widoczneKategorie]);
      zbudujFiltry(); odswiezLiczniki();
    }
    // Znacznik ukryty (spoiler, zaliczony) też da się otworzyć z linku lub wyszukiwarki.
    wymuszony = id;
    odswiezWidocznosc();
    zamknijPanel();
    // Bez wcześniejszego setView: gdy mapa jest już wyśrodkowana na znaczniku, panTo w zoomToShowLayer
    // nic nie robi, nie ma moveend i dymek by się nie otworzył. zoomToShowLayer sam przybliża klaster.
    grupa.zoomToShowLayer(wpis.marker, () => wpis.marker.openPopup());
    return true;
  }

  // --- Wyszukiwarka: wzorzec ARIA combobox z listą podpowiedzi ---
  // Podświetla dopasowanie, choć szukamy bez ogonków (ą = a): mapujemy pozycje z powrotem na oryginał.
  function podswietl(tekst, fraza) {
    let znormalizowany = "";
    const pozycje = [];
    for (let i = 0; i < tekst.length; i++) {
      const n = bezOgonkow(tekst[i]);
      for (let j = 0; j < n.length; j++) pozycje.push(i);
      znormalizowany += n;
    }
    const start = fraza ? znormalizowany.indexOf(fraza) : -1;
    if (start < 0) return document.createTextNode(tekst);
    const a = pozycje[start], b = pozycje[start + fraza.length - 1] + 1;
    const f = document.createDocumentFragment();
    f.append(tekst.slice(0, a), el("mark", { textContent: tekst.slice(a, b) }), tekst.slice(b));
    return f;
  }

  function ustawWyszukiwarke() {
    const pole = document.getElementById("szukaj");
    const lista = document.getElementById("wyniki");
    const status = document.getElementById("wyniki-status");
    let trafienia = [];
    let aktywny = -1;

    function zamknij() {
      lista.replaceChildren();
      lista.hidden = true;
      trafienia = [];
      aktywny = -1;
      pole.setAttribute("aria-expanded", "false");
      pole.removeAttribute("aria-activedescendant");
    }
    function ustawAktywny(i) {
      const opcje = lista.querySelectorAll("[role=option]");
      if (!opcje.length) return;
      aktywny = (i + opcje.length) % opcje.length;
      opcje.forEach((o, j) => o.setAttribute("aria-selected", String(j === aktywny)));
      pole.setAttribute("aria-activedescendant", opcje[aktywny].id);
      opcje[aktywny].scrollIntoView({ block: "nearest" });
    }
    function wybierz(i) {
      const t = trafienia[i];
      if (!t) return;
      zamknij();
      pokazZnacznik(t.dane.id);
    }

    function szukaj() {
      const fraza = bezOgonkow(pole.value.trim());
      lista.replaceChildren();
      aktywny = -1;
      pole.removeAttribute("aria-activedescendant");
      if (fraza.length < 2) { zamknij(); status.textContent = ""; return; }
      // Kolejność: początek nazwy, nazwa, region, kategoria, opis.
      const wszystkie = [];
      for (const w of znacznikiPoId.values()) {
        const kat = kategoriePoId.get(w.dane.kategoria);
        if (kat.spoiler && !widoczneKategorie.has(kat.id)) continue;
        const s = w.szukaj;
        const ranga = s.nazwa.startsWith(fraza) ? 0 : s.nazwa.includes(fraza) ? 1 : s.region.includes(fraza) ? 2
          : s.kategoria.includes(fraza) ? 3 : s.opis.includes(fraza) ? 4 : -1;
        if (ranga >= 0) wszystkie.push({ ranga, w });
      }
      wszystkie.sort((a, b) => a.ranga - b.ranga || a.w.dane.nazwa.localeCompare(b.w.dane.nazwa, "pl"));
      trafienia = wszystkie.slice(0, MAKS_WYNIKOW).map((t) => t.w);
      status.textContent = wszystkie.length
        ? `${wszystkie.length} ${odmiana(wszystkie.length, "wynik", "wyniki", "wyników")}` + (wszystkie.length > MAKS_WYNIKOW ? `, pokazano ${MAKS_WYNIKOW}` : "")
        : "Brak wyników";
      lista.hidden = false;
      pole.setAttribute("aria-expanded", "true");
      if (!trafienia.length) {
        lista.append(el("li", { className: "wyniki__brak", textContent: "Brak wyników" }));
        return;
      }
      trafienia.forEach(({ dane }, i) => {
        const kat = kategoriePoId.get(dane.kategoria);
        const opis = [kat.nazwa, dane.region].filter(Boolean).join(" · ");
        const opcja = el("li", { id: "wynik-" + i, className: "wyniki__opcja" },
          el("span", { className: "pin pin--maly", style: `--kolor:${kat.kolor}`, textContent: zaliczone.has(dane.id) ? "✓" : kat.znak, ariaHidden: "true" }),
          el("span", { className: "wyniki__tekst" },
            el("span", { className: "wyniki__nazwa" }, podswietl(dane.nazwa, fraza)),
            el("span", { className: "wyniki__opis" }, podswietl(opis, fraza))));
        opcja.setAttribute("role", "option");
        opcja.setAttribute("aria-selected", "false");
        opcja.addEventListener("click", () => wybierz(i));
        lista.append(opcja);
      });
    }

    pole.addEventListener("input", szukaj);
    pole.addEventListener("focus", () => { if (pole.value.trim().length >= 2 && lista.hidden) szukaj(); });
    // Klik w podpowiedź nie zabiera fokusu z pola (inaczej blur zamknąłby listę przed kliknięciem).
    lista.addEventListener("mousedown", (e) => e.preventDefault());
    pole.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== pole) zamknij(); }, 0));
    pole.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (lista.hidden) szukaj();
        const wDol = e.key === "ArrowDown";
        if (trafienia.length) { e.preventDefault(); ustawAktywny(aktywny < 0 ? (wDol ? 0 : -1) : aktywny + (wDol ? 1 : -1)); }
      } else if (e.key === "Enter") {
        if (lista.hidden) szukaj();
        if (trafienia.length) { e.preventDefault(); wybierz(Math.max(aktywny, 0)); }
      } else if (e.key === "Escape") {
        if (!lista.hidden) { e.preventDefault(); zamknij(); }
        else if (pole.value) { e.preventDefault(); pole.value = ""; status.textContent = ""; }
      }
    });
    zamknij();
  }

  // --- Stan w adresie: #z=<id> (znacznik), k=a,b (kategorie), v=x,y,zoom (widok) ---
  // Każdy parametr jest walidowany – śmieci w adresie są po prostu ignorowane.
  let otwartyId = null;
  function czytajParametry() {
    try { return new URLSearchParams(location.hash.slice(1)); } catch (e) { return new URLSearchParams(); }
  }
  function czytajWidok(tekst) {
    const t = String(tekst || "").split(",").map((v) => (v.trim() === "" ? NaN : Number(v)));
    if (t.length !== 3 || !t.every(Number.isFinite)) return null;
    const [x, y, zoom] = t;
    const b = map.options.maxBounds;
    if (x < b.getWest() || x > b.getEast() || y < b.getSouth() || y > b.getNorth()) return null;
    return { x, y, zoom: Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), zoom)) };
  }
  function czytajKategorie(tekst) {
    // Kategorii ze spoilerami z linku nie włączamy – to decyzja czytającego, nie autora linku.
    // Same nieznane nazwy = śmieci w adresie: zwracamy null i zostaje dotychczasowy wybór.
    const nazwy = String(tekst).split(",").filter(Boolean);
    const znane = new Set(nazwy.filter((id) => kategoriePoId.has(id) && !kategoriePoId.get(id).spoiler));
    return nazwy.length && !znane.size ? null : znane;
  }
  function budujHash() {
    const p = [];
    if (otwartyId) p.push("z=" + encodeURIComponent(otwartyId));
    const jawne = kategorie.filter((k) => !k.spoiler && widoczneKategorie.has(k.id)).map((k) => k.id);
    if (jawne.length !== kategorie.filter((k) => !k.spoiler).length) p.push("k=" + jawne.join(","));
    const c = map.getCenter();
    p.push("v=" + Math.round(c.lng) + "," + Math.round(c.lat) + "," + map.getZoom());
    return p.join("&");
  }
  function zapiszAdres() {
    if (!kategorie.length) return; // przed wczytaniem danych nie nadpisuj adresu
    try { history.replaceState(null, "", location.pathname + location.search + "#" + budujHash()); } catch (e) { /* np. file:// */ }
  }
  let czasZapisuAdresu = 0;
  function zapiszAdresPoRuchu() { clearTimeout(czasZapisuAdresu); czasZapisuAdresu = setTimeout(zapiszAdres, 400); }

  async function kopiujLinkWidoku() {
    const przycisk = document.getElementById("kopiuj-widok");
    const link = location.origin + location.pathname + location.search + "#" + budujHash();
    try {
      await navigator.clipboard.writeText(link);
      przycisk.textContent = "Skopiowano ✓";
      setTimeout(() => { przycisk.textContent = "Kopiuj link do widoku"; }, 2000);
    } catch (e) { prompt("Skopiuj link:", link); }
  }

  function zastosujAdres() {
    const p = czytajParametry();
    const kat = p.has("k") ? czytajKategorie(p.get("k")) : null;
    if (kat) {
      widoczneKategorie = kat;
      zbudujFiltry(); odswiezLiczniki(); odswiezWidocznosc();
    }
    const widok = p.has("v") ? czytajWidok(p.get("v")) : null;
    if (widok) map.setView([widok.y, widok.x], widok.zoom, { animate: false });
    const id = p.get("z");
    if (id) pokazZnacznik(id);
  }
  map.on("popupopen", (e) => {
    otwartyId = (e.popup._source && e.popup._source.vicemapId) || null;
    zapiszAdres();
  });
  map.on("popupclose", (e) => {
    const id = e.popup._source && e.popup._source.vicemapId;
    if (id && id === wymuszony) wymuszony = null;
    if (id === otwartyId) otwartyId = null;
    zapiszAdres();
    // Po zdarzeniu: w trakcie popupclose Leaflet wciąż raportuje isPopupOpen() === true.
    setTimeout(odswiezWidocznosc, 0);
  });
  map.on("moveend", zapiszAdresPoRuchu);
  window.addEventListener("hashchange", zastosujAdres);

  // --- Postęp: eksport i import pliku JSON ---
  const FORMAT_POSTEPU = "vicemap-postep";
  const WERSJA_POSTEPU = 1;
  function komunikatPostepu(tekst, blad) {
    const e = document.getElementById("komunikat-postepu");
    e.textContent = tekst;
    e.classList.toggle("komunikat-postepu--blad", !!blad);
  }
  function pobierzPostep() {
    const dane = { format: FORMAT_POSTEPU, wersja: WERSJA_POSTEPU, zapisano: new Date().toISOString(), zaliczone: [...zaliczone].sort() };
    const adres = URL.createObjectURL(new Blob([JSON.stringify(dane, null, 2)], { type: "application/json" }));
    const a = el("a", { href: adres, download: "vicemap-postep.json" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(adres), 1000);
    komunikatPostepu(`Pobrano postęp (${zaliczone.size} zaliczonych).`);
  }
  async function wczytajPostep(plik) {
    if (plik.size > 1024 * 1024) return komunikatPostepu("Plik jest za duży – to nie wygląda na postęp z ViceMap.", true);
    let dane;
    try { dane = JSON.parse(await plik.text()); }
    catch (e) { return komunikatPostepu("Nie udało się odczytać pliku: to nie jest poprawny JSON.", true); }
    if (!dane || typeof dane !== "object" || dane.format !== FORMAT_POSTEPU)
      return komunikatPostepu("To nie jest plik postępu z ViceMap.", true);
    if (!Number.isInteger(dane.wersja) || dane.wersja < 1 || dane.wersja > WERSJA_POSTEPU)
      return komunikatPostepu("Nieobsługiwana wersja pliku postępu. Odśwież stronę i spróbuj ponownie.", true);
    if (!Array.isArray(dane.zaliczone) || dane.zaliczone.some((id) => typeof id !== "string"))
      return komunikatPostepu("Plik jest uszkodzony: brak poprawnej listy zaliczonych.", true);
    const znane = dane.zaliczone.filter((id) => znacznikiPoId.has(id));
    const pominiete = dane.zaliczone.length - znane.length;
    if (!znane.length && dane.zaliczone.length) return komunikatPostepu("Żaden znacznik z pliku nie istnieje na tej mapie.", true);
    // Łączymy z obecnym postępem – import niczego nie odznacza.
    const nowe = [...new Set(znane)].filter((id) => !zaliczone.has(id));
    if (nowe.length) ustawZaliczone(nowe, true);
    komunikatPostepu(`Wczytano postęp: ${nowe.length} nowych zaliczonych${pominiete ? `, pominięto ${pominiete} nieznanych znaczników` : ""}.`);
  }

  // --- Odliczanie do premiery: północ 19.11.2026 czasu lokalnego (godziny platform: poradniki/premiera.html) ---
  function ustawOdliczanie() {
    const e = document.getElementById("odliczanie");
    if (!e) return;
    const cel = new Date(2026, 10, 19, 0, 0, 0).getTime();
    function odswiez() {
      const ms = cel - Date.now();
      if (ms <= 0) { e.textContent = "Gra jest już dostępna"; return; }
      const godzin = Math.floor(ms / 3600000);
      e.textContent = `Do premiery: ${Math.floor(godzin / 24)} dni ${godzin % 24} godz. (19.11.2026)`;
      setTimeout(odswiez, 60000 - (Date.now() % 60000) + 50); // następna pełna minuta, bez interwału co sekundę
    }
    odswiez();
  }
  ustawOdliczanie();

  // --- Tryb edytora (?edytor): klik pokazuje gotowy wpis do data/znaczniki.json ---
  if (TRYB_EDYTORA) {
    document.body.classList.add("tryb-edytora");
    map.on("click", (e) => {
      const x = Math.round(e.latlng.lng), y = Math.round(e.latlng.lat);
      const wpis = `{ "id": "", "kategoria": "", "nazwa": "", "opis": "", "x": ${x}, "y": ${y} }`;
      const kod = el("code", { textContent: wpis });
      const kopiuj = el("button", { type: "button", className: "przycisk przycisk--maly", textContent: "Kopiuj" });
      kopiuj.addEventListener("click", () => navigator.clipboard && navigator.clipboard.writeText(wpis));
      L.popup().setLatLng(e.latlng).setContent(el("div", { className: "popup" }, el("div", { textContent: `x: ${x}, y: ${y}` }), kod, kopiuj)).openOn(map);
    });
  }

  // --- Start ---
  async function wczytaj(url) {
    const odp = await fetch(url, { cache: "no-cache" });
    if (!odp.ok) throw new Error(url + ": " + odp.status);
    return odp.json();
  }

  // Regiony są opcjonalne: brak pliku = mapa bez nazw regionów.
  wczytaj("/data/regiony.json").then(dodajEtykiety, (blad) => console.warn("Brak nazw regionów na mapie:", blad.message));

  Promise.all([wczytaj("/data/kategorie.json"), wczytaj("/data/znaczniki.json")])
    .then(([kat, znaczniki]) => {
      kategorie = kat;
      kategoriePoId = new Map(kat.map((k) => [k.id, k]));
      const domyslne = kat.filter((k) => !k.spoiler).map((k) => k.id);
      const zapisane = pamiec.czytaj("filtry", domyslne);
      widoczneKategorie = new Set((Array.isArray(zapisane) ? zapisane : domyslne).filter((id) => kategoriePoId.has(id)));
      // Adres ma pierwszeństwo przed zapisem w przeglądarce (bez nadpisywania zapisu).
      const pk = czytajParametry().get("k");
      const zAdresu = pk === null ? null : czytajKategorie(pk);
      if (zAdresu) widoczneKategorie = zAdresu;

      for (const z of znaczniki) {
        const k = kategoriePoId.get(z.kategoria);
        if (!k) { console.warn("Nieznana kategoria znacznika", z); continue; }
        const marker = L.marker([z.y, z.x], { icon: ikona(k, zaliczone.has(z.id), z.nazwa), title: z.nazwa });
        marker.vicemapId = z.id;
        marker.bindPopup(() => trescPopupu(z), { maxWidth: 280, autoPanPadding: [16, 72] });
        const szukaj = {
          nazwa: bezOgonkow(z.nazwa), region: bezOgonkow(z.region || ""),
          kategoria: bezOgonkow(k.nazwa), opis: bezOgonkow(z.opis || "")
        };
        znacznikiPoId.set(z.id, { dane: z, marker, szukaj });
      }

      zbudujFiltry();
      ustawPrzelaczniki();
      ustawWyszukiwarke();
      ustawSkroty();
      odswiezLiczniki();
      odswiezWidocznosc();
      zastosujAdres();
    })
    .catch((blad) => {
      console.error(blad);
      document.getElementById("map").insertAdjacentHTML("beforeend",
        '<p class="blad-mapy">Nie udało się wczytać znaczników. Odśwież stronę.</p>');
    });
})();
