"""Geometry helpers shared by the pipeline steps."""
import json
from collections import defaultdict

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import mapping

from .settings import COORDINATE_DECIMALS, STATE_PLANE, WGS84, work_file


def district_outline() -> shapely.Geometry:
    """The USD 233 boundary as one shape (state plane feet)."""
    return gpd.read_file(work_file('district.gpkg')).geometry.union_all()


def read_zones(level: str) -> gpd.GeoDataFrame:
    """Today's attendance areas for a level: one row per school, with columns `school` (id like 'es-0123') and `bldg`."""
    return gpd.read_file(work_file(f'zones_{level}.gpkg'))


def polygon_containing_each_point(points: gpd.GeoDataFrame, polygons: gpd.GeoDataFrame) -> pd.Series:
    """For each point, the index of the polygon it falls in (NaN if none). Where polygons overlap, the first match wins."""
    joined = gpd.sjoin(points[['geometry']], polygons[['geometry']], predicate='within')
    joined = joined[~joined.index.duplicated()]
    return joined['index_right'].reindex(points.index)


def round_coordinates(geometry: shapely.Geometry, decimals: int = COORDINATE_DECIMALS) -> shapely.Geometry:
    return shapely.transform(geometry, lambda coordinates: np.round(coordinates, decimals))


def to_app_geometry(geometry: shapely.Geometry, crs=STATE_PLANE) -> dict:
    """A shape as GeoJSON in longitude/latitude, rounded like every other shape the app loads."""
    in_wgs84 = gpd.GeoSeries([geometry], crs=crs).to_crs(WGS84).iloc[0]
    return mapping(round_coordinates(in_wgs84))


def write_geojson(frame: gpd.GeoDataFrame, path) -> None:
    """Write features in longitude/latitude with the app's coordinate precision (no simplification: shared edges must stay
    identical across files so they line up exactly)."""
    frame.to_crs(WGS84).to_file(path, driver='GeoJSON', COORDINATE_PRECISION=COORDINATE_DECIMALS)


def write_compact_json(value, path) -> None:
    with open(path, 'w') as file:
        json.dump(value, file, separators=(',', ':'))


def shared_border_lengths(shapes: gpd.GeoSeries, tolerance_ft: float = 5, min_length_ft: float = 30) -> dict[tuple[int, int], float]:
    """Length of border each pair of neighbouring shapes shares, keyed (i, j) with i < j.

    Shapes cut from the same lines rarely share edges exactly, so each is grown by `tolerance_ft`; the overlap of two grown
    shapes is a thin strip `2 * tolerance_ft` wide, and its area divided by that width is the shared length.
    Pairs sharing less than `min_length_ft` (corner touches) are left out.
    """
    shapes = shapes.reset_index(drop=True)
    grown = shapes.buffer(tolerance_ft)
    spatial_index = shapes.sindex
    lengths = {}
    for i, shape in enumerate(grown):
        for j in spatial_index.query(shape):
            if j <= i:
                continue
            length = shape.intersection(grown[j]).area / (2 * tolerance_ft)
            if length > min_length_ft:
                lengths[(i, int(j))] = length
    return lengths


def neighbours_from_borders(border_lengths: dict[tuple[int, int], float], count: int) -> list[dict[int, float]]:
    """Turn pairwise border lengths into a list: for shape i, {neighbour j: shared length}."""
    neighbours = [dict() for _ in range(count)]
    for (i, j), length in border_lengths.items():
        neighbours[i][j] = length
        neighbours[j][i] = length
    return neighbours


def connected_groups(members: set[int], neighbours: list[dict[int, float]] | list[set[int]]) -> list[list[int]]:
    """Split a set of shapes into groups that touch each other (depth-first search over neighbours)."""
    unvisited = set(members)
    groups = []
    while unvisited:
        start = unvisited.pop()
        group, stack = [start], [start]
        while stack:
            current = stack.pop()
            for neighbour in neighbours[current]:
                if neighbour in unvisited:
                    unvisited.remove(neighbour)
                    group.append(neighbour)
                    stack.append(neighbour)
        groups.append(group)
    return groups


def group_by_value(values) -> dict:
    """{value: [positions holding it]} for a list-like of values."""
    positions = defaultdict(list)
    for position, value in enumerate(values):
        positions[value].append(position)
    return dict(positions)
