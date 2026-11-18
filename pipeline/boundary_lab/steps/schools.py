"""Step 1 - Schools: locations, today's attendance areas, enrollment, capacity and projected utilization.

Reads
  raw/School.gdb                         Johnson County AIMS: district boundary, school points, attendance areas
  data/ksde_2025_26_by_school_grade.csv  KSDE 2025-26 headcount by building and grade
  data/util_{es,ms,hs}.csv               DAA utilization projections by school, 2025-26..2034-35 (DAA report pp. 13-16)
  data/published_capacities.csv          capacities from Facility Alignment Meeting 3
  data/nces_prek_2024_25.csv             NCES Pre-K headcount by building
Writes
  work/district.gpkg, work/schools.parquet, work/zones_{es,ms,hs}.gpkg

Capacity, in order of preference: the district's Nov 2026 functional capacity (elementary), a capacity the district published
earlier, or 2025-26 enrollment divided by 2025-26 utilization.
"""
import re

import geopandas as gpd
import pandas as pd

from .. import district
from ..settings import DATA_DIR, GRADES_BY_LEVEL, RAW_DIR, SCHOOL_YEARS, STATE_PLANE, work_file

AIMS_DATABASE = RAW_DIR / 'School.gdb'
SCHOOL_TYPE_TO_LEVEL = {'Elementary': 'es', 'Middle': 'ms', 'High': 'hs'}
ATTENDANCE_AREA_LAYERS = {  # level: (layer in School.gdb, column holding the school name)
    'es': ('SCHOOLATTENDBNDELEM_PL', 'Elem_Name'),
    'ms': ('SCHOOLATTENDBNDMID_PL', 'Mid_Name'),
    'hs': ('SCHOOLATTENDBNDHIGH_PL', 'High_Name'),
}
KSDE_GRADE_LABELS = {
    'Kindergarten': 'K', '1st Grade': '1', '2nd Grade': '2', '3rd Grade': '3', '4th Grade': '4', '5th Grade': '5',
    '6th Grade': '6', '7th Grade': '7', '8th Grade': '8', '9th Grade': '9', '10th Grade': '10', '11th Grade': '11', '12th Grade': '12',
}


def name_key(name: str) -> str:
    """A school name stripped of words like 'Elementary' or 'High School', lowercased, for matching across sources."""
    name = re.sub(r'\b(Elem(entary)?|Elementary School|Middle School|Sr High|High School|Campus)\b', '', str(name), flags=re.I)
    return re.sub(r'\s+', ' ', name).strip().lower()


def read_district_outline() -> gpd.GeoDataFrame:
    districts = gpd.read_file(AIMS_DATABASE, layer='SCHOOLDIST_PL').to_crs(STATE_PLANE)
    return districts[districts.DISTRICT.astype(str) == district.DISTRICT_NUMBER][['geometry']]


def read_ksde_headcounts() -> pd.DataFrame:
    """2025-26 students by building number (rows) and grade (columns K..12, plus PK)."""
    counts = pd.read_csv(DATA_DIR / 'ksde_2025_26_by_school_grade.csv', dtype={'bldg': str})
    counts['grade_code'] = counts.grade.str.strip().map(KSDE_GRADE_LABELS)
    counts.loc[counts.grade.str.contains('Pre|Preschool|Special Ed 3', na=False), 'grade_code'] = 'PK'
    counts = counts[counts.grade_code.notna()]
    return counts.pivot_table(index='bldg', columns='grade_code', values='n', aggfunc='sum').fillna(0)


def read_utilization_projections() -> pd.DataFrame:
    """DAA's projected utilization (percent of capacity) by school and year, with a `key` column for matching names."""
    projections = pd.concat([pd.read_csv(DATA_DIR / f'util_{level}.csv').assign(level=level) for level in ('es', 'ms', 'hs')])
    projections['key'] = projections.school.map(name_key)
    return projections


def read_published_capacities() -> dict[str, float]:
    table = pd.read_csv(DATA_DIR / 'published_capacities.csv')
    capacities = {name_key(row.school): row.capacity for row in table.itertuples()}
    capacities[name_key('Pleasant Ridge')] = district.PLEASANT_RIDGE_PUBLISHED_CAPACITY
    return capacities


def read_nces_prek() -> dict[str, float]:
    table = pd.read_csv(DATA_DIR / 'nces_prek_2024_25.csv')
    without_elementary = (re.sub(r'\b(ELEM(ENTARY)?)\b', '', name, flags=re.I) for name in table.name)
    return {name_key(name).replace('  ', ' '): count for name, count in zip(without_elementary, table.prek)}


