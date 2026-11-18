-- Olathe Boundary Lab: reference data published by the pipeline, plus saved plans.
-- Every reference row carries the data version it was published with, so new data never breaks old saved plans.

create extension if not exists postgis;

create table if not exists data_versions (
  version      text primary key,              -- e.g. 2026-11-18.1
  published_at timestamptz not null default now(),
  is_current   boolean not null default false,
  notes        text
);
create unique index if not exists data_versions_one_current on data_versions (is_current) where is_current;

create table if not exists schools (
  version      text not null references data_versions on delete cascade,
  i            integer not null,              -- index used by the app
  id           text not null,                 -- district / AIMS id
  level        text not null check (level in ('es', 'ms', 'hs')),
  name         text not null,
  capacity     double precision not null,
  prek         double precision not null default 0,
  immersion    double precision not null default 0,
  neighborhood double precision[] not null,   -- neighborhood students by year (meta.years)
  location     geometry(Point, 4326) not null,
  props        jsonb not null default '{}',   -- color, area, neighbors, grade shares, factors, sources
  primary key (version, i)
);

create table if not exists zones (
  version  text not null references data_versions on delete cascade,
  level    text not null check (level in ('es', 'ms', 'hs')),
  school_i integer not null,
  geom     geometry(MultiPolygon, 4326) not null,
  primary key (version, level, school_i)
);
create index if not exists zones_geom on zones using gist (geom);

create table if not exists planning_areas (
  version text not null references data_versions on delete cascade,
  pa      text not null,
  school  text not null,                      -- elementary school whose area it sits in
  es      double precision[] not null,        -- students living there by year
  ms      double precision[] not null,
  hs      double precision[] not null,
  label   geometry(Point, 4326),
  geom    geometry(MultiPolygon, 4326) not null,
  primary key (version, pa)
);
create index if not exists planning_areas_geom on planning_areas using gist (geom);

-- one row per home (building with housing units); weights are students per home before each school's yearly factor
create table if not exists homes (
  version   text not null references data_versions on delete cascade,
  idx       integer not null,
  geom      geometry(Point, 4326) not null,
  units     real not null,
  is_new    boolean not null default false,
  w_es      real not null, w_ms real not null, w_hs real not null,
  orig_es   smallint not null, orig_ms smallint not null, orig_hs smallint not null,
  node      integer,                          -- nearest street node (road distances)
  offset_ft real,
  primary key (version, idx)
);
create index if not exists homes_geom on homes using gist (geom);

-- the district's own numbers (Nov 2026 boundary presentations)
create table if not exists district_tables (
  version  text not null references data_versions on delete cascade,
  option   smallint not null,                 -- district-wide option 1..4
  school   text not null,
  totals   integer[] not null,                -- 2026-27 .. 2031-32, Early Childhood included
  primary key (version, option, school)
);
create table if not exists district_pieces (
  version     text not null references data_versions on delete cascade,
  option      smallint not null,
  from_school text not null,
  to_school   text not null,
  students    integer not null,               -- 2026-27 K-5
  primary key (version, option, from_school, to_school)
);
create table if not exists district_schools (
  version     text not null references data_versions on delete cascade,
  school      text not null,
  capacity    integer not null,               -- functional capacity
  enroll_2026 integer not null,
  primary key (version, school)
);

-- documents the app loads whole: presets, Option Builder concepts and moves
create table if not exists documents (
  version text not null references data_versions on delete cascade,
  name    text not null,                      -- presets | combos
  body    jsonb not null,
  primary key (version, name)
);

-- saved plans behind short links (/p/<id>); written only by the server (service role)
create table if not exists plans (
  id           text primary key,
  hash         text not null,                 -- the lab's encoded plan (URL hash)
  hash_md5     text generated always as (md5(hash)) stored,
  name         text,
  data_version text,
  created_at   timestamptz not null default now()
);
create index if not exists plans_hash on plans (hash_md5);

-- Row level security: reference data is public to read; plans are only reachable through the API routes.
alter table data_versions   enable row level security;
alter table schools         enable row level security;
alter table zones           enable row level security;
alter table planning_areas  enable row level security;
alter table homes           enable row level security;
alter table district_tables enable row level security;
alter table district_pieces enable row level security;
alter table district_schools enable row level security;
alter table documents       enable row level security;
alter table plans           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['data_versions','schools','zones','planning_areas','homes','district_tables','district_pieces','district_schools','documents'] loop
    execute format('drop policy if exists "public read" on %I', t);
    execute format('create policy "public read" on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
