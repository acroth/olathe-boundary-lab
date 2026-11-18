"""The boundary solver: decide which school each chunk goes to.

Two kinds of chunk
  * Closing-school chunks must go to an open school: the district's listed receivers, or any open school next door.
  * Open-school chunks (only when a scenario allows moves between open schools) stay with their school, or move to a
    neighbouring open school to make room - the way the district's options move, e.g., Briarwood east of Black Bob Road to
    Regency Place.

Rules every plan must meet (hard constraints)
  * Room:       every school that takes students stays at or below `max_utilization` of its capacity in every plan year
                (2027-28 to 2034-35), counting Pre-K and Spanish immersion in the building.
  * Trip:       no home moved is more than `max_trip_miles` by road from its new school - except in a closing-school chunk
                where no receiver is that close; such a chunk may go only to its nearest receiver.
  * No islands: every school's area stays in one piece: a chunk joins a school only through other chunks that also join it.

What it prefers (the objective, in "student-miles" so the parts can be traded against each other)
  * Short trips:     students in a chunk x their average road miles to the school.
  * Few new lines:   `boundary_cost_per_mile` for each mile of line between neighbouring chunks that end up at different
                     schools (lines between chunks already follow major roads, creeks and planning-area edges).
  * Whole schools:   `split_cost` each time a closing school's area is split to one more receiver.
  * Few moved homes: `move_cost_per_student` for each student moved out of an open school, so open schools only give up
                     areas when the room is needed.
The middle two are what make plans look like a district's: whole neighborhoods move together, and a closing school is
split only where it pays off in shorter trips or room.

Solved with Google OR-Tools CP-SAT, an exact integer solver.
"""
from collections import deque
from dataclasses import dataclass

import numpy as np
from ortools.sat.python import cp_model
from shapely.geometry import Point

from .. import district
from ..settings import FEET_PER_MILE, FIRST_PLAN_YEAR, PLAN_YEARS
from .chunks import MIN_BORDER_FT, Chunks
from .road_distance import RoadNetwork

COST_SCALE = 100       # CP-SAT works in integers: costs are multiplied by this before rounding
STUDENT_SCALE = 10     # student counts in the room rule are kept to a tenth of a student


@dataclass(frozen=True)
class Scenario:
    id: str
    name: str
    receivers: str                        # 'district': only the district's listed receivers; 'adjacent': any open school next door
    max_utilization: float
    max_trip_miles: float
    open_school_moves: bool = False       # may open schools pass areas to their neighbours?
    split_cost: float = 60.0
    boundary_cost_per_mile: float = 40.0
    move_cost_per_student: float = 3.0
    time_limit_seconds: float = 120.0


@dataclass
class Plan:
    scenario: Scenario
    school_of_chunk: dict[int, int]       # chunk -> school number (index in schools.json); empty if no plan meets the rules
    status: str


