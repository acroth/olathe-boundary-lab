"""Publish the app's data files to Supabase (Postgres + PostGIS) as a new data version.

Usage (from the repo root, after the pipeline has written public/data):
    export DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
    python pipeline/src/publish_supabase.py [--version 2026-11-18.1] [--notes "..."] [--current] [--dry-run]

Reads public/data/*.json|geojson|bin and pipeline/src/district_tables.py. Writes one row set per table tagged with the
version, and stamps meta.dataVersion into public/data/schools.json so the app and its saved plans know which data they use.
Run the migration in supabase/migrations first. Use the session pooler (port 5432) or a direct connection, not the
transaction pooler, because this uses COPY.
"""
import argparse, datetime, io, json, os, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'public' / 'data'
sys.path.insert(0, str(Path(__file__).parent))
import district_tables as DT  # noqa: E402

def load(name): return json.loads((DATA / name).read_text())

def multipolygon(geom):
    """GeoJSON geometry as a MultiPolygon GeoJSON string (PostGIS column type)."""
    if geom['type'] == 'Polygon': geom = {'type': 'MultiPolygon', 'coordinates': [geom['coordinates']]}
    return json.dumps(geom, separators=(',', ':'))

def homes_rows(meta):
    buf = (DATA / 'homes.bin').read_bytes()
    T = {'float32': np.float32, 'uint32': np.uint32, 'uint16': np.uint16, 'uint8': np.uint8}
    c = {l['name']: np.frombuffer(buf, dtype=T[l['type']], count=l['length'], offset=l['offset']) for l in meta['homes']['layout']}
    for k in range(meta['homes']['count']):
        yield (k, f"SRID=4326;POINT({c['lon'][k]:.6f} {c['lat'][k]:.6f})", float(c['units'][k]), bool(c['isNew'][k]),
               float(c['w_es'][k]), float(c['w_ms'][k]), float(c['w_hs'][k]),
               int(c['orig_es'][k]), int(c['orig_ms'][k]), int(c['orig_hs'][k]), int(c['node'][k]), float(c['offset_ft'][k]))

def copy(cur, table, cols, rows, version):
    """COPY rows (tuples without the version column) into table."""
    out = io.StringIO(); n = 0
    def fmt(v):
        if v is None: return r'\N'
        if isinstance(v, bool): return 't' if v else 'f'
        if isinstance(v, (list, tuple)): return '{' + ','.join(str(x) for x in v) + '}'
        return str(v).replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n')
    for r in rows:
        out.write('\t'.join(fmt(v) for v in (version, *r)) + '\n'); n += 1
    out.seek(0)
    if cur is not None:
        with cur.copy(f"COPY {table} (version, {', '.join(cols)}) FROM STDIN") as cp:
            while chunk := out.read(1 << 20): cp.write(chunk)
    return n

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--version', default=datetime.date.today().isoformat() + '.1')
    ap.add_argument('--notes', default=None)
    ap.add_argument('--current', action='store_true', help='make this the current data version')
    ap.add_argument('--dry-run', action='store_true', help='build every row but write nothing')
    a = ap.parse_args()

    sj = load('schools.json'); meta = sj['meta']
    S = sj['schools']
    tables = {
        'schools': (['i', 'id', 'level', 'name', 'capacity', 'prek', 'immersion', 'neighborhood', 'location', 'props'],
                    [(s['i'], s['id'], s['level'], s['name'], s['capacity'], s.get('prek', 0), s.get('immersion', 0), s['neighborhood'],
                      f"SRID=4326;POINT({s['lon']} {s['lat']})",
                      json.dumps({k: v for k, v in s.items() if k not in ('i', 'id', 'level', 'name', 'capacity', 'prek', 'immersion', 'neighborhood', 'lon', 'lat')}))
                     for s in S]),
        'zones': (['level', 'school_i', 'geom'],
                  [(lv, f['properties']['school'], multipolygon(f['geometry']))
                   for lv in ('es', 'ms', 'hs') for f in load(f'zones_{lv}.geojson')['features']]),
        'planning_areas': (['pa', 'school', 'es', 'ms', 'hs', 'label', 'geom'],
                           [(str(f['properties']['pa']), f['properties']['school'], f['properties']['es'], f['properties']['ms'], f['properties']['hs'],
                             f"SRID=4326;POINT({f['properties']['lon']} {f['properties']['lat']})", multipolygon(f['geometry']))
                            for f in load('planning_areas.geojson')['features'] if f['geometry']['type'] != 'Point']),
        'homes': (['idx', 'geom', 'units', 'is_new', 'w_es', 'w_ms', 'w_hs', 'orig_es', 'orig_ms', 'orig_hs', 'node', 'offset_ft'], homes_rows(meta)),
        'district_tables': (['option', 'school', 'totals'], [(o, n, v) for o, t in DT.TABLE.items() for n, v in t.items()]),
        'district_pieces': (['option', 'from_school', 'to_school', 'students'], [(o, f, t, n) for o, rows in DT.PIECES.items() for f, t, n in rows]),
        'district_schools': (['school', 'capacity', 'enroll_2026'], [(n, DT.CAP[n], DT.ENROLL_2026[n]) for n in DT.CAP]),
        'documents': (['name', 'body'], [('presets', json.dumps(load('presets.json'), separators=(',', ':'))),
                                          ('combos', json.dumps(load('combos.json'), separators=(',', ':')))]),
    }

    conn = cur = None
    if not a.dry_run:
        import psycopg
        url = os.environ.get('DATABASE_URL')
        if not url: sys.exit('Set DATABASE_URL (Supabase session pooler or direct connection string).')
        conn = psycopg.connect(url); cur = conn.cursor()
        cur.execute('delete from data_versions where version = %s', (a.version,))   # republishing a version replaces it
        cur.execute('insert into data_versions (version, notes) values (%s, %s)', (a.version, a.notes))
    GEOJSON = {'zones', 'planning_areas'}   # polygons arrive as GeoJSON text; points as EWKT, which COPY takes directly
    for table, (cols, rows) in tables.items():
        if table in GEOJSON and cur is not None:
            tmp = f'_stage_{table}'
            cur.execute(f'create temp table {tmp} (like {table}) on commit drop')
            cur.execute(f'alter table {tmp} alter column geom type text')
            n = copy(cur, tmp, cols, rows, a.version)
            sel = ', '.join(['version', *('st_multi(st_setsrid(st_geomfromgeojson(geom), 4326))' if c == 'geom' else c for c in cols)])
            cur.execute(f"insert into {table} (version, {', '.join(cols)}) select {sel} from {tmp}")
        else:
            n = copy(cur, table, cols, rows, a.version)
        print(f'{table:17} {n:6d} rows')
    if cur is not None:
        if a.current:
            cur.execute('update data_versions set is_current = false where is_current')
            cur.execute('update data_versions set is_current = true where version = %s', (a.version,))
        conn.commit(); conn.close()
    # the app reads its version from schools.json
    meta['dataVersion'] = a.version
    if not a.dry_run:
        (DATA / 'schools.json').write_text(json.dumps(sj, separators=(',', ':')))
    print(('dry run: nothing written; ' if a.dry_run else 'published ') + f'version {a.version}' + (' (current)' if a.current and not a.dry_run else ''))

if __name__ == '__main__':
    main()
