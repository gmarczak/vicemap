// Ustawienia strony. Puste pole = funkcja wyłączona.
// Wszystko tutaj jest publiczne (trafia do przeglądarki), więc NIE wpisuj tu sekretów.
window.VICEMAP_CONFIG = {
  // Obraz mapy bazowej i jego wymiary w pikselach. Po premierze podmień na własną, przerysowaną mapę.
  mapa: { obraz: "/mapa.svg", szerokosc: 1000, wysokosc: 1000 },

  // Zgłoszenia znaczników trafiają do Supabase (tabela z pliku supabase/zgloszenia.sql).
  // Bez tych dwóch pól formularz otwiera program pocztowy z gotową wiadomością.
  supabaseUrl: "",       // np. "https://abcd1234.supabase.co"
  supabaseAnonKey: "",   // klucz publiczny "anon" / "publishable", NIGDY service_role
  kontaktEmail: "",      // adres na zgłoszenia i kontakt, np. "kontakt@vicemap.pl"

  // Reklamy Google AdSense ładują się dopiero po zgodzie użytkownika. Np. "ca-pub-1234567890".
  adsenseClient: "",

  // Przycisk wsparcia w stopce, np. "https://buycoffee.to/vicemap".
  wsparcieUrl: "",

  // Linki afiliacyjne. Element <a data-sklep="eneba"> dostanie ten adres zamiast domyślnego.
  afiliacja: {
    eneba: "",
    ceneo: "",
    amazon: ""
  }
};
