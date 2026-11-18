"""Step 7 - Option Builder: the district's concepts for each closing school, so they can be mixed and matched.

Reads   data/map_readings/elementary_blocks.parquet  the district's four full elementary options, read block by block
        data/map_readings/middle_school_blocks.parquet  the five middle school concepts, read block by block
        work/homes_assigned.parquet, work/school_factors.json, work/zones_ms.gpkg, schools.json
Writes  combos.json

Elementary: the district presented four district-wide options. Each closing school's "concept k" is what its blocks do in one
of those options (CONCEPTS below says which). Moves between open schools that some options include are listed separately,
each with a rule saying which concept choices bring it along (the app turns them on by default; people can override).

Middle: five concepts, each a set of areas moving to new middle schools (the district shows these separately from the
elementary options, so any pairing works).
"""
import json

import geopandas as gpd
import numpy as np

from .. import district
from ..geo import polygon_containing_each_point, read_zones, to_app_geometry, write_compact_json
from ..settings import FALL_2026, MAP_READINGS_DIR, app_file, work_file

# For each closing school: (concept number, column of the reading = district option it comes from, summary)
CONCEPTS = {
    'Heritage': [
        (1, 'option_1', 'West of Lindenwood to Madison Place; east of Lindenwood to Brougham'),
        (2, 'option_2', 'West of Ridgeview to Madison Place; Ridgeview to Indian Creek to Havencroft; east of Indian Creek to Sunnyside'),
        (3, 'option_3', 'West of Indian Creek to Havencroft; east to Sunnyside'),
        (4, 'option_4', 'Only in district-wide option 4, not in the Heritage deck: west of Lindenwood to Havencroft; east to Brougham')],
    'Scarborough': [
        (1, 'option_1', 'All to Sunnyside'),
        (2, 'option_2', 'West of Indian Creek to Madison Place; east to Sunnyside')],
    'Black Bob': [
        (1, 'option_1', 'Northwest corner to Briarwood; southwest corner to Brougham; the rest to Green Springs'),
        (2, 'option_2', 'West part to Brougham; the rest to Green Springs'),
        (3, 'option_3', 'Southwest part to Brougham; the rest to Green Springs')],
    'Tomahawk': [
        (1, 'option_1', 'West of Mur-Len to Havencroft; the rest to Briarwood'),
        (2, 'option_2', 'All to Briarwood'),
        (3, 'option_3', 'West of Mur-Len to Indian Creek; the rest to Briarwood')],
    'Walnut Grove': [
        (1, 'option_1', 'West of Pflumm to Heatherstone; east of Pflumm to Pleasant Ridge'),
        (2, 'option_2', 'North part and a strip along Pflumm to Heatherstone; the rest to Pleasant Ridge'),
        (3, 'option_4', 'Band along I-35 to Countryside; otherwise as concept 2')],
}
# Which district option's student counts go with each concept (the parent-meeting tables are per option)
CONCEPT_TO_DISTRICT_OPTION = {
    'Heritage': {1: 1, 2: 2, 3: 3, 4: 4}, 'Scarborough': {1: 1, 2: 2}, 'Black Bob': {1: 1, 2: 2, 3: 3},
    'Tomahawk': {1: 1, 2: 2, 3: 3}, 'Walnut Grove': {1: 1, 2: 2, 3: 4},
}
# The district-wide options as concept choices, in the order of CONCEPTS (Heritage, Scarborough, Black Bob, Tomahawk, Walnut Grove)
DISTRICT_OPTIONS_AS_CONCEPTS = {'1': [1, 1, 1, 1, 1], '2': [2, 2, 2, 2, 2], '3': [3, 2, 3, 3, 2], '4': [4, 1, 3, 2, 3]}

