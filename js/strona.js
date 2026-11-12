// Wspólne elementy każdej podstrony: zgody, reklamy po zgodzie, wsparcie, linki afiliacyjne, tryb offline.
(function () {
  "use strict";
  const CFG = window.VICEMAP_CONFIG || {};

  const czytaj = (k) => { try { return localStorage.getItem("vicemap." + k); } catch (e) { return null; } };
  const zapisz = (k, v) => { try { localStorage.setItem("vicemap." + k, v); } catch (e) { /* brak pamięci */ } };

  // --- Przycisk wsparcia w stopce ---
  if (CFG.wsparcieUrl) {
    for (const a of document.querySelectorAll("[data-wsparcie]")) {
      a.href = CFG.wsparcieUrl;
      a.hidden = false;
    }
  }

  // --- Linki afiliacyjne: <a data-sklep="eneba" href="domyślny-adres"> ---
  const afiliacja = CFG.afiliacja || {};
  for (const a of document.querySelectorAll("a[data-sklep]")) {
    const adres = afiliacja[a.dataset.sklep];
    if (adres) {
      a.href = adres;
      a.rel = "sponsored nofollow noopener";
    }
  }

  // --- Reklamy: tylko gdy skonfigurowane i po zgodzie ---
  function zaladujReklamy() {
    if (!CFG.adsenseClient || document.getElementById("adsense-skrypt")) return;
    const s = document.createElement("script");
    s.id = "adsense-skrypt";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(CFG.adsenseClient);
    document.head.append(s);
    for (const slot of document.querySelectorAll("ins.adsbygoogle")) {
      slot.dataset.adClient = CFG.adsenseClient;
      slot.closest(".reklama") && (slot.closest(".reklama").hidden = false);
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  }

  // --- Baner zgód (pokazuje się tylko, gdy jest coś, na co trzeba zgody) ---
  function pokazBaner() {
    const baner = document.createElement("div");
    baner.className = "zgody";
    baner.setAttribute("role", "dialog");
    baner.setAttribute("aria-label", "Zgoda na pliki cookie");
    baner.innerHTML =
      '<p>Używamy plików cookie do wyświetlania reklam, które utrzymują stronę. ' +
      'Szczegóły w <a href="/polityka-prywatnosci.html">polityce prywatności</a>.</p>' +
      '<div class="zgody__przyciski">' +
      '<button type="button" class="przycisk" data-zgoda="nie">Tylko niezbędne</button>' +
      '<button type="button" class="przycisk przycisk--glowny" data-zgoda="tak">Akceptuję</button>' +
      "</div>";
    baner.addEventListener("click", (e) => {
      const wybor = e.target.dataset && e.target.dataset.zgoda;
      if (!wybor) return;
      zapisz("zgoda", wybor);
      baner.remove();
      if (wybor === "tak") zaladujReklamy();
    });
    document.body.append(baner);
  }

  for (const b of document.querySelectorAll("[data-zmien-zgode]")) {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      zapisz("zgoda", "");
      if (!document.querySelector(".zgody")) pokazBaner();
    });
  }

  if (CFG.adsenseClient) {
    const zgoda = czytaj("zgoda");
    if (zgoda === "tak") zaladujReklamy();
    else if (zgoda !== "nie") pokazBaner();
  }

  // --- Odliczanie do premiery (po premierze znika samo) ---
  const PREMIERA = Date.parse("2026-11-19T00:00:00+01:00"); // północ czasu polskiego
  const naglowek = document.querySelector("header");
  if (naglowek && Date.now() < PREMIERA) {
    const pasek = document.createElement("div");
    pasek.className = "odliczanie";
    pasek.setAttribute("role", "timer");
    const tekst = document.createElement("strong");
    const data = document.createElement("span");
    data.className = "odliczanie__data";
    data.textContent = "19 listopada, 00:00 czasu polskiego";
    const opis = document.createElement("span");
    opis.append("Premiera GTA 6 za ", tekst);
    pasek.append(opis, data);
    const odmiana = (n, a, b, c) => n + " " + (n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c);
    const tik = () => {
      const r = PREMIERA - Date.now();
      if (r <= 0) { pasek.remove(); return; }
      const d = Math.floor(r / 864e5), h = Math.floor(r / 36e5) % 24, m = Math.floor(r / 6e4) % 60, s = Math.floor(r / 1e3) % 60;
      tekst.textContent = d > 0
        ? `${odmiana(d, "dzień", "dni", "dni")} ${h} godz. ${m} min`
        : `${h} godz. ${m} min ${s} s`;
    };
    tik();
    setInterval(tik, 1000);
    // Na stronie mapy pasek trafia do panelu, żeby nie zabierać miejsca mapie.
    const miejsce = document.getElementById("odliczanie-mapa");
    if (miejsce) { pasek.classList.add("odliczanie--panel"); miejsce.append(pasek); }
    else naglowek.after(pasek);
  }

  // --- Tryb offline / "Dodaj do ekranu głównego" ---
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
})();
