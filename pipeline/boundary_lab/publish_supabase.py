"""Publish the app's data files to Supabase (Postgres + PostGIS) as a new data version.

    export DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
    python -m boundary_lab.publish_supabase [--version 2026-11-18.1] [--notes "..."] [--current] [--dry-run]

Run from the pipeline folder after the pipeline has written public/data, and after the migrations in supabase/migrations.
Every table gets one set of rows tagged with the version, so new data never breaks saved plans. The version is also stamped
into public/data/schools.json (meta.dataVersion) so the app and its saved plans know which data they use.

Use Supabase's session pooler (port 5432) or a direct connection, not the transaction pooler: this uses COPY.
"""
import argparse
import datetime
import io
import json
import os
import sys

import numpy as np

from . import district
from .settings import app_file

NUMPY_TYPES = {'float32': np.float32, 'uint32': np.uint32, 'uint16': np.uint16, 'uint8': np.uint8}
POLYGON_TABLES = {'zones', 'planning_areas'}   # shapes arrive as GeoJSON text and are converted in the database


def load(name: str):
    return json.load(open(app_file(name)))


def as_multipolygon_json(geometry: dict) -> str:
    """Every polygon column is MultiPolygon in the database."""
    if geometry['type'] == 'Polygon':
        geometry = {'type': 'MultiPolygon', 'coordinates': [geometry['coordinates']]}
    return json.dumps(geometry, separators=(',', ':'))


def point(longitude: float, latitude: float) -> str:
    return f'SRID=4326;POINT({longitude} {latitude})'


def school_rows(schools: list[dict]):
    stored_separately = {'i', 'id', 'level', 'name', 'capacity', 'prek', 'immersion', 'neighborhood', 'lon', 'lat'}
    for school in schools:
        other_fields = {key: value for key, value in school.items() if key not in stored_separately}
        yield (school['i'], school['id'], school['level'], school['name'], school['capacity'], school.get('prek', 0),
               school.get('immersion', 0), school['neighborhood'], point(school['lon'], school['lat']), json.dumps(other_fields))


def home_rows(meta: dict):
    """One row per home from homes.bin (layout in meta)."""
    buffer = open(app_file('homes.bin'), 'rb').read()
    column = {entry['name']: np.frombuffer(buffer, dtype=NUMPY_TYPES[entry['type']], count=entry['length'], offset=entry['offset'])
              for entry in meta['homes']['layout']}
    for home in range(meta['homes']['count']):
        yield (home, f'SRID=4326;POINT({column["lon"][home]:.6f} {column["lat"][home]:.6f})', float(column['units'][home]),
               bool(column['isNew'][home]), float(column['w_es'][home]), float(column['w_ms'][home]), float(column['w_hs'][home]),
               int(column['orig_es'][home]), int(column['orig_ms'][home]), int(column['orig_hs'][home]), int(column['node'][home]),
               float(column['offset_ft'][home]))


def table_rows(schools: list[dict], meta: dict) -> dict[str, tuple[list[str], object]]:
    """{table: (columns, rows)} for every table, rows without the version column."""
    zones = [(level, feature['properties']['school'], as_multipolygon_json(feature['geometry']))
             for level in ('es', 'ms', 'hs') for feature in load(f'zones_{level}.geojson')['features']]
    planning_areas = [(str(props['pa']), props['school'], props['es'], props['ms'], props['hs'], point(props['lon'], props['lat']),
                       as_multipolygon_json(feature['geometry']))
                      for feature in load('planning_areas.geojson')['features'] if feature['geometry']['type'] != 'Point'
                      for props in [feature['properties']]]
    return {
        'schools': (['i', 'id', 'level', 'name', 'capacity', 'prek', 'immersion', 'neighborhood', 'location', 'props'], school_rows(schools)),
        'zones': (['level', 'school_i', 'geom'], zones),
        'planning_areas': (['pa', 'school', 'es', 'ms', 'hs', 'label', 'geom'], planning_areas),
        'homes': (['idx', 'geom', 'units', 'is_new', 'w_es', 'w_ms', 'w_hs', 'orig_es', 'orig_ms', 'orig_hs', 'node', 'offset_ft'], home_rows(meta)),
        'district_tables': (['option', 'school', 'totals'],
                            [(option, school, totals) for option, table in district.OPTION_FIVE_YEAR_ESTIMATES.items() for school, totals in table.items()]),
        'district_pieces': (['option', 'from_school', 'to_school', 'students'],
                            [(option, source, receiver, students) for option, rows in district.OPTION_STUDENTS_MOVING.items()
                             for source, receiver, students in rows]),
        'district_schools': (['school', 'capacity', 'enroll_2026'],
                             [(name, capacity, district.ENROLLMENT_FALL_2026[name]) for name, capacity in district.FUNCTIONAL_CAPACITY.items()]),
        'documents': (['name', 'body'], [(name, json.dumps(load(f'{name}.json'), separators=(',', ':'))) for name in ('presets', 'combos')]),
    }


