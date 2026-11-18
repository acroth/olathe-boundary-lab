// Polygon operations for attendance areas.
//
// Union / difference / intersection run on an integer grid with Clipper2, which stays robust where floating-point
// libraries fail on nearly coincident edges (a drawn edge running along a zone edge, for example). Display cleanup and line
// strips use JTS buffers.
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

// Coordinates become integers in units of 1e-7 degrees (about 1 cm) measured from a point near the district, which keeps the
// numbers small enough that Clipper's cross products never overflow.
const ORIGIN_LON = -94.8, ORIGIN_LAT = 38.9, UNITS_PER_DEGREE = 1e7;
const MIN_DISPLAY_ACRES = 0.25;      // smaller parts and holes are dropped from displayed areas
const CLEANUP_DEGREES = 3e-5;        // about 3 m

function toGridPaths(shape: MPoly): Paths64 {
  const paths: Paths64 = [];
  for (const polygon of shape) for (const ring of polygon) {
    const path: Path64 = [];
    for (const [lon, lat] of ring) {
      const x = Math.round((lon - ORIGIN_LON) * UNITS_PER_DEGREE), y = Math.round((lat - ORIGIN_LAT) * UNITS_PER_DEGREE);
      const previous = path[path.length - 1];
      if (!previous || previous.x !== x || previous.y !== y) path.push({ x, y });   // drop repeated points
    }
    const closesOnItself = path.length > 1 && path[0].x === path[path.length - 1].x && path[0].y === path[path.length - 1].y;
    if (closesOnItself) path.pop();   // Clipper paths are implicitly closed
    if (path.length >= 3) paths.push(path);
  }
  return paths;
}

function toRing(path: Path64): Ring {
  const ring: Ring = path.map(point => [point.x / UNITS_PER_DEGREE + ORIGIN_LON, point.y / UNITS_PER_DEGREE + ORIGIN_LAT] as [number, number]);
  ring.push(ring[0]);
  return ring;
}

/** Positive for counter-clockwise outer rings, negative for holes (Clipper's orientation). */
function signedArea(path: Path64) {
  let twiceArea = 0;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) twiceArea += (path[j].x + path[i].x) * (path[j].y - path[i].y);
  return -twiceArea / 2;
}

function pointInPath(x: number, y: number, path: Path64) {
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i].x, yi = path[i].y, xj = path[j].x, yj = path[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Clipper returns a flat list of rings: outer rings have positive area, holes negative. Put each hole in the smallest outer
 *  ring that contains it. */
function assemblePolygons(paths: Paths64, minArea = 0): MPoly {
  const outers: { path: Path64; area: number; holes: Path64[] }[] = [], holes: Path64[] = [];
  for (const path of paths) {
    const area = signedArea(path);
    if (area > minArea) outers.push({ path, area, holes: [] });
    else if (area < -minArea) holes.push(path);
  }
  outers.sort((a, b) => a.area - b.area);
  for (const hole of holes) {
    const edgeMidpointX = (hole[0].x + hole[1].x) / 2, edgeMidpointY = (hole[0].y + hole[1].y) / 2;
    const container = outers.find(outer => pointInPath(edgeMidpointX, edgeMidpointY, outer.path) || pointInPath(hole[0].x, hole[0].y, outer.path));
    if (container) container.holes.push(hole);
  }
  return outers.map(outer => [toRing(outer.path), ...outer.holes.map(toRing)]);
}

const CLIP_TYPE = { union: ClipType.Union, difference: ClipType.Difference, intersection: ClipType.Intersection };

export function boolOp(operation: 'union' | 'difference' | 'intersection', subject: MPoly, clipShape: MPoly): MPoly {
  const clipper = new Clipper64();
  clipper.addSubjectPaths(toGridPaths(subject));
  if (clipShape.length) clipper.addClipPaths(toGridPaths(clipShape));
  const solution: Paths64 = [];
  clipper.execute(CLIP_TYPE[operation], FillRule.EvenOdd, solution);
  return assemblePolygons(solution);
}

// ----- JTS buffers ---------------------------------------------------------------------------------------------------------
const reader = new (GeoJSONReader as any)(), writer = new (GeoJSONWriter as any)();
const squareCorners = new BufferParameters();
squareCorners.setJoinStyle(BufferParameters.JOIN_MITRE); squareCorners.setMitreLimit(2); squareCorners.setQuadrantSegments(1);
const grow = (geometry: any, distance: number) => BufferOp.bufferOp(geometry, distance, squareCorners);

function fromJts(geometry: any): MPoly {
  const json = writer.write(geometry) as any;
  return json.type === 'Polygon' ? [json.coordinates] : json.type === 'MultiPolygon' ? json.coordinates : [];
}
const withoutSmallParts = (shape: MPoly) =>
  shape.filter(polygon => polyAcres(polygon) > MIN_DISPLAY_ACRES)
       .map(polygon => [polygon[0], ...polygon.slice(1).filter(hole => polyAcres([hole]) > MIN_DISPLAY_ACRES)]);

/** Display cleanup: a morphological close (grow then shrink ~3 m) seals hairline slits and gaps where a drawn edge runs next to
 *  a zone edge (OpenStreetMap vs. county street centerlines); an open (shrink then grow) drops slivers thinner than that.
 *  `closed` keeps thin parts (for counting pieces); `display` doesn't. Display only: the numbers come from homes, not shapes. */
export function clean(shape: MPoly, distance = CLEANUP_DEGREES): { display: MPoly; closed: MPoly } {
  if (!shape.length) return { display: shape, closed: shape };
  const geometry = reader.read({ type: 'MultiPolygon', coordinates: shape });
  const closed = grow(grow(geometry, distance), -distance);
  const display = grow(grow(closed, -distance), distance);
  return { display: withoutSmallParts(fromJts(display)), closed: withoutSmallParts(fromJts(closed)) };
}

/** A thin polygon along a line (flat ends), used to cut an area in two along a traced line. */
export function lineStrip(line: [number, number][], halfWidth: number): MPoly {
  const flatEnds = new BufferParameters();
  flatEnds.setEndCapStyle(BufferParameters.CAP_FLAT); flatEnds.setQuadrantSegments(2);
  return fromJts(BufferOp.bufferOp(reader.read({ type: 'LineString', coordinates: line }), halfWidth, flatEnds));
}