def build_school_table(district_shape) -> gpd.GeoDataFrame:
    headcounts = read_ksde_headcounts()
    projections = read_utilization_projections()
    published_capacity = read_published_capacities()
    nces_prek = read_nces_prek()
    immersion = {name_key(name): count for name, count in district.IMMERSION_STUDENTS.items()}

    points = gpd.read_file(AIMS_DATABASE, layer='SCHOOL_PT').to_crs(STATE_PLANE)
    points = points[(points.DISTRICT.astype(str) == district.DISTRICT_NUMBER) & points.SCHTYPE.isin(SCHOOL_TYPE_TO_LEVEL)].copy()
    points['bldg'] = points.BLDGNUMBER.fillna(0).astype(int).astype(str).str.zfill(4)
    points['level'] = points.SCHTYPE.map(SCHOOL_TYPE_TO_LEVEL)

    rows = []
    for point in points.itertuples():
        name = re.sub(r'\s+(Elementary|Middle|High)$', '', point.SCHNAME).strip()
        key = name_key(name)
        projection = projections[(projections.key == key) & (projections.level == point.level)]
        utilization = [int(value) for value in projection.iloc[0][SCHOOL_YEARS]] if len(projection) else None

        grades = {grade: float(headcounts.loc[point.bldg, grade]) if point.bldg in headcounts.index and grade in headcounts.columns else 0.0
                  for grade in GRADES_BY_LEVEL[point.level]}
        enrollment_2025 = sum(grades.values())

        prek = 0.0
        if point.level == 'es':
            prek = float(nces_prek.get(key, 0.0))                     # NCES 2024-25 Pre-K headcount (program-placed)
            prek = float(district.EARLY_CHILDHOOD_FALL_2026.get(name, prek))  # the district's fall 2026 count, where known

        if key in published_capacity:
            capacity, capacity_source = published_capacity[key], 'district published / back-solved (Facility Alignment Meeting 3)'
        elif utilization and enrollment_2025 > 0:
            capacity, capacity_source = round(enrollment_2025 / (utilization[0] / 100)), 'estimated: KSDE 2025-26 headcount / DAA 2025-26 utilization'
        else:
            capacity, capacity_source = None, 'unknown'
        if point.level == 'es' and name in district.FUNCTIONAL_CAPACITY:
            capacity = float(district.FUNCTIONAL_CAPACITY[name])
            capacity_source = 'district 2026 functional capacity (Nov 2026 boundary presentations)'

        rows.append(dict(
            id=f'{point.level}-{point.bldg}', bldg=point.bldg, name=name, level=point.level,
            code=projection.iloc[0].code if len(projection) else None,
            grades=grades, prek=prek, immersion=immersion.get(key, 0), enroll2025=enrollment_2025,
            capacity=capacity, capSource=capacity_source, util=utilization, address=point.ADDRESS, geometry=point.geometry))

    schools = gpd.GeoDataFrame(rows, crs=STATE_PLANE)
    # Westview closed at the end of 2025-26; schools without a projection aren't modeled
    return schools[(schools.name.str.lower() != 'westview') & schools.util.notna()]


def build_attendance_areas(level: str, schools: gpd.GeoDataFrame, district_shape) -> gpd.GeoDataFrame:
    """Today's attendance areas for one level, one shape per school, trimmed to the district."""
    layer, name_column = ATTENDANCE_AREA_LAYERS[level]
    areas = gpd.read_file(AIMS_DATABASE, layer=layer).to_crs(STATE_PLANE)
    areas = areas[areas.District.astype(str) == district.DISTRICT_NUMBER].copy()
    areas['bldg'] = areas.BldgNum.astype(int).astype(str).str.zfill(4)
    areas['name'] = areas[name_column]
    if level == 'es':
        successor = schools[(schools.level == 'es') & (schools.name == district.WESTVIEW_MERGED_INTO)]
        if len(successor):
            areas.loc[areas.name.str.lower() == 'westview', 'bldg'] = successor.iloc[0].bldg
    areas = areas.dissolve('bldg').reset_index()[['bldg', 'geometry']]
    areas['school'] = f'{level}-' + areas.bldg
    unmatched = set(areas.school) - set(schools.id)
    print(f'  {level}: {len(areas)} attendance areas' + (f', no school record for {sorted(unmatched)}' if unmatched else ''))
    areas.geometry = areas.geometry.intersection(district_shape).buffer(0)
    return areas


def run() -> None:
    outline = read_district_outline()
    outline.to_file(work_file('district.gpkg'))
    district_shape = outline.geometry.union_all()

    schools = build_school_table(district_shape)
    print('  schools by level:', schools.groupby('level').size().to_dict())
    schools.to_parquet(work_file('schools.parquet'))

    for level in ('es', 'ms', 'hs'):
        build_attendance_areas(level, schools, district_shape).to_file(work_file(f'zones_{level}.gpkg'))
