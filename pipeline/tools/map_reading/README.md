# Map reading

These readers turn the district's boundary maps into data. The district publishes its maps as images in its slide decks.
The pipeline itself doesn't run them; it uses the committed readings in `data/map_readings/`. See `__init__.py` for how a
reading works.

```
cd pipeline
python -m tools.map_reading.elementary_options      # about 30 s
python -m tools.map_reading.student_dots
python -m tools.map_reading.middle_school_concepts
```

Each reader prints how its fresh reading compares with the committed one. On the current files:

| Reader | Agreement with the committed reading |
|---|---|
| Elementary options 1–4 | 99.7%, 99.9%, 99.9%, 100% of students; the only differences are the hand corrections below |
| Student dots | identical for four schools; Heritage differs by 8 students, at the block split for the first correction below |
| Middle school concepts 1–5 | 99.2–99.8% of blocks |

## Slide images (`raw/district_slides/`, not in git)

The images are pages exported from the district's November 2026 boundary presentations (Olathe USD 233).

| File | Slide |
|---|---|
| `elementary_option{1-4}_{ne,se}.jpg` | Elementary options 1–4, northeast and southeast map frames |
| `student_dots_{school}_base.png` | A closing school's student-density slide, before the dots appear (it holds the georeference points) |
| `student_dots_{school}_dots.png` | The same slide with the dots shown |
| `middle_school_concept{1-5}.jpg` | Middle school concepts 1–5 |

The road crossings used to line up each picture are in `data/map_readings/georeference_points.json`. To add a picture, run
`python -m tools.map_reading.georeference <image> MurLen&151=x,y ...` with rough pixel guesses for four or more crossings.

## Hand corrections

These corrections were made after checking the readings against the district's maps and summary tables. They're in the
committed `elementary_blocks.parquet`, so a fresh run differs from it in these places.

1. **Option 1, Heritage.** The map's line between Madison Place and Brougham runs along Lindenwood Dr. The Heritage block
   it crosses is split there, and the part on the Brougham side goes to Brougham (about 17 students).
2. **Option 2, Heritage.** The middle piece of Heritage goes entirely to Havencroft, as the summary table counts it. The
   high school land south of it stays a separate Madison Place block (about 7 students).
3. **Option 3, Walnut Grove.** Option 3 uses the same Walnut Grove lines as Walnut Grove's concept 2: the strip the reader
   gives to Heatherstone goes to Pleasant Ridge (about 6 students).
