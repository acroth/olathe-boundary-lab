import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { Engine } from '../src/lab/model/engine';
import { buildPlan, defaultMoves, districtCheck } from '../src/lab/ui/Builder';
const D = new URL('../public/data/', import.meta.url).pathname;
const J = (f: string) => JSON.parse(readFileSync(D + f, 'utf8'));
const B = (f: string) => { const b = readFileSync(D + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const T: any = { float32: Float32Array, uint32: Uint32Array, uint16: Uint16Array, uint8: Uint8Array };
const cols = (buf: ArrayBuffer, lay: any[]) => Object.fromEntries(lay.map(c => [c.name, new T[c.type](buf, c.offset, c.length)]));
it.skipIf(!process.env.VERIFY)('option builder reproduces the district options', () => {
  const sj = J('schools.json'), pj = J('presets.json'), C = J('combos.json');
  const h: any = cols(B('homes.bin'), sj.meta.homes.layout), s: any = cols(B('streets.bin'), sj.meta.streets.layout);
  const S: any = { meta: sj.meta, schools: sj.schools, homes: { n: sj.meta.homes.count, lon: h.lon, lat: h.lat, units: h.units, node: h.node, offsetFt: h.offset_ft, isNew: h.isNew, w: { es: h.w_es, ms: h.w_ms, hs: h.w_hs }, orig: { es: h.orig_es, ms: h.orig_ms, hs: h.orig_hs } },
    streets: { nNodes: sj.meta.streets.nodes, nEdges: sj.meta.streets.edges, nodeLon: s.node_lon, nodeLat: s.node_lat, u: s.u, v: s.v, len: s.len_ft, cls: s.cls, name: s.name, coordOff: s.coord_off, coordLon: s.coord_lon, coordLat: s.coord_lat },
    zones: { es: J('zones_es.geojson'), ms: J('zones_ms.geojson'), hs: J('zones_hs.geojson') }, faces: J('faces.geojson'), district: J('district.geojson'),
    presets: pj.presets.map((p: any) => ({ ...p, edits: p.edits.map((e: any, k: number) => ({ ...e, id: p.id + k, kind: 'preset' })) })), receivers: pj.receivers, combos: C };
  const E = new Engine(S);
  for (const [k, sel] of Object.entries(C.options) as [string, number[]][]) {
    const mv = defaultMoves(C, sel);
    const a = E.run('es', { ...buildPlan(S, sel, null), includePreK: true } as any, true);
    const p = S.presets.find((x: any) => x.id === 'dc' + k);
    const b = E.run('es', { closures: p.closures, edits: p.edits, includePreK: true } as any, false);
    let diff = 0; const where: Record<string, number> = {}; for (let i = 0; i < a.assign.length; i++) if (a.assign[i] !== b.assign[i]) { diff += S.homes.w.es[i]; const k = S.schools[S.homes.orig.es[i]].name + ": builder " + (S.schools[a.assign[i]]?.name ?? a.assign[i]) + " vs preset " + (S.schools[b.assign[i]]?.name ?? b.assign[i]); where[k] = (where[k] ?? 0) + S.homes.w.es[i]; } if (diff > 0.05) console.log(JSON.stringify(where));
    const pieces = Object.values(a.schools).filter((r: any) => r.open && r.pieces > 1).map((r: any) => S.schools[r.i].name + ' ' + r.pieces);
    console.log(`option ${k}: moves ${Object.keys(mv).filter(x => mv[x]).join(',')} | weight differing from dc${k}: ${diff.toFixed(1)} | multi-piece: ${pieces.join(', ') || 'none'} | district basis top: ${districtCheck(C, sel, mv).slice(0, 3).map(r => r.name + ' ' + (r.u * 100).toFixed(1) + '%').join(', ')}`);
    expect(diff).toBeLessThan(1);
  }
  // a custom mix
  for (const sel of [[1, 1, 1, 3, 2], [2, 2, 3, 3, 3], [3, 2, 1, 3, 3], [4, 2, 1, 3, 2], [1, 1, 3, 2, 1]]) {
    const r = E.run('es', { ...buildPlan(S, sel, null), includePreK: true } as any, true);
    const un = Object.values(r.schools).reduce((t: number, x: any) => t + x.unassignedOwn, 0);
    const pcs = Object.values(r.schools).filter((x: any) => x.open && x.pieces > 1).map((x: any) => S.schools[x.i].name);
    const top = Object.values(r.schools).filter((x: any) => x.open).sort((x: any, y: any) => y.peak - x.peak).slice(0, 3).map((x: any) => S.schools[x.i].name + ' ' + (x.peak * 100).toFixed(1) + '%');
    console.log(`mix ${sel.join('.')}: unassigned ${(un as number).toFixed(1)}, multi-piece [${pcs.join(', ')}], model peaks ${top.join(', ')}`);
  }
});
