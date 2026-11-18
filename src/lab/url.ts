// Plans in the URL: preset id + closures + removed preset edits + user edits (quantized, delta-encoded), lz-compressed.
import LZ from 'lz-string';
import type { Edit, Level, Preset } from './data';
import type { Plan } from './store';

const Q = 1e5; // ~1 m
function encRing(r: number[][]) {
  const out: number[] = []; let px = 0, py = 0;
  for (const [x, y] of r) { const qx = Math.round(x * Q), qy = Math.round(y * Q); out.push(qx - px, qy - py); px = qx; py = qy; }
  return out;
}
function decRing(a: number[]) {
  const r: [number, number][] = []; let x = 0, y = 0;
  for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; r.push([x / Q, y / Q]); }
  return r;
}
const L: Level[] = ['es', 'ms', 'hs'];

export function encodePlan(plan: Plan, presets: Preset[]): string {
  const base = presets.find(p => p.id === plan.preset);
  const baseIds = new Set(base?.edits.map(e => e.id) ?? []);
  const kept = new Set(plan.edits.filter(e => e.kind === 'preset').map(e => e.id));
  const removed = base ? base.edits.map((e, k) => (kept.has(e.id) ? -1 : k)).filter(k => k >= 0) : [];
  const user = plan.edits.filter(e => !baseIds.has(e.id)).map(e => {
    const o: any = { l: L.indexOf(e.level), s: e.school, k: e.kind[0] };
    if (e.label && e.kind === 'area') o.n = e.label;
    if (e.ref) o.a = e.ref;
    else if (e.faces?.length) o.f = e.faces;
    else o.g = (e.geom.type === 'Polygon' ? [e.geom.coordinates] : e.geom.coordinates).map(p => p.map(encRing));
    return o;
  });
  const order = plan.edits.map(e => (baseIds.has(e.id) ? 'p' + base!.edits.findIndex(b => b.id === e.id) : 'u'));
  const obj = { v: 1, p: plan.preset, c: plan.closures, r: removed, e: user, o: order.join(','), n: plan.name };
  return LZ.compressToEncodedURIComponent(JSON.stringify(obj));
}

export function decodePlan(s: string, presets: Preset[], faceGeom: (ids: number[]) => GeoJSON.MultiPolygon, refGeom?: (ref: string) => any): Plan | null {
  try {
    const obj = JSON.parse(LZ.decompressFromEncodedURIComponent(s) || 'null');
    if (!obj || obj.v !== 1) return null;
    const base = presets.find(p => p.id === obj.p);
    const kinds: Record<string, Edit['kind']> = { d: 'draw', t: 'trace', b: 'blocks', a: 'area', p: 'preset' };
    const user: Edit[] = obj.e.map((o: any, k: number) => {
      const level = L[o.l];
      const geom: any = o.a && refGeom ? refGeom(o.a) : o.f ? faceGeom(o.f) : { type: 'MultiPolygon', coordinates: (o.g ?? []).map((p: number[][]) => p.map(decRing)) };
      return { id: `url${k}`, level, school: o.s, kind: kinds[o.k] ?? 'draw', geom: geom ?? { type: 'MultiPolygon', coordinates: [] }, faces: o.f, label: o.n, ref: o.a };
    });
    const edits: Edit[] = []; let ui = 0;
    for (const tok of String(obj.o || '').split(',').filter(Boolean)) {
      if (tok === 'u') edits.push(user[ui++]);
      else { const e = base?.edits[Number(tok.slice(1))]; if (e) edits.push({ ...e }); }
    }
    return { preset: obj.p, closures: obj.c ?? {}, edits, name: obj.n };
  } catch { return null; }
}
