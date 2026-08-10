-- TARIFA·VIVA — esquema
-- Aplicar con: npm run db:setup   (o pegarlo en la consola de Neon/Vercel Postgres)

create table if not exists packages (
  id               uuid primary key,
  slug             text not null unique,
  title            text not null,
  origin           text not null,
  destination      text not null,
  destination_name text not null,
  depart_date      date not null,
  return_date      date,
  nights           integer,
  board            text not null default 'all_inclusive',
  pax_base         integer not null default 2,
  listed_price_usd numeric(10, 2),
  status           text not null default 'borrador',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists packages_status_idx on packages (status, depart_date);

create table if not exists quotes (
  id               uuid primary key,
  token            text not null unique,
  package_id       uuid references packages (id) on delete set null,
  customer_name    text,
  customer_contact text,
  channel          text not null default 'whatsapp',
  status           text not null default 'abierta',
  params           jsonb not null,
  revision         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists quotes_status_idx on quotes (status, updated_at desc);

-- Log append-only de la conversación: cada cambio de fecha, de pasajeros o de
-- horario queda acá. Es lo que hace auditable una cotización que se movió diez
-- veces antes de cerrarse.
create table if not exists quote_events (
  id         uuid primary key,
  quote_id   uuid not null references quotes (id) on delete cascade,
  kind       text not null,
  actor      text not null,
  text       text,
  data       jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quote_events_quote_idx on quote_events (quote_id, created_at);

-- Cada consulta a la aerolínea queda registrada. De acá salen el "subió/bajó"
-- y el histórico que permite decirle al cliente cuánto se movió su tarifa.
create table if not exists fare_snapshots (
  id                 uuid primary key,
  quote_id           uuid references quotes (id) on delete cascade,
  package_id         uuid references packages (id) on delete cascade,
  origin             text not null,
  destination        text not null,
  depart_date        date not null,
  return_date        date,
  pax                integer not null,
  provider           text not null,
  carrier            text,
  cabin              text not null default 'ECONOMY',
  price_per_pax_usd  numeric(10, 2) not null,
  total_usd          numeric(10, 2) not null,
  seats_left         integer,
  fetched_at         timestamptz not null default now(),
  valid_until        timestamptz not null,
  delta_pct          numeric(6, 2),
  previous_total_usd numeric(10, 2),
  raw                jsonb
);

create index if not exists fare_snapshots_key_idx
  on fare_snapshots (origin, destination, depart_date, pax, fetched_at desc);

create index if not exists fare_snapshots_quote_idx
  on fare_snapshots (quote_id, fetched_at desc);

create index if not exists fare_snapshots_package_idx
  on fare_snapshots (package_id, fetched_at desc);
