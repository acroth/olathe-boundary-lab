"""Step 6 - Planning areas: the district's numbered neighborhoods (610, 750, ...) and the students living in each.

Reads   data/planning_areas_2026.gpkg (traced from the district's 2026 boundary PDF), work/homes_assigned.parquet,
        work/school_factors.json
Writes  planning_areas.geojson  one feature per area: pa (number), school (elementary area it sits in), units,
        es / ms / hs (students living there by year, whichever school a plan sends them to), lon / lat (label point)
"""
import json

import geopandas as gpd
import numpy as np

from ..geo import district_outline, polygon_containing_each_point, round_coordinates, write_compact_json
from ..settings import DATA_DIR, SCHOOL_YEARS, STATE_PLANE, WGS84, app_file, work_file


def students_by_year(homes: gpd.GeoDataFrame, level: str, factors: dict) -> list[float]:
    """Projected students living in these homes, by year: weight x the original school's factor, summed."""
    if not len(homes):
        return [0.0] * len(SCHOOL_YEARS)
    factor_by_home = np.array([factors[school]['factor'] for school in homes[f'orig_{level}']])
    return [round(float(value), 1) for value in (homes[f'w_{level}'].values[:, None] * factor_by_home).sum(axis=0)]


def run() -> None:
    areas = gpd.read_file(DATA_DIR / 'planning_areas_2026.gpkg').to_crs(STATE_PLANE)
    areas['geometry'] = areas.geometry.intersection(district_outline())
    areas = areas[~areas.geometry.is_empty].reset_index(drop=True)
    homes = gpd.read_parquet(work_file('homes_assigned.parquet'))
    factors = json.load(open(work_file('school_factors.json')))
    homes['planning_area'] = polygon_containing_each_point(homes, areas)

    rows = []
    for number, area in areas.iterrows():
        homes_in_area = homes[homes.planning_area == number]
        row = dict(pa=int(area.pa), school=area.school, units=round(float(homes_in_area.u.sum())))
        for level in ('es', 'ms', 'hs'):
            row[level] = students_by_year(homes_in_area, level, factors)
        label_point = gpd.GeoSeries([area.geometry.representative_point()], crs=STATE_PLANE).to_crs(WGS84).iloc[0]
        row['lon'], row['lat'] = round(label_point.x, 6), round(label_point.y, 6)
        rows.append(row)

    features = gpd.GeoDataFrame(rows, geometry=areas.geometry.values, crs=STATE_PLANE).to_crs(WGS84)
    features['geometry'] = features.geometry.apply(round_coordinates)
    write_compact_json(json.loads(features.to_json()), app_file('planning_areas.geojson'))
    print(f'  {len(features)} planning areas')
