"""Map reading: turn the district's boundary maps (images in its slide decks) into data.

The district published its options as pictures. Each reader here:
  1. lines the picture up with real coordinates, using road intersections it can see (georeference.py), then
  2. looks at the picture under every street block and reads the fill color against the map's legend (colors.py), then
  3. tidies the result: a block the picture doesn't show clearly takes its neighbours' reading, and tiny islands are merged.

Readers (run from the pipeline folder):
  python -m tools.map_reading.elementary_options      the four district-wide elementary options
  python -m tools.map_reading.student_dots            the closing schools' student-dot maps
  python -m tools.map_reading.middle_school_concepts  the five middle school concepts

They write to work/ and print how their reading compares with the committed one in data/map_readings/. The committed
readings are the source the pipeline uses: they also carry corrections made by hand after checking against the district's
maps (listed in README.md), so a fresh run is expected to differ from them in those places.

Inputs: the slide images in raw/district_slides/ (listed in README.md), the intersection points in
data/map_readings/georeference_points.json, and the street network from the pipeline (work/street_edges.parquet).
"""
