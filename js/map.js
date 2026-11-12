// Interaktywna mapa ViceMap: filtry, wyszukiwarka, tracker postępu, linki do znaczników.
(function () {
  "use strict";

  const CFG = window.VICEMAP_CONFIG || {};
  const MAPA = CFG.mapa || { obraz: "/mapa.svg", szerokosc: 1000, wysokosc: 1000 };
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
    minZoom: -2,
    maxZoom: 3,
    maxBounds: [[-MAPA.wysokosc * 0.25, -MAPA.szerokosc * 0.25], [MAPA.wysokosc * 1.25, MAPA.szerokosc * 1.25]],
    zoomSnap: 0.25,
    attributionControl: false
  });
  L.imageOverlay(MAPA.obraz, granice).addTo(map);
  map.fitBounds(granice);

  function ikona(kat, zrobione) {
    return L.divIcon({
      className: "",
      html: `<span class="pin${zrobione ? " pin--zaliczone" : ""}" style="--kolor:${kat.kolor}">${zrobione ? "✓" : kat.znak}</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14]
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
  }

  function zbudujFiltry() {
    listaFiltrow.replaceChildren();
    for (const kat of kategorie) {
      const pole = el("input", { type: "checkbox", checked: widoczneKategorie.has(kat.id) });
      pole.addEventListener("change", () => {
        if (pole.checked) widoczneKategorie.add(kat.id); else widoczneKategorie.delete(kat.id);
        pamiec.zapisz("filtry", [...widoczneKategorie]);
        odswiezWidocznosc();
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
      zbudujFiltry(); odswiezLiczniki(); odswiezWidocznosc();
    });
    document.getElementById("ukryj-wszystkie").addEventListener("click", () => {
      widoczneKategorie = new Set();
      pamiec.zapisz("filtry", []);
      zbudujFiltry(); odswiezLiczniki(); odswiezWidocznosc();
    });
    document.getElementById("resetuj-postep").addEventListener("click", () => {
      if (!confirm("Wyczyścić cały zapisany postęp na tym urządzeniu?")) return;
      for (const id of [...zaliczone]) ustawZaliczone(id, false);
    });
    przyciskPanelu.addEventListener("click", () => {
      if (panel.classList.contains("panel--otwarty")) zamknijPanel();
      else {
        panel.classList.add("panel--otwarty");
        przyciskPanelu.setAttribute("aria-expanded", "true");
        przyciskPanelu.textContent = "Pokaż mapę";
      }
    });
    map.on("click", zamknijPanel);
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

  // --- Linki do znaczników: #z=<id> ---
  function obsluzAdres() {
    const m = location.hash.match(/^#z=(.+)$/);
    if (m) pokazZnacznik(decodeURIComponent(m[1]));
  }
  map.on("popupopen", (e) => {
    const id = e.popup._source && e.popup._source.vicemapId;
    if (id) history.replaceState(null, "", "#z=" + encodeURIComponent(id));
  });
  map.on("popupclose", () => {
    if (location.hash.startsWith("#z=")) history.replaceState(null, "", location.pathname + location.search);
    odswiezWidocznosc();
  });
  window.addEventListener("hashchange", obsluzAdres);

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
      widoczneKategorie = new Set(pamiec.czytaj("filtry", domyslne).filter((id) => kategoriePoId.has(id)));

      for (const k of kat) warstwy.set(k.id, L.layerGroup());
      for (const z of znaczniki) {
        const k = kategoriePoId.get(z.kategoria);
        if (!k) { console.warn("Nieznana kategoria znacznika", z); continue; }
        const marker = L.marker([z.y, z.x], { icon: ikona(k, zaliczone.has(z.id)), title: z.nazwa, alt: z.nazwa });
        marker.vicemapId = z.id;
        marker.bindPopup(() => trescPopupu(z), { maxWidth: 280 });
        warstwy.get(k.id).addLayer(marker);
        znacznikiPoId.set(z.id, { dane: z, marker });
      }

      zbudujFiltry();
      ustawPrzelaczniki();
      ustawWyszukiwarke();
      odswiezLiczniki();
      odswiezWidocznosc();
      obsluzAdres();
    })
    .catch((blad) => {
      console.error(blad);
      document.getElementById("map").insertAdjacentHTML("beforeend",
        '<p class="blad-mapy">Nie udało się wczytać znaczników. Odśwież stronę.</p>');
    });
})();
