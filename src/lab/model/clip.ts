// Polygon boolean ops on an integer grid (Clipper2): robust where floating-point sweep-line libraries
// fail on near-coincident edges (shared zone and street lines).
import { Clipper64, ClipType, FillRule, type Path64, type Paths64 } from 'clipper2-js';
import type { MPoly, Ring } from './geo';
import { polyAcres } from './geo';
// @ts-ignore no types
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js';
// @ts-ignore
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js';
// @ts-ignore
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
// @ts-ignore
import BufferParameters from 'jsts/org/locationtech/jts/operation/buffer/BufferParameters.js';

const OX = -94.8, OY = 38.9, K = 1e7;   // local origin keeps integers small (no float overflow in cross products)

function toPaths(mp: MPoly): Paths64 {
  const out: Paths64 = [];
  for (const p of mp) for (const r of p) {
    const path: Path64 = [];
    for (let i = 0; i < r.length; i++) {
      const x = Math.round((r[i][0] - OX) * K), y = Math.round((r[i][1] - OY) * K);
      const l = path[path.length - 1];
      if (!l || l.x !== x || l.y !== y) path.push({ x, y });
    }
    if (path.length > 1 && path[0].x === path[path.length - 1].x && path[0].y === path[path.length - 1].y) path.pop();
    if (path.length >= 3) out.push(path);
  }
  return out;
}
function ring(p: Path64): Ring {
  const r: Ring = p.map(q => [q.x / K + OX, q.y / K + OY] as [number, number]);
  r.push(r[0]);
  return r;
}
function signedArea(p: Path64) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j].x + p[i].x) * (p[j].y - p[i].y); return -a / 2; }
function inside(x: number, y: number, p: Path64) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i].x, yi = p[i].y, xj = p[j].x, yj = p[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
/** flat Clipper output -> polygons with holes: positive-area rings are outers, negative are holes (put in the smallest outer containing them) */
function assemble(paths: Paths64, minArea = 0): MPoly {
  const outers: { p: Path64; a: number; holes: Path64[] }[] = [], holes: Path64[] = [];
  for (const p of paths) { const a = signedArea(p); if (a > minArea) outers.push({ p, a, holes: [] }); else if (a < -minArea) holes.push(p); }
  outers.sort((x, y) => x.a - y.a);
  for (const h of holes) {
    const o = outers.find(o => inside((h[0].x + h[1].x) / 2, (h[0].y + h[1].y) / 2, o.p) || inside(h[0].x, h[0].y, o.p));
    if (o) o.holes.push(h);
  }
  return outers.map(o => [ring(o.p), ...o.holes.map(ring)]);
}
const CT = { union: ClipType.Union, difference: ClipType.Difference, intersection: ClipType.Intersection };

export function boolOp(op: 'union' | 'difference' | 'intersection', a: MPoly, b: MPoly): MPoly {
  const c = new Clipper64();
  c.addSubjectPaths(toPaths(a));
  if (b.length) c.addClipPaths(toPaths(b));
  const sol: Paths64 = [];
  c.execute(CT[op], FillRule.EvenOdd, sol);
  return assemble(sol);
}

/** Morphological close then open (~3 m) with JTS buffers: seals hairline slits and gaps where a drawn edge runs next to
 *  a zone edge (e.g. OpenStreetMap vs. county street centerlines) and drops slivers thinner than that. Display only. */
const reader = new (GeoJSONReader as any)(), writer = new (GeoJSONWriter as any)();
const params = new BufferParameters(); params.setJoinStyle(BufferParameters.JOIN_MITRE); params.setMitreLimit(2); params.setQuadrantSegments(1);
const buf = (g: any, d: number) => BufferOp.bufferOp(g, d, params);
function toM(g: any): MPoly {
  const j = writer.write(g) as any;
  return j.type === 'Polygon' ? [j.coordinates] : j.type === 'MultiPolygon' ? j.coordinates : [];
}
export function clean(mp: MPoly, d = 3e-5): { display: MPoly; closed: MPoly } {
  if (!mp.length) return { display: mp, closed: mp };
  const g = reader.read({ type: 'MultiPolygon', coordinates: mp });
  const closed = buf(buf(g, d), -d);
  const display = buf(buf(closed, -d), d);
  const big = (m: MPoly) => m.filter(p => polyAcres(p) > 0.25).map(p => [p[0], ...p.slice(1).filter(h => polyAcres([h]) > 0.25)]);
  return { display: big(toM(display)), closed: big(toM(closed)) };
}

/** thin polygon along a line (flat ends), used to cut an area in two */
export function lineStrip(line: [number, number][], halfWidth: number): MPoly {
  const p = new BufferParameters(); p.setEndCapStyle(BufferParameters.CAP_FLAT); p.setQuadrantSegments(2);
  const g = reader.read({ type: 'LineString', coordinates: line });
  return toM(BufferOp.bufferOp(g, halfWidth, p));
}
