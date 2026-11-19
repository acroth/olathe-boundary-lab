// Writes public/data/calibration.json: the district's verified facts, applied on top of the pipeline's files.
//
//   npm run calibrate
//
// 1. Capacity: the Nov 2026 functional capacity wherever the district published one.
// 2. Fall 2026 counts: Early Childhood is set so each school's total matches the district's fall 2026 enrollment; middle schools
//    are scaled to the 2026-27 column of the middle school deck.
// 3. Moved students: home weights inside Heritage, Scarborough and Walnut Grove are raked so each concept's pieces hold the
//    district's shares. Black Bob's and Tomahawk's published counts don't reconcile with their enrollment, so they're left alone.
//
// 4. First-year counts: closing schools' students start from the counts the district placed, and Indian Trail from its fall 2026 count.
// 5. Middle school concepts: each detached piece left by reading the concept maps goes to the school around it. Every piece was
//    checked against the concept maps in the Nov 2026 middle school deck; none is a separate area there.
//    Elementary concept 1's Pleasant Ridge-to-Bentwood piece is redrawn along the Indian Creek trail (bentwood.ts), and concept 3's
//    Indian Creek-to-Countryside piece stops at the drive off Lindenwood instead of running down to Santa Fe.
// 6. District trend (districtTrend.ts): each school's year-by-year trend is fitted so the model lands on the district's five-year
//    tables for its published concepts. Estimates extend the district's numbers to custom plans and to years after 2031-32.
import { readFileSync, writeFileSync } from 'fs';
import { boolOp } from '../../../src/lab/model/clip';
import { Engine } from '../../../src/lab/model/engine';
import { inMPoly, polyAcres, toMPoly, type MPoly } from '../../../src/lab/model/geo';
import type { Calibration } from '../../../src/lab/calibration';
import { buildPlan } from '../../../src/lab/planBuilder';
import { loadStatic } from '../../../tests/support/loadStatic';
import { bentwoodSideOfCreek } from './bentwood';
import { fitDistrictTrend } from './districtTrend';
import { INDIAN_CREEK } from './indianCreek';

const RECONCILED_SCHOOLS = ['Heritage', 'Scarborough', 'Walnut Grove'];
const RAKING_ROUNDS = 200;
const MIN_SCALE = 0.4, MAX_SCALE = 2.5;
const FIRST_PLAN_YEAR = 2;   // 2027-28
const INDIAN_TRAIL_FALL_2026 = 570;                       // Indian Trail parent meeting deck
const INDIAN_TRAIL_CAPACITY = 849;                        // Indian Trail parent meeting deck; the middle school deck doesn't list it
// Students the parent-meeting decks place from each closing school. Black Bob's count differs by concept (225 to 247), so this is the middle value.
const CLOSING_SCHOOL_STUDENTS: Record<string, number> = { Heritage: 233, Scarborough: 237, 'Walnut Grove': 367, Tomahawk: 322, 'Black Bob': 229 };
const MAJOR_STREET_CLASS = 4;          // street classes up to this one (tertiary) are arterials and collectors
const ROAD_SEARCH_DEGREES = 0.0015;    // how far from a road's expected position to look for it

const S = loadStatic({ calibrated: false }), engine = new Engine(S), combos = S.combos!, middle = combos.ms!;
const schoolNamed = (level: string, name: string) => S.schools.find(school => school.level === level && school.name === name)!;
const published = S.presets.find(preset => preset.district)!.district!;

const capacity: Calibration['capacity'] = {};
for (const [level, table] of [['es', published.cap], ['ms', middle.cap]] as const) {
  for (const [name, value] of Object.entries(table)) if (schoolNamed(level, name).capacity !== value) capacity[schoolNamed(level, name).i] = value;
}
capacity[schoolNamed('ms', 'Indian Trail').i] = INDIAN_TRAIL_CAPACITY;

const today = engine.run('es', { closures: {}, edits: [], includePreK: true }, false);
const prek: Calibration['prek'] = {};
for (const [name, enrollment] of Object.entries(published.enroll2026)) {
  const school = schoolNamed('es', name), gap = enrollment - today.schools[school.i].total[1];
  if (Math.abs(gap) >= 0.5) prek[school.i] = Math.max(0, Math.round(school.prek + gap));
}

