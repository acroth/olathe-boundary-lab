"""Chunks: the pieces the solver hands out.

A school's area is cut only along lines a district would use as a boundary - arterial and collector roads, named creeks,
railroads, the district's planning-area lines and today's school lines - so any plan built from chunks follows those lines
instead of weaving between individual blocks.

Pieces holding almost no students (commercial land, parks, road corridors, slivers where two nearly identical lines meet) are
folded into the neighbouring piece of the same school they share the most border with, so they go wherever their
surroundings go.
"""
import json
from dataclasses import dataclass

import geopandas as gpd
import numpy as np
from shapely.ops import polygonize, unary_union

from ..geo import district_outline, neighbours_from_borders, polygon_containing_each_point, read_zones, shared_border_lengths
from ..settings import DATA_DIR, FIRST_PLAN_YEAR, RAW_DIR, STATE_PLANE, work_file

BUSIEST_CUTTING_ROAD_CLASS = 4      # rank in steps.streets.ROAD_CLASSES: motorway .. tertiary (collectors such as Lindenwood)
MIN_STUDENTS_PER_CHUNK = 3.0        # in the first plan year; smaller pieces are folded into a neighbour
MIN_BORDER_FT = 30                  # shorter shared edges are corner touches, not real neighbours


@dataclass
class Chunks:
    shapes: gpd.GeoDataFrame            # one row per chunk: current_school (name), geometry (state plane feet)
    students: np.ndarray                # [chunk, year] projected elementary students living in the chunk
    homes: list[np.ndarray]             # [chunk] -> row numbers in homes_assigned.parquet
    neighbours: list[dict[int, float]]  # [chunk] -> {neighbouring chunk: shared border in feet}

    def __len__(self) -> int:
        return len(self.shapes)

    def of_school(self, name: str) -> np.ndarray:
        return np.where(self.shapes.current_school == name)[0]


def cutting_lines(district_shape):
    """Every line a chunk edge may follow, merged into one shape."""
    edges = gpd.read_parquet(work_file('street_edges.parquet'))
    major_roads = edges[edges.cls <= BUSIEST_CUTTING_ROAD_CLASS].geometry

    creeks = gpd.read_file(f'zip://{RAW_DIR}/tl_2026_20091_linearwater.zip').to_crs(STATE_PLANE)
    named_creeks = creeks[creeks.FULLNAME.notna() & creeks.intersects(district_shape)].geometry

    district_box = tuple(gpd.GeoSeries([district_shape], crs=STATE_PLANE).to_crs(4269).total_bounds)
    railroads = gpd.read_file(f'zip://{RAW_DIR}/tl_2026_us_rails.zip', bbox=district_box).to_crs(STATE_PLANE).geometry

    planning_areas = gpd.read_file(DATA_DIR / 'planning_areas_2026.gpkg').to_crs(STATE_PLANE).boundary
    school_lines = read_zones('es').boundary
    return unary_union(list(major_roads) + list(named_creeks) + list(railroads) + list(planning_areas)
                       + list(school_lines) + [district_shape.boundary])


def student_counts(homes: gpd.GeoDataFrame, shapes: gpd.GeoDataFrame, factors: dict) -> tuple[np.ndarray, list[np.ndarray]]:
    """Projected elementary students in each shape by year, and the homes in each shape."""
    shape_of_home = polygon_containing_each_point(homes, shapes)
    students_per_home = homes.w_es.values[:, None] * np.array([factors[school]['factor'] for school in homes.orig_es])
    students = np.zeros((len(shapes), students_per_home.shape[1]))
    homes_in_shape = [[] for _ in range(len(shapes))]
    for home, shape in enumerate(shape_of_home.values):
        if not np.isnan(shape):
            students[int(shape)] += students_per_home[home]
            homes_in_shape[int(shape)].append(home)
    return students, [np.array(rows, dtype=int) for rows in homes_in_shape]


def fold_small_pieces(pieces: gpd.GeoDataFrame, students: np.ndarray) -> np.ndarray:
    """Group number for each piece: pieces with fewer than MIN_STUDENTS_PER_CHUNK students join the neighbouring group of the
    same school they share the most border with. Smallest pieces are folded first."""
    # Any touch counts here, so slivers left where two nearly identical lines meet are folded in too
    neighbours = neighbours_from_borders(shared_border_lengths(pieces.geometry, min_length_ft=0), len(pieces))
    school = pieces.current_school.values
    group = np.arange(len(pieces))
    group_students = students[:, FIRST_PLAN_YEAR].copy()

    def borders_with_other_groups(members: np.ndarray) -> dict[int, float]:
        borders = {}
        for piece in members:
            for other, length in neighbours[piece].items():
                if group[other] != group[piece] and school[other] == school[piece]:
                    borders[group[other]] = borders.get(group[other], 0.0) + length
        return borders

    changed = True
    while changed:
        changed = False
        for current in sorted(set(group), key=lambda g: group_students[g]):
            if group_students[current] >= MIN_STUDENTS_PER_CHUNK:
                break
            members = np.where(group == current)[0]
            borders = borders_with_other_groups(members)
            if not borders:
                continue
            target = max(borders, key=borders.get)
            group[members] = target
            group_students[target] += group_students[current]
            group_students[current] = np.inf      # this group no longer exists
            changed = True
            break                                 # group sizes changed: sort again
    return group


def build_chunks(school_names: list[str]) -> Chunks:
    """Cut the named schools' current elementary areas into chunks."""
    district_shape = district_outline()
    zones = read_zones('es')
    school_table = gpd.read_parquet(work_file('schools.parquet'))
    zones['current_school'] = zones.school.map(dict(zip(school_table.id, school_table.name)))
    areas = zones[zones.current_school.isin(school_names)][['current_school', 'geometry']]

    cells = gpd.GeoDataFrame(geometry=list(polygonize(cutting_lines(district_shape))), crs=STATE_PLANE)
    pieces = gpd.overlay(cells, areas, keep_geom_type=True).explode(index_parts=False).reset_index(drop=True)
    pieces = pieces[pieces.area > 1].reset_index(drop=True)

    homes = gpd.read_parquet(work_file('homes_assigned.parquet'))
    factors = json.load(open(work_file('school_factors.json')))
    piece_students, _ = student_counts(homes, pieces, factors)
    pieces['group'] = fold_small_pieces(pieces, piece_students)

    shapes = pieces.dissolve(['group', 'current_school']).reset_index()[['current_school', 'geometry']]
    shapes = shapes.sort_values('current_school', kind='stable').reset_index(drop=True)
    students, homes_in_chunk = student_counts(homes, shapes, factors)
    neighbours = neighbours_from_borders(shared_border_lengths(shapes.geometry, min_length_ft=MIN_BORDER_FT), len(shapes))
    return Chunks(shapes=shapes, students=students, homes=homes_in_chunk, neighbours=neighbours)