# Moves between open schools: (id, from, to, option column that shows it, label, rule).
# A rule names concepts with the school's short code + number (BB2 = Black Bob concept 2) and combines them with | & ! ( ).
OPEN_SCHOOL_MOVES = [
    ('630', 'Briarwood', 'Regency Place', 'option_1', 'Briarwood east of Black Bob Rd (planning area 630) to Regency Place', 'always'),
    ('PR-BE', 'Pleasant Ridge', 'Bentwood', 'option_1', 'Pleasant Ridge southeast part to Bentwood (district option 1)', 'WG1'),
    ('BW-GS', 'Briarwood', 'Green Springs', 'option_2', 'Briarwood south of 143rd to Green Springs (Black Bob concepts 2 and 3)', 'BB2|BB3'),
    ('GS-BR', 'Green Springs', 'Brougham', 'option_2', 'Green Springs west of Black Bob Rd by 151st to Brougham (Black Bob concept 2)', 'BB2'),
    ('GSN-BW', 'Green Springs', 'Briarwood', 'option_3', 'Green Springs north of 143rd to Briarwood (district option 3)', 'BB3&!TH2'),
    ('GSN-RP', 'Green Springs', 'Regency Place', 'option_4', 'Green Springs north of 143rd to Regency Place (district option 4)', 'BB3&TH2'),
    ('RP-BE', 'Regency Place', 'Bentwood', 'option_4', 'Regency Place east part to Bentwood (district options 3 and 4)', 'BB3'),
    ('IC-CS', 'Indian Creek', 'Countryside', 'option_3', 'Indian Creek northwest corner to Countryside (with Tomahawk concept 3)', 'TH3'),
    ('BR-AC', 'Brougham', 'Arbor Creek', 'option_4', 'Brougham south part to Arbor Creek (district option 4)', '(HT1|HT4)&BB3'),
]
MUTUALLY_EXCLUSIVE_MOVES = [['GSN-BW', 'GSN-RP']]   # the same area going to two places: only one can be on


def model_students_fall_2026(blocks: gpd.GeoDataFrame) -> np.ndarray:
    """The model's 2026-27 elementary students living in each block (to set beside the district's counts)."""
    homes = gpd.read_parquet(work_file('homes_assigned.parquet'))
    factors = json.load(open(work_file('school_factors.json')))
    students = homes.w_es.values * np.array([factors[school]['factor'][FALL_2026] for school in homes.orig_es])
    block_of_home = polygon_containing_each_point(homes, blocks)
    inside = block_of_home.notna()
    return np.bincount(block_of_home[inside].astype(int).values, weights=students[inside.values], minlength=len(blocks))


def union_as_app_geometry(blocks: gpd.GeoDataFrame, selection) -> dict:
    return to_app_geometry(blocks.geometry[selection].union_all(), crs=blocks.crs)


def elementary_concepts(blocks: gpd.GeoDataFrame, school_number: dict[str, int]) -> list[dict]:
    district_counts = {}   # (closing school, receiver) -> {district option: students}
    for option, rows in district.OPTION_STUDENTS_MOVING.items():
        for closing, receiver, students in rows:
            district_counts.setdefault((closing, receiver), {})[option] = students

    schools = []
    for name, concepts in CONCEPTS.items():
        of_school = blocks.current_school == name
        concept_records = []
        for concept, column, summary in concepts:
            pieces = []
            for receiver, receiving_blocks in blocks[of_school].groupby(column):
                pieces.append(dict(
                    to=receiver, school=school_number[receiver],
                    geom=union_as_app_geometry(blocks, of_school & (blocks[column] == receiver)),
                    model26=round(float(receiving_blocks.students_2026.sum())),
                    district=district_counts.get((name, receiver), {}).get(CONCEPT_TO_DISTRICT_OPTION[name][concept])))
            concept_records.append(dict(id=concept, summary=summary, pieces=pieces))
        schools.append(dict(name=name, i=school_number[name], concepts=concept_records))
    return schools


def open_school_moves(blocks: gpd.GeoDataFrame, school_number: dict[str, int]) -> list[dict]:
    moves = []
    for move_id, source, target, column, label, rule in OPEN_SCHOOL_MOVES:
        moving = (blocks.current_school == source) & (blocks[column] == target)
        moves.append(dict(id=move_id, frm=source, to=target, school=school_number[target], label=label, rule=rule,
                          geom=union_as_app_geometry(blocks, moving), model26=round(float(blocks.students_2026[moving].sum()))))
    return moves


