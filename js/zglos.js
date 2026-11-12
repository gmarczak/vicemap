// Formularz zgłoszeń: zapis do Supabase albo – bez konfiguracji – gotowy e-mail.
(function () {
  "use strict";
  const CFG = window.VICEMAP_CONFIG || {};
  const form = document.getElementById("formularz-zgloszenia");
  const komunikat = document.getElementById("komunikat");
  if (!form) return;

  const parametry = new URLSearchParams(location.search);
  const poleZnacznika = form.elements.znacznik_id;
  if (parametry.get("z")) {
    poleZnacznika.value = parametry.get("z");
    form.elements.typ.value = "poprawka";
  }
  if (parametry.get("x")) form.elements.x.value = parametry.get("x");
  if (parametry.get("y")) form.elements.y.value = parametry.get("y");

  // Lista kategorii z tego samego pliku co mapa.
  fetch("/data/kategorie.json").then((r) => r.json()).then((kategorie) => {
    const select = form.elements.kategoria;
    for (const k of kategorie) select.append(new Option(k.nazwa, k.id));
  }).catch(() => {});

  function pokaz(tekst, ok) {
    komunikat.textContent = tekst;
    komunikat.className = "komunikat " + (ok ? "komunikat--ok" : "komunikat--blad");
    komunikat.hidden = false;
    komunikat.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const naLiczbe = (v) => (v === "" || v == null ? null : Math.round(Number(v)));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.elements.strona_www.value) return; // pułapka na boty: ludzie nie widzą tego pola

    let ostatnie = 0;
    try { ostatnie = Number(localStorage.getItem("vicemap.ostatnieZgloszenie")) || 0; } catch (err) { /* brak pamięci */ }
    if (Date.now() - ostatnie < 30000) {
      pokaz("Odczekaj pół minuty przed kolejnym zgłoszeniem.", false);
      return;
    }

    const dane = {
      typ: form.elements.typ.value,
      znacznik_id: form.elements.znacznik_id.value.trim() || null,
      kategoria: form.elements.kategoria.value || null,
      nazwa: form.elements.nazwa.value.trim() || null,
      opis: form.elements.opis.value.trim(),
      x: naLiczbe(form.elements.x.value),
      y: naLiczbe(form.elements.y.value),
      kontakt: form.elements.kontakt.value.trim() || null
    };
    if (dane.opis.length < 10) {
      pokaz("Opisz miejsce trochę dokładniej (min. 10 znaków).", false);
      return;
    }

    const przycisk = form.querySelector("button[type=submit]");
    przycisk.disabled = true;

    try {
      if (CFG.supabaseUrl && CFG.supabaseAnonKey) {
        const odp = await fetch(CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/zgloszenia", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: CFG.supabaseAnonKey,
            Authorization: "Bearer " + CFG.supabaseAnonKey,
            Prefer: "return=minimal"
          },
          body: JSON.stringify(dane)
        });
        if (!odp.ok) throw new Error("HTTP " + odp.status);
        try { localStorage.setItem("vicemap.ostatnieZgloszenie", String(Date.now())); } catch (err) { /* brak pamięci */ }
        form.reset();
        pokaz("Dzięki! Zgłoszenie dotarło. Sprawdzimy je i dodamy na mapę.", true);
      } else if (CFG.kontaktEmail) {
        const tresc = Object.entries(dane).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}: ${v}`).join("\n");
        location.href = "mailto:" + CFG.kontaktEmail + "?subject=" + encodeURIComponent("Zgłoszenie ViceMap") + "&body=" + encodeURIComponent(tresc);
        pokaz("Otworzyliśmy Twój program pocztowy z gotową wiadomością – wystarczy ją wysłać.", true);
      } else {
        pokaz("Formularz nie jest jeszcze podłączony. Spróbuj ponownie za kilka dni.", false);
      }
    } catch (err) {
      console.error(err);
      pokaz("Nie udało się wysłać zgłoszenia. Spróbuj ponownie za chwilę.", false);
    } finally {
      przycisk.disabled = false;
    }
  });
})();