class BoundarySolver:
    def __init__(self, chunks: Chunks, schools: list[dict], network: RoadNetwork, unchunked_borders: list[dict[int, float]],
                 building_chunk: dict[int, int], scenario: Scenario):
        """
        unchunked_borders[chunk] = {school number: feet of border with that school's current area}, for schools whose area
                                   wasn't cut into chunks
        building_chunk           = {school number: the chunk holding its building}, for schools whose area was cut into chunks
        """
        self.chunks = chunks
        self.schools = schools
        self.network = network
        self.unchunked_borders = unchunked_borders
        self.building_chunk = building_chunk
        self.scenario = scenario
        self.number_of = {school['name']: school['i'] for school in schools if school['level'] == 'es'}
        self.closing = {closure.school for closure in district.CLOSURES}
        self.model = cp_model.CpModel()
        self.goes_to: dict[tuple[int, int], cp_model.IntVar] = {}   # (chunk, school) -> 1 if the chunk goes to the school
        self.average_miles: dict[tuple[int, int], float] = {}
        self.costs = []

    # ----- where each chunk may go -----------------------------------------------------------------------------------------
    def current_school(self, chunk: int) -> int:
        return self.number_of[self.chunks.shapes.current_school[chunk]]

    def is_closing(self, chunk: int) -> bool:
        return self.chunks.shapes.current_school[chunk] in self.closing

    def receivers_for(self, closing_school: str) -> list[int]:
        if self.scenario.receivers == 'district':
            closure = next(closure for closure in district.CLOSURES if closure.school == closing_school)
            return [self.number_of[name] for name in closure.receivers]
        return self.open_neighbours(self.number_of[closing_school])

    def open_neighbours(self, school: int) -> list[int]:
        return [other for other in self.schools[school]['neighbors'] if self.schools[other]['name'] not in self.closing]

    def trip_miles(self, chunk: int, school: int) -> tuple[float, float]:
        """(average, farthest home) road miles from the chunk's homes to the school."""
        node = self.schools[school]['node']
        homes = self.chunks.homes[chunk]
        if not len(homes):
            point = self.chunks.shapes.geometry[chunk].representative_point()
            miles = self.network.point_trip_miles(node, point.x, point.y)
            return miles, miles
        miles = self.network.home_trip_miles(node, homes)
        return float(miles.mean()), float(miles.max())

    def possible_schools(self, chunk: int) -> tuple[list[int], dict[int, tuple[float, float]]]:
        """Schools the chunk may go to under the trip rule (before the no-islands rule), and the trip miles to each."""
        if not self.is_closing(chunk):
            own = self.current_school(chunk)
            options = [own]
            if self.scenario.open_school_moves and self.building_chunk.get(own) != chunk:
                options += self.open_neighbours(own)
            trips = {school: self.trip_miles(chunk, school) for school in options}
            return [school for school in options if school == own or trips[school][1] <= self.scenario.max_trip_miles], trips
        trips = {school: self.trip_miles(chunk, school) for school in self.receivers_for(self.chunks.shapes.current_school[chunk])}
        nearest = min(trips, key=lambda school: trips[school][1])
        nearly_empty = self.chunks.students[chunk].max() < 0.05
        return [school for school, (_, farthest) in trips.items()
                if farthest <= self.scenario.max_trip_miles + 1e-9 or school == nearest or nearly_empty], trips

    def anchors(self, school: int, possible: dict[int, list[int]]) -> set[int]:
        """Chunks a school can grow from: its building's chunk if its area was cut up, else chunks touching its area."""
        if school in self.building_chunk:
            return {self.building_chunk[school]}
        return {chunk for chunk in range(len(self.chunks))
                if school in possible[chunk] and self.unchunked_borders[chunk].get(school, 0) > MIN_BORDER_FT}

    def steps_from_anchors(self, school: int, possible: dict[int, list[int]]) -> dict[int, int]:
        """Breadth-first search: how many chunks away from the school's anchors each chunk it may take is."""
        steps = {chunk: 0 for chunk in self.anchors(school, possible)}
        queue = deque(steps)
        while queue:
            chunk = queue.popleft()
            for neighbour in self.chunks.neighbours[chunk]:
                if neighbour not in steps and school in possible[neighbour]:
                    steps[neighbour] = steps[chunk] + 1
                    queue.append(neighbour)
        return steps

    def allowed_schools(self) -> dict[int, list[int]]:
        possible = {}
        for chunk in range(len(self.chunks)):
            possible[chunk], trips = self.possible_schools(chunk)
            for school in possible[chunk]:
                self.average_miles[chunk, school] = trips[school][0]
        schools = {school for options in possible.values() for school in options}
        self.steps = {school: self.steps_from_anchors(school, possible) for school in schools}
        return {chunk: [school for school in options if chunk in self.steps[school]] for chunk, options in possible.items()}

    # ----- rules ------------------------------------------------------------------------------------------------------------
    def add_choices(self, allowed: dict[int, list[int]]) -> None:
        for chunk, schools in allowed.items():
            if not schools:
                raise ValueError(f'Chunk {chunk} ({self.chunks.shapes.current_school[chunk]}) has no school it may go to.')
            for school in schools:
                self.goes_to[chunk, school] = self.model.NewBoolVar(f'chunk{chunk}_to_{school}')
            self.model.AddExactlyOne(self.goes_to[chunk, school] for school in schools)

    def add_room_rule(self) -> None:
        for school in self.schools_involved():
            record = self.schools[school]
            own_chunks = self.chunks.of_school(record['name'])
            in_building = record['prek'] + record['immersion']
            for year in PLAN_YEARS:
                # neighborhood students outside the school's chunks are always its own; its chunks count only if they stay
                fixed_students = record['neighborhood'][year] - self.chunks.students[own_chunks, year].sum() + in_building
                room = self.scenario.max_utilization * record['capacity'] - fixed_students
                arriving = sum(int(round(self.chunks.students[chunk][year] * STUDENT_SCALE)) * choice
                               for (chunk, target), choice in self.goes_to.items() if target == school)
                self.model.Add(arriving <= int(room * STUDENT_SCALE))

    def add_no_islands_rule(self) -> None:
        """A chunk n steps from a school's anchors may go to it only if a neighbour fewer steps away also does."""
        for (chunk, school), choice in self.goes_to.items():
            steps = self.steps[school][chunk]
            if steps == 0:
                continue
            closer = [self.goes_to[neighbour, school] for neighbour in self.chunks.neighbours[chunk]
                      if (neighbour, school) in self.goes_to and self.steps[school].get(neighbour, 99) < steps]
            self.model.Add(choice <= sum(closer))

    # ----- preferences ------------------------------------------------------------------------------------------------------
    def add_trip_cost(self) -> None:
        for (chunk, school), choice in self.goes_to.items():
            student_miles = self.chunks.students[chunk][FIRST_PLAN_YEAR] * self.average_miles[chunk, school]
            self.costs.append(int(round(student_miles * COST_SCALE)) * choice)

    def add_moved_homes_cost(self) -> None:
        for (chunk, school), choice in self.goes_to.items():
            if not self.is_closing(chunk) and school != self.current_school(chunk):
                cost = self.scenario.move_cost_per_student * self.chunks.students[chunk][FIRST_PLAN_YEAR]
                self.costs.append(int(round(cost * COST_SCALE)) * choice)

    def add_new_line_cost(self) -> None:
        for chunk, neighbours in enumerate(self.chunks.neighbours):
            for neighbour, border_ft in neighbours.items():
                if neighbour < chunk:
                    continue
                shared_options = [school for school in self.schools_involved()
                                  if (chunk, school) in self.goes_to or (neighbour, school) in self.goes_to]
                differs = self.model.NewBoolVar(f'line_{chunk}_{neighbour}')
                for school in shared_options:
                    here = self.goes_to.get((chunk, school), 0)
                    there = self.goes_to.get((neighbour, school), 0)
                    self.model.Add(differs >= here - there)
                cost = self.scenario.boundary_cost_per_mile * border_ft / FEET_PER_MILE
                self.costs.append(int(round(cost * COST_SCALE)) * differs)

    def add_split_cost(self) -> None:
        for closing_school in sorted(set(self.chunks.shapes.current_school) & self.closing):
            own_chunks = self.chunks.of_school(closing_school)
            for school in self.schools_involved():
                choices = [self.goes_to[chunk, school] for chunk in own_chunks if (chunk, school) in self.goes_to]
                if not choices:
                    continue
                used = self.model.NewBoolVar(f'{closing_school}_uses_{school}')
                for choice in choices:
                    self.model.Add(used >= choice)
                self.costs.append(int(round(self.scenario.split_cost * COST_SCALE)) * used)

    def schools_involved(self) -> list[int]:
        return sorted({school for _, school in self.goes_to})

    # ----- solve ------------------------------------------------------------------------------------------------------------
    def solve(self) -> Plan:
        self.add_choices(self.allowed_schools())
        self.add_room_rule()
        self.add_no_islands_rule()
        self.add_trip_cost()
        self.add_moved_homes_cost()
        self.add_new_line_cost()
        self.add_split_cost()
        self.model.Minimize(sum(self.costs))

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.scenario.time_limit_seconds
        solver.parameters.num_workers = 8
        status = solver.Solve(self.model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return Plan(self.scenario, {}, solver.StatusName(status))
        school_of_chunk = {chunk: school for (chunk, school), choice in self.goes_to.items() if solver.Value(choice)}
        return Plan(self.scenario, school_of_chunk, solver.StatusName(status))


def building_chunks(chunks: Chunks, schools: list[dict], points_in_state_plane: dict[int, Point]) -> dict[int, int]:
    """For each school whose area was cut into chunks: the chunk holding its building (or its nearest own chunk)."""
    found = {}
    for school in schools:
        own = chunks.of_school(school['name'])
        if school['level'] != 'es' or not len(own):
            continue
        building = points_in_state_plane[school['i']]
        found[school['i']] = int(min(own, key=lambda chunk: chunks.shapes.geometry[chunk].distance(building)))
    return found
