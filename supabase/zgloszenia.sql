-- Tabela zgłoszeń znaczników z formularza /zglos.html.
-- Uruchom raz w Supabase: SQL Editor -> wklej -> Run.
-- Odwiedzający mogą tylko DODAWAĆ zgłoszenia. Czytasz je w panelu Supabase (Table Editor).

create table if not exists public.zgloszenia (
  id           bigint generated always as identity primary key,
  utworzono    timestamptz not null default now(),
  typ          text not null check (typ in ('nowy', 'poprawka', 'blad')),
  znacznik_id  text check (char_length(znacznik_id) <= 100),
  kategoria    text check (char_length(kategoria) <= 50),
  nazwa        text check (char_length(nazwa) <= 120),
  opis         text not null check (char_length(opis) between 10 and 2000),
  x            integer check (x between -100000 and 100000),
  y            integer check (y between -100000 and 100000),
  kontakt      text check (char_length(kontakt) <= 120),
  status       text not null default 'nowe' check (status in ('nowe', 'dodane', 'odrzucone'))
);

alter table public.zgloszenia enable row level security;

-- Anonimowy odwiedzający może wstawić zgłoszenie, ale nie może ustawić statusu ani niczego odczytać.
drop policy if exists "anon dodaje zgloszenia" on public.zgloszenia;
create policy "anon dodaje zgloszenia"
  on public.zgloszenia
  for insert
  to anon
  with check (status = 'nowe');

-- Brak polityk select/update/delete = odwiedzający nie widzą ani nie zmieniają cudzych zgłoszeń.
revoke select, update, delete on public.zgloszenia from anon, authenticated;
grant insert (typ, znacznik_id, kategoria, nazwa, opis, x, y, kontakt) on public.zgloszenia to anon;
