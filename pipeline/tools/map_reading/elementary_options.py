"""Read the district's four elementary options off its deck maps (Nov 2026 elementary boundary presentation).

Each option has two map frames (northeast and southeast), clean GIS exports with one fill color per receiving school.
For every street block of the 18 affected schools, sample points inside it are looked up in both frames; each point votes for
the legend color filling its 21x21-pixel window (if one covers at least 30% of it). The block takes the color with the most
votes. Then:
  * blocks the maps don't show clearly take their neighbours' reading (`settle_weak_blocks`),
  * blocks still unread take the reading of neighbours from the same school; open schools otherwise keep their own blocks,
  * moves between open schools adding up to fewer than 10 students are dropped (stray edge readings),
  * islands under 40 acres that don't hold their school's building join the school around them.

Writes work/elementary_options_reading.parquet and compares it with data/map_readings/elementary_blocks.parquet.
"""
import json

import geopandas as gpd
import numpy as np
from PIL import Image
from shapely.geometry import Point

from boundary_lab.geo import connected_groups, polygon_containing_each_point
from boundary_lab.settings import FIRST_PLAN_YEAR, MAP_READINGS_DIR, work_file
from .blocks import block_neighbours, sample_points, street_blocks_of
from .colors import Legend
from .georeference import SLIDES_DIR, georeference_for
from .intersections import road_crossings

OPEN_SCHOOLS = ['Arbor Creek', 'Bentwood', 'Briarwood', 'Brougham', 'Countryside', 'Green Springs', 'Havencroft', 'Heatherstone',
                'Indian Creek', 'Madison Place', 'Pleasant Ridge', 'Regency Place', 'Sunnyside']
CLOSING_SCHOOLS = ['Black Bob', 'Heritage', 'Scarborough', 'Tomahawk', 'Walnut Grove']
# Legend swatches (identical on every page of the deck)
LEGEND = Legend({
    'Arbor Creek': (255, 127, 126), 'Bentwood': (0, 133, 168), 'Briarwood': (255, 212, 128), 'Brougham': (249, 254, 196),
    'Countryside': (223, 114, 255), 'Green Springs': (77, 230, 0), 'Havencroft': (182, 254, 251), 'Heatherstone': (254, 230, 182),
    'Indian Creek': (163, 255, 116), 'Madison Place': (204, 204, 204), 'Pleasant Ridge': (253, 217, 242),
    'Regency Place': (254, 255, 179), 'Sunnyside': (219, 195, 255)})
# Where each school's blocks may go in any option, from the deck's "Summary of Changes" slides (open schools may also stay)
POSSIBLE_RECEIVERS = {
    'Black Bob': {'Brougham', 'Briarwood', 'Green Springs'}, 'Heritage': {'Madison Place', 'Brougham', 'Havencroft', 'Sunnyside'},
    'Scarborough': {'Sunnyside', 'Madison Place'}, 'Tomahawk': {'Briarwood', 'Havencroft', 'Indian Creek', 'Regency Place'},
    'Walnut Grove': {'Heatherstone', 'Pleasant Ridge', 'Countryside'}, 'Pleasant Ridge': {'Bentwood'},
    'Briarwood': {'Regency Place', 'Green Springs'}, 'Green Springs': {'Brougham', 'Briarwood', 'Regency Place'},
    'Regency Place': {'Bentwood'}, 'Indian Creek': {'Countryside'}, 'Brougham': {'Arbor Creek'}}
MAP_FRAME = (75, 75, 2545, 2395)    # the map inside each page picture: left, top, right, bottom (pixels)
WINDOW_RADIUS = 10                  # pixels around a sample point
MAX_COLOR_DISTANCE = 20             # in weighted Lab
MIN_FILL_SHARE = 0.3                # a fill must cover this much of the window to vote
BUILDING_MARKER_RADIUS = 62         # pixels: school symbols and labels are drawn here, so no sampling
MIN_OPEN_SCHOOL_MOVE = 10           # students: smaller open -> open moves are stray readings
MAX_ISLAND_ACRES = 40


def allowed_schools(blocks: gpd.GeoDataFrame, buildings: dict[str, tuple[float, float]]) -> list[set[str]]:
    """The schools each block may read as. Brougham and Regency Place have nearly the same legend color, so where both are
    possible, keep the one whose building is nearer."""
    allowed = [POSSIBLE_RECEIVERS.get(name, set()) | ({name} if name in OPEN_SCHOOLS else set()) for name in blocks.current_school]
    centres = blocks.geometry.centroid
    for block, options in enumerate(allowed):
        if {'Brougham', 'Regency Place'} <= options:
            to_brougham = np.hypot(*(np.array([centres.iloc[block].x, centres.iloc[block].y]) - buildings['Brougham']))
            to_regency = np.hypot(*(np.array([centres.iloc[block].x, centres.iloc[block].y]) - buildings['Regency Place']))
            allowed[block] = options - ({'Regency Place'} if to_brougham < to_regency else {'Brougham'})
    return allowed


