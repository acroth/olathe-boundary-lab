"""The pipeline's steps, in the order they run. Each module has a `run()` and a docstring saying what it reads and writes."""
from . import app_export, homes, option_builder, planning_areas, presets, schools, solver_plans, streets, students

STEPS = {
    'schools': schools,                # 1  schools, attendance areas, capacity, projected utilization
    'homes': homes,                    # 2  homes with housing units and expected children
    'students': students,              # 3  each home's school today and its projected students
    'streets': streets,                # 4  road network and street blocks
    'app_export': app_export,          # 5  schools.json, zones, homes.bin, streets.bin for the app
    'planning_areas': planning_areas,  # 6  the district's planning areas with students living in each
    'option_builder': option_builder,  # 7  the district's concepts per closing school (Option Builder)
    'solver_plans': solver_plans,      # 8  the lab's own plans from the boundary solver
    'presets': presets,                # 9  the starting plans the app offers
}
