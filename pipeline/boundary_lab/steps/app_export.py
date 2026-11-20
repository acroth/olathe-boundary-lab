"""Step 5 - App export: the compact files the web app loads from public/data.

Reads   work/schools.parquet, work/school_factors.json, work/zones_*.gpkg, work/district.gpkg, work/faces.parquet,
        work/homes_assigned.parquet, work/street_nodes.parquet, work/street_edges.parquet
Writes  schools.json            schools (array index = the school's number everywhere in the app) and `meta`
        zones_{es,ms,hs}.geojson  today's attendance areas
        district.geojson, faces.geojson (street blocks)
        homes.bin, streets.bin  column-packed binary arrays; their layout (name, type, byte offset, length) is in meta

The binary files are plain typed arrays laid end to end, each starting on a 4-byte boundary, so the browser can view them
directly with Float32Array / Uint32Array etc. without parsing.
"""
import json
import os

import geopandas as gpd
import numpy as np
from scipy.spatial import cKDTree

from ..geo import read_zones, write_geojson
from ..settings import FIRST_PLAN_YEAR, SCHOOL_YEARS, WGS84, app_file, work_file
from .streets import ROAD_CLASSES

MAX_COLORS = 10
SOURCES = dict(
    utilization='Demographic Analytics Advisors, Enrollment Forecasting, Capacity and Utilization Analysis (July 2026), pp. 13-16',
    enrollment='KSDE 2025-26 headcount by building and grade', prek='NCES CCD 2024-25',
    boundaries='Johnson County AIMS School.gdb (current attendance areas; Westview merged into Rolling Ridge)',
    homes='2020 Census blocks (housing units, DHC P12 ages) + Overture building footprints for post-2020 homes',
    streets='Overture Maps transportation (OpenStreetMap), Nov 2026', basemap='Protomaps (OpenStreetMap)')


def school_records(schools: gpd.GeoDataFrame, factors: dict, nearest_node: cKDTree) -> list[dict]:
    in_wgs84 = schools.to_crs(WGS84)
    records = []
    for i, school in schools.iterrows():
        grades = {grade: count for grade, count in school.grades.items() if count is not None}
        grade_total = sum(grades.values()) or 1
        _, node = nearest_node.query([school.geometry.x, school.geometry.y])
        model = factors[school.id]
        records.append(dict(
            i=i, id=school.id, name=school['name'], level=school.level, code=school.code,
            lon=round(in_wgs84.geometry[i].x, 6), lat=round(in_wgs84.geometry[i].y, 6), node=int(node), address=school.address,
            capacity=float(school.capacity), capSource=school.capSource, util=[int(value) for value in school.util],
            fixed=model['fixed'], neighborhood=model['neighborhood'], factor=model['factor'],
            gradeShare={grade: round(count / grade_total, 4) for grade, count in grades.items()},
            enroll2025=school.enroll2025, prek=school.prek, immersion=int(school.immersion)))
    return records


def neighbouring_areas(zones: gpd.GeoDataFrame, school_id: str):
    """Schools whose areas come within 300 ft of this school's area (itself included)."""
    return zones[zones.geometry.intersects(zones.loc[school_id].geometry.buffer(300))].index


def assign_map_colors() -> dict[str, int]:
    """Greedy map coloring per level: neighbouring areas never share a color, and colors are used about equally.
    Schools with the most neighbours are colored first."""
    colors = {}
    for level in ('es', 'ms', 'hs'):
        zones = read_zones(level).set_index('school')
        neighbour_count = {school: zones.loc[school].geometry.buffer(300).intersects(zones.geometry).sum() for school in zones.index}
        for school in sorted(zones.index, key=lambda school: -neighbour_count[school]):
            used_by_neighbours = {colors.get(other) for other in neighbouring_areas(zones, school)}
            times_used = {color: sum(1 for value in colors.values() if value == color) for color in range(MAX_COLORS)}
            colors[school] = min((color for color in range(MAX_COLORS) if color not in used_by_neighbours),
                                 key=lambda color: (times_used[color], color))
    return colors


def high_school_area_names(schools: gpd.GeoDataFrame) -> list[str]:
    """For each school, the high school attendance area it sits in ('South', 'Northwest', ...): the app shows one part of
    the district at a time by this."""
    high_school_zones = read_zones('hs')
    name_of = dict(zip(schools.id, schools['name']))
    areas = []
    for location in schools.geometry:
        containing = high_school_zones[high_school_zones.contains(location)]
        if not len(containing):
            containing = high_school_zones.iloc[[high_school_zones.distance(location).argmin()]]
        areas.append(name_of[containing.iloc[0].school].replace('Olathe ', ''))
    return areas


def write_packed_columns(path, columns: list[tuple[str, type, object]]) -> list[dict]:
    """Write (name, numpy type, values) columns end to end, each aligned to 4 bytes. Returns the layout for meta."""
    buffer = b''
    layout = []
    for name, dtype, values in columns:
        array = np.asarray(values, dtype=dtype)
        buffer += b'\0' * ((-len(buffer)) % 4)
        layout.append(dict(name=name, type=np.dtype(dtype).name, offset=len(buffer), length=len(array)))
        buffer += array.tobytes()
    open(path, 'wb').write(buffer)
    print(f'  {os.path.basename(path)}: {len(buffer) / 1e6:.2f} MB')
    return layout