const factorScale: Calibration['factorScale'] = {};
const fallCountsMiddle: Record<string, number> = { 'Indian Trail': INDIAN_TRAIL_FALL_2026 };
for (const [name, counts] of Object.entries(middle.concepts[0].table)) fallCountsMiddle[name] = counts[0];
for (const [name, count] of Object.entries(fallCountsMiddle)) {
  const school = schoolNamed('ms', name);
  factorScale[school.i] = Number((count / school.neighborhood[1]).toFixed(5));
}

const yearScale: Calibration['yearScale'] = {};

// Students at a closing school in fall 2026 are known, so their first year at a new school starts from that count.
for (const [name, students] of Object.entries(CLOSING_SCHOOL_STUDENTS)) {
  const school = schoolNamed('es', name), firstYearScale = students / school.neighborhood[FIRST_PLAN_YEAR];
  yearScale[school.i] = school.neighborhood.map((_, year) => year >= FIRST_PLAN_YEAR ? Number(firstYearScale.toFixed(5)) : 1);
}

/** Rakes one closing school's home weights toward the district's piece shares; returns each home's scale. */
function rakeToDistrictShares(name: string) {
  const entry = combos.schools.find(school => school.name === name)!, weight = S.homes.w.es, origin = S.homes.orig.es;
  const homes: number[] = [];
  for (let home = 0; home < S.homes.n; home++) if (origin[home] === entry.i) homes.push(home);
  const constraints = entry.concepts.map(concept => concept.pieces.filter(piece => piece.district !== null).map(piece => {
    const shape = toMPoly(piece.geom);
    return { share: piece.district!, members: homes.filter(home => inMPoly(S.homes.lon[home], S.homes.lat[home], shape)) };
  }));
  const scale = new Map(homes.map(home => [home, 1]));
  const current = (members: number[]) => members.reduce((sum, home) => sum + weight[home] * scale.get(home)!, 0);
  for (let round = 0; round < RAKING_ROUNDS; round++) for (const pieces of constraints) {
    const placed = pieces.reduce((sum, piece) => sum + current(piece.members), 0);
    const shares = pieces.reduce((sum, piece) => sum + piece.share, 0);
    for (const piece of pieces) {
      const held = current(piece.members); if (!held) continue;
      const ratio = (placed * piece.share / shares) / held;
      for (const home of piece.members) scale.set(home, Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.get(home)! * ratio)));
    }
  }
  const before = homes.reduce((sum, home) => sum + weight[home], 0), after = current(homes);
  for (const home of homes) scale.set(home, scale.get(home)! * before / after);   // a school's total stays the same
  return scale;
}

const grouped = new Map<number, number[]>();
for (const name of RECONCILED_SCHOOLS) for (const [home, scale] of rakeToDistrictShares(name)) {
  const rounded = Number(scale.toFixed(3));
  if (rounded !== 1) grouped.set(rounded, [...(grouped.get(rounded) ?? []), home]);
}
const homeWeights = [...grouped].map(([scale, homes]) => ({ scale, homes: homes.sort((a, b) => a - b).map((home, k, all) => home - (k ? all[k - 1] : 0)) }));

/** The school whose area touches most of this piece's outline. */
function surroundingSchool(piece: MPoly[number], areas: { school: number; shape: MPoly }[], ownSchool: number): number {
  const NEIGHBOR_STEPS = [0.0004, 0.001, 0.002];   // degrees outward from the outline
  for (const step of NEIGHBOR_STEPS) {
    const touches = new Map<number, number>();
    for (const [longitude, latitude] of piece[0]) {
      for (const [east, north] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const neighbor = areas.find(area => area.school !== ownSchool && inMPoly(longitude + east, latitude + north, area.shape));
        if (neighbor) touches.set(neighbor.school, (touches.get(neighbor.school) ?? 0) + 1);
      }
    }
    if (touches.size) return [...touches].sort((first, second) => second[1] - first[1])[0][0];
  }
  throw new Error('A detached piece has no neighboring school');
}

type ConceptEdit = Calibration['conceptEdits'][string][number];

