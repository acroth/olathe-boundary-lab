import { describe, it, expect, beforeAll } from 'vitest';
import { polyAcres } from '../src/lab/model/geo';
import { readFileSync } from 'fs';
import { Engine, clipStats } from '../src/lab/model/engine';
import { LEVELS, type Static } from '../src/lab/data';

const D = new URL('../public/data/', import.meta.url).pathname;
const J = (f: string) => JSON.parse(readFileSync(D + f, 'utf8'));
const B = (f: string) => { const b = readFileSync(D + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const T: any = { float32: Float32Array, uint32: Uint32Array, uint16: Uint16Array, uint8: Uint8Array };
const cols = (buf: ArrayBuffer, lay: any[]) => Object.fromEntries(lay.map(c => [c.name, new T[c.type](buf, c.offset, c.length)]));

let S: Static, E: Engine;
beforeAll(() => {
  const sj = J('schools.json'), pj = J('presets.json');
  const h: any = cols(B('homes.bin'), sj.meta.homes.layout), s: any = cols(B('streets.bin'), sj.meta.streets.layout);
  S = {
    meta: sj.meta, schools: sj.schools,
    homes: { n: sj.meta.homes.count, lon: h.lon, lat: h.lat, units: h.units, node: h.node, offsetFt: h.offset_ft, isNew: h.isNew, w: { es: h.w_es, ms: h.w_ms, hs: h.w_hs }, orig: { es: h.orig_es, ms: h.orig_ms, hs: h.orig_hs } },
    streets: { nNodes: sj.meta.streets.nodes, nEdges: sj.meta.streets.edges, nodeLon: s.node_lon, nodeLat: s.node_lat, u: s.u, v: s.v, len: s.len_ft, cls: s.cls, name: s.name, coordOff: s.coord_off, coordLon: s.coord_lon, coordLat: s.coord_lat },
    zones: { es: J('zones_es.geojson'), ms: J('zones_ms.geojson'), hs: J('zones_hs.geojson') }, faces: J('faces.geojson'), district: J('district.geojson'),
    presets: pj.presets.map((p: any) => ({ ...p, edits: p.edits.map((e: any, k: number) => ({ ...e, id: p.id + k, kind: 'preset' })) })), receivers: pj.receivers,
  };
  E = new Engine(S);
});

describe('engine', () => {
  it('current plan reproduces each school projection', () => {
    for (const lv of LEVELS) {
      const r = E.run(lv, { closures: {}, edits: [] }, false);
      for (const s of S.schools.filter(x => x.level === lv)) {
        for (const y of [2, 5, 9]) expect(r.schools[s.i].students[y]).toBeCloseTo(s.neighborhood[y], 0);
        const u = r.schools[s.i].util[2];
        const expected = (s.neighborhood[2] + (s.name === 'Black Bob' ? s.immersion : 0) + s.prek) / s.capacity;
        expect(u).toBeCloseTo(expected, 3);
      }
      expect(r.summary.unassignedStudents).toBeCloseTo(0, 3);
    }
  });
  it('district preset leaves closing areas unassigned', () => {
    const p = S.presets.find(p => p.id === 'district')!;
    const r = E.run('es', p, true);
    const closedOpenOnly = ['Black Bob', 'Heritage', 'Scarborough', 'Tomahawk', 'Walnut Grove'];
    const exp = S.schools.filter(s => closedOpenOnly.includes(s.name) && s.level === 'es').reduce((a, s) => a + s.neighborhood[2], 0);
    console.log('es unassigned', r.summary.unassignedStudents.toFixed(1), 'expected', exp.toFixed(1));
    expect(Math.abs(r.summary.unassignedStudents - exp)).toBeLessThan(exp * 0.03);
    const nv = S.schools.find(s => s.name === 'Northview')!, fv = S.schools.find(s => s.name === 'Fairview')!;
    console.log('Northview 2028-29 util', (r.schools[nv.i].util[3] * 100).toFixed(1), 'pieces', r.schools[nv.i].pieces, 'Fairview+Northview', (nv.neighborhood[3] + fv.neighborhood[3]).toFixed(0), r.schools[nv.i].students[3].toFixed(0));
  });
  it('southeast plans', () => {
    for (const id of ['seA', 'seB']) {
      const p = S.presets.find(p => p.id === id)!;
      const t0 = performance.now();
      const r = E.run('es', p, true);
      const ring = ['Brougham', 'Green Springs', 'Havencroft', 'Madison Place', 'Sunnyside', 'Briarwood', 'Indian Creek', 'Arbor Creek'];
      const out = ring.map(n => { const s = S.schools.find(x => x.name === n && x.level === 'es')!; const t = r.schools[s.i]; return `${n} ${(t.peak * 100).toFixed(1)}% (${S.meta.years[t.peakYear]}) pcs ${t.pieces}`; });
      console.log(id, Math.round(performance.now() - t0) + 'ms', 'unassigned', r.summary.unassignedStudents.toFixed(0), 'avg', r.summary.avgTripMi.toFixed(2), '>2.5', (r.summary.over25Share * 100).toFixed(1) + '%\n  ' + out.join('\n  '));
    }
  });
});
describe('distances', () => {
  it('finite for homes', () => {
    const s = S.schools.find(x => x.name === 'Havencroft')!;
    const d = E.distTo(s.i); let inf = 0; const bad: number[] = [];
    for (let i = 0; i < S.homes.n; i++) if (!isFinite(d[S.homes.node[i]])) { inf++; if (bad.length < 3) bad.push(i); }
    let infN = 0; for (let k = 0; k < d.length; k++) if (!isFinite(d[k])) infN++;
    console.log('inf homes', inf, 'inf nodes', infN, 'of', d.length, 'school node', s.node, bad.map(i => [S.homes.lon[i], S.homes.lat[i], S.homes.node[i]]));
  });
});
describe('breakdown', () => {
  it('seA by origin', () => {
    const p = S.presets.find(p => p.id === 'seA')!;
    const a = E.assign('es', p); const h = S.homes; const m = new Map<string, number>();
    for (let i = 0; i < h.n; i++) { const s = a[i], o = h.orig.es[i]; if (s < 0 || s === o) continue; const k = S.schools[o].name + '->' + S.schools[s].name; m.set(k, (m.get(k) ?? 0) + h.w.es[i] * S.schools[o].factor[0]); }
    console.log([...m].sort().map(([k, v]) => k + ' ' + v.toFixed(0)).join('\n'));
  });
});
describe('zones debug', () => {
  it('seB unassigned area and diff', () => {

    const pB = S.presets.find(p => p.id === (process.env.PID || 'seB'))!, pA = S.presets.find(p => p.id === 'seA')!;
    const z = E.zones('es', pB);
    console.log('polys', (z.get(-1) ?? []).map((p: any) => polyAcres(p).toFixed(0) + '@' + p[0][0].map((v: number) => v.toFixed(3)).join(',')).join(' '));
    console.log('clip', JSON.stringify(clipStats));
    console.log('unassigned acres', (z.get(-1) ?? []).reduce((a: number, p: any) => a + polyAcres(p), 0).toFixed(0), 'polys', (z.get(-1) ?? []).length);
    const a = E.assign('es', pA), b = E.assign('es', pB); const m = new Map<string, number>();
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { const k = (a[i] < 0 ? 'U' : S.schools[a[i]].name) + '|' + (b[i] < 0 ? 'U' : S.schools[b[i]].name) + '|orig ' + S.schools[S.homes.orig.es[i]].name; m.set(k, (m.get(k) ?? 0) + 1); }
    console.log([...m].sort((x, y) => y[1] - x[1]).slice(0, 15));
  });
});
describe('slits', () => {
  it('zone rings', () => {
    for (const id of ['seA', 'seB']) {
      const z = E.zones('es', S.presets.find(p => p.id === id)!);
      const gs = S.schools.find(s => s.name === 'Green Springs')!;
      const mp = z.get(gs.i)!; const holes = mp.flatMap(p => p.slice(1)).map(h => polyAcres([h]));
      console.log(id, 'GS polys', mp.length, 'holes', holes.length, 'tiny holes(<0.05ac)', holes.filter(a => a < 0.05).length, 'pieces>2ac', mp.filter(p => polyAcres(p) > 2).length);
    }
  });
});
describe('dump', () => {
  it.skipIf(!process.env.DUMP)('dump zones', () => {
    (globalThis as any).NOCLEAN = !!process.env.NOCLEAN;
    const r = E.run('es', S.presets.find(p => p.id === (process.env.PID || 'seB'))!);
    const fs = require('fs');
    fs.writeFileSync('/tmp/zB.geojson', JSON.stringify({ type: 'FeatureCollection', features: r.zones.features.map((f: any) => ({ ...f, properties: { s: f.properties.school, name: f.properties.school >= 0 ? S.schools[f.properties.school].name : 'U' } })) }));
  });
});
describe('perf', () => {
  it.skipIf(!process.env.PERF)('profile', () => {
    const p = S.presets.find(p => p.id === 'seA')!;
    let t = performance.now(); const z = E.zones('es', p); console.log('zones ms', Math.round(performance.now() - t), 'touched', E.touched.size);
    for (const [s, mp] of z) { if (!E.touched.has(s)) continue; t = performance.now(); E.cleaned(mp); const n = mp.reduce((a, p) => a + p.reduce((b, r) => b + r.length, 0), 0); const T = (globalThis as any).CLT; console.log('clean', s < 0 ? 'U' : S.schools[s].name, n, Math.round(performance.now() - t), T ? T.slice(1).map((x: number, i: number) => Math.round(x - T[i])).join(',') : ''); }
  });
});
