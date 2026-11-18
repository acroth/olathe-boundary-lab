"""Read the district's five middle school boundary concepts (Nov 2026 middle school deck) onto street blocks.

Each concept map fills the whole new area of every middle school that changes; unfilled land keeps today's middle school.
For every street block, nine points inside it are looked up on the map; each point's 7x7-pixel median color matches the
nearest legend swatch if it's within 60 (RGB distance). A block takes the most common swatch if at least two points and 40%
of its points are filled. Then:
  * unfilled blocks of a school that the map does fill (or of Indian Trail, which closes) can't keep that school, so they take
    their neighbours' reading,
  * small specks unlike every neighbour join their neighbours,
  * moves the deck's "Summary of Changes" slides don't describe are dropped, and Indian Trail's blocks go only to that
    concept's filled schools.

Writes work/middle_school_concepts_reading.parquet and compares it with data/map_readings/middle_school_blocks.parquet.
"""
from collections import Counter

import geopandas as gpd
import numpy as np
from PIL import Image
from shapely.geometry import Point

from boundary_lab.geo import read_zones
from boundary_lab.settings import MAP_READINGS_DIR, work_file
from .colors import sample_swatches
from .georeference import SLIDES_DIR, georeference_for
from .intersections import road_crossings

CALIFORNIA, CHISHOLM, FRONTIER, PIONEER, SANTA_FE, OREGON = (
    'California Trail', 'Chisholm Trail', 'Frontier Trail', 'Pioneer Trail', 'Santa Fe Trail', 'Oregon Trail')
CLOSING = 'Indian Trail'
# Legend swatch centres in each concept's picture (pixels)
LEGEND_PIXELS = {
    1: {CALIFORNIA: (1968, 813), CHISHOLM: (1968, 889), FRONTIER: (1968, 964), PIONEER: (1968, 1040), SANTA_FE: (1968, 1194)},
    2: {CALIFORNIA: (2532, 724), CHISHOLM: (2532, 801), FRONTIER: (2532, 877), PIONEER: (2532, 954), OREGON: (2532, 1107)},
    3: {CALIFORNIA: (2394, 764), CHISHOLM: (2394, 841), FRONTIER: (2394, 916), PIONEER: (2394, 994), OREGON: (2394, 1146)},
    4: {CALIFORNIA: (2163, 945), CHISHOLM: (2163, 1001), FRONTIER: (2163, 1059), PIONEER: (2163, 1117), SANTA_FE: (2163, 1232)},
    5: {CALIFORNIA: (2680, 1409), CHISHOLM: (2680, 1470), FRONTIER: (2680, 1529), PIONEER: (2680, 1591), SANTA_FE: (2680, 1650)},
}
# Moves between open schools that each concept's summary slide describes
DESCRIBED_MOVES = {
    1: {(PIONEER, CALIFORNIA), (FRONTIER, CHISHOLM), (FRONTIER, PIONEER)},
    2: {(CALIFORNIA, PIONEER), (PIONEER, CALIFORNIA), (FRONTIER, CALIFORNIA), (FRONTIER, CHISHOLM)},
    3: {(FRONTIER, CALIFORNIA), (FRONTIER, PIONEER)},
    4: {(CALIFORNIA, PIONEER), (PIONEER, CALIFORNIA), (FRONTIER, CALIFORNIA)},
    5: {(FRONTIER, CHISHOLM)},
}
# Where Indian Trail's area goes in each concept
INDIAN_TRAIL_RECEIVERS = {1: {CALIFORNIA, CHISHOLM, FRONTIER, PIONEER, SANTA_FE}, 2: {CALIFORNIA, CHISHOLM, FRONTIER, PIONEER, OREGON},
                          3: {CALIFORNIA, CHISHOLM, FRONTIER, PIONEER, OREGON}, 4: {CALIFORNIA, CHISHOLM, FRONTIER, PIONEER, SANTA_FE},
                          5: {CHISHOLM, FRONTIER, SANTA_FE}}
MAX_COLOR_DISTANCE = 60
MAX_SPECK_ACRES = 15


def current_middle_school(blocks: gpd.GeoDataFrame) -> np.ndarray:
    """Today's middle school of each block: the area it overlaps most (None outside the district)."""
    zones = read_zones('ms')
    school_table = gpd.read_parquet(work_file('schools.parquet'))
    zones['name'] = zones.school.map(dict(zip(school_table.id, school_table.name)))
    pieces = gpd.overlay(blocks.reset_index(names='block')[['block', 'geometry']], zones[['name', 'geometry']], keep_geom_type=True)
    pieces['area'] = pieces.area
    largest = pieces.sort_values('area').groupby('block').name.last().reindex(range(len(blocks)))
    return np.array([name if isinstance(name, str) else None for name in largest], dtype=object)