/** A road's position (longitude for north-south roads, latitude for east-west ones) from the major street segments along it. */
function roadPosition(direction: 'north-south' | 'east-west', estimate: number, along: [number, number]): number {
  const streets = S.streets, positions: number[] = [];
  const across = direction === 'north-south' ? streets.nodeLon : streets.nodeLat, length = direction === 'north-south' ? streets.nodeLat : streets.nodeLon;
  for (let edge = 0; edge < streets.nEdges; edge++) {
    if (streets.cls[edge] > MAJOR_STREET_CLASS) continue;
    const start = streets.u[edge], end = streets.v[edge];
    const nearRoad = Math.abs(across[start] - estimate) < ROAD_SEARCH_DEGREES && Math.abs(across[end] - estimate) < ROAD_SEARCH_DEGREES;
    const inRange = length[start] > along[0] && length[start] < along[1];
    if (nearRoad && inRange && Math.abs(length[end] - length[start]) > Math.abs(across[end] - across[start])) positions.push(across[start], across[end]);
  }
  return positions.sort((first, second) => first - second)[positions.length >> 1];
}

const BLACK_BOB = roadPosition('north-south', -94.76015, [38.885, 38.912]);
const STREET_119TH = roadPosition('east-west', 38.9134, [-94.79, -94.71]);
const STREET_127TH = roadPosition('east-west', 38.8989, [-94.79, -94.71]);
const FAR = { west: -95, east: -94.5, south: 38.7, north: 39.1 };

// Corrections from local review of the concept maps: whole planning areas, and boundaries that follow a road.
interface RoadCut { from: string; to: string; west: number; east: number; south: number; north: number }
interface AreaSplit { area: string; to: string; side: MPoly }
const AREA_400_WEST = -94.7424;
// East-side planning areas whose edges the reviewed boundaries follow
const SNAPPED_AREAS = ['200', '210', '230', '240', '370', '380', '390', '400', '410', '420', '430', '440', '450', '460', '470', '625', '630', '635', '640', '645', '840'];
const SOUTH_OF_INDIAN_CREEK: MPoly = [[[...INDIAN_CREEK, [INDIAN_CREEK[INDIAN_CREEK.length - 1][0], FAR.south], [INDIAN_CREEK[0][0], FAR.south], INDIAN_CREEK[0]]]];
const CONCEPT_CORRECTIONS: Record<number, { planningAreas: Record<string, string>; areaSplits?: AreaSplit[]; drawnAreas?: string; roadCuts: RoadCut[] }> = {
  1: {
    planningAreas: { 590: 'Oregon Trail', 600: 'Santa Fe Trail', 610: 'Pioneer Trail', 620: 'Pioneer Trail', 660: 'Frontier Trail', 680: 'Frontier Trail', 730: 'Frontier Trail' },
    roadCuts: [{ from: 'Pioneer Trail', to: 'California Trail', ...FAR, west: BLACK_BOB, north: STREET_119TH }],   // Pioneer stays west of Black Bob south of 119th
  },
  2: {
    planningAreas: {
      600: 'Oregon Trail', 610: 'California Trail', 620: 'California Trail', 625: 'California Trail', 630: 'California Trail',
      650: 'Frontier Trail', 660: 'Frontier Trail', 680: 'Frontier Trail', 730: 'Frontier Trail', 750: 'Frontier Trail', 770: 'Frontier Trail',
    },
    drawnAreas: 'middle_school_concept2_850_drawn.geojson',   // the Frontier and Chisholm line around 850, drawn by hand in the lab
    roadCuts: [
      { from: 'Pioneer Trail', to: 'California Trail', ...FAR, north: STREET_127TH },   // Pioneer north of 127th, California south of it
      { from: 'California Trail', to: 'Pioneer Trail', ...FAR, south: STREET_127TH },
    ],
  },
  3: {
    planningAreas: { 380: 'Pioneer Trail', 610: 'Pioneer Trail', 390: 'California Trail', 460: 'California Trail', 620: 'California Trail', 625: 'California Trail', 630: 'California Trail', 650: 'Frontier Trail', 660: 'Frontier Trail', 680: 'Frontier Trail', 685: 'Frontier Trail', 850: 'Frontier Trail' },
    roadCuts: [],
  },
  4: {
    planningAreas: {
      610: 'California Trail', 620: 'California Trail', 625: 'California Trail', 630: 'California Trail', 650: 'California Trail', 410: 'California Trail',
      210: 'Pioneer Trail', 380: 'Pioneer Trail', 400: 'Pioneer Trail',
      660: 'Frontier Trail', 680: 'Frontier Trail', 730: 'Frontier Trail', 850: 'Frontier Trail',
      590: 'Oregon Trail', 600: 'Santa Fe Trail',
    },
    areaSplits: [{ area: '400', to: 'California Trail', side: SOUTH_OF_INDIAN_CREEK }],   // 400 divides along Indian Creek
    roadCuts: [
      { from: 'Pioneer Trail', to: 'California Trail', ...FAR, north: STREET_127TH },
      { from: 'California Trail', to: 'Pioneer Trail', ...FAR, south: STREET_127TH, east: AREA_400_WEST },
    ],
  },
  5: {
    planningAreas: { 600: 'Santa Fe Trail', 750: 'Frontier Trail', 770: 'Frontier Trail' },
    drawnAreas: 'middle_school_concept5_drawn.geojson',   // the concept's lines, drawn by hand in the lab
    roadCuts: [],
  },
};

