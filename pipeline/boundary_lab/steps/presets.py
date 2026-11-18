"""Step 9 - Presets: the starting plans the app offers.

Reads   data/map_readings/elementary_blocks.parquet, work/solver_plan_*.parquet / .json, work/zones_es.gpkg, schools.json
Writes  presets.json  {receivers, presets}

A plan = the schools it closes (school number -> first year closed) + an ordered list of edits on top of today's areas, each
edit giving an area to a school (later edits win). The plans:
  current            today's areas, nothing closed
  district           the district's closures and the approved Fairview -> Northview and Ridgeview -> Central merges, with the
                     other closing areas left unassigned for people to draw
  dc1 .. dc4         the district's four elementary options, read off its maps, with the district's own tables attached
  solver-...         the lab's solver plans (steps/solver_plans.py)
"""
import json

import geopandas as gpd

from .. import district
from ..geo import read_zones, to_app_geometry, write_compact_json
from ..settings import MAP_READINGS_DIR, SCHOOL_YEARS, app_file, work_file
from ..solver.scenarios import SCENARIOS

DISTRICT_OPTION_DESCRIPTIONS = {
    1: "Read off the district's Concept 1 map (Nov 2026 boundary presentation). Heritage: west of Indian Creek to Madison Place, east to "
       "Brougham. Scarborough: all to Sunnyside. Black Bob: northwest corner to Briarwood, southwest corner to Brougham, the rest to Green "
       "Springs. Tomahawk: west of Mur-Len to Havencroft, the rest to Briarwood. Walnut Grove: west of Pflumm to Heatherstone, east to "
       "Pleasant Ridge. Also Briarwood east of Black Bob Rd to Regency Place, and Pleasant Ridge's southeast part to Bentwood. Half of "
       "Spanish immersion (118) to Arbor Creek.",
    2: "Read off the district's Concept 2 map (Nov 2026 boundary presentation). Heritage: west of Ridgeview to Madison Place, Ridgeview to "
       "Indian Creek to Havencroft, east of Indian Creek to Sunnyside. Scarborough: west of Indian Creek to Madison Place, east to Sunnyside. "
       "Black Bob: west part to Brougham, the rest to Green Springs. Tomahawk: all to Briarwood. Walnut Grove: north part and a strip along "
       "Pflumm to Heatherstone, the rest to Pleasant Ridge. Also Briarwood south of 143rd to Green Springs, Green Springs by 151st to "
       "Brougham, Briarwood east of Black Bob Rd to Regency Place. Half of Spanish immersion (118) to Arbor Creek.",
    3: "Read off the district's Concept 3 map (Nov 2026 boundary presentation). Heritage: west of Indian Creek to Havencroft, east to "
       "Sunnyside. Scarborough: west of Indian Creek to Madison Place, east to Sunnyside. Black Bob: southwest part to Brougham, the rest to "
       "Green Springs. Tomahawk: west of Mur-Len to Indian Creek, the rest to Briarwood. Walnut Grove: as option 2 (commercial land by I-35 "
       "to Countryside). Also Briarwood south of 143rd to Green Springs, Green Springs north of 143rd to Briarwood, Briarwood east of Black "
       "Bob Rd to Regency Place, Indian Creek west of Mur-Len near I-35 to Countryside, and Regency Place's east part to Bentwood. Half of "
       "Spanish immersion (118) to Arbor Creek.",
    4: "Read off the district's Concept 4 map (Nov 2026 boundary presentation). Heritage: west of Indian Creek to Havencroft, east to "
       "Brougham. Scarborough: all to Sunnyside. Black Bob: southwest part to Brougham, the rest to Green Springs. Tomahawk: all to "
       "Briarwood. Walnut Grove: a wider band along I-35 to Countryside, the rest to Heatherstone and Pleasant Ridge. Also Briarwood south "
       "of 143rd to Green Springs, Green Springs north of 143rd to Regency Place, Briarwood east of Black Bob Rd to Regency Place, Regency "
       "Place's east part to Bentwood, and Brougham's south part to Arbor Creek. Half of Spanish immersion (118) to Arbor Creek.",
}


def edit(school: int, geometry: dict, label: str, level: str = 'es') -> dict:
    return dict(level=level, school=school, geom=geometry, label=label)


def closures_and_receivers(number_of: dict[tuple[str, str], int]) -> tuple[dict, dict]:
    closures = {str(number_of[closure.level, closure.school]): closure.first_year_closed for closure in district.CLOSURES}
    receivers = {str(number_of[closure.level, closure.school]): [number_of[closure.level, name] for name in closure.receivers]
                 for closure in district.CLOSURES}
    return closures, receivers