def votes_in_frame(picture: np.ndarray, georeference, points_ft: np.ndarray, marker_pixels: np.ndarray, allowed: np.ndarray):
    """(votes per legend color, number of usable sample points) for one block in one map frame."""
    votes, usable = np.zeros(len(LEGEND.names)), 0
    left, top, right, bottom = MAP_FRAME
    for x, y in georeference.feet_to_pixels(points_ft):
        if not (left < x < right and top < y < bottom) or np.hypot(*(marker_pixels - (x, y)).T).min() < BUILDING_MARKER_RADIUS:
            continue
        x, y = int(round(x)), int(round(y))
        window = picture[y - WINDOW_RADIUS:y + WINDOW_RADIUS + 1, x - WINDOW_RADIUS:x + WINDOW_RADIUS + 1]
        fill = LEGEND.dominant_fill(window, allowed, MAX_COLOR_DISTANCE, MIN_FILL_SHARE)
        usable += 1
        if fill is not None:
            votes[fill] += 1
    return votes, usable


def read_option(option: int, blocks, sample_ft, allowed, building_points_ft, crossings) -> tuple[list, list]:
    """Raw reading for one option: (school or None, share of votes) per block."""
    frames = []
    for frame in ('ne', 'se'):
        image = f'elementary_option{option}_{frame}.jpg'
        picture = np.asarray(Image.open(SLIDES_DIR / image).convert('RGB')).astype(float)
        georeference = georeference_for(image, crossings)
        frames.append((picture, georeference, georeference.feet_to_pixels(building_points_ft)))
    readings, confidence = [], []
    for block in range(len(blocks)):
        mask = np.array([name in allowed[block] for name in LEGEND.names])
        votes, usable = np.zeros(len(LEGEND.names)), 0
        for picture, georeference, markers in frames:
            frame_votes, frame_usable = votes_in_frame(picture, georeference, sample_ft[block], markers, mask)
            votes += frame_votes
            usable += frame_usable
        if usable == 0 or votes.sum() < 0.25 * usable:
            readings.append(None); confidence.append(0.0)
            continue
        best = int(votes.argmax())
        readings.append(LEGEND.names[best]); confidence.append(votes[best] / votes.sum())
    return readings, confidence


def settle_weak_blocks(readings, confidence, neighbours, acres, rounds: int = 4):
    """Unread or uncertain blocks (under 55% agreement) take the reading most of their border agrees on (60%+); a small block
    (under 25 acres) whose reading none of its neighbours share takes theirs if 75% of its border agrees."""
    readings = list(readings)
    for _ in range(rounds):
        updated = readings[:]
        for block in range(len(readings)):
            border_by_reading = {}
            for neighbour, length in neighbours[block].items():
                if readings[neighbour] is not None:
                    border_by_reading[readings[neighbour]] = border_by_reading.get(readings[neighbour], 0) + length
            if not border_by_reading:
                continue
            leading = max(border_by_reading, key=border_by_reading.get)
            leading_share = border_by_reading[leading] / sum(border_by_reading.values())
            weak = readings[block] is None or confidence[block] < 0.55
            island = readings[block] not in border_by_reading and leading_share >= 0.75 and acres[block] < 25
            if (weak and leading_share >= 0.6) or island:
                updated[block] = leading
        readings = updated
    return readings


def fill_unread(readings, blocks, neighbours, allowed):
    """Still-unread blocks: first from neighbours of the same school, then open schools keep their own, then closing-school
    blocks take any allowed neighbour's reading."""
    readings = list(readings)
    current = list(blocks.current_school)

    def spread(rounds, accept):
        for _ in range(rounds):
            changed = False
            for block in range(len(readings)):
                if readings[block] is not None:
                    continue
                border = {}
                for neighbour, length in neighbours[block].items():
                    if readings[neighbour] is not None and accept(block, neighbour):
                        border[readings[neighbour]] = border.get(readings[neighbour], 0) + length
                if border:
                    readings[block] = max(border, key=border.get)
                    changed = True
            if not changed:
                break

    spread(30, lambda block, neighbour: current[neighbour] == current[block])
    for block in range(len(readings)):
        if readings[block] is None and current[block] in OPEN_SCHOOLS:
            readings[block] = current[block]
    spread(20, lambda block, neighbour: readings[neighbour] in allowed[block])
    return [reading if reading is not None else sorted(allowed[block])[0] for block, reading in enumerate(readings)]


