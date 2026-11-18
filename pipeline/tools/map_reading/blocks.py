"""The pieces a map is read for: street blocks, split where they cross a school line, and points inside each to sample."""
import geopandas as gpd
import numpy as np
from shapely.geometry import Point

from boundary_lab.geo import neighbours_from_borders, read_zones, shared_border_lengths
from boundary_lab.settings import work_file


def street_blocks_of(school_names: list[str], level: str = 'es', min_square_feet: float = 400) -> gpd.GeoDataFrame:
    """Street blocks clipped to the named schools' current areas: columns current_school, geometry."""
    zones = read_zones(level)
    school_table = gpd.read_parquet(work_file('schools.parquet'))
    zones['current_school'] = zones.school.map(dict(zip(school_table.id, school_table.name)))
    zones = zones[zones.current_school.isin(school_names)]
    street_blocks = gpd.read_parquet(work_file('faces.parquet'))[['geometry']]
    pieces = gpd.overlay(street_blocks, zones[['current_school', 'geometry']], keep_geom_type=True).explode(index_parts=False)
    pieces = pieces.reset_index(drop=True)
    return pieces[pieces.area > min_square_feet].reset_index(drop=True)


def sample_points(shape, spacing_ft: float = 90, max_points: int = 40) -> list[Point]:
    """Grid points inside a block, kept back from its edges (where lines and labels are drawn)."""
    for inset in (-70, -35, -10):
        interior = shape.buffer(inset)
        if not interior.is_empty and interior.area > 500:
            break
    else:
        return [shape.representative_point()]
    west, south, east, north = interior.bounds
    grid = [Point(x, y) for x in np.arange(west + spacing_ft / 2, east, spacing_ft) for y in np.arange(south + spacing_ft / 2, north, spacing_ft)]
    inside = [point for point in grid if interior.contains(point)] or [interior.representative_point()]
    if len(inside) > max_points:
        inside = [inside[k] for k in np.random.default_rng(0).choice(len(inside), max_points, replace=False)]
    return inside


def block_neighbours(blocks: gpd.GeoDataFrame) -> list[dict[int, float]]:
    """{neighbouring block: shared border in feet} for each block (corner touches left out)."""
    return neighbours_from_borders(shared_border_lengths(blocks.geometry, tolerance_ft=6, min_length_ft=25), len(blocks))