def middle_school_concepts(middle_school_number: dict[str, int]) -> dict:
    """Each concept as one area per receiving middle school (the blocks that change to it). Parts of Indian Trail's area that
    no street block covers (road corridors, edges) go to the receiving area they border most, so nothing is left unassigned."""
    blocks = gpd.read_parquet(MAP_READINGS_DIR / 'middle_school_blocks.parquet')
    zones = read_zones('ms')
    school_table = gpd.read_parquet(work_file('schools.parquet'))
    zones['name'] = zones.school.map(dict(zip(school_table.id, school_table.name)))
    indian_trail = zones[zones.name == 'Indian Trail'].geometry.union_all()

    concepts = []
    for concept in sorted(district.MIDDLE_SCHOOL_CONCEPT_SUMMARIES):
        column = f'concept_{concept}'
        changing = blocks[blocks[column].notna() & (blocks[column] != blocks.current_school)]
        areas = {receiver: group.geometry.buffer(2).union_all().buffer(-2) for receiver, group in changing.groupby(column)}

        uncovered = indian_trail.difference(gpd.GeoSeries(list(areas.values())).union_all())
        for part in getattr(uncovered, 'geoms', [uncovered]):
            if part.is_empty or part.geom_type != 'Polygon':
                continue
            closest = max(areas, key=lambda receiver: part.buffer(25).intersection(areas[receiver]).area)
            if part.buffer(25).intersection(areas[closest]).area > 0:
                areas[closest] = areas[closest].union(part.buffer(1))

        edits = [dict(school=middle_school_number[receiver], to=receiver,
                      faces=changing[changing[column] == receiver].face_id.astype(int).tolist(),
                      geom=to_app_geometry(area.simplify(12), crs=blocks.crs))
                 for receiver, area in areas.items()]
        concepts.append(dict(id=concept, summary=district.MIDDLE_SCHOOL_CONCEPT_SUMMARIES[concept],
                             table=district.MIDDLE_SCHOOL_CONCEPT_ESTIMATES[concept], edits=edits))
        print(f'  middle school concept {concept}: ' + ', '.join(f'{edit["to"]} {len(edit["faces"])} blocks' for edit in edits))
    return dict(cap=district.MIDDLE_SCHOOL_CAPACITY, firstYear='2026-27', concepts=concepts,
                source='Middle School Boundary Adjustments deck (Nov 2026): concept maps read onto street blocks; tables from the five-year estimate slides.')


def run() -> None:
    schools = json.load(open(app_file('schools.json')))['schools']
    elementary_number = {school['name']: school['i'] for school in schools if school['level'] == 'es'}
    middle_number = {school['name']: school['i'] for school in schools if school['level'] == 'ms'}

    blocks = gpd.read_parquet(MAP_READINGS_DIR / 'elementary_blocks.parquet')
    blocks['students_2026'] = model_students_fall_2026(blocks)
    concepts = elementary_concepts(blocks, elementary_number)
    for school in concepts:
        print(f'  {school["name"]}: ' + '; '.join(
            f'{concept["id"]} ' + ', '.join(f'{piece["to"]} {piece["model26"]}' for piece in concept['pieces']) for concept in school['concepts']))

    enrollment = dict(district.ENROLLMENT_FALL_2026)
    enrollment[district.IMMERSION_HOST] = district.ARBOR_CREEK_WITH_IMMERSION_2027
    write_compact_json(dict(
        basePreset='district', schools=concepts, moves=open_school_moves(blocks, elementary_number), exclusive=MUTUALLY_EXCLUSIVE_MOVES,
        district=dict(enroll2026=enrollment, cap=district.FUNCTIONAL_CAPACITY), options=DISTRICT_OPTIONS_AS_CONCEPTS,
        ms=middle_school_concepts(middle_number)), app_file('combos.json'))
