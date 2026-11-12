// Interaktywna mapa ViceMap: filtry, regiony, wyszukiwarka, tracker, profile, notatki, własne pinezki, linki.
(function () {
  "use strict";

  const CFG = window.VICEMAP_CONFIG || {};
  const MAPA = CFG.mapa || { obraz: "/mapa.svg", szerokosc: 1000, wysokosc: 1000 };
  const POSTEP = window.VicemapPostep;
  const parametry = new URLSearchParams(location.search);
  const TRYB_EDYTORA = parametry.has("edytor");
  const MOJE = "moje"; // id warstwy własnych pinezek w filtrach
  // Dymek mieści się na ekranie telefonu; dłuższa treść przewija się w środku.
  const OPCJE_DYMKA = () => ({ maxWidth: 300, maxHeight: Math.round(window.innerHeight * 0.62), autoPanPaddingTopLeft: [16, 20], autoPanPaddingBottomRight: [16, 90] });

  const el = (tag, wlasciwosci, ...dzieci) => {
    const e = Object.assign(document.createElement(tag), wlasciwosci || {});
    for (const d of dzieci) if (d != null) e.append(d);
    return e;
  };
  const bezOgonkow = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

  // --- Stan ---
  let ukryjZaliczone = POSTEP.czytaj("ukryjZaliczone", false);
  let region = "";
  let widoczneKategorie = null;
  let filtryZAdresu = false; // ?kategoria= pokazuje wybrane, ale nie nadpisuje zapisanych filtrów
  const znacznikiPoId = new Map(); // id -> { dane, marker }
  const warstwy = new Map();       // id kategorii -> L.layerGroup
  let kategorie = [];
  let kategoriePoId = new Map();
  const warstwaMoich = L.layerGroup();
  const warstwaRegionow = L.layerGroup();
  let trybDodawania = false;

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

  function ikona(kolor, znak, zrobione, klasa) {
    return L.divIcon({
      className: "",
      html: `<span class="pin${zrobione ? " pin--zaliczone" : ""}${klasa ? " " + klasa : ""}" style="--kolor:${kolor}">${zrobione ? "✓" : znak}</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14]
    });
  }
  const ikonaZnacznika = (z) => {
    const k = kategoriePoId.get(z.kategoria);
    return ikona(k.kolor, k.znak, POSTEP.czyZaliczone(z.id));
  };

  function zapiszFiltry() {
    if (!filtryZAdresu) POSTEP.zapisz("filtry", [...widoczneKategorie]);
  }

  // --- Dymek znacznika ---
  function etykietaStatusu(z) {
    if (z.przyklad) return el("span", { className: "etykieta etykieta--przyklad", textContent: "Przykład" });
    if (z.status === "potwierdzone") return el("span", { className: "etykieta etykieta--ok", textContent: "Potwierdzone" });
    return el("span", { className: "etykieta", textContent: "Od społeczności" });
  }

  function poleNotatki(wartosc, zapisz) {
    const pole = el("textarea", { className: "popup__notatka", rows: 2, maxLength: POSTEP.MAKS_NOTATKA, placeholder: "Moja notatka (widzisz ją tylko Ty)", value: wartosc || "" });
    let czas;
    pole.addEventListener("input", () => { clearTimeout(czas); czas = setTimeout(() => zapisz(pole.value), 400); });
    pole.addEventListener("blur", () => { clearTimeout(czas); zapisz(pole.value); });
    return pole;
  }

  function przyciskKopiujLink(hash) {
    const kopiuj = el("button", { type: "button", className: "przycisk przycisk--maly", textContent: "Kopiuj link" });
    kopiuj.addEventListener("click", async () => {
      const link = location.origin + "/#" + hash;
      try { await navigator.clipboard.writeText(link); kopiuj.textContent = "Skopiowano"; }
      catch (e) { window.prompt("Skopiuj link:", link); }
    });
    return kopiuj;
  }

  function trescPopupu(z) {
    const kat = kategoriePoId.get(z.kategoria);
    const pole = el("input", { type: "checkbox", checked: POSTEP.czyZaliczone(z.id) });
    pole.addEventListener("change", () => ustawZaliczone(z.id, pole.checked));

    const meta = el("div", { className: "popup__meta" }, etykietaStatusu(z));
    if (z.region) meta.append(el("span", { textContent: z.region }));

    const fakty = el("div", { className: "popup__fakty" });
    if (z.autor) fakty.append(el("span", { textContent: "Znalazł: " + z.autor }));
    if (z.dodano) fakty.append(el("span", { textContent: "Dodano " + z.dodano }));

    const linki = el("div", { className: "popup__akcje" }, przyciskKopiujLink("z=" + encodeURIComponent(z.id)),
      el("a", { className: "przycisk przycisk--maly", href: "/zglos.html?z=" + encodeURIComponent(z.id), textContent: "Zgłoś poprawkę" }));
    if (!z.przyklad && !kat.spoiler) {
      linki.append(el("a", { className: "przycisk przycisk--maly", href: "/znaczniki/" + encodeURIComponent(z.id) + ".html", textContent: "Szczegóły" }));
    }

    return el("div", { className: "popup" },
      el("div", { className: "popup__kategoria", textContent: kat.nazwa }),
      el("strong", { className: "popup__nazwa", textContent: z.nazwa }),
      meta,
      z.opis ? el("p", { textContent: z.opis }) : null,
      z.przyklad ? el("p", { className: "popup__uwaga", textContent: "Przykładowy znacznik – prawdziwe lokalizacje dodamy po premierze." }) : null,
      el("label", { className: "popup__zaliczone" }, pole, " Zaliczone"),
      poleNotatki(POSTEP.notatka(z.id), (t) => POSTEP.ustawNotatke(z.id, t)),
      fakty.childElementCount ? fakty : null,
      /^https?:\/\//.test(z.zrodlo || "") ? el("p", { className: "popup__uwaga" }, el("a", { href: z.zrodlo, rel: "nofollow noopener", target: "_blank", textContent: "Źródło" })) : null,
      linki
    );
  }

  function ustawZaliczone(id, wartosc) {
    POSTEP.ustawZaliczone(id, wartosc);
    const wpis = znacznikiPoId.get(id);
    if (wpis) {
      wpis.marker.setIcon(ikonaZnacznika(wpis.dane));
      if (ukryjZaliczone && wartosc) wpis.marker.closePopup();
    }
    odswiezWidocznosc();
    odswiezLiczniki();
  }

  function czyWidoczny(z) {
    return widoczneKategorie.has(z.kategoria)
      && !(ukryjZaliczone && POSTEP.czyZaliczone(z.id))
      && (!region || z.region === region);
  }

  function odswiezWidocznosc() {
    for (const { dane, marker } of znacznikiPoId.values()) {
      const warstwa = warstwy.get(dane.kategoria);
      const pokaz = czyWidoczny(dane);
      if (pokaz && !warstwa.hasLayer(marker)) warstwa.addLayer(marker);
      if (!pokaz && warstwa.hasLayer(marker) && !marker.isPopupOpen()) warstwa.removeLayer(marker);
    }
    for (const [id, warstwa] of warstwy) {
      if (widoczneKategorie.has(id)) warstwa.addTo(map); else map.removeLayer(warstwa);
    }
    if (widoczneKategorie.has(MOJE)) warstwaMoich.addTo(map); else map.removeLayer(warstwaMoich);
  }

  // --- Podpisy regionów (położenie przybliżone, ze schematu) ---
  function dodajRegiony(regiony) {
    for (const r of regiony) {
      const etykieta = L.marker([r.y, r.x], {
        icon: L.divIcon({ className: "", html: `<span class="region">${r.nazwa.replace(/[<&]/g, "")}</span>`, iconSize: null, iconAnchor: [0, 0] }),
        zIndexOffset: -1000,
        keyboard: true,
        title: "Region: " + r.nazwa
      });
      etykieta.bindPopup(() => {
        const ileMiejsc = [...znacznikiPoId.values()].filter((w) => w.dane.region === r.nazwa).length;
        const tresc = el("div", { className: "popup" },
          el("div", { className: "popup__kategoria", textContent: "Region" }),
          el("strong", { className: "popup__nazwa", textContent: r.nazwa }),
          el("p", { textContent: r.opis }),
          el("p", { className: "popup__uwaga", textContent: `Pierwowzór: ${r.pierwowzor}. Położenie na schemacie jest przybliżone – dokładną mapę dodamy po premierze.` }));
        if (ileMiejsc) {
          const b = el("button", { type: "button", className: "przycisk przycisk--maly przycisk--glowny", textContent: `Pokaż tylko ten region (${ileMiejsc})` });
          b.addEventListener("click", () => {
            region = r.nazwa;
            document.getElementById("region").value = r.nazwa;
            etykieta.closePopup();
            odswiezWidocznosc();
          });
          tresc.append(el("div", { className: "popup__akcje" }, b));
        }
        return tresc;
      }, OPCJE_DYMKA());
      warstwaRegionow.addLayer(etykieta);
    }
    const pole = document.getElementById("pokaz-regiony");
    pole.checked = POSTEP.czytaj("regiony", true);
    // Przy dużym przybliżeniu podpisy regionów tylko zasłaniają pinezki, więc wtedy znikają.
    const ustaw = () => {
      if (pole.checked && map.getZoom() < 1.5) warstwaRegionow.addTo(map); else map.removeLayer(warstwaRegionow);
    };
    pole.addEventListener("change", () => { POSTEP.zapisz("regiony", pole.checked); ustaw(); });
    map.on("zoomend", ustaw);
    ustaw();
  }

  // --- Własne pinezki ---
  function dodajMarkerWlasny(p) {
    const marker = L.marker([p.y, p.x], { icon: ikona("#eef5f2", "★", false, "pin--moja"), title: p.nazwa, alt: p.nazwa });
    marker.vicemapMoja = p.id;
    marker.bindPopup(() => {
      const aktualna = POSTEP.pinezki().find((q) => q.id === p.id) || p;
      const nazwa = el("input", { type: "text", className: "popup__pole", value: aktualna.nazwa, maxLength: 80 });
      nazwa.setAttribute("aria-label", "Nazwa pinezki");
      nazwa.addEventListener("change", () => POSTEP.zmienPinezke(p.id, { nazwa: nazwa.value }));
      const usun = el("button", { type: "button", className: "przycisk przycisk--maly", textContent: "Usuń pinezkę" });
      usun.addEventListener("click", () => {
        POSTEP.usunPinezke(p.id);
        warstwaMoich.removeLayer(marker);
        odswiezLiczniki();
      });
      return el("div", { className: "popup" },
        el("div", { className: "popup__kategoria", textContent: "Moja pinezka" }),
        nazwa,
        poleNotatki(aktualna.opis, (t) => POSTEP.zmienPinezke(p.id, { opis: t })),
        el("p", { className: "popup__uwaga", textContent: "Widzisz ją tylko Ty, w tym profilu." }),
        el("div", { className: "popup__akcje" }, usun));
    }, OPCJE_DYMKA());
    warstwaMoich.addLayer(marker);
    return marker;
  }

  function ustawTrybDodawania(wl) {
    trybDodawania = wl;
    document.body.classList.toggle("tryb-dodawania", wl);
    document.getElementById("dodaj-pinezke").textContent = wl ? "Kliknij na mapie… (anuluj)" : "+ Dodaj własną pinezkę";
    if (wl) { zamknijPanel(); alertKomunikat("Kliknij na mapie, gdzie postawić pinezkę."); }
  }

  // --- Panel ---
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
  function otworzPanel() {
    panel.classList.add("panel--otwarty");
    przyciskPanelu.setAttribute("aria-expanded", "true");
    przyciskPanelu.textContent = "Pokaż mapę";
  }

  function wierszFiltra(id, nazwa, kolor, znak, nastepny) {
    const pole = el("input", { type: "checkbox", checked: widoczneKategorie.has(id) });
    pole.addEventListener("change", () => {
      if (pole.checked) widoczneKategorie.add(id); else widoczneKategorie.delete(id);
      zapiszFiltry();
      odswiezWidocznosc();
      odswiezLiczniki();
    });
    const licznik = el("span", { className: "filtr__licznik" });
    licznikiKategorii.set(id, licznik);
    const wiersz = el("li", { className: "filtr-wiersz" },
      el("label", { className: "filtr" }, pole,
        el("span", { className: "pin pin--maly", style: `--kolor:${kolor}`, textContent: znak }),
        el("span", { className: "filtr__nazwa", textContent: nazwa }),
        licznik));
    if (nastepny) {
      const b = el("button", { type: "button", className: "filtr__nastepny", textContent: "›", title: "Następny niezaliczony" });
      b.setAttribute("aria-label", "Następny niezaliczony: " + nazwa);
      b.addEventListener("click", () => nastepnyNiezaliczony(id));
      wiersz.append(b);
    }
    return wiersz;
  }

  function zbudujFiltry() {
    listaFiltrow.replaceChildren();
    licznikiKategorii.clear();
    for (const kat of kategorie) {
      // Bez strzałki przy spoilerach: „następna misja” zdradzałaby fabułę.
      listaFiltrow.append(wierszFiltra(kat.id, kat.nazwa + (kat.spoiler ? " (spoilery)" : ""), kat.kolor, kat.znak, !kat.spoiler));
    }
    listaFiltrow.append(wierszFiltra(MOJE, "Moje pinezki", "#ffffff", "★", false));
  }

  function policzPostep() {
    let wszystkie = 0, zrobione = 0;
    const naKategorie = new Map();
    for (const kat of kategorie) {
      const lista = [...znacznikiPoId.values()].filter((w) => w.dane.kategoria === kat.id);
      const ile = lista.filter((w) => POSTEP.czyZaliczone(w.dane.id)).length;
      naKategorie.set(kat.id, { ile, z: lista.length });
      // Spoilery nie wliczają się do wyniku, żeby licznik nie zdradzał liczby misji.
      if (!kat.spoiler) { wszystkie += lista.length; zrobione += ile; }
    }
    return { wszystkie, zrobione, procent: wszystkie ? Math.round((zrobione / wszystkie) * 100) : 0, naKategorie };
  }

  function odswiezLiczniki() {
    const p = policzPostep();
    for (const [id, { ile, z }] of p.naKategorie) {
      const licznik = licznikiKategorii.get(id);
      const kat = kategoriePoId.get(id);
      // Licznik ukrytych spoilerów milczy, żeby nie zdradzać liczby misji.
      if (licznik) licznik.textContent = kat.spoiler && !widoczneKategorie.has(id) ? "" : `${ile}/${z}`;
    }
    const moje = licznikiKategorii.get(MOJE);
    if (moje) moje.textContent = String(POSTEP.pinezki().length);
    postepOgolny.querySelector(".postep__tekst").textContent = `Zaliczone: ${p.zrobione} z ${p.wszystkie} (${p.procent}%)`;
    postepOgolny.querySelector(".postep__pasek span").style.width = p.procent + "%";
  }

  function nastepnyNiezaliczony(katId) {
    const otwarty = [...znacznikiPoId.values()].find((w) => w.marker.isPopupOpen());
    const srodek = map.getCenter();
    const kandydaci = [...znacznikiPoId.values()].filter((w) =>
      w.dane.kategoria === katId && !POSTEP.czyZaliczone(w.dane.id) && (!region || w.dane.region === region) && w !== otwarty);
    if (!kandydaci.length) {
      alertKomunikat("Brak niezaliczonych w tej kategorii" + (region ? " w wybranym regionie" : "") + ".");
      return;
    }
    // Najbliższy niezaliczony od miejsca, które teraz oglądasz.
    kandydaci.sort((a, b) => srodek.distanceTo(a.marker.getLatLng()) - srodek.distanceTo(b.marker.getLatLng()));
    pokazZnacznik(kandydaci[0].dane.id);
  }

  let czasKomunikatu;
  function alertKomunikat(tekst) {
    const k = document.getElementById("komunikat-mapy");
    k.textContent = tekst;
    k.hidden = false;
    clearTimeout(czasKomunikatu);
    czasKomunikatu = setTimeout(() => { k.hidden = true; }, 3500);
  }

  function ustawPrzelaczniki() {
    const ukryj = document.getElementById("ukryj-zaliczone");
    ukryj.checked = ukryjZaliczone;
    ukryj.addEventListener("change", () => {
      ukryjZaliczone = ukryj.checked;
      POSTEP.zapisz("ukryjZaliczone", ukryjZaliczone);
      odswiezWidocznosc();
    });
    document.getElementById("pokaz-wszystkie").addEventListener("click", () => {
      filtryZAdresu = false;
      widoczneKategorie = new Set([...kategorie.filter((k) => !k.spoiler).map((k) => k.id), MOJE]);
      zapiszFiltry(); zbudujFiltry(); odswiezLiczniki(); odswiezWidocznosc();
    });
    document.getElementById("ukryj-wszystkie").addEventListener("click", () => {
      filtryZAdresu = false;
      widoczneKategorie = new Set();
      zapiszFiltry(); zbudujFiltry(); odswiezLiczniki(); odswiezWidocznosc();
    });
    document.getElementById("resetuj-postep").addEventListener("click", () => {
      if (!confirm("Wyczyścić zaliczone miejsca w tym profilu?")) return;
      POSTEP.wyczyscZaliczone();
      for (const w of znacznikiPoId.values()) w.marker.setIcon(ikonaZnacznika(w.dane));
      odswiezLiczniki(); odswiezWidocznosc();
    });
    przyciskPanelu.addEventListener("click", () => {
      if (panel.classList.contains("panel--otwarty")) zamknijPanel(); else otworzPanel();
    });
    document.getElementById("dodaj-pinezke").addEventListener("click", () => ustawTrybDodawania(!trybDodawania));

    // Region
    const wyborRegionu = document.getElementById("region");
    const regiony = [...new Set([...znacznikiPoId.values()].map((w) => w.dane.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pl"));
    if (regiony.length) {
      for (const r of regiony) wyborRegionu.append(new Option(r, r));
      wyborRegionu.closest(".panel__region").hidden = false;
      wyborRegionu.addEventListener("change", () => { region = wyborRegionu.value; odswiezWidocznosc(); });
    }
  }

  // --- Profile, kopia zapasowa, karta postępu ---
  function pobierz(blob, nazwa) {
    const a = el("a", { href: URL.createObjectURL(blob), download: nazwa });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function ustawProfile() {
    const wybor = document.getElementById("profil");
    const { aktywny, lista } = POSTEP.profile();
    for (const p of lista) wybor.append(new Option(p.nazwa, p.id, false, p.id === aktywny));
    wybor.addEventListener("change", () => POSTEP.przelaczProfil(wybor.value));
    document.getElementById("profil-nowy").addEventListener("click", () => {
      if (POSTEP.profile().lista.length >= POSTEP.MAKS_PROFILI) { alertKomunikat(`Możesz mieć najwyżej ${POSTEP.MAKS_PROFILI} profili.`); return; }
      const nazwa = prompt("Nazwa nowego przejścia:", "Przejście " + (lista.length + 1));
      if (nazwa) POSTEP.nowyProfil(nazwa);
    });
    document.getElementById("profil-nazwa").addEventListener("click", () => {
      const obecny = wybor.options[wybor.selectedIndex];
      const nazwa = prompt("Nowa nazwa profilu:", obecny.text);
      if (nazwa) { POSTEP.zmienNazweProfilu(nazwa); obecny.text = nazwa.slice(0, 40); }
    });
    document.getElementById("profil-usun").addEventListener("click", () => {
      if (POSTEP.profile().lista.length < 2) { alertKomunikat("To jedyny profil – nie można go usunąć."); return; }
      if (confirm("Usunąć ten profil razem z jego postępem, notatkami i pinezkami?")) POSTEP.usunProfil();
    });

    document.getElementById("eksport").addEventListener("click", () => {
      pobierz(new Blob([JSON.stringify(POSTEP.eksport(), null, 1)], { type: "application/json" }),
        "vicemap-kopia-" + new Date().toISOString().slice(0, 10) + ".json");
    });
    const plik = document.getElementById("import-plik");
    document.getElementById("import").addEventListener("click", () => plik.click());
    plik.addEventListener("change", async () => {
      const f = plik.files && plik.files[0];
      plik.value = "";
      if (!f) return;
      try {
        if (f.size > 2000000) throw new Error("plik jest za duży");
        const ile = POSTEP.importuj(JSON.parse(await f.text()));
        if (!ile) throw new Error(`limit to ${POSTEP.MAKS_PROFILI} profili`);
        alert(`Wczytano ${ile} ${ile === 1 ? "profil" : "profile"} jako kopie. Wybierz je z listy profili.`);
        location.reload();
      } catch (e) {
        alertKomunikat("Nie udało się wczytać kopii: " + (e.message || "zły plik"));
      }
    });

    document.getElementById("udostepnij").addEventListener("click", udostepnijPostep);
  }

  function kartaPostepu() {
    const W = 1080, H = 1350;
    const c = el("canvas", { width: W, height: H });
    const g = c.getContext("2d");
    const czcionka = (r, waga) => `${waga || 700} ${r}px Overpass, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const zaokr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    g.fillStyle = "#0c1c2b"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#14283a"; g.lineWidth = 2;
    for (let x = 0; x <= W; x += 90) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += 90) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

    // Logo jako zielona tablica drogowa
    g.font = czcionka(60, 800);
    const szer = g.measureText("ViceMap").width + 56;
    g.fillStyle = "#0a7a52"; zaokr(72, 72, szer + 16, 112, 22); g.fill();
    g.strokeStyle = "#f4f8f6"; g.lineWidth = 5; zaokr(80, 80, szer, 96, 15); g.stroke();
    g.fillStyle = "#ffffff"; g.textBaseline = "middle"; g.fillText("ViceMap", 108, 132);
    g.textBaseline = "alphabetic";

    const p = policzPostep();
    g.font = czcionka(38, 600); g.fillStyle = "#9db5c0"; g.fillText("Mój postęp w GTA 6", 80, 290);
    g.font = czcionka(230, 800); g.fillStyle = "#eef5f2"; g.fillText(p.procent + "%", 66, 500);
    g.font = czcionka(40, 400); g.fillStyle = "#9db5c0"; g.fillText(`${p.zrobione} z ${p.wszystkie} miejsc zaliczonych`, 82, 570);
    g.fillStyle = "#18354b"; zaokr(80, 610, W - 160, 16, 8); g.fill();
    if (p.procent) { g.fillStyle = "#ffb648"; zaokr(80, 610, (W - 160) * p.procent / 100, 16, 8); g.fill(); }

    let y = 720;
    for (const kat of kategorie) {
      const s = p.naKategorie.get(kat.id);
      if (kat.spoiler || !s.z || y > H - 180) continue;
      g.font = czcionka(34, 700); g.fillStyle = "#eef5f2"; g.textAlign = "left"; g.fillText(kat.nazwa, 80, y);
      g.font = czcionka(34, 400); g.textAlign = "right"; g.fillStyle = "#9db5c0"; g.fillText(`${s.ile}/${s.z}`, W - 80, y); g.textAlign = "left";
      g.fillStyle = "#18354b"; zaokr(80, y + 18, W - 160, 12, 6); g.fill();
      if (s.ile) { g.fillStyle = kat.kolor; zaokr(80, y + 18, (W - 160) * (s.ile / s.z), 12, 6); g.fill(); }
      y += 90;
    }
    g.font = czcionka(36, 700); g.fillStyle = "#ff7f98"; g.fillText("vicemap.pl", 80, H - 84);
    g.font = czcionka(30, 400); g.fillStyle = "#9db5c0"; g.fillText("Interaktywna mapa GTA 6 po polsku", 80, H - 40);
    return c;
  }

  async function udostepnijPostep() {
    const blob = await new Promise((r) => kartaPostepu().toBlob(r, "image/png"));
    const plik = new File([blob], "vicemap-postep.png", { type: "image/png" });
    const tekst = `Mam ${policzPostep().procent}% w GTA 6 – sprawdź swoją mapę na vicemap.pl`;
    try {
      if (navigator.canShare && navigator.canShare({ files: [plik] })) {
        await navigator.share({ files: [plik], text: tekst });
        return;
      }
    } catch (e) { if (e && e.name === "AbortError") return; }
    pobierz(blob, "vicemap-postep.png");
    alertKomunikat("Zapisano obrazek z Twoim postępem.");
  }

  // --- Pokazywanie znacznika (link, wyszukiwarka, „następny”) ---
  function pokazZnacznik(id) {
    const wpis = znacznikiPoId.get(id);
    if (!wpis) return false;
    const kat = kategoriePoId.get(wpis.dane.kategoria);
    if (kat.spoiler && !widoczneKategorie.has(kat.id)) {
      // Link do misji pokazuje tylko tę jedną misję – reszta spoilerów zostaje ukryta.
      wpis.marker.addTo(map);
      wpis.marker.once("popupclose", () => {
        if (!widoczneKategorie.has(kat.id)) map.removeLayer(wpis.marker);
      });
    } else {
      if (!widoczneKategorie.has(kat.id)) {
        widoczneKategorie.add(kat.id);
        zapiszFiltry(); zbudujFiltry(); odswiezLiczniki();
      }
      if (region && wpis.dane.region !== region) {
        region = ""; document.getElementById("region").value = "";
      }
      odswiezWidocznosc();
      // Znacznik ukryty jako zaliczony też da się otworzyć z linku lub wyszukiwarki.
      const warstwa = warstwy.get(kat.id);
      if (!warstwa.hasLayer(wpis.marker)) warstwa.addLayer(wpis.marker);
    }
    // Bez animacji, żeby dymek po otwarciu mógł się dosunąć w całości na ekran.
    map.setView(wpis.marker.getLatLng(), Math.max(map.getZoom(), 1), { animate: false });
    wpis.marker.openPopup();
    zamknijPanel();
    return true;
  }

  function pokazMoja(idPinezki) {
    const m = warstwaMoich.getLayers().find((x) => x.vicemapMoja === idPinezki);
    if (!m) return;
    if (!widoczneKategorie.has(MOJE)) { widoczneKategorie.add(MOJE); zapiszFiltry(); zbudujFiltry(); odswiezLiczniki(); odswiezWidocznosc(); }
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 1), { animate: false });
    m.openPopup();
    zamknijPanel();
  }

  function ustawWyszukiwarke() {
    const pole = document.getElementById("szukaj");
    const wyniki = document.getElementById("wyniki");
    pole.addEventListener("input", () => {
      const fraza = bezOgonkow(pole.value.trim());
      wyniki.replaceChildren();
      if (fraza.length < 2) return;
      const trafienia = [];
      for (const { dane } of znacznikiPoId.values()) {
        const kat = kategoriePoId.get(dane.kategoria);
        if (kat.spoiler && !widoczneKategorie.has(kat.id)) continue;
        const tekst = bezOgonkow([dane.nazwa, dane.opis || "", kat.nazwa, dane.region || "", POSTEP.notatka(dane.id)].join(" "));
        if (tekst.includes(fraza)) trafienia.push({ id: dane.id, nazwa: dane.nazwa, kolor: kat.kolor, znak: kat.znak });
      }
      for (const p of POSTEP.pinezki()) {
        if (bezOgonkow(p.nazwa + " " + (p.opis || "")).includes(fraza)) trafienia.push({ moja: p.id, nazwa: p.nazwa, kolor: "#ffffff", znak: "★" });
      }
      if (!trafienia.length) {
        wyniki.append(el("li", { className: "wyniki__brak", textContent: "Brak wyników" }));
        return;
      }
      for (const t of trafienia.slice(0, 20)) {
        const przycisk = el("button", { type: "button" },
          el("span", { className: "pin pin--maly", style: `--kolor:${t.kolor}`, textContent: t.znak }), " " + t.nazwa);
        przycisk.addEventListener("click", () => (t.id ? pokazZnacznik(t.id) : pokazMoja(t.moja)));
        wyniki.append(el("li", null, przycisk));
      }
    });

    // Skrót „/” otwiera wyszukiwarkę, Esc ją opuszcza i przerywa dodawanie pinezki.
    document.addEventListener("keydown", (e) => {
      const pisze = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if (e.key === "/" && !pisze) { e.preventDefault(); otworzPanel(); pole.focus(); }
      if (e.key === "Escape" && document.activeElement === pole) pole.blur();
      if (e.key === "Escape" && trybDodawania) ustawTrybDodawania(false);
    });
  }

  // --- Adres: #z=<id> ---
  function obsluzAdres() {
    const m = location.hash.match(/^#z=(.+)$/);
    if (m) pokazZnacznik(decodeURIComponent(m[1]));
  }
  map.on("popupopen", (e) => {
    document.body.classList.add("popup-otwarty");
    const id = e.popup._source && e.popup._source.vicemapId;
    if (id) history.replaceState(null, "", location.pathname + location.search + "#z=" + encodeURIComponent(id));
  });
  map.on("popupclose", () => {
    document.body.classList.remove("popup-otwarty");
    if (location.hash.startsWith("#z=")) history.replaceState(null, "", location.pathname + location.search);
    odswiezWidocznosc();
  });
  window.addEventListener("hashchange", obsluzAdres);

  // --- Kliknięcie w mapę: dodawanie pinezki, edytor albo zamknięcie panelu ---
  map.on("click", (e) => {
    const x = Math.round(e.latlng.lng), y = Math.round(e.latlng.lat);
    if (trybDodawania) {
      ustawTrybDodawania(false);
      document.getElementById("komunikat-mapy").hidden = true;
      const p = POSTEP.dodajPinezke({ nazwa: "Moja pinezka", x, y });
      if (!p) { alertKomunikat(`Limit to ${POSTEP.MAKS_PINEZEK} pinezek w profilu.`); return; }
      widoczneKategorie.add(MOJE); zapiszFiltry(); zbudujFiltry(); odswiezWidocznosc();
      const m = dodajMarkerWlasny(p);
      odswiezLiczniki();
      m.openPopup();
      const pole = document.querySelector(".leaflet-popup .popup__pole");
      if (pole) { pole.focus(); pole.select(); }
      return;
    }
    if (TRYB_EDYTORA) {
      const wpis = `{ "id": "", "kategoria": "", "nazwa": "", "opis": "", "region": "", "status": "potwierdzone", "dodano": "${new Date().toISOString().slice(0, 10)}", "x": ${x}, "y": ${y} }`;
      const kopiuj = el("button", { type: "button", className: "przycisk przycisk--maly", textContent: "Kopiuj" });
      kopiuj.addEventListener("click", () => navigator.clipboard && navigator.clipboard.writeText(wpis).then(() => { kopiuj.textContent = "Skopiowano"; }));
      L.popup().setLatLng(e.latlng).setContent(el("div", { className: "popup" }, el("div", { textContent: `x: ${x}, y: ${y}` }), el("code", { textContent: wpis }), kopiuj)).openOn(map);
      return;
    }
    zamknijPanel();
  });
  if (TRYB_EDYTORA) document.body.classList.add("tryb-edytora");

  // --- Start ---
  async function wczytaj(url) {
    const odp = await fetch(url, { cache: "no-cache" });
    if (!odp.ok) throw new Error(url + ": " + odp.status);
    return odp.json();
  }

  Promise.all([wczytaj("/data/kategorie.json"), wczytaj("/data/znaczniki.json"), wczytaj("/data/regiony.json").catch(() => [])])
    .then(([kat, znaczniki, regiony]) => {
      kategorie = kat;
      kategoriePoId = new Map(kat.map((k) => [k.id, k]));
      const znane = new Set([...kategoriePoId.keys(), MOJE]);
      const domyslne = [...kat.filter((k) => !k.spoiler).map((k) => k.id), MOJE];

      // ?kategoria=bron,sklepy pokazuje tylko te kategorie (link z poradnika albo strony kategorii).
      const zAdresu = (parametry.get("kategoria") || "").split(",").map((s) => s.trim()).filter((s) => kategoriePoId.has(s));
      if (zAdresu.length) {
        filtryZAdresu = true;
        widoczneKategorie = new Set([...zAdresu, MOJE]);
      } else {
        widoczneKategorie = new Set(POSTEP.czytaj("filtry", domyslne).filter((id) => znane.has(id)));
      }

      for (const k of kat) warstwy.set(k.id, L.layerGroup());
      for (const z of znaczniki) {
        const k = kategoriePoId.get(z.kategoria);
        if (!k) { console.warn("Nieznana kategoria znacznika", z); continue; }
        const marker = L.marker([z.y, z.x], { icon: ikona(k.kolor, k.znak, POSTEP.czyZaliczone(z.id)), title: z.nazwa, alt: z.nazwa });
        marker.vicemapId = z.id;
        marker.bindPopup(() => trescPopupu(z), OPCJE_DYMKA());
        warstwy.get(k.id).addLayer(marker);
        znacznikiPoId.set(z.id, { dane: z, marker });
      }
      for (const p of POSTEP.pinezki()) dodajMarkerWlasny(p);
      dodajRegiony(regiony);

      zbudujFiltry();
      ustawPrzelaczniki();
      ustawWyszukiwarke();
      ustawProfile();
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
