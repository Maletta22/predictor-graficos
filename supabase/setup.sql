-- setup.sql — base de datos del ranking de UpDown en Supabase.
--
-- Cómo usarlo: en tu proyecto de Supabase, abre "SQL Editor", pega todo este
-- archivo y pulsa "Run". Solo hay que hacerlo una vez.
--
-- Cada jugador es un usuario "anónimo" de Supabase (sin email ni contraseña)
-- con un apodo. Guardamos un resumen de sus estadísticas para el ranking.

create table if not exists public.players (
  -- El mismo identificador que su usuario anónimo de Supabase
  id uuid primary key references auth.users (id) on delete cascade,

  -- Apodo: de 3 a 20 caracteres, letras (con tildes y ñ), números, _ y -
  nickname text not null
    check (char_length(nickname) between 3 and 20)
    check (nickname ~ '^[A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ-]+$'),

  -- Estadísticas (con comprobaciones básicas para que no haya valores absurdos)
  played integer not null default 0 check (played >= 0),
  correct integer not null default 0 check (correct >= 0 and correct <= played),
  best_streak integer not null default 0 check (best_streak >= 0 and best_streak <= correct),

  -- Probabilidad de que una moneda lo haga igual de bien o mejor (test
  -- binomial). El ranking se ordena por ella: cuanto más pequeña, mejor.
  luck_prob double precision not null default 1 check (luck_prob >= 0 and luck_prob <= 1),

  updated_at timestamptz not null default now()
);

-- Dos jugadores no pueden tener el mismo apodo (sin distinguir mayúsculas)
create unique index if not exists players_nickname_unique
  on public.players (lower(nickname));

-- Índice para que el ranking sea rápido aunque haya muchos jugadores
create index if not exists players_ranking
  on public.players (luck_prob, played desc)
  where played >= 30;

-- Seguridad a nivel de fila (Row Level Security): sin reglas, nadie puede
-- leer ni escribir. Las reglas de abajo dicen quién puede hacer qué.
alter table public.players enable row level security;

drop policy if exists "Cualquiera puede ver el ranking" on public.players;
create policy "Cualquiera puede ver el ranking"
  on public.players for select
  using (true);

drop policy if exists "Cada jugador crea su propia fila" on public.players;
create policy "Cada jugador crea su propia fila"
  on public.players for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Cada jugador edita solo su propia fila" on public.players;
create policy "Cada jugador edita solo su propia fila"
  on public.players for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
