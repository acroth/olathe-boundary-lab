# Olathe Boundary Lab

Try Olathe USD 233 elementary boundary options and see capacity, utilization and busing distances.
Independent analysis; not affiliated with Olathe Public Schools.

## Layout

| Path | What it is |
|---|---|
| `src/app` | Next.js App Router: the page, `/p/[id]` short links, `/api/plans` |
| `src/lab` | The lab itself (client-only): map, drawing, Option Builder, scoring engine (`model/engine.ts`, runs in a web worker) |
| `src/server` | Server-only helpers (Supabase client) |
| `public/data` | Data the app loads: schools, zones, planning areas, homes and streets (binary), presets, Option Builder concepts, basemap |
| `pipeline/src` | Python pipeline that builds `public/data` from census, county, Overture and district sources (`s01`..`s12`), plus `publish_supabase.py` |
| `pipeline/tools` | Readers for the district's boundary-map photos/decks and student-dot maps |
| `supabase/migrations` | Database schema (PostGIS) |
| `tests` | Vitest: engine, polygon ops; `VERIFY=1` also checks every district option and Option Builder combination |

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # VERIFY=1 npm test for the slow data checks
```

The app works without Supabase; sharing then falls back to long links that carry the plan in the URL.

## Supabase

1. Create a project; in the SQL editor (or `supabase db push`) run `supabase/migrations/*.sql`.
2. In Vercel, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`).
3. Publish the data (from your machine; needs the session-pooler connection string):

```bash
pip install -r pipeline/requirements.txt
export DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
python pipeline/src/publish_supabase.py --version 2026-11-18.1 --current --notes "Nov 2026 options, dot model"
```

This stamps `meta.dataVersion` into `public/data/schools.json`; commit that so saved plans record which data they used.

## Pipeline

Inputs (`pipeline/raw`) and intermediates (`pipeline/work`) are not in git (large; rebuilt locally). Steps run in order
`s01_schools` .. `s12_combos`; see each file's docstring. The district's own figures from the Nov 2026 presentations are in
`pipeline/src/district_tables.py`.