def merge_edits(number_of: dict[tuple[str, str], int]) -> list[dict]:
    """Fairview -> Northview and Ridgeview -> Central: the whole area moves."""
    zones = read_zones('es')
    school_table = gpd.read_parquet(work_file('schools.parquet'))
    zones['name'] = zones.school.map(dict(zip(school_table.id, school_table.name)))
    return [edit(number_of['es', successor], to_app_geometry(zones[zones.name == closing].geometry.union_all(), crs=zones.crs),
                 f'{closing} merges into {successor}')
            for closing, successor in district.MERGES.items()]


def area_edits(blocks: gpd.GeoDataFrame, current_column: str, target_column: str, plan_name: str, number_of: dict) -> list[dict]:
    """Edits for a plan given block by block: one edit per receiver for the closing schools' blocks, then one per
    (open school -> open school) move."""
    closing = blocks[current_column].isin(district.CLOSING_ELEMENTARY)
    edits = [edit(number_of['es', receiver], to_app_geometry(group.geometry.union_all(), crs=blocks.crs), f'{plan_name}: to {receiver}')
             for receiver, group in blocks[closing].groupby(target_column)]
    moving = blocks[~closing & (blocks[target_column] != blocks[current_column])]
    for (source, receiver), group in moving.groupby([current_column, target_column]):
        edits.append(edit(number_of['es', receiver], to_app_geometry(group.geometry.union_all(), crs=blocks.crs),
                          f'{plan_name}: {source} to {receiver}'))
    return edits


def district_option(option: int, base: dict, blocks: gpd.GeoDataFrame, number_of: dict) -> dict:
    name = f'District option {option}'
    return dict(
        id=f'dc{option}', name=name, description=DISTRICT_OPTION_DESCRIPTIONS[option], closures=base['closures'],
        edits=base['edits'] + area_edits(blocks, 'current_school', f'option_{option}', name, number_of),
        district=dict(firstYear='2026-27', table=district.OPTION_FIVE_YEAR_ESTIMATES[option], cap=district.FUNCTIONAL_CAPACITY,
                      enroll2026=district.ENROLLMENT_FALL_2026,
                      pieces=[dict(frm=source, to=receiver, n=students) for source, receiver, students in district.OPTION_STUDENTS_MOVING[option]]))


def solver_description(scenario, numbers: dict) -> str:
    who = ("only the district's listed receivers take each closing school's students" if scenario.receivers == 'district'
           else "any open school next to a closing school may take its students")
    rules = (f"Made by this lab's solver, not by the district. Rules: {who}; every school taking students stays at or below "
             f"{scenario.max_utilization:.0%} of capacity in every year through {SCHOOL_YEARS[-1]} (Pre-K and immersion counted); no home "
             f"moves more than {scenario.max_trip_miles:g} road miles from its new school where a receiver is that close; no islands.")
    if scenario.open_school_moves:
        rules += ' Open schools may pass areas to a neighbouring open school when that makes room.'
    shape = (' Lines follow arterial and collector roads, creeks and the district\'s planning-area lines, and each closing school is '
             'split only where it pays off.')
    moves = '; '.join(f'{pair.replace(" > ", " to ")} ({students})' for pair, students in numbers['moves'].items())
    result = (f' Students moving in 2027-28: {moves}. Average trip for students who move: {numbers["average_trip_miles"]} miles. '
              'Indian Trail (middle school) still unassigned.')
    return rules + shape + result


def solver_plan(scenario, base: dict, number_of: dict) -> dict | None:
    path = work_file(f'solver_plan_{scenario.id}.parquet')
    if not path.exists():
        print(f'  {scenario.id}: no solver result, skipped')
        return None
    chunks = gpd.read_parquet(path)
    numbers = json.load(open(work_file(f'solver_plan_{scenario.id}.json')))
    return dict(id=scenario.id, name=scenario.name, description=solver_description(scenario, numbers), closures=base['closures'],
                edits=base['edits'] + area_edits(chunks, 'current_school', 'to', scenario.name, number_of))


def run() -> None:
    schools = json.load(open(app_file('schools.json')))['schools']
    number_of = {(school['level'], school['name']): school['i'] for school in schools}
    closures, receivers = closures_and_receivers(number_of)
    current = dict(id='current', name='Current boundaries (2025-26)', description="Today's attendance areas. Nothing closed.", closures={}, edits=[])
    base = dict(
        id='district', name='District closures, areas to draw',
        description='Closes the six schools the district recommended (end of 2026-27) plus Fairview and Ridgeview (approved, 2028-29). '
                    'Fairview and Ridgeview areas merge into Northview and Central; the other closing areas are left unassigned for you to draw.',
        closures=closures, edits=merge_edits(number_of))

    blocks = gpd.read_parquet(MAP_READINGS_DIR / 'elementary_blocks.parquet')
    presets = [current, base] + [district_option(option, base, blocks, number_of) for option in (1, 2, 3, 4)]
    presets += [plan for plan in (solver_plan(scenario, base, number_of) for scenario in SCENARIOS) if plan]
    write_compact_json(dict(receivers=receivers, presets=presets), app_file('presets.json'))
    print('  plans: ' + ', '.join(preset['id'] for preset in presets))
