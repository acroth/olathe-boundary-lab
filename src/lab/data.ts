import { fetchBin } from './bin';
// Loads the pipeline outputs from public/data.
export type Level = 'es' | 'ms' | 'hs';
export const LEVELS: Level[] = ['es', 'ms', 'hs'];
export const LEVEL_NAME: Record<Level, string> = { es: 'Elementary', ms: 'Middle', hs: 'High' };

export interface School {
  i: number; id: string; name: string; level: Level; code: string | null; lon: number; lat: number; node: number;
  address: string; capacity: number; capSource: string; util: number[]; fixed: number;
  neighborhood: number[]; factor: number[]; gradeShare: Record<string, number>;
  enroll2025: number; prek: number; immersion: number; area: string; neighbors: number[]; color: number;
}
export interface Meta {
  years: string[]; firstPlanYear: number; classSize: Record<string, number>; streetClasses: string[]; streetNames: string[];
  busMiles: number; target: number; sources: Record<string, string>; dataVersion?: string;
  homes: { count: number; layout: Col[] }; streets: { nodes: number; edges: number; layout: Col[] };
}
interface Col { name: string; type: string; offset: number; length: number }

export interface Homes {
  n: number; lon: Float32Array; lat: Float32Array; units: Float32Array; node: Uint32Array; offsetFt: Float32Array; isNew: Uint8Array;
  w: Record<Level, Float32Array>; orig: Record<Level, Uint8Array>;
}
export interface Streets {
  nNodes: number; nEdges: number; nodeLon: Float32Array; nodeLat: Float32Array;
  u: Uint32Array; v: Uint32Array; len: Float32Array; cls: Uint8Array; name: Uint16Array;
  coordOff: Uint32Array; coordLon: Float32Array; coordLat: Float32Array;
}
export interface Edit {
  id: string; level: Level; school: number;            // school index, -1 = unassigned
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  kind: 'draw' | 'trace' | 'blocks' | 'area' | 'preset'; faces?: number[]; ref?: string; label?: string; rev?: number;
}
export interface DistrictNumbers { firstYear: string; table: Record<string, number[]>; cap: Record<string, number>; enroll2026: Record<string, number>; pieces: { frm: string; to: string; n: number }[] }
export interface Preset { id: string; name: string; description: string; closures: Record<string, number>; edits: Edit[]; district?: DistrictNumbers }
export interface ComboPiece { to: string; school: number; geom: GeoJSON.Polygon | GeoJSON.MultiPolygon; model26: number; district: number | null }
export interface ComboConcept { id: number; summary: string; pieces: ComboPiece[] }
export interface ComboMove { id: string; frm: string; to: string; school: number; label: string; rule: string; geom: GeoJSON.Polygon | GeoJSON.MultiPolygon; model26: number }
export interface Combos { basePreset: string; schools: { name: string; i: number; concepts: ComboConcept[] }[]; moves: ComboMove[]; exclusive: string[][];
  district: { enroll2026: Record<string, number>; cap: Record<string, number> }; options: Record<string, number[]> }
export interface Static {
  meta: Meta; schools: School[]; homes: Homes; streets: Streets;
  zones: Record<Level, GeoJSON.FeatureCollection>; faces: GeoJSON.FeatureCollection; district: GeoJSON.FeatureCollection; planning: GeoJSON.FeatureCollection;
  presets: Preset[]; receivers: Record<string, number[]>; combos: Combos | null;
}

// data folder URL; the worker is given the page's base explicitly (its own location is under assets/)
let BASE = typeof document !== 'undefined' ? new URL('/data/', document.baseURI).href : '';
export const dataBase = () => BASE;
const TYPES: Record<string, any> = { float32: Float32Array, uint32: Uint32Array, uint16: Uint16Array, uint8: Uint8Array };
function cols(buf: ArrayBuffer, layout: Col[]) {
  const o: Record<string, any> = {};
  for (const c of layout) o[c.name] = new TYPES[c.type](buf, c.offset, c.length);
  return o;
}
const j = (f: string) => fetch(BASE + f).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
const b = (f: string) => fetchBin(BASE + f);

export async function loadStatic(base?: string): Promise<Static> {
  if (base) BASE = base;
  const [sj, pj, hb, sb, zes, zms, zhs, faces, district, planning] = await Promise.all([
    j('schools.json'), j('presets.json'), b('homes.bin'), b('streets.bin'),
    j('zones_es.geojson'), j('zones_ms.geojson'), j('zones_hs.geojson'), j('faces.geojson'), j('district.geojson'), j('planning_areas.geojson').catch(() => ({ type: 'FeatureCollection', features: [] }))]);
  const combos: Combos | null = await j('combos.json').catch(() => null);
  const meta: Meta = sj.meta;
  const h = cols(hb, meta.homes.layout), s = cols(sb, meta.streets.layout);
  const homes: Homes = {
    n: meta.homes.count, lon: h.lon, lat: h.lat, units: h.units, node: h.node, offsetFt: h.offset_ft, isNew: h.isNew,
    w: { es: h.w_es, ms: h.w_ms, hs: h.w_hs }, orig: { es: h.orig_es, ms: h.orig_ms, hs: h.orig_hs },
  };
  const streets: Streets = {
    nNodes: meta.streets.nodes, nEdges: meta.streets.edges, nodeLon: s.node_lon, nodeLat: s.node_lat,
    u: s.u, v: s.v, len: s.len_ft, cls: s.cls, name: s.name, coordOff: s.coord_off, coordLon: s.coord_lon, coordLat: s.coord_lat,
  };
  const presets: Preset[] = pj.presets.map((p: any) => ({
    ...p, edits: p.edits.map((e: any, k: number) => ({ id: `${p.id}-${k}`, level: e.level, school: e.school, geom: e.geom, kind: 'preset', label: e.label })),
  }));
  return { meta, schools: sj.schools, homes, streets, zones: { es: zes, ms: zms, hs: zhs }, faces, district, planning, presets, receivers: pj.receivers, combos };
}

/** Geometry for an 'area' edit reference: "p750" = planning area 750, "z<level>:<school index>" = that school's current boundary. */
export function areaGeom(S: Pick<Static, 'planning' | 'zones'>, ref: string): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (ref[0] === 'p') { const f = S.planning.features.find(f => String(f.properties!.pa) === ref.slice(1) && f.geometry.type !== 'Point'); return (f?.geometry as any) ?? null; }
  const [lv, i] = ref.slice(1).split(':'); const f = (S.zones as any)[lv]?.features.find((f: any) => f.properties.school === Number(i));
  return f?.geometry ?? null;
}