function conceptAreas(conceptId: number) {
  const plan = buildPlan(S, [1, 1, 1, 1, 1], null, conceptId);
  const zones = engine.run('ms', { ...plan, includePreK: true }).zones.features.filter(feature => feature.properties!.school >= 0);
  return zones.map(feature => ({ school: feature.properties!.school as number, shape: toMPoly(feature.geometry as any) }));
}

function planningAreaEdits(assignments: Record<string, string>): ConceptEdit[] {
  return Object.entries(assignments).map(([area, to]) => {
    const feature = S.planning.features.find(candidate => String(candidate.properties!.pa) === area && candidate.geometry.type !== 'Point')!;
    return { school: schoolNamed('ms', to).i, to, faces: [], geom: feature.geometry as ConceptEdit['geom'] };
  });
}

function areaSplitEdits(splits: AreaSplit[]): ConceptEdit[] {
  return splits.map(({ area, to, side }) => {
    const feature = S.planning.features.find(candidate => String(candidate.properties!.pa) === area && candidate.geometry.type !== 'Point')!;
    const part = boolOp('intersection', toMPoly(feature.geometry as any), side);
    return { school: schoolNamed('ms', to).i, to, faces: [], geom: { type: 'MultiPolygon' as const, coordinates: part as any } };
  });
}

function drawnAreaEdits(file: string): ConceptEdit[] {
  const drawn = JSON.parse(readFileSync(new URL(`../../data/map_readings/${file}`, import.meta.url), 'utf8')) as GeoJSON.FeatureCollection;
  return drawn.features.map(feature => {
    const to = feature.properties!.school as string;
    return { school: schoolNamed('ms', to).i, to, faces: [], geom: feature.geometry as ConceptEdit['geom'] };
  });
}

function roadCutEdits(conceptId: number, cuts: RoadCut[]): ConceptEdit[] {
  const areas = conceptAreas(conceptId);
  return cuts.flatMap(({ from, to, west, east, south, north }) => {
    const source = areas.find(area => area.school === schoolNamed('ms', from).i);
    const box: MPoly = [[[[west, south], [east, south], [east, north], [west, north], [west, south]]]];
    const moved = source ? boolOp('intersection', source.shape, box) : [];
    return moved.length ? [{ school: schoolNamed('ms', to).i, to, faces: [], geom: { type: 'MultiPolygon' as const, coordinates: moved as any } }] : [];
  });
}

/** Gives each listed planning area wholly to the school holding most of it, so boundaries follow the planning-area lines. */
function snappedAreaEdits(conceptId: number): ConceptEdit[] {
  const areas = conceptAreas(conceptId);
  return SNAPPED_AREAS.flatMap(area => {
    const feature = S.planning.features.find(candidate => String(candidate.properties!.pa) === area && candidate.geometry.type !== 'Point')!;
    const shape = toMPoly(feature.geometry as any);
    const held = areas.map(({ school, shape: zone }) => ({ school, acres: boolOp('intersection', shape, zone).reduce((total, polygon) => total + polyAcres(polygon), 0) }));
    const holder = held.sort((first, second) => second.acres - first.acres)[0];
    return holder.acres > 0 ? [{ school: holder.school, to: S.schools[holder.school].name, faces: [], geom: feature.geometry as ConceptEdit['geom'] }] : [];
  });
}