def nine_points_inside(shape, random) -> list[Point]:
    """A representative point plus up to eight random points at least 60 ft inside the block."""
    points = [shape.representative_point()]
    interior = shape.buffer(-60)
    west, south, east, north = shape.bounds
    for _ in range(200):
        if len(points) == 9:
            break
        point = Point(random.uniform(west, east), random.uniform(south, north))
        if interior.contains(point):
            points.append(point)
    return points


def nearby_blocks(blocks: gpd.GeoDataFrame, distance_ft: float = 40) -> list[list[int]]:
    """Blocks within `distance_ft` of each block (across a street counts)."""
    index = blocks.sindex
    return [[int(other) for other in index.query(shape, predicate='intersects') if other != block]
            for block, shape in enumerate(blocks.geometry.buffer(distance_ft))]


def read_concept(concept: int, sample_ft, crossings) -> np.ndarray:
    """Raw reading: the filled school of each block, or None."""
    image = f'middle_school_concept{concept}.jpg'
    picture = np.asarray(Image.open(SLIDES_DIR / image).convert('RGB')).astype(float)
    height, width, _ = picture.shape
    georeference = georeference_for(image, crossings)
    swatches = sample_swatches(picture, LEGEND_PIXELS[concept])
    names, colors = list(swatches), np.array(list(swatches.values()))
    readings = []
    for points in sample_ft:
        votes = Counter()
        for x, y in georeference.feet_to_pixels(points):
            if not (8 < x < width - 8 and 8 < y < height - 8):
                continue
            x, y = int(x), int(y)
            color = np.median(picture[y - 3:y + 4, x - 3:x + 4].reshape(-1, 3), axis=0)
            distance = np.sqrt(((colors - color) ** 2).sum(axis=1))
            votes[names[int(distance.argmin())] if distance.min() < MAX_COLOR_DISTANCE else None] += 1
        filled = Counter({name: count for name, count in votes.items() if name})
        enough = filled and sum(filled.values()) >= max(2, 0.4 * sum(votes.values()))
        readings.append(filled.most_common(1)[0][0] if enough else None)
    return np.array(readings, dtype=object)


def tidy(concept: int, raw: np.ndarray, current: np.ndarray, nearby, acres: np.ndarray) -> np.ndarray:
    filled_schools = {name for name in raw if name}
    reading = np.array([raw[block] or current[block] for block in range(len(raw))], dtype=object)

    def cannot_stay(block):
        return raw[block] is None and current[block] is not None and (current[block] in filled_schools or current[block] == CLOSING)

    for _ in range(8):
        changed = False
        for block in range(len(reading)):
            if cannot_stay(block) and reading[block] == current[block]:
                around = Counter(reading[other] for other in nearby[block] if raw[other] or (reading[other] and not cannot_stay(other)))
                around.pop(None, None)
                if around:
                    reading[block] = around.most_common(1)[0][0]
                    changed = True
        if not changed:
            break

    for _ in range(3):
        for block in range(len(reading)):
            if current[block] is None or acres[block] > MAX_SPECK_ACRES:
                continue
            around = Counter(reading[other] for other in nearby[block] if current[other] is not None)
            if around and reading[block] not in around:
                reading[block] = around.most_common(1)[0][0]

    for block in range(len(reading)):
        if current[block] not in (None, CLOSING) and reading[block] != current[block] \
                and (current[block], reading[block]) not in DESCRIBED_MOVES[concept]:
            reading[block] = current[block]
    receivers = INDIAN_TRAIL_RECEIVERS[concept]
    for _ in range(20):
        changed = False
        for block in range(len(reading)):
            if current[block] == CLOSING and reading[block] not in receivers:
                around = Counter(reading[other] for other in nearby[block] if reading[other] in receivers)
                if around:
                    reading[block] = around.most_common(1)[0][0]
                    changed = True
        if not changed:
            break
    return reading


def run() -> None:
    blocks = gpd.read_parquet(work_file('faces.parquet'))[['geometry']]
    current = current_middle_school(blocks)
    random = np.random.default_rng(0)
    sample_ft = [np.array([[point.x, point.y] for point in nine_points_inside(shape, random)]) for shape in blocks.geometry]
    nearby = nearby_blocks(blocks)
    acres = blocks.area.values / 43560
    crossings = road_crossings()
    blocks['current_school'] = current
    committed = gpd.read_parquet(MAP_READINGS_DIR / 'middle_school_blocks.parquet').set_index('face_id')
    in_district = np.array([school is not None for school in current]) & blocks.index.isin(committed.index)
    for concept in LEGEND_PIXELS:
        column = f'concept_{concept}'
        blocks[column] = tidy(concept, read_concept(concept, sample_ft, crossings), current, nearby, acres)
        committed_reading = committed[column].reindex(blocks.index).values
        same = blocks[column].values[in_district] == committed_reading[in_district]
        print(f'  concept {concept}: {same.mean():.1%} of blocks read the same as the committed reading')
    blocks.to_parquet(work_file('middle_school_concepts_reading.parquet'))


if __name__ == '__main__':
    run()
