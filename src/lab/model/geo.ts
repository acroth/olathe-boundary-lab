export type Ring = [number, number][];
export type Poly = Ring[];
export type MPoly = Poly[];

export function toMPoly(g: GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined): MPoly {
  if (!g) return [];
  return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as MPoly;
}

export function bboxOf(mp: MPoly): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of mp) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
export const bboxHit = (a: number[], b: number[]) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);

function inRing(x: number, y: number, r: Ring) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
export function inMPoly(x: number, y: number, mp: MPoly) {
  for (const p of mp) {
    if (!inRing(x, y, p[0])) continue;
    let hole = false;
    for (let k = 1; k < p.length; k++) if (inRing(x, y, p[k])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}

// planar area in acres (local equirectangular, fine at county scale)
const FT_LON = 287000, FT_LAT = 364000;
function ringArea(r: Ring) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * FT_LON) * (r[i][1] * FT_LAT) - (r[i][0] * FT_LON) * (r[j][1] * FT_LAT);
  return Math.abs(a / 2);
}
export const polyAcres = (p: Poly) => (ringArea(p[0]) - p.slice(1).reduce((s, h) => s + ringArea(h), 0)) / 43560;

export function centroidOfLargest(mp: MPoly): [number, number] | null {
  let best: Poly | null = null, ba = 0;
  for (const p of mp) { const a = polyAcres(p); if (a > ba) { ba = a; best = p; } }
  if (!best) return null;
  let x = 0, y = 0; for (const [a, b] of best[0]) { x += a; y += b; }
  return [x / best[0].length, y / best[0].length];
}