def export_homes(school_number: dict[str, int], nearest_node: cKDTree) -> tuple[list[dict], int]:
    homes = gpd.read_parquet(work_file('homes_assigned.parquet'))
    in_wgs84 = homes.to_crs(WGS84)
    feet_to_node, node = nearest_node.query(np.c_[homes.geometry.x, homes.geometry.y])
    layout = write_packed_columns(app_file('homes.bin'), [
        ('lon', np.float32, in_wgs84.geometry.x), ('lat', np.float32, in_wgs84.geometry.y),
        ('w_es', np.float32, homes.w_es), ('w_ms', np.float32, homes.w_ms), ('w_hs', np.float32, homes.w_hs),
        ('units', np.float32, homes.u), ('node', np.uint32, node), ('offset_ft', np.float32, feet_to_node),
        ('orig_es', np.uint8, homes.orig_es.map(school_number)), ('orig_ms', np.uint8, homes.orig_ms.map(school_number)),
        ('orig_hs', np.uint8, homes.orig_hs.map(school_number)), ('isNew', np.uint8, (homes.new > 0).astype(int)),
    ])
    return layout, len(homes)


def export_streets(nodes: gpd.GeoDataFrame) -> tuple[list[dict], int, list[str]]:
    edges = gpd.read_parquet(work_file('street_edges.parquet'))
    street_names = sorted(set(edges.name.dropna()))
    name_number = {name: number + 1 for number, name in enumerate(street_names)}   # 0 = unnamed
    coordinates, offsets = [], [0]
    for line in edges.to_crs(WGS84).geometry:
        points = np.asarray(line.coords)[:, :2]
        coordinates.append(points)
        offsets.append(offsets[-1] + len(points))
    coordinates = np.vstack(coordinates)
    nodes_wgs84 = nodes.to_crs(WGS84)
    layout = write_packed_columns(app_file('streets.bin'), [
        ('node_lon', np.float32, nodes_wgs84.geometry.x), ('node_lat', np.float32, nodes_wgs84.geometry.y),
        ('u', np.uint32, edges.u), ('v', np.uint32, edges.v), ('len_ft', np.float32, edges.len_ft), ('cls', np.uint8, edges.cls),
        ('name', np.uint16, edges.name.map(name_number).fillna(0)), ('coord_off', np.uint32, offsets),
        ('coord_lon', np.float32, coordinates[:, 0]), ('coord_lat', np.float32, coordinates[:, 1]),
    ])
    return layout, len(edges), street_names


def run() -> None:
    schools = gpd.read_parquet(work_file('schools.parquet')).sort_values(['level', 'name']).reset_index(drop=True)
    factors = json.load(open(work_file('school_factors.json')))
    nodes = gpd.read_parquet(work_file('street_nodes.parquet'))
    nearest_node = cKDTree(np.c_[nodes.x, nodes.y])
    school_number = {school_id: number for number, school_id in enumerate(schools.id)}

    records = school_records(schools, factors, nearest_node)
    colors = assign_map_colors()
    for record, area in zip(records, high_school_area_names(schools)):
        record['color'] = colors.get(record['id'], 0)
        record['area'] = area
    for level in ('es', 'ms', 'hs'):
        zones = read_zones(level).set_index('school')
        for school_id in zones.index:
            records[school_number[school_id]]['neighbors'] = sorted(
                school_number[other] for other in neighbouring_areas(zones, school_id) if other != school_id)
    print(f'  {max(colors.values()) + 1} map colors')

    for level in ('es', 'ms', 'hs'):
        zones = read_zones(level)
        zones['school'] = zones.school.map(school_number)
        write_geojson(zones[['school', 'geometry']], app_file(f'zones_{level}.geojson'))
    write_geojson(gpd.read_file(work_file('district.gpkg')), app_file('district.geojson'))
    blocks = gpd.read_parquet(work_file('faces.parquet'))
    blocks['id'] = np.arange(len(blocks))
    write_geojson(blocks[['id', 'geometry']], app_file('faces.geojson'))

    homes_layout, home_count = export_homes(school_number, nearest_node)
    streets_layout, edge_count, street_names = export_streets(nodes)
    meta = dict(
        # classSize: the district's staffing guidelines ("2026 <school> Grade Breakdown" in each Nov 2026 parent-meeting deck)
        years=SCHOOL_YEARS, firstPlanYear=FIRST_PLAN_YEAR, classSize={'K': 24, '1': 24, '2': 24, '3': 26, '4': 28, '5': 28},
        streetClasses=ROAD_CLASSES, streetNames=street_names,
        homes=dict(count=home_count, layout=homes_layout), streets=dict(nodes=len(nodes), edges=edge_count, layout=streets_layout),
        busMiles=2.5, target=0.85, sources=SOURCES)
    json.dump(dict(meta=meta, schools=records), open(app_file('schools.json'), 'w'), separators=(',', ':'))
    print(f'  schools.json: {os.path.getsize(app_file("schools.json")) / 1e3:.0f} KB')
