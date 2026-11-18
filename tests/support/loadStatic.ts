// Loads public/data the way the app does, for tests (Node has no fetch of local files, so this reads them from disk).
import { existsSync, readFileSync } from 'fs';
import { applyCalibration } from '../../src/lab/calibration';
import type { Static } from '../../src/lab/data';

const DATA_DIR = new URL('../../public/data/', import.meta.url).pathname;
const TYPED_ARRAYS: Record<string, any> = { float32: Float32Array, uint32: Uint32Array, uint16: Uint16Array, uint8: Uint8Array };

export const readJson = (file: string) => JSON.parse(readFileSync(DATA_DIR + file, 'utf8'));

function readColumns(file: string, layout: { name: string; type: string; offset: number; length: number }[]) {
  const bytes = readFileSync(DATA_DIR + file);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return Object.fromEntries(layout.map(column => [column.name, new TYPED_ARRAYS[column.type](buffer, column.offset, column.length)]));
}

export function loadStatic({ calibrated = true } = {}): Static {
  const schoolsFile = readJson('schools.json'), presetsFile = readJson('presets.json');
  const meta = schoolsFile.meta;
  const homes: any = readColumns('homes.bin', meta.homes.layout);
  const streets: any = readColumns('streets.bin', meta.streets.layout);
  const homeColumns = { n: meta.homes.count, lon: homes.lon, lat: homes.lat, units: homes.units, node: homes.node, offsetFt: homes.offset_ft, isNew: homes.isNew,
                        w: { es: homes.w_es, ms: homes.w_ms, hs: homes.w_hs }, orig: { es: homes.orig_es, ms: homes.orig_ms, hs: homes.orig_hs } };
  if (calibrated && existsSync(DATA_DIR + 'calibration.json')) applyCalibration(schoolsFile.schools, homeColumns, readJson('calibration.json'));
  return {
    meta, schools: schoolsFile.schools,
    homes: homeColumns,
    streets: { nNodes: meta.streets.nodes, nEdges: meta.streets.edges, nodeLon: streets.node_lon, nodeLat: streets.node_lat, u: streets.u, v: streets.v,
               len: streets.len_ft, cls: streets.cls, name: streets.name, coordOff: streets.coord_off, coordLon: streets.coord_lon, coordLat: streets.coord_lat },
    zones: { es: readJson('zones_es.geojson'), ms: readJson('zones_ms.geojson'), hs: readJson('zones_hs.geojson') },
    faces: readJson('faces.geojson'), district: readJson('district.geojson'),
    presets: presetsFile.presets.map((preset: any) => ({ ...preset, edits: preset.edits.map((edit: any, k: number) => ({ ...edit, id: preset.id + k, kind: 'preset' })) })),
    receivers: presetsFile.receivers, combos: readJson('combos.json'),
  } as Static;
}
