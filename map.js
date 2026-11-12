const ROZMIAR = 1000; // bok obrazka mapy w jednostkach mapy
const granice = [[0, 0], [ROZMIAR, ROZMIAR]];

const map = L.map("map", { crs: L.CRS.Simple, minZoom: -1, maxZoom: 3, maxBounds: granice });
// Podmień mapa.svg na prawdziwy obraz mapy (np. mapa.jpg) po premierze.
L.imageOverlay("mapa.svg", granice).addTo(map);
map.fitBounds(granice);

// Jedna warstwa na kategorię; wbudowana kontrolka Leafleta robi z nich filtry.
const warstwy = {};
for (const m of MARKERS) {
  warstwy[m.kategoria] ??= L.layerGroup().addTo(map);
  // Tekst wstawiany przez DOM, nie przez HTML – opis ze znaczników nie wykona się jako kod.
  const tresc = document.createElement("div");
  tresc.append(Object.assign(document.createElement("strong"), { textContent: m.nazwa }));
  tresc.append(document.createElement("br"), m.opis);
  L.marker([m.y, m.x]).bindPopup(tresc).addTo(warstwy[m.kategoria]);
}
L.control.layers(null, warstwy, { collapsed: false }).addTo(map);

// Pomoc przy dodawaniu znaczników: klik pokazuje współrzędne do wklejenia w markers.js.
map.on("click", (e) => {
  const x = Math.round(e.latlng.lng), y = Math.round(e.latlng.lat);
  L.popup().setLatLng(e.latlng).setContent(`x: ${x}, y: ${y}`).openOn(map);
});
