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
// 4. Middle school concepts: each detached piece left by reading the concept maps goes to the school around it. Every piece was
//    checked against the concept maps in the Nov 2026 middle school deck; none is a separate area there.
//
// The district's five-year forecasts are deliberately not used here: the model stays an independent check on them.
import { writeFileSync } from 'fs';
import { Engine } from '../../../src/lab/model/engine';
import { inMPoly, polyAcres, toMPoly, type MPoly } from '../../../src/lab/model/geo';
import type { Calibration } from '../../../src/lab/calibration';
import { buildPlan } from '../../../src/lab/planBuilder';
import { loadStatic } from '../../../tests/support/loadStatic';

const RECONCILED_SCHOOLS = ['Heritage', 'Scarborough', 'Walnut Grove'];
const RAKING_ROUNDS = 200;
const MIN_SCALE = 0.4, MAX_SCALE = 2.5;

const S = loadStatic({ calibrated: false }), engine = new Engine(S), combos = S.combos!, middle = combos.ms!;
const schoolNamed = (level: string, name: string) => S.schools.find(school => school.level === level && school.name === name)!;
const published = S.presets.find(preset => preset.district)!.district!;

const capacity: Calibration['capacity'] = {};
for (const [level, table] of [['es', published.cap], ['ms', middle.cap]] as const) {
  for (const [name, value] of Object.entries(table)) if (schoolNamed(level, name).capacity !== value) capacity[schoolNamed(level, name).i] = value;
}

const today = engine.run('es', { closures: {}, edits: [], includePreK: true }, false);
const prek: Calibration['prek'] = {};
for (const [name, enrollment] of Object.entries(published.enroll2026)) {
  const school = schoolNamed('es', name), gap = enrollment - today.schools[school.i].total[1];
  if (Math.abs(gap) >= 0.5) prek[school.i] = Math.max(0, Math.round(school.prek + gap));
}

const factorScale: Calibration['factorScale'] = {};
for (const [name, counts] of Object.entries(middle.concepts[0].table)) {
  const school = schoolNamed('ms', name);
  factorScale[school.i] = Number((counts[0] / school.neighborhood[1]).toFixed(5));
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

function detachedPieceEdits(): Calibration['conceptEdits'] {
  const conceptEdits: Calibration['conceptEdits'] = {};
  for (const concept of middle.concepts) {
    const plan = buildPlan(S, [1, 1, 1, 1, 1], null, concept.id);
    const zones = engine.run('ms', { ...plan, includePreK: true }).zones.features.filter(feature => feature.properties!.school >= 0);
    const areas = zones.map(feature => ({ school: feature.properties!.school as number, shape: toMPoly(feature.geometry as any) }));
    conceptEdits[concept.id] = areas.flatMap(area => {
      const [, ...detached] = [...area.shape].sort((first, second) => polyAcres(second) - polyAcres(first));
      return detached.map(piece => {
        const school = surroundingSchool(piece, areas, area.school);
        return { school, to: S.schools[school].name, faces: [], geom: { type: 'Polygon' as const, coordinates: piece as any } };
      });
    });
  }
  return conceptEdits;
}

const conceptEdits = detachedPieceEdits();
for (const [concept, edits] of Object.entries(conceptEdits)) console.log(`concept ${concept}: ${edits.map(edit => edit.to).join(', ')}`);

const calibration: Calibration = { capacity, capSource: 'district 2026 functional capacity (Nov 2026 boundary presentations)', prek, factorScale, homeWeights, conceptEdits };
writeFileSync(new URL('../../../public/data/calibration.json', import.meta.url), JSON.stringify(calibration));
console.log(`capacity ${Object.keys(capacity).length} schools, Early Childhood ${Object.keys(prek).length}, middle school scales ${Object.keys(factorScale).length}, ` +
            `${homeWeights.reduce((sum, group) => sum + group.homes.length, 0)} homes reweighted`);
