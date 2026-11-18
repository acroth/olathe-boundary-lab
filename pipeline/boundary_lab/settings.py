"""Folders the pipeline reads and writes, and constants shared by every step.

Folders can be moved with environment variables (handy for keeping big intermediate files outside the repo):
    BOUNDARY_RAW_DIR   downloaded source data (not in git; see pipeline/README.md for what goes there)
    BOUNDARY_WORK_DIR  intermediate files passed between steps (not in git)
    BOUNDARY_APP_DIR   where the web app's data files are written (defaults to public/data in this repo)
"""
import os
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = PIPELINE_DIR.parent

RAW_DIR = Path(os.environ.get('BOUNDARY_RAW_DIR', PIPELINE_DIR / 'raw'))
DATA_DIR = PIPELINE_DIR / 'data'                     # small source tables kept in git
MAP_READINGS_DIR = DATA_DIR / 'map_readings'         # what tools/ read off the district's slides, kept in git
WORK_DIR = Path(os.environ.get('BOUNDARY_WORK_DIR', PIPELINE_DIR / 'work'))
APP_DATA_DIR = Path(os.environ.get('BOUNDARY_APP_DIR', REPO_DIR / 'public' / 'data'))

# Coordinate systems
STATE_PLANE = 3419        # Kansas North state plane, in US feet: used for every distance and area calculation
WGS84 = 4326              # longitude / latitude: used for every file the app loads

FEET_PER_MILE = 5280
SQUARE_FEET_PER_ACRE = 43560

# School years covered by the district's projections. Index 2 (2027-28) is the first year a new boundary applies.
SCHOOL_YEARS = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30', '2030-31', '2031-32', '2032-33', '2033-34', '2034-35']
FALL_2026 = SCHOOL_YEARS.index('2026-27')
FIRST_PLAN_YEAR = SCHOOL_YEARS.index('2027-28')
PLAN_YEARS = range(FIRST_PLAN_YEAR, len(SCHOOL_YEARS))

LEVELS = ('es', 'ms', 'hs')                           # elementary, middle, high
GRADES_BY_LEVEL = {'es': ['K', '1', '2', '3', '4', '5'], 'ms': ['6', '7', '8'], 'hs': ['9', '10', '11', '12']}
COORDINATE_DECIMALS = 6   # about 4 inches; every exported shape is rounded the same way so shared edges line up exactly


def ensure_output_folders() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)


def work_file(name: str) -> Path:
    return WORK_DIR / name


def app_file(name: str) -> Path:
    return APP_DATA_DIR / name