def drop_small_open_school_moves(readings, blocks, students):
    readings = list(readings)
    moves = {}
    for block, (current, reading) in enumerate(zip(blocks.current_school, readings)):
        if current in OPEN_SCHOOLS and reading != current:
            moves.setdefault((current, reading), []).append(block)
    for (current, _), moved_blocks in moves.items():
        if students[moved_blocks].sum() < MIN_OPEN_SCHOOL_MOVE:
            for block in moved_blocks:
                readings[block] = current
    return readings


def merge_islands(readings, blocks, neighbours, buildings: dict[str, tuple[float, float]], rounds: int = 3):
    """Parts of a school's new area that don't hold its building and are under MAX_ISLAND_ACRES join the school they share
    the most border with."""
    readings = list(readings)
    for _ in range(rounds):
        for school in OPEN_SCHOOLS:
            groups = connected_groups({block for block, reading in enumerate(readings) if reading == school}, neighbours)
            if len(groups) < 2:
                continue
            building = Point(*buildings[school])
            for group in groups:
                acres = sum(blocks.geometry.iloc[block].area for block in group) / 43560
                holds_building = any(blocks.geometry.iloc[block].distance(building) < 300 for block in group)
                if holds_building or acres >= MAX_ISLAND_ACRES:
                    continue
                border = {}
                for block in group:
                    for neighbour, length in neighbours[block].items():
                        if neighbour not in group:
                            border[readings[neighbour]] = border.get(readings[neighbour], 0) + length
                if border:
                    surrounding = max(border, key=border.get)
                    for block in group:
                        readings[block] = surrounding
    return readings


def run() -> None:
    blocks = street_blocks_of(OPEN_SCHOOLS + CLOSING_SCHOOLS)
    school_table = gpd.read_parquet(work_file('schools.parquet'))
    elementary = school_table[school_table.level == 'es'].set_index('name')
    buildings = {name: (elementary.geometry[name].x, elementary.geometry[name].y) for name in OPEN_SCHOOLS + CLOSING_SCHOOLS}
    building_points_ft = np.array(list(buildings.values()))
    neighbours = block_neighbours(blocks)
    allowed = allowed_schools(blocks, buildings)
    sample_ft = [np.array([[point.x, point.y] for point in sample_points(shape)]) for shape in blocks.geometry]
    students = model_students(blocks)
    crossings = road_crossings()

    for option in (1, 2, 3, 4):
        readings, confidence = read_option(option, blocks, sample_ft, allowed, building_points_ft, crossings)
        unread = sum(reading is None for reading in readings)
        readings = settle_weak_blocks(readings, confidence, neighbours, blocks.area.values / 43560)
        readings = fill_unread(readings, blocks, neighbours, allowed)
        readings = drop_small_open_school_moves(readings, blocks, students)
        blocks[f'option_{option}'] = merge_islands(readings, blocks, neighbours, buildings)
        print(f'  option {option}: {unread} blocks unread before tidying')
    blocks.to_parquet(work_file('elementary_options_reading.parquet'))
    compare_with_committed(blocks, students)


def model_students(blocks: gpd.GeoDataFrame) -> np.ndarray:
    homes = gpd.read_parquet(work_file('homes_assigned.parquet'))
    factors = json.load(open(work_file('school_factors.json')))
    per_home = homes.w_es.values * np.array([factors[school]['factor'][FIRST_PLAN_YEAR] for school in homes.orig_es])
    block_of_home = polygon_containing_each_point(homes, blocks)
    inside = block_of_home.notna()
    return np.bincount(block_of_home[inside].astype(int).values, weights=per_home[inside.values], minlength=len(blocks))


def compare_with_committed(blocks: gpd.GeoDataFrame, students: np.ndarray) -> None:
    """Share of students whose block reads the same as the committed reading, by option (blocks matched by location), and
    each difference as 'school today: this reading vs committed (students)'."""
    committed = gpd.read_parquet(MAP_READINGS_DIR / 'elementary_blocks.parquet')
    block_points = gpd.GeoDataFrame(geometry=blocks.geometry.representative_point(), crs=blocks.crs)
    committed_row = polygon_containing_each_point(block_points, committed)
    for option in (1, 2, 3, 4):
        column = f'option_{option}'
        committed_reading = committed_row.map(committed[column]).values
        same = blocks[column].values == committed_reading
        differences = {}
        for block in np.flatnonzero(~same):
            key = (blocks.current_school.iloc[block], blocks[column].iloc[block], committed_reading[block])
            differences[key] = differences.get(key, 0) + students[block]
        listed = [f'{today}: {new} vs {old} ({count:.0f})' for (today, new, old), count in differences.items() if count >= 1]
        print(f'  option {option}: {students[same].sum() / students.sum():.1%} of students read the same as the committed '
              f'reading. Differences: {", ".join(listed) or "none"}')


if __name__ == '__main__':
    run()
