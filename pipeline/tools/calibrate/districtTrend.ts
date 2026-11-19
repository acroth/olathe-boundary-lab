// Step 6 of the calibration: each school's year-by-year trend, fitted so the model's totals land on the district's five-year tables.
//
// A school's total in any plan is the sum, over the schools its homes came from, of (summed home weight × that origin's students per
// weight that year), plus students fixed in the building. So for each year, scaling each origin's students per weight is a linear
// least-squares problem across every published concept, leaving out figures that look like errors (src/lab/questionableFigures.ts).
// A small penalty keeps each scale near 1 where the tables say little.
// After the tables end (2031-32), each school keeps its last fitted scale, so the July 2026 forecast's trend carries on from there.
import { applyCalibration, type Calibration } from '../../../src/lab/calibration';
import type { Level, Static } from '../../../src/lab/data';
import { Engine } from '../../../src/lab/model/engine';
import { buildPlan } from '../../../src/lab/planBuilder';
import { QUESTIONABLE_FIGURES } from '../../../src/lab/questionableFigures';
import { loadStatic } from '../../../tests/support/loadStatic';

const FIRST_TABLE_YEAR = 1;                    // the district's tables start in 2026-27, index 1 of the app's years
const FIRST_FITTED_YEAR = 2, LAST_TABLE_YEAR = 6;   // 2027-28 to 2031-32; 2026-27 is already matched to fall counts
const STAY_NEAR_ONE = 0.05;                    // penalty, relative to a school's own students, for moving its scale away from 1

interface Row { districtStudents: number; fixed: number; weightByOrigin: Map<number, number> }

/** One published plan's rows: each table school's district count, its students fixed in the building, and its homes by origin. */
function tableRows(S: Static, engine: Engine, level: Level, plan: any, table: Record<string, number[]>, year: number, excluded: string[]): Row[] {
  const result = engine.run(level, { ...plan, includePreK: true }, false), weight = S.homes.w[level], origin = S.homes.orig[level];
  const byReceiver = new Map<number, Map<number, number>>();
  for (let home = 0; home < S.homes.n; home++) {
    const school = result.assign[home]; if (school < 0) continue;
    const byOrigin = byReceiver.get(school) ?? new Map<number, number>();
    byOrigin.set(origin[home], (byOrigin.get(origin[home]) ?? 0) + weight[home]);
    byReceiver.set(school, byOrigin);
  }
  return Object.entries(table).filter(([name]) => !excluded.includes(name)).map(([name, counts]) => {
    const school = S.schools.find(candidate => candidate.level === level && candidate.name === name)!;
    return { districtStudents: counts[year - FIRST_TABLE_YEAR], fixed: result.schools[school.i].inBuilding, weightByOrigin: byReceiver.get(school.i) ?? new Map() };
  });
}

/** Solves (A + penalty) x = b by Gaussian elimination; the systems here have a few dozen unknowns. */
function solve(matrix: number[][], vector: number[]): number[] {
  const size = vector.length, a = matrix.map((row, k) => [...row, vector[k]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    [a[column], a[pivot]] = [a[pivot], a[column]];
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const ratio = a[row][column] / a[column][column];
      for (let k = column; k <= size; k++) a[row][k] -= ratio * a[column][k];
    }
  }
  return a.map((row, k) => row[size] / row[k]);
}

/** Scales for one level and year: one per origin school that appears in the tables, fitted across all published concepts. */
function fitYear(S: Static, rows: Row[], year: number, origins: number[]): Map<number, number> {
  const index = new Map(origins.map((school, k) => [school, k]));
  const normal = origins.map(() => origins.map(() => 0)), right = origins.map(() => 0);
  for (const row of rows) {
    const coefficients = origins.map(() => 0);
    let constant = row.fixed;
    for (const [origin, summedWeight] of row.weightByOrigin) {
      const students = summedWeight * S.schools[origin].factor[year];
      if (index.has(origin)) coefficients[index.get(origin)!] += students;
      else constant += students;
    }
    const target = row.districtStudents - constant;
    for (let i = 0; i < origins.length; i++) {
      right[i] += coefficients[i] * target;
      for (let j = 0; j < origins.length; j++) normal[i][j] += coefficients[i] * coefficients[j];
    }
  }
  origins.forEach((school, k) => {
    const ownStudents = S.schools[school].neighborhood[year], penalty = STAY_NEAR_ONE * ownStudents * ownStudents;
    normal[k][k] += penalty; right[k] += penalty;
  });
  return new Map(solve(normal, right).map((scale, k) => [origins[k], scale]));
}

/** Multiplies each table school's year scales so the model follows the district's tables, then carries the last year's scale on. */
export function fitDistrictTrend(calibration: Calibration): Calibration['yearScale'] {
  const S = loadStatic({ calibrated: false });
  applyCalibration(S.schools, S.homes, S.combos, calibration);
  const engine = new Engine(S), combos = S.combos!, middle = combos.ms!;
  const published = Object.keys(combos.options).map(option => S.presets.find(preset => preset.id === 'dc' + option)!.district!);
  const levels: { level: Level; plans: { concept: number; plan: any; table: Record<string, number[]> }[] }[] = [
    { level: 'es', plans: Object.entries(combos.options).map(([option, concepts], k) => ({ concept: Number(option), plan: buildPlan(S, concepts, null), table: published[k].table })) },
    { level: 'ms', plans: middle.concepts.map(concept => ({ concept: concept.id, plan: buildPlan(S, combos.options['1'], null, concept.id), table: concept.table })) },
  ];

  const yearScale: Calibration['yearScale'] = Object.fromEntries(Object.entries(calibration.yearScale).map(([school, scales]) => [school, [...scales]]));
  const yearCount = S.meta.years.length;
  for (const { level, plans } of levels) {
    const tableSchools = new Set(plans.flatMap(({ table }) => Object.keys(table)));
    const closing = new Set(level === 'es'
      ? combos.schools.map(school => school.i)
      : [S.schools.find(school => school.level === 'ms' && school.name === 'Indian Trail')!.i]);
    const origins = S.schools.filter(school => school.level === level && (tableSchools.has(school.name) || closing.has(school.i))).map(school => school.i);

    let lastScales = new Map<number, number>();
    for (let year = FIRST_FITTED_YEAR; year < yearCount; year++) {
      if (year <= LAST_TABLE_YEAR) {
        const rows = plans.flatMap(({ concept, plan, table }) => tableRows(S, engine, level, plan, table, year, Object.keys(QUESTIONABLE_FIGURES[level]?.[concept] ?? {})));
        lastScales = fitYear(S, rows, year, origins);
      }
      for (const [school, scale] of lastScales) {
        const scales = yearScale[school] ?? S.meta.years.map(() => 1);
        scales[year] = Number((scales[year] * scale).toFixed(5));
        yearScale[school] = scales;
      }
    }
  }
  return yearScale;
}