function detachedPieces(conceptId: number): ConceptEdit[] {
  const areas = conceptAreas(conceptId);
  return areas.flatMap(area => {
    const [, ...detached] = [...area.shape].sort((first, second) => polyAcres(second) - polyAcres(first));
    return detached.map(piece => {
      const school = surroundingSchool(piece, areas, area.school);
      return { school, to: S.schools[school].name, faces: [], geom: { type: 'Polygon' as const, coordinates: piece as any } };
    });
  });
}

/** Applies each concept's corrections in order, so later steps see the boundaries the earlier ones produced. */
function correctedConceptEdits(): Calibration['conceptEdits'] {
  const conceptEdits: Calibration['conceptEdits'] = {};
  for (const concept of middle.concepts) {
    const corrections = CONCEPT_CORRECTIONS[concept.id];
    const steps: (() => ConceptEdit[])[] = [
      () => corrections?.drawnAreas ? drawnAreaEdits(corrections.drawnAreas) : [],
      () => corrections ? roadCutEdits(concept.id, corrections.roadCuts) : [],
      () => corrections && !corrections.drawnAreas?.includes('concept5') ? snappedAreaEdits(concept.id) : [],
      () => corrections ? planningAreaEdits(corrections.planningAreas) : [],   // named planning areas have the final say
      () => corrections?.areaSplits ? areaSplitEdits(corrections.areaSplits) : [],
      () => detachedPieces(concept.id),
    ];
    conceptEdits[concept.id] = [];
    for (const step of steps) {
      const edits = step();
      concept.edits.push(...edits);
      conceptEdits[concept.id].push(...edits);
    }
  }
  return conceptEdits;
}

const conceptEdits = correctedConceptEdits();
console.log(`roads: Black Bob ${BLACK_BOB.toFixed(5)}, 119th ${STREET_119TH.toFixed(5)}, 127th ${STREET_127TH.toFixed(5)}`);
for (const [concept, edits] of Object.entries(conceptEdits)) console.log(`concept ${concept}: ${edits.length} corrections`);

/** Pleasant Ridge's area today, cut along the Indian Creek trail: the part elementary concept 1 gives Bentwood. */
function pleasantRidgeToBentwood(): GeoJSON.MultiPolygon {
  const pleasantRidge = schoolNamed('es', 'Pleasant Ridge').i;
  const today = S.zones.es.features.find(feature => feature.properties!.school === pleasantRidge)!;
  const piece = boolOp('intersection', toMPoly(today.geometry as any), [[bentwoodSideOfCreek()]]).filter(part => polyAcres(part) > 0.5);
  return { type: 'MultiPolygon', coordinates: piece as any };
}

// On the district's concept 3 map, the Indian Creek piece given to Countryside ends just past the first drive off Lindenwood Drive
// east of it, across to Mur-Len. The map reading carried the strip east of Lindenwood on down to Santa Fe.
const LINDENWOOD_SIDE_STREET = 38.8859;

/** Concept 3's Indian Creek-to-Countryside piece, cut off along the drive off Lindenwood. */
function indianCreekToCountryside(): GeoJSON.MultiPolygon {
  const move = combos.moves.find(candidate => candidate.id === 'IC-CS')!;
  const north: MPoly = [[[[-95, LINDENWOOD_SIDE_STREET], [-94.5, LINDENWOOD_SIDE_STREET], [-94.5, 39.5], [-95, 39.5], [-95, LINDENWOOD_SIDE_STREET]]]];
  const piece = boolOp('intersection', toMPoly(move.geom as any), north).filter(part => polyAcres(part) > 0.5);
  return { type: 'MultiPolygon', coordinates: piece as any };
}

const calibration: Calibration = { capacity, capSource: 'district 2026 functional capacity (Nov 2026 boundary presentations)', prek, factorScale, yearScale, homeWeights, conceptEdits,
  moveGeometries: { 'PR-BE': pleasantRidgeToBentwood(), 'IC-CS': indianCreekToCountryside() } };
calibration.yearScale = fitDistrictTrend(calibration);
writeFileSync(new URL('../../../public/data/calibration.json', import.meta.url), JSON.stringify(calibration));
console.log(`capacity ${Object.keys(capacity).length} schools, Early Childhood ${Object.keys(prek).length}, middle school scales ${Object.keys(factorScale).length}, ` +
            `${homeWeights.reduce((sum, group) => sum + group.homes.length, 0)} homes reweighted`);
