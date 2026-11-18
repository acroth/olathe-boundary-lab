"""Step 8 - Solver plans: the lab's own plans for the five closing elementary schools (rules in solver/scenarios.py).

Reads   work/homes_assigned.parquet, work/school_factors.json, work/zones_es.gpkg, work/street_*.parquet, schools.json,
        data/planning_areas_2026.gpkg, raw/tl_2026_20091_linearwater.zip (creeks), raw/tl_2026_us_rails.zip
Writes  work/solver_plan_<scenario id>.parquet  every chunk: current_school, to (school it goes to), students in 2027-28
        work/solver_plan_<scenario id>.json     the plan's numbers, used to write its description in the presets step
"""
import json

import geopandas as gpd
import numpy as np

from .. import district
from ..geo import read_zones
from ..settings import FIRST_PLAN_YEAR, PLAN_YEARS, STATE_PLANE, WGS84, app_file, work_file
from ..solver.chunks import MIN_BORDER_FT, Chunks, build_chunks
from ..solver.model import BoundarySolver, Plan, Scenario, building_chunks
from ..solver.road_distance import RoadNetwork
from ..solver.scenarios import SCENARIOS


def schools_to_cut(scenario: Scenario) -> list[str]:
    """The closing schools, plus the receivers when open schools may pass areas to their neighbours."""
    names = list(district.CLOSING_ELEMENTARY)
    if scenario.open_school_moves:
        names += sorted({receiver for closure in district.CLOSURES if closure.school in district.CLOSING_ELEMENTARY
                         for receiver in closure.receivers})
    return names


def borders_with_unchunked_schools(chunks: Chunks, schools: list[dict]) -> list[dict[int, float]]:
    """For each chunk: {school number: feet of border with that school's current area}, for open elementary schools whose
    area wasn't cut into chunks."""
    zones = read_zones('es')
    number_of_id = {school['id']: school['i'] for school in schools}
    skip = {closure.school for closure in district.CLOSURES} | set(chunks.shapes.current_school)
    borders = [dict() for _ in range(len(chunks))]
    grown_chunks = chunks.shapes.geometry.buffer(5)
    for zone in zones.itertuples():
        school = number_of_id[zone.school]
        if schools[school]['name'] in skip:
            continue
        grown_zone = zone.geometry.buffer(5)
        for chunk in np.where(grown_chunks.intersects(grown_zone))[0]:
            length = grown_chunks[chunk].intersection(grown_zone).area / 10
            if length > MIN_BORDER_FT:
                borders[chunk][school] = length
    return borders


def plan_numbers(plan: Plan, chunks: Chunks, schools: list[dict], network: RoadNetwork) -> dict:
    """What the plan does: students moving by (from, to) school, peak use at every school that changes, and trip lengths
    for the students who move."""
    moves, change = {}, {}
    trip_miles, trip_weights = [], []
    for chunk, school in plan.school_of_chunk.items():
        current = chunks.shapes.current_school[chunk]
        target = schools[school]['name']
        if target == current:
            continue
        students = chunks.students[chunk]
        moves[f'{current} > {target}'] = moves.get(f'{current} > {target}', 0) + students[FIRST_PLAN_YEAR]
        change[target] = change.get(target, 0) + students
        change[current] = change.get(current, 0) - students
        if len(chunks.homes[chunk]):
            trip_miles.append(network.home_trip_miles(schools[school]['node'], chunks.homes[chunk]))
            trip_weights.append(np.full(len(chunks.homes[chunk]), students[FIRST_PLAN_YEAR] / len(chunks.homes[chunk])))
    by_name = {school['name']: school for school in schools if school['level'] == 'es'}
    peaks = {}
    for name, students_change in change.items():
        if name in district.CLOSING_ELEMENTARY:
            continue
        record = by_name[name]
        in_building = record['prek'] + record['immersion']
        peaks[name] = max((record['neighborhood'][year] + in_building + students_change[year]) / record['capacity'] for year in PLAN_YEARS)
    miles, weights = np.concatenate(trip_miles), np.concatenate(trip_weights)
    return dict(status=plan.status, moves={key: round(value) for key, value in sorted(moves.items())},
                peak_use={name: round(value, 3) for name, value in sorted(peaks.items())},
                average_trip_miles=round(float(np.average(miles, weights=weights)), 2), farthest_home_miles=round(float(miles.max()), 2))


def run() -> None:
    schools = json.load(open(app_file('schools.json')))['schools']
    buildings = gpd.GeoSeries(gpd.points_from_xy([s['lon'] for s in schools], [s['lat'] for s in schools]), crs=WGS84).to_crs(STATE_PLANE)
    network = RoadNetwork(gpd.read_parquet(work_file('homes_assigned.parquet')))

    for scenario in SCENARIOS:
        chunks = build_chunks(schools_to_cut(scenario))
        print(f'  {scenario.id}: {len(chunks)} chunks')
        solver = BoundarySolver(chunks, schools, network, borders_with_unchunked_schools(chunks, schools),
                                building_chunks(chunks, schools, dict(enumerate(buildings))), scenario)
        plan = solver.solve()
        if not plan.school_of_chunk:
            print(f'    no plan meets the rules ({plan.status})')
            continue
        numbers = plan_numbers(plan, chunks, schools, network)
        print(f'    {plan.status}; peak use ' + ', '.join(f'{name} {value:.0%}' for name, value in numbers['peak_use'].items()))
        print(f'    moves {numbers["moves"]}')
        print(f'    average trip {numbers["average_trip_miles"]} mi, farthest home {numbers["farthest_home_miles"]} mi')
        result = chunks.shapes.assign(to=[schools[plan.school_of_chunk[chunk]]['name'] for chunk in range(len(chunks))],
                                      students=chunks.students[:, FIRST_PLAN_YEAR])
        result.to_parquet(work_file(f'solver_plan_{scenario.id}.parquet'))
        json.dump(numbers, open(work_file(f'solver_plan_{scenario.id}.json'), 'w'), indent=1)
