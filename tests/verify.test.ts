import { it } from 'vitest';
import { readFileSync } from 'fs';
import { Engine } from '../src/lab/model/engine';
import { polyAcres } from '../src/lab/model/geo';
const D = new URL('../public/data/', import.meta.url).pathname;
const J = (f: string) => JSON.parse(readFileSync(D + f, 'utf8'));
const B = (f: string) => { const b = readFileSync(D + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const T: any = { float32: Float32Array, uint32: Uint32Array, uint16: Uint16Array, uint8: Uint8Array };
const cols = (buf: ArrayBuffer, lay: any[]) => Object.fromEntries(lay.map(c => [c.name, new T[c.type](buf, c.offset, c.length)]));
it.skipIf(!process.env.VERIFY)('verify optimized plans', () => {
  const sj = J('schools.json'), pj = J('presets.json');
  const h: any = cols(B('homes.bin'), sj.meta.homes.layout), s: any = cols(B('streets.bin'), sj.meta.streets.layout);
  const S: any = { meta: sj.meta, schools: sj.schools, homes: { n: sj.meta.homes.count, lon: h.lon, lat: h.lat, units: h.units, node: h.node, offsetFt: h.offset_ft, isNew: h.isNew, w: { es: h.w_es, ms: h.w_ms, hs: h.w_hs }, orig: { es: h.orig_es, ms: h.orig_ms, hs: h.orig_hs } },
    streets: { nNodes: sj.meta.streets.nodes, nEdges: sj.meta.streets.edges, nodeLon: s.node_lon, nodeLat: s.node_lat, u: s.u, v: s.v, len: s.len_ft, cls: s.cls, name: s.name, coordOff: s.coord_off, coordLon: s.coord_lon, coordLat: s.coord_lat },
    zones: { es: J('zones_es.geojson'), ms: J('zones_ms.geojson'), hs: J('zones_hs.geojson') }, faces: J('faces.geojson'), district: J('district.geojson'), presets: pj.presets, receivers: pj.receivers };
  const E = new Engine(S);
  for (const id of ['dc1', 'dc2', 'dc3', 'dc4']) {
    const p = pj.presets.find((x: any) => x.id === id);
    const plan = { closures: p.closures, edits: p.edits.map((e: any, k: number) => ({ ...e, id: id + k, kind: 'preset' })), includePreK: true };
    const r = E.run('es', plan, true);
    const a = r.assign; let maxMi = 0, stuOver = 0, stuMoved = 0, kidsHomesOver = 0;
    for (let i = 0; i < a.length; i++) {
      const o = S.homes.orig.es[i]; if (a[i] < 0 || a[i] === o) continue;
      const mi = E.miles(i, a[i]); const st = S.homes.w.es[i] * S.schools[o].factor[2];
      stuMoved += st; if (mi > 2.5) { stuOver += st; if (st > 0.01) kidsHomesOver++; }
      if (st > 0.01 && mi > maxMi) maxMi = mi;
    }
    const names = ['Arbor Creek', 'Bentwood', 'Briarwood', 'Brougham', 'Countryside', 'Green Springs', 'Havencroft', 'Heatherstone', 'Indian Creek', 'Madison Place', 'Pleasant Ridge', 'Regency Place', 'Sunnyside'];
    console.log(`\n${id}: unassigned ${r.summary.unassignedStudents.toFixed(0)} (Walnut Grove ${S.schools.find((x: any) => x.name === 'Walnut Grove').neighborhood[2].toFixed(0)}), moved ${stuMoved.toFixed(0)}, avg trip ${r.summary.avgTripMi.toFixed(2)} mi, students >2.5 mi ${stuOver.toFixed(0)} (${kidsHomesOver} homes), farthest home with kids ${maxMi.toFixed(2)} mi`);
    for (const n of names) { const sc = S.schools.find((x: any) => x.name === n && x.level === 'es'); const t = r.schools[sc.i]; const raw = E.zones('es', plan).get(sc.i)!; const small = raw.map((q: any) => polyAcres(q)).sort((x: number, y: number) => y - x).slice(1, 4).map((v: number) => v.toFixed(2)).join('/'); console.log(`  ${n}: other raw parts(ac) [${small}] peak ${(t.peak * 100).toFixed(1)}% (${S.meta.years[t.peakYear]}), pieces ${t.pieces}, +${t.fromClosed.toFixed(0)} from closing`); }
  }
});