def copy_text(value) -> str:
    """One value in Postgres COPY text format."""
    if value is None:
        return r'\N'
    if isinstance(value, bool):
        return 't' if value else 'f'
    if isinstance(value, (list, tuple)):
        return '{' + ','.join(str(item) for item in value) + '}'
    return str(value).replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n')


def copy_rows(cursor, table: str, columns: list[str], rows, version: str) -> int:
    """COPY rows into a table (or just count them when cursor is None)."""
    text = io.StringIO()
    count = 0
    for row in rows:
        text.write('\t'.join(copy_text(value) for value in (version, *row)) + '\n')
        count += 1
    text.seek(0)
    if cursor is not None:
        with cursor.copy(f'COPY {table} (version, {", ".join(columns)}) FROM STDIN') as copy:
            while chunk := text.read(1 << 20):
                copy.write(chunk)
    return count


def copy_polygons(cursor, table: str, columns: list[str], rows, version: str) -> int:
    """Polygons go through a temporary text table and are converted with ST_GeomFromGeoJSON."""
    staging = f'_stage_{table}'
    cursor.execute(f'create temp table {staging} (like {table}) on commit drop')
    cursor.execute(f'alter table {staging} alter column geom type text')
    count = copy_rows(cursor, staging, columns, rows, version)
    converted = ', '.join(['version'] + ['st_multi(st_setsrid(st_geomfromgeojson(geom), 4326))' if column == 'geom' else column for column in columns])
    cursor.execute(f'insert into {table} (version, {", ".join(columns)}) select {converted} from {staging}')
    return count


def main() -> None:
    arguments = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    arguments.add_argument('--version', default=datetime.date.today().isoformat() + '.1')
    arguments.add_argument('--notes', default=None)
    arguments.add_argument('--current', action='store_true', help='make this the current data version')
    arguments.add_argument('--dry-run', action='store_true', help='build every row but write nothing')
    options = arguments.parse_args()

    schools_file = load('schools.json')
    connection = cursor = None
    if not options.dry_run:
        import psycopg
        url = os.environ.get('DATABASE_URL')
        if not url:
            sys.exit('Set DATABASE_URL (Supabase session pooler or direct connection string).')
        connection = psycopg.connect(url)
        cursor = connection.cursor()
        cursor.execute('delete from data_versions where version = %s', (options.version,))   # republishing a version replaces it
        cursor.execute('insert into data_versions (version, notes) values (%s, %s)', (options.version, options.notes))

    for table, (columns, rows) in table_rows(schools_file['schools'], schools_file['meta']).items():
        writer = copy_polygons if table in POLYGON_TABLES and cursor is not None else copy_rows
        print(f'{table:17} {writer(cursor, table, columns, rows, options.version):6d} rows')

    if cursor is not None:
        if options.current:
            cursor.execute('update data_versions set is_current = false where is_current')
            cursor.execute('update data_versions set is_current = true where version = %s', (options.version,))
        connection.commit()
        connection.close()
        schools_file['meta']['dataVersion'] = options.version
        json.dump(schools_file, open(app_file('schools.json'), 'w'), separators=(',', ':'))
    print(('dry run: nothing written; ' if options.dry_run else 'published ') + f'version {options.version}'
          + (' (current)' if options.current and not options.dry_run else ''))


if __name__ == '__main__':
    main()
