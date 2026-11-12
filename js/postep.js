// Postęp gracza zapisany w przeglądarce: profile przejść, zaliczone miejsca, notatki, własne pinezki.
// Wspólny dla mapy (js/map.js) i listy 100% (js/lista.js).
(function () {
  "use strict";
  const P = "vicemap.";
  const MAKS_PROFILI = 5;
  const MAKS_PINEZEK = 200;
  const MAKS_NOTATKA = 500;

  function czytaj(klucz, domyslnie) {
    try {
      const v = localStorage.getItem(P + klucz);
      return v === null ? domyslnie : JSON.parse(v);
    } catch (e) { return domyslnie; }
  }
  function zapisz(klucz, wartosc) {
    try { localStorage.setItem(P + klucz, JSON.stringify(wartosc)); return true; } catch (e) { return false; }
  }
  function usun(klucz) {
    try { localStorage.removeItem(P + klucz); } catch (e) { /* brak pamięci */ }
  }

  // --- Profile przejść ---
  let profile = czytaj("profile", null);
  if (!profile || !Array.isArray(profile.lista) || !profile.lista.length) {
    profile = { aktywny: "p1", lista: [{ id: "p1", nazwa: "Moje przejście" }] };
    // Przeniesienie postępu z pierwszej wersji strony (jeden wspólny zapis).
    const stare = czytaj("zaliczone", null);
    if (Array.isArray(stare)) { zapisz("p.p1.zaliczone", stare); usun("zaliczone"); }
    zapisz("profile", profile);
  }
  if (!profile.lista.some((p) => p.id === profile.aktywny)) profile.aktywny = profile.lista[0].id;

  const kluczProfilu = (co, id) => `p.${id || profile.aktywny}.${co}`;

  const zaliczone = new Set(czytaj(kluczProfilu("zaliczone"), []));
  const notatki = czytaj(kluczProfilu("notatki"), {});
  let pinezki = czytaj(kluczProfilu("pinezki"), []);

  const sluchacze = new Set();
  const powiadom = () => { for (const f of sluchacze) f(); };

  const api = {
    MAKS_PROFILI, MAKS_PINEZEK, MAKS_NOTATKA,
    czytaj, zapisz,
    naZmiane(f) { sluchacze.add(f); },

    // Zaliczone
    czyZaliczone: (id) => zaliczone.has(id),
    ustawZaliczone(id, wartosc) {
      if (wartosc) zaliczone.add(id); else zaliczone.delete(id);
      zapisz(kluczProfilu("zaliczone"), [...zaliczone]);
      powiadom();
    },
    wszystkieZaliczone: () => new Set(zaliczone),
    wyczyscZaliczone() { zaliczone.clear(); zapisz(kluczProfilu("zaliczone"), []); powiadom(); },

    // Notatki do znaczników
    notatka: (id) => notatki[id] || "",
    ustawNotatke(id, tekst) {
      tekst = String(tekst || "").slice(0, MAKS_NOTATKA);
      if (tekst.trim()) notatki[id] = tekst; else delete notatki[id];
      zapisz(kluczProfilu("notatki"), notatki);
    },

    // Własne pinezki
    pinezki: () => pinezki.slice(),
    dodajPinezke(p) {
      if (pinezki.length >= MAKS_PINEZEK) return null;
      const nowa = { id: "moja-" + Date.now().toString(36), nazwa: String(p.nazwa || "Moja pinezka").slice(0, 80), opis: "", x: Math.round(p.x), y: Math.round(p.y) };
      pinezki.push(nowa);
      zapisz(kluczProfilu("pinezki"), pinezki);
      return nowa;
    },
    zmienPinezke(id, zmiany) {
      const p = pinezki.find((q) => q.id === id);
      if (!p) return;
      if (zmiany.nazwa != null) p.nazwa = String(zmiany.nazwa).slice(0, 80) || "Moja pinezka";
      if (zmiany.opis != null) p.opis = String(zmiany.opis).slice(0, MAKS_NOTATKA);
      zapisz(kluczProfilu("pinezki"), pinezki);
    },
    usunPinezke(id) {
      pinezki = pinezki.filter((q) => q.id !== id);
      zapisz(kluczProfilu("pinezki"), pinezki);
    },

    // Profile
    profile: () => ({ aktywny: profile.aktywny, lista: profile.lista.map((p) => ({ ...p })) }),
    przelaczProfil(id) {
      if (!profile.lista.some((p) => p.id === id)) return;
      profile.aktywny = id; zapisz("profile", profile); location.reload();
    },
    nowyProfil(nazwa) {
      if (profile.lista.length >= MAKS_PROFILI) return false;
      const id = "p" + Date.now().toString(36);
      profile.lista.push({ id, nazwa: String(nazwa || "Nowe przejście").slice(0, 40) });
      profile.aktywny = id; zapisz("profile", profile); location.reload();
      return true;
    },
    zmienNazweProfilu(nazwa) {
      const p = profile.lista.find((q) => q.id === profile.aktywny);
      if (p && nazwa) { p.nazwa = String(nazwa).slice(0, 40); zapisz("profile", profile); }
    },
    usunProfil() {
      if (profile.lista.length < 2) return false;
      const id = profile.aktywny;
      for (const co of ["zaliczone", "notatki", "pinezki"]) usun(kluczProfilu(co, id));
      profile.lista = profile.lista.filter((p) => p.id !== id);
      profile.aktywny = profile.lista[0].id; zapisz("profile", profile); location.reload();
      return true;
    },

    // Kopia zapasowa wszystkich profili
    eksport() {
      const dane = { aplikacja: "vicemap", wersja: 1, utworzono: new Date().toISOString(), profile: [] };
      for (const p of profile.lista) {
        dane.profile.push({
          nazwa: p.nazwa,
          zaliczone: czytaj(kluczProfilu("zaliczone", p.id), []),
          notatki: czytaj(kluczProfilu("notatki", p.id), {}),
          pinezki: czytaj(kluczProfilu("pinezki", p.id), [])
        });
      }
      return dane;
    },
    // Dodaje profile z kopii obok istniejących. Zwraca liczbę dodanych albo rzuca błąd z opisem.
    importuj(dane) {
      if (!dane || dane.aplikacja !== "vicemap" || !Array.isArray(dane.profile)) throw new Error("To nie jest plik kopii ViceMap.");
      const tekst = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
      let dodane = 0;
      for (const zrodlo of dane.profile) {
        if (profile.lista.length >= MAKS_PROFILI) break;
        const id = "p" + Date.now().toString(36) + dodane;
        const zal = Array.isArray(zrodlo.zaliczone) ? zrodlo.zaliczone.filter((x) => typeof x === "string" && x.length <= 100).slice(0, 10000) : [];
        const not = {};
        if (zrodlo.notatki && typeof zrodlo.notatki === "object") {
          for (const [k, v] of Object.entries(zrodlo.notatki).slice(0, 5000)) if (k.length <= 100) not[k] = tekst(v, MAKS_NOTATKA);
        }
        const pin = Array.isArray(zrodlo.pinezki) ? zrodlo.pinezki.slice(0, MAKS_PINEZEK)
          .filter((q) => q && Number.isFinite(q.x) && Number.isFinite(q.y))
          .map((q, i) => ({ id: "moja-" + Date.now().toString(36) + "-" + i, nazwa: tekst(q.nazwa, 80) || "Moja pinezka", opis: tekst(q.opis, MAKS_NOTATKA), x: Math.round(q.x), y: Math.round(q.y) })) : [];
        zapisz(kluczProfilu("zaliczone", id), zal);
        zapisz(kluczProfilu("notatki", id), not);
        zapisz(kluczProfilu("pinezki", id), pin);
        profile.lista.push({ id, nazwa: (tekst(zrodlo.nazwa, 30) || "Przejście") + " (kopia)" });
        dodane++;
      }
      zapisz("profile", profile);
      return dodane;
    }
  };

  window.VicemapPostep = api;
})();
