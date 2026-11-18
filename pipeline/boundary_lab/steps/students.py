"""Step 3 - Students: each home's school today, and how many projected students each home carries.

Reads   work/homes.parquet, work/schools.parquet, work/zones_*.gpkg, data/map_readings/elementary_blocks.parquet
Writes  work/homes_assigned.parquet  homes with orig_<level> (school id today) and w_<level> (relative weight)
        work/school_factors.json     per school: neighborhood students by year, and the factor turning weights into students

The model in one sentence: a school's projected neighborhood students in a year (the district's projected utilization times
its capacity) are spread over the homes in its attendance area in proportion to each home's weight. A home keeps its
original school's factor wherever a plan sends it, so moving a home moves its projected students with it.

Weights blend two views of the 2020 Census (see step 2): BLEND_SAME_AGES of "each block keeps its share of the grade's ages"
plus the rest of "2020's younger children followed forward". A 2010-to-2020 backtest in the district favored a blend over
either view alone (elementary 0.55-0.70 same-ages over ten years, middle/high 0.35-0.45).

For the five closing elementary schools the district published maps with a dot per student. Those schools' weights are
reshaped so each street block holds its share of the dots (see `place_students_by_district_dots`).
"""
import json

import geopandas as gpd
import numpy as np
import pandas as pd

from .. import district
from ..geo import polygon_containing_each_point, read_zones
from ..settings import FALL_2026, MAP_READINGS_DIR, work_file

BLEND_SAME_AGES = {'es': 0.5, 'ms': 0.4, 'hs': 0.4}


def assign_homes_to_current_schools(homes: gpd.GeoDataFrame, level: str) -> pd.Series:
    """School id whose attendance area holds each home; homes on a seam between areas take the nearest area."""
    zones = read_zones(level)
    school = polygon_containing_each_point(homes, zones).map(zones.school)
    on_seam = school.isna()
    if on_seam.any():
        nearest = gpd.sjoin_nearest(homes[on_seam][['geometry']], zones[['school', 'geometry']])
        school[on_seam] = nearest[~nearest.index.duplicated()].school
    return school


def blended_weights(homes: gpd.GeoDataFrame, level: str) -> pd.Series:
    """Each home's share of its school's students under each view, blended, scaled so a school's homes sum to 100."""
    school = homes[f'orig_{level}']
    share_same_ages = homes[f's_{level}'] / school.map(homes.groupby(school)[f's_{level}'].sum()).replace(0, 1)
    share_aged_forward = homes[f'a_{level}'] / school.map(homes.groupby(school)[f'a_{level}'].sum()).replace(0, 1)
    blend = BLEND_SAME_AGES[level]
    return (blend * share_same_ages + (1 - blend) * share_aged_forward) * 100


def place_students_by_district_dots(homes: gpd.GeoDataFrame, school_names: dict[str, str]) -> np.ndarray:
    """Reshape the closing schools' elementary weights to follow the district's student-dot maps.

    Each closing school's total weight is unchanged (so its projected totals are too). Within the street blocks the map
    reader covered, each block gets the school's weight in proportion to its dots, and homes inside a block keep their census
    proportions. Dots that fell in a block with no homes go to the nearest block with homes. Homes outside the covered
    blocks keep their weight.
    """
    blocks = gpd.read_parquet(MAP_READINGS_DIR / 'elementary_blocks.parquet')
    blocks = blocks[blocks.current_school.isin(district.CLOSING_ELEMENTARY)].copy()
    block_of_home = polygon_containing_each_point(homes, blocks).values
    weights = homes.w_es.values.copy()
    school_of_home = homes.orig_es.map(school_names).values

    for school in district.CLOSING_ELEMENTARY:
        school_homes = np.where(school_of_home == school)[0]
        if not len(school_homes):
            continue
        total_weight = weights[school_homes].sum()
        home_blocks = block_of_home[school_homes]
        in_a_block = ~np.isnan(home_blocks)
        weight_outside_blocks = weights[school_homes][~in_a_block].sum()

        dots = blocks[blocks.current_school == school].student_dots.astype(float).copy()
        blocks_with_homes = set(home_blocks[in_a_block].astype(int))
        for block in dots.index:
            if block in blocks_with_homes or dots[block] == 0:
                continue
            outline = blocks.geometry[block]
            nearest = min(blocks_with_homes, key=lambda other: blocks.geometry[other].distance(outline))
            dots[nearest] += dots[block]
            dots[block] = 0
        dot_share = dots / dots.sum()

        weight_to_place = total_weight - weight_outside_blocks
        for block in blocks_with_homes:
            homes_in_block = school_homes[in_a_block][home_blocks[in_a_block].astype(int) == block]
            census_weights = weights[homes_in_block]
            census_total = census_weights.sum()
            proportions = census_weights / census_total if census_total > 0 else np.full(len(homes_in_block), 1 / len(homes_in_block))
            weights[homes_in_block] = dot_share.get(block, 0) * weight_to_place * proportions
        print(f'  dots: {school} placed over {len(blocks_with_homes)} street blocks')
    return weights


def neighborhood_students(school: pd.Series) -> list[float]:
    """Projected neighborhood students by year: utilization x capacity, calibrated to the district's fall 2026 count.

    DAA's utilization is K-5 (or 6-8, 9-12) headcount over functional capacity, without Pre-K. Black Bob's published figure
    includes the Spanish immersion students in its building beyond those who live in its area; they're taken out here
    because immersion is added separately (see district.IMMERSION_STUDENTS).
    """
    immersion_in_published_figure = school.immersion if school['name'] == 'Black Bob' else 0
    students = [max(0.0, percent / 100 * school.capacity - immersion_in_published_figure) for percent in school.util]
    fall_count = district.K5_STUDENTS_FALL_2026.get(school['name']) if school.level == 'es' else None
    if fall_count and students[FALL_2026] > 0:
        scale = fall_count / students[FALL_2026]       # keep the projected trend, start from the district's actual count
        students = [value * scale for value in students]
    return students


def run() -> None:
    schools = gpd.read_parquet(work_file('schools.parquet'))
    homes = gpd.read_parquet(work_file('homes.parquet'))
    school_names = dict(zip(schools.id, schools.name))
    factors = {}
    for level in ('es', 'ms', 'hs'):
        homes[f'orig_{level}'] = assign_homes_to_current_schools(homes, level).values
        homes[f'w_{level}'] = blended_weights(homes, level)
        if level == 'es':
            homes['w_es'] = place_students_by_district_dots(homes, school_names)

        weight_by_school = homes.groupby(f'orig_{level}')[f'w_{level}'].sum()
        for _, school in schools[schools.level == level].iterrows():
            students = neighborhood_students(school)
            weight = float(weight_by_school.get(school.id, 0))
            if weight == 0:
                print(f'  WARNING: no homes in {school["name"]} ({school.id})')
            # Immersion students counted at the building in plan years (Arbor Creek); Black Bob's are already excluded above
            fixed = school.immersion if school['name'] != 'Black Bob' else 0
            factors[school.id] = dict(weight=weight, fixed=fixed, neighborhood=[round(value, 1) for value in students],
                                      factor=[value / weight if weight else 0 for value in students])
        level_total = sum(factors[school_id]['neighborhood'][FALL_2026] for school_id in schools[schools.level == level].id)
        print(f'  {level}: {level_total:.0f} neighborhood students in 2026-27')
    json.dump(factors, open(work_file('school_factors.json'), 'w'))
    homes.to_parquet(work_file('homes_assigned.parquet'))
