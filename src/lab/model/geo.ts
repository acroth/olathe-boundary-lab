// Plain polygon helpers in longitude/latitude: GeoJSON rings as arrays, bounding boxes, point-in-polygon and areas.
export type Ring = [number, number][];
export type Poly = Ring[];      // outer ring, then holes
export type MPoly = Poly[];     // a multipolygon

const FEET_PER_DEGREE_LONGITUDE = 287000;   // near 38.9° N; flat-earth areas are fine at county scale
const FEET_PER_DEGREE_LATITUDE = 364000;
const SQUARE_FEET_PER_ACRE = 43560;

export function toMPoly(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined): MPoly {
  if (!geometry) return [];
  return (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as MPoly;
}

/** [west, south, east, north] of the outer rings. */
export function bboxOf(shape: MPoly): [number, number, number, number] {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const polygon of shape) for (const [x, y] of polygon[0]) {
    if (x < west) west = x; if (y < south) south = y; if (x > east) east = x; if (y > north) north = y;
  }
  return [west, south, east, north];
}
export const bboxHit = (a: number[], b: number[]) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);

/** Ray casting: count how many ring edges a ray from the point crosses. */
function pointInRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inMPoly(x: number, y: number, shape: MPoly) {
  for (const polygon of shape) {
    if (!pointInRing(x, y, polygon[0])) continue;
    const inHole = polygon.slice(1).some(hole => pointInRing(x, y, hole));
    if (!inHole) return true;
  }
  return false;
}

/** Shoelace formula, in square feet. */
function ringSquareFeet(ring: Ring) {
  let twiceArea = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twiceArea += (ring[j][0] * FEET_PER_DEGREE_LONGITUDE) * (ring[i][1] * FEET_PER_DEGREE_LATITUDE)
               - (ring[i][0] * FEET_PER_DEGREE_LONGITUDE) * (ring[j][1] * FEET_PER_DEGREE_LATITUDE);
  }
  return Math.abs(twiceArea / 2);
}
export const polyAcres = (polygon: Poly) =>
  (ringSquareFeet(polygon[0]) - polygon.slice(1).reduce((sum, hole) => sum + ringSquareFeet(hole), 0)) / SQUARE_FEET_PER_ACRE;

/** Average of the outer-ring vertices of the largest polygon (a label point). */
export function centroidOfLargest(shape: MPoly): [number, number] | null {
  let largest: Poly | null = null, largestAcres = 0;
  for (const polygon of shape) { const acres = polyAcres(polygon); if (acres > largestAcres) { largestAcres = acres; largest = polygon; } }
  if (!largest) return null;
  let sumX = 0, sumY = 0;
  for (const [x, y] of largest[0]) { sumX += x; sumY += y; }
  return [sumX / largest[0].length, sumY / largest[0].length];
}
