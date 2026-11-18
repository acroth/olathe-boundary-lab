# Data pipeline

Builds every file the web app loads (`public/data/`) from public data and the district's published material. It runs on your
own machine (it needs a few hundred MB of downloads), never on the website.

```
pip install -r requirements.txt
python run.py            # every step, about a minute after the downloads are in place
python run.py --list     # what each step does
python run.py solver_plans presets   # just some steps (they read what earlier steps left in work/)
```

## How it fits together

```
raw downloads ─┐
data/ (in git) ┼─> 1 schools ─> 2 homes ─> 3 students ─> 5 app_export ─> public/data/schools.json, zones, homes.bin, streets.bin
               │                              │         4 streets ──────┘
               │                              ├─> 6 planning_areas ─> public/data/planning_areas.geojson
               │                              ├─> 7 option_builder ─> public/data/combos.json   (district concepts, mix & match)
               │                              └─> 8 solver_plans ──> 9 presets ─> public/data/presets.json (starting plans)
```

| Folder | What's in it |
|---|---|
| `boundary_lab/settings.py` | Folders, coordinate systems, school years. Every path and constant the steps share. |
| `boundary_lab/district.py` | The district's decisions and published figures (closures, receivers, capacities, fall 2026 counts, option tables). Copied from its material, nothing modeled. |
| `boundary_lab/steps/` | One module per step, in order. Each starts with what it reads, what it writes and how it works. |
| `boundary_lab/solver/` | The boundary solver behind the lab's own plans (see below). |
| `boundary_lab/geo.py` | Small geometry helpers used across steps. |
| `boundary_lab/publish_supabase.py` | Copies the finished data into Supabase as a numbered data version. |
| `analysis/backtest_2010.py` | The 2010-to-2020 check behind the model's age-blend weights. |
| `tools/` | One-off readers that turned the district's slide maps into data (results are saved in `data/map_readings/`). |
| `data/` | Small source tables kept in git: KSDE headcounts, DAA utilization, NCES Pre-K, published capacities, planning areas, map readings. |

## The student model in brief

1. **Homes** (step 2): every residential building gets a share of its 2020 census block's housing units. Blocks that grew since
   2020 get the extra units as new homes.
2. **Children per home** (step 2): each home inherits its block's children per unit, by age.
3. **Matching the district** (step 3): a school's projected students in a year (DAA's projected utilization × capacity,
   calibrated to the district's fall 2026 K-5 count) are spread over the homes in its area by those weights. For the five
   closing schools, the district's student-dot maps decide which blocks hold the students.
4. **Moving boundaries** (in the app): a home keeps its original school's projection wherever a plan sends it, so moving an
   area moves its students.

## The boundary solver

The lab's own plans come from `boundary_lab/solver/`. The goal is plans that look like a district's: whole neighborhoods
moving together, with any split on a major road or creek. That goal shapes the three files.

- **`chunks.py`**: a closing school's area is cut only along arterial and collector roads, named creeks, railroads, the
  district's planning-area lines and today's school lines. Near-empty pieces fold into a neighbor. Each closing school ends up
  as 3 to 11 chunks, and any plan made of chunks follows those lines.
- **`model.py`**: decides where each chunk goes. These rules must hold:
  - every school under a utilization cap in every year through 2034-35;
  - a maximum road trip;
  - no islands.

  Within those rules it minimizes a cost that weighs:
  - student-miles;
  - every mile of new line;
  - every extra way a closing school is split;
  - every student moved out of an open school.

  The solver is OR-Tools CP-SAT, an exact integer solver. Both published plans solve to proven optimality in seconds.
- **`scenarios.py`**: the published plans. One uses only the district's receivers with a 90% cap. The other uses an 85% cap
  and may pass areas between open schools, the way the district's options do.

## Map readings

The district published its options as images. The readers in `tools/` georeferenced each map against known road
intersections and classified every street block by its fill color. Their results are committed here, so the pipeline needs
nothing from those tools:

- `data/map_readings/elementary_blocks.parquet`: for each street block of the 18 affected elementary schools, its school today,
  where each district option 1–4 sends it, and its share of the district's student dots. Dots sitting on a block line are
  split between blocks, so the counts are fractional.
- `data/map_readings/middle_school_blocks.parquet`: for each street block, its middle school today and in concepts 1–5.

## Downloads (`raw/`, not in git)

| File | Source |
|---|---|
| `School.gdb` | Johnson County AIMS: school points, attendance areas, district boundary |
| `jocok_blocks.gpkg`, `jocok_dhc_p12_age_blocks.json`, `census_age_gq_blocks.csv` | 2020 Census blocks, DHC table P12 ages, group quarters |
| `overture_building.parquet`, `overture_land_use.parquet`, `overture_segment.parquet` | Overture Maps (buildings, land use, transportation) |
| `tl_2026_20091_linearwater.zip`, `tl_2026_us_rails.zip` | Census TIGER creeks and railroads (solver chunk lines) |
| `jocok_2010_p12_blocks.json`, `tl_2010_20091_tabblock10.zip` | 2010 Census, for `analysis/backtest_2010.py` only |

Set `BOUNDARY_RAW_DIR`, `BOUNDARY_WORK_DIR` or `BOUNDARY_APP_DIR` to keep these folders elsewhere.
