# Olathe Boundary Lab

Try Olathe USD 233 elementary boundary concepts and see capacity, utilization and busing distances.
Independent analysis; not affiliated with Olathe Public Schools.

## Layout

| Path | What it is |
|---|---|
| `src/app` | Next.js App Router: the page, `/p/[id]` short links, `/api/plans` |
| `src/lab` | The lab itself (client-only): map, drawing, Concept Builder, scoring engine (`model/engine.ts`, runs in a web worker) |
| `src/server` | Server-only helpers (Supabase client) |
| `public/data` | Data the app loads: schools, zones, planning areas, homes and streets (binary), presets, Concept Builder concepts, basemap |
| `pipeline/src` | Python pipeline that builds `public/data` from census, county, Overture and district sources (`s01`..`s12`), plus `publish_supabase.py` |
| `pipeline/tools` | Readers for the district's boundary-map photos/decks and student-dot maps |
| `supabase/migrations` | Database schema (PostGIS) |
| `tests` | Vitest: engine, polygon ops; `VERIFY=1` also checks every district concept and Concept Builder combination |

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # VERIFY=1 npm test for the slow data checks
```

The app works without Supabase; sharing then falls back to long links that carry the plan in the URL.

## Feedback form

Messages from the contact page are emailed to a Gmail inbox. In Vercel, set:

- `GMAIL_USER`: the Gmail address that sends (and, by default, receives) feedback.
- `GMAIL_APP_PASSWORD`: an app password for that account (Google Account → Security → 2-Step Verification → App passwords).
- `FEEDBACK_TO` (optional): a different inbox to send feedback to.

Until those are set, the form says feedback isn't set up yet.

## Supabase

1. Create a project; in the SQL editor (or `supabase db push`) run `supabase/migrations/*_init.sql`. The `feedback` migration is no longer used.
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
