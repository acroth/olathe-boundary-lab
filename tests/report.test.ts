import { it } from 'vitest';
import { readFileSync } from 'fs';
import { Engine } from '../src/lab/model/engine';
const D = new URL('../public/data/', import.meta.url).pathname;
const J = (f: string) => JSON.parse(readFileSync(D + f, 'utf8'));
const B = (f: string) => { const b = readFileSync(D + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const T: any = { float32: Float32Array, uint32: Uint32Array, uint16: Uint16Array, uint8: Uint8Array };
const cols = (buf: ArrayBuffer, lay: any[]) => Object.fromEntries(lay.map(c => [c.name, new T[c.type](buf, c.offset, c.length)]));
it.skipIf(!process.env.REPORT)('report', () => {
  const sj = J('schools.json'), pj = J('presets.json');
  const h: any = cols(B('homes.bin'), sj.meta.homes.layout), s: any = cols(B('streets.bin'), sj.meta.streets.layout);
  const S: any = { meta: sj.meta, schools: sj.schools, homes: { n: sj.meta.homes.count, lon: h.lon, lat: h.lat, units: h.units, node: h.node, offsetFt: h.offset_ft, isNew: h.isNew, w: { es: h.w_es, ms: h.w_ms, hs: h.w_hs }, orig: { es: h.orig_es, ms: h.orig_ms, hs: h.orig_hs } },
    streets: { nNodes: sj.meta.streets.nodes, nEdges: sj.meta.streets.edges, nodeLon: s.node_lon, nodeLat: s.node_lat, u: s.u, v: s.v, len: s.len_ft, cls: s.cls, name: s.name, coordOff: s.coord_off, coordLon: s.coord_lon, coordLat: s.coord_lat },
    zones: { es: J('zones_es.geojson'), ms: J('zones_ms.geojson'), hs: J('zones_hs.geojson') }, faces: J('faces.geojson'), district: J('district.geojson'), presets: pj.presets, receivers: pj.receivers };
  const E = new Engine(S);
  for (const id of ['seA', 'seB']) for (const pk of [true, false]) {
    const p = pj.presets.find((x: any) => x.id === id);
    const r = E.run('es', { closures: p.closures, edits: p.edits.map((e: any, k: number) => ({ ...e, id: id + k, kind: 'preset' })), includePreK: pk }, false);
    const ring = ['Briarwood', 'Havencroft', 'Madison Place', 'Brougham', 'Sunnyside', 'Green Springs', 'Indian Creek', 'Arbor Creek'];
    console.log(id, pk ? 'PreK' : 'K5', ring.map(n => { const sc = S.schools.find((x: any) => x.name === n && x.level === 'es'); return n + ' ' + (r.schools[sc.i].peak * 100).toFixed(1); }).join(', '));
  }
});
