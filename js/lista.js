// Lista 100%: odhaczanie zsynchronizowane z mapą (ten sam zapis w przeglądarce).
(function () {
  "use strict";
  const POSTEP = window.VicemapPostep;
  if (!POSTEP) return;
  const wiersze = [...document.querySelectorAll("tr[data-id]")];

  function odswiez() {
    let ile = 0;
    const naKat = {};
    for (const w of wiersze) {
      const zal = POSTEP.czyZaliczone(w.dataset.id);
      w.querySelector("input").checked = zal;
      w.classList.toggle("zaliczony", zal);
      const k = (naKat[w.dataset.kategoria] ||= { ile: 0, z: 0 });
      k.z++; if (zal) { k.ile++; ile++; }
    }
    for (const span of document.querySelectorAll(".lista-licznik")) {
      const k = naKat[span.dataset.kategoria] || { ile: 0, z: 0 };
      span.textContent = `(${k.ile}/${k.z})`;
    }
    const procent = wiersze.length ? Math.round((ile / wiersze.length) * 100) : 0;
    document.getElementById("lista-postep").textContent = `Zaliczone: ${ile} z ${wiersze.length} (${procent}%)`;
  }

  for (const w of wiersze) {
    w.querySelector("input").addEventListener("change", (e) => {
      POSTEP.ustawZaliczone(w.dataset.id, e.target.checked);
      odswiez();
    });
  }
  const { aktywny, lista } = POSTEP.profile();
  const profil = lista.find((p) => p.id === aktywny);
  if (profil && lista.length > 1) document.getElementById("lista-profil").textContent = "Profil: " + profil.nazwa;
  // Zmiana postępu w innej karcie (np. na mapie) od razu widoczna tutaj.
  window.addEventListener("storage", (e) => { if (e.key && e.key.startsWith("vicemap.")) location.reload(); });
  odswiez();
})();
