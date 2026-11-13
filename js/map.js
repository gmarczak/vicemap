// Interaktywna mapa ViceMap: filtry, wyszukiwarka, tracker postępu, linki do znaczników.
(function () {
  "use strict";

  const CFG = window.VICEMAP_CONFIG || {};
  const MAPA = CFG.mapa || { obraz: "/mapa.webp", szerokosc: 3200, wysokosc: 4357 };
  const TRYB_EDYTORA = new URLSearchParams(location.search).has("edytor");

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

  // --- Stan ---
  const zaliczone = new Set(pamiec.czytaj("zaliczone", []));
  let ukryjZaliczone = pamiec.czytaj("ukryjZaliczone", false);
  let widoczneKategorie = null; // ustawiane po wczytaniu kategorii
  const znacznikiPoId = new Map(); // id -> { dane, marker }
  const warstwy = new Map();       // id kategorii -> L.layerGroup
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

  function ikona(kat, zrobione) {
    return L.divIcon({
      className: "",
      html: `<span class="pin${zrobione ? " pin--zaliczone" : ""}" style="--kolor:${kat.kolor}">${zrobione ? "✓" : kat.znak}</span>`,
      iconSize: [44, 44], // pole dotyku 44px, sam pin ma 30px
      iconAnchor: [22, 22],
      popupAnchor: [0, -18]
    });
  }

  function trescPopupu(z) {
    const kat = kategoriePoId.get(z.kategoria);
    const pole = el("input", { type: "checkbox", checked: zaliczone.has(z.id) });
    pole.addEventListener("change", () => ustawZaliczone(z.id, pole.checked));

    const kopiuj = el("button", { type: "button", className: "przycisk przycisk--maly", textContent: "Kopiuj link" });
    kopiuj.addEventListener("click", async () => {
      const link = location.origin + location.pathname + "#z=" + encodeURIComponent(z.id);
      try { await navigator.clipboard.writeText(link); kopiuj.textContent = "Skopiowano"; }
      catch (e) { prompt("Skopiuj link:", link); }
    });

    const linki = el("div", { className: "popup__akcje" }, kopiuj,
      el("a", { className: "przycisk przycisk--maly", href: "/zglos.html?z=" + encodeURIComponent(z.id), textContent: "Zgłoś poprawkę" }));
    if (!z.przyklad) {
      linki.append(el("a", { className: "przycisk przycisk--maly", href: "/znaczniki/" + encodeURIComponent(z.id) + ".html", textContent: "Szczegóły" }));
    }

    return el("div", { className: "popup" },
      el("div", { className: "popup__kategoria", textContent: kat ? kat.nazwa : z.kategoria }),
      el("strong", { className: "popup__nazwa", textContent: z.nazwa }),
      z.opis ? el("p", { textContent: z.opis }) : null,
      z.przyklad ? el("p", { className: "popup__uwaga", textContent: "Przykładowy znacznik – prawdziwe lokalizacje dodamy po premierze." }) : null,
      el("label", { className: "popup__zaliczone" }, pole, " Zaliczone"),
      linki
    );
  }

  function ustawZaliczone(id, wartosc) {
    if (wartosc) zaliczone.add(id); else zaliczone.delete(id);
    pamiec.zapisz("zaliczone", [...zaliczone]);
    const wpis = znacznikiPoId.get(id);
    if (wpis) wpis.marker.setIcon(ikona(kategoriePoId.get(wpis.dane.kategoria), wartosc));
    if (ukryjZaliczone && wartosc && wpis) {
      wpis.marker.closePopup();
    }
    odswiezWidocznosc();
    odswiezLiczniki();
  }

  function czyWidoczny(z) {
    return widoczneKategorie.has(z.kategoria) && !(ukryjZaliczone && zaliczone.has(z.id));
  }

  function odswiezWidocznosc() {
    for (const { dane, marker } of znacznikiPoId.values()) {
      const warstwa = warstwy.get(dane.kategoria);
      if (!warstwa) continue;
      const pokaz = czyWidoczny(dane);
      if (pokaz && !warstwa.hasLayer(marker)) warstwa.addLayer(marker);
      if (!pokaz && warstwa.hasLayer(marker) && !marker.isPopupOpen()) warstwa.removeLayer(marker);
    }
    for (const [id, warstwa] of warstwy) {
      if (widoczneKategorie.has(id)) warstwa.addTo(map); else map.removeLayer(warstwa);
    }
  }

  // --- Panel: filtry, postęp, wyszukiwarka ---
  const panel = document.getElementById("panel");
  const listaFiltrow = document.getElementById("filtry");
  const postepOgolny = document.getElementById("postep");
  const licznikiKategorii = new Map();
  const przyciskPanelu = document.getElementById("przelacz-panel");
  function zamknijPanel() {
    panel.classList.remove("panel--otwarty");
    przyciskPanelu.setAttribute("aria-expanded", "false");
    przyciskPanelu.textContent = "Filtry i szukaj";
    ustawInert();
  }
  // Zamknięta szuflada na telefonie jest poza kolejnością tabulatora i czytnikiem ekranu.
  function ustawInert() {
    panel.inert = waskiEkran.matches && !panel.classList.contains("panel--otwarty");
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
      licznikiKategorii.set(kat.id, licznik);
      listaFiltrow.append(el("li", null,
        el("label", { className: "filtr" }, pole,
          el("span", { className: "pin pin--maly", style: `--kolor:${kat.kolor}`, textContent: kat.znak }),
          el("span", { className: "filtr__nazwa", textContent: kat.nazwa + (kat.spoiler ? " (spoilery)" : "") }),
          licznik)));
    }
  }

  function odswiezLiczniki() {
    let wszystkie = 0, zrobione = 0;
    for (const kat of kategorie) {
      const lista = [...znacznikiPoId.values()].filter((w) => w.dane.kategoria === kat.id);
      const ile = lista.filter((w) => zaliczone.has(w.dane.id)).length;
      wszystkie += lista.length; zrobione += ile;
      const licznik = licznikiKategorii.get(kat.id);
      if (licznik) licznik.textContent = `${ile}/${lista.length}`;
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
      for (const id of [...zaliczone]) ustawZaliczone(id, false);
    });
    document.getElementById("kopiuj-widok").addEventListener("click", kopiujLinkWidoku);
    document.getElementById("pobierz-postep").addEventListener("click", pobierzPostep);
    const plikPostepu = document.getElementById("wczytaj-postep");
    plikPostepu.addEventListener("change", () => {
      if (plikPostepu.files[0]) wczytajPostep(plikPostepu.files[0]);
      plikPostepu.value = ""; // pozwala wybrać ten sam plik jeszcze raz
    });
    przyciskPanelu.addEventListener("click", () => {
      if (panel.classList.contains("panel--otwarty")) zamknijPanel();
      else otworzPanel();
    });
    map.on("click", zamknijPanel);
    map.on("popupopen", () => { if (waskiEkran.matches) zamknijPanel(); });
    waskiEkran.addEventListener("change", ustawInert);
    ustawInert();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.classList.contains("panel--otwarty")) { zamknijPanel(); przyciskPanelu.focus(); }
    });
  }

  function pokazZnacznik(id) {
    const wpis = znacznikiPoId.get(id);
    if (!wpis) return false;
    const kat = kategoriePoId.get(wpis.dane.kategoria);
    if (kat && kat.spoiler && !widoczneKategorie.has(kat.id)) {
      // Link do misji pokazuje tylko tę jedną misję – reszta spoilerów zostaje ukryta.
      wpis.marker.addTo(map);
      wpis.marker.once("popupclose", () => {
        if (!widoczneKategorie.has(kat.id)) map.removeLayer(wpis.marker);
      });
      map.setView(wpis.marker.getLatLng(), Math.max(map.getZoom(), 1));
      wpis.marker.openPopup();
      zamknijPanel();
      return true;
    }
    if (!widoczneKategorie.has(wpis.dane.kategoria)) {
      widoczneKategorie.add(wpis.dane.kategoria);
      pamiec.zapisz("filtry", [...widoczneKategorie]);
      zbudujFiltry(); odswiezLiczniki();
    }
    odswiezWidocznosc();
    // Znacznik ukryty jako zaliczony też da się otworzyć z linku lub wyszukiwarki.
    const warstwa = warstwy.get(wpis.dane.kategoria);
    if (!warstwa.hasLayer(wpis.marker)) warstwa.addLayer(wpis.marker);
    map.setView(wpis.marker.getLatLng(), Math.max(map.getZoom(), 1));
    wpis.marker.openPopup();
    zamknijPanel();
    return true;
  }

  function ustawWyszukiwarke() {
    const pole = document.getElementById("szukaj");
    const wyniki = document.getElementById("wyniki");
    pole.addEventListener("input", () => {
      const fraza = bezOgonkow(pole.value.trim());
      wyniki.replaceChildren();
      if (fraza.length < 2) return;
      const trafienia = [...znacznikiPoId.values()].filter(({ dane }) => {
        const kat = kategoriePoId.get(dane.kategoria);
        if (kat && kat.spoiler && !widoczneKategorie.has(kat.id)) return false;
        return bezOgonkow([dane.nazwa, dane.opis || "", kat ? kat.nazwa : ""].join(" ")).includes(fraza);
      }).slice(0, 20);
      if (!trafienia.length) {
        wyniki.append(el("li", { className: "wyniki__brak", textContent: "Brak wyników" }));
        return;
      }
      for (const { dane } of trafienia) {
        const kat = kategoriePoId.get(dane.kategoria);
        const przycisk = el("button", { type: "button" },
          el("span", { className: "pin pin--maly", style: `--kolor:${kat ? kat.kolor : "#999"}`, textContent: kat ? kat.znak : "•" }),
          " " + dane.nazwa);
        przycisk.addEventListener("click", () => { pokazZnacznik(dane.id); });
        wyniki.append(el("li", null, przycisk));
      }
    });
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
      przycisk.textContent = "Skopiowano";
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
  map.on("popupclose", () => {
    otwartyId = null;
    zapiszAdres();
    odswiezWidocznosc();
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
    let nowe = 0;
    for (const id of znane) if (!zaliczone.has(id)) { ustawZaliczone(id, true); nowe++; }
    komunikatPostepu(`Wczytano postęp: ${nowe} nowych zaliczonych${pominiete ? `, pominięto ${pominiete} nieznanych znaczników` : ""}.`);
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

      for (const k of kat) warstwy.set(k.id, L.layerGroup());
      for (const z of znaczniki) {
        const k = kategoriePoId.get(z.kategoria);
        if (!k) { console.warn("Nieznana kategoria znacznika", z); continue; }
        const marker = L.marker([z.y, z.x], { icon: ikona(k, zaliczone.has(z.id)), title: z.nazwa, alt: z.nazwa });
        marker.vicemapId = z.id;
        marker.bindPopup(() => trescPopupu(z), { maxWidth: 260, autoPanPadding: [16, 72] });
        warstwy.get(k.id).addLayer(marker);
        znacznikiPoId.set(z.id, { dane: z, marker });
      }

      zbudujFiltry();
      ustawPrzelaczniki();
      ustawWyszukiwarke();
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
