// Mała mapa na stronie pojedynczego znacznika.
(function () {
  "use strict";
  const kontener = document.getElementById("mini-mapa");
  if (!kontener || !window.L) return;
  const MAPA = (window.VICEMAP_CONFIG || {}).mapa || { obraz: "/mapa.webp", szerokosc: 3200, wysokosc: 4357 };
  const x = Number(kontener.dataset.x), y = Number(kontener.dataset.y);
  const map = L.map(kontener, {
    crs: L.CRS.Simple, minZoom: -2, maxZoom: 3, zoomControl: true, attributionControl: false,
    scrollWheelZoom: false, dragging: !L.Browser.mobile
  });
  L.imageOverlay(MAPA.obraz, [[0, 0], [MAPA.wysokosc, MAPA.szerokosc]]).addTo(map);
  const pin = document.createElement("span");
  pin.className = "pin";
  pin.style.setProperty("--kolor", kontener.dataset.kolor || "#ccc");
  pin.textContent = kontener.dataset.znak || "•";
  L.marker([y, x], { icon: L.divIcon({ className: "", html: pin.outerHTML, iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(map);
  map.setView([y, x], 1);
})();
