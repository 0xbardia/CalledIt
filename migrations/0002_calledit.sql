create table if not exists chain_sync_state (
  id integer primary key,
  last_forecast_count integer not null default 0,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz
);

insert into chain_sync_state (id, last_forecast_count)
values (1, 0)
on conflict (id) do nothing;

create table if not exists forecasts (
  network text not null,
  contract_address text not null,
  forecast_id integer not null,
  author text not null,
  mode text not null,
  original_text text not null,
  source_url text not null default '',
  source_verification text not null,
  locked_at bigint,
  deadline bigint,
  deadline_iso text not null,
  category text not null default '',
  subject text not null default '',
  predicate text not null default '',
  comparator text not null default '',
  target_value text not null default '',
  unit text not null default '',
  occurrence text not null default '',
  canonical text not null default '',
  criteria text not null default '',
  ambiguity text not null default '',
  status text not null,
  verdict text not null default '',
  resolved_at bigint,
  evidence text not null default '',
  content_hash text not null default '',
  policy_snapshot text not null default '',
  chain_status text not null,
  lock_state text not null,
  tx_hash text,
  indexed_at timestamptz not null default now(),
  primary key (network, contract_address, forecast_id),
  constraint forecasts_status_chk check (status in ('OPEN', 'RESOLVED')),
  constraint forecasts_chain_chk check (chain_status in ('accepted', 'finalized', 'simulated')),
  constraint forecasts_lock_chk check (lock_state in ('draft', 'locked'))
);

create index if not exists forecasts_author_idx on forecasts (lower(author));
create index if not exists forecasts_status_idx on forecasts (status, chain_status);
create index if not exists forecasts_indexed_idx on forecasts (indexed_at desc);

create table if not exists auth_nonces (
  nonce text primary key,
  address text not null,
  origin text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists auth_nonces_expires_idx on auth_nonces (expires_at);

create table if not exists sessions (
  token_hash text primary key,
  address text not null,
  origin text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sessions_address_idx on sessions (address);

create table if not exists indexed_transactions (
  tx_hash text primary key,
  network text not null,
  chain_status text not null,
  forecast_id integer,
  method text not null default '',
  seen_at timestamptz not null default now()
);
