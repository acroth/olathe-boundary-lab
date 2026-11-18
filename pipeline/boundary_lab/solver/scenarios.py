"""The solver plans published in the app. Each is one set of rules; see model.py for what the rules and costs mean."""
from .model import Scenario

SCENARIOS = [
    Scenario(id='solver-receivers', name='Solver: district receivers, 90% cap',
             receivers='district', max_utilization=0.90, max_trip_miles=3.0),
    Scenario(id='solver-85', name='Solver: 85% target, with moves between open schools',
             receivers='district', max_utilization=0.85, max_trip_miles=3.0, open_school_moves=True),
]
