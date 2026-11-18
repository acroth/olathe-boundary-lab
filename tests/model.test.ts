// The browser model (src/lab/model/engine.ts) against the data the pipeline published.
import { beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/lab/model/engine';
import { LEVELS, type Static } from '../src/lab/data';
import { loadStatic } from './support/loadStatic';

let S: Static, engine: Engine;
const presetById = (id: string) => S.presets.find(preset => preset.id === id)!;
const schoolNamed = (name: string) => S.schools.find(school => school.level === 'es' && school.name === name)!;

beforeAll(() => { S = loadStatic(); engine = new Engine(S); });

describe("today's boundaries", () => {
  it("give every school exactly its projected students", () => {
    for (const level of LEVELS) {
      const result = engine.run(level, { closures: {}, edits: [] }, false);
      for (const school of S.schools.filter(s => s.level === level)) {
        for (const year of [2, 5, 9]) expect(result.schools[school.i].students[year]).toBeCloseTo(school.neighborhood[year], 0);
        const inBuilding = (school.name === 'Black Bob' ? school.immersion : 0) + school.prek;
        expect(result.schools[school.i].util[2]).toBeCloseTo((school.neighborhood[2] + inBuilding) / school.capacity, 3);
      }
      expect(result.summary.unassignedStudents).toBeCloseTo(0, 3);
    }
  });
});

describe('published plans', () => {
  it("the district's closures leave just the closing schools' students unassigned", () => {
    const result = engine.run('es', presetById('district'), false);
    const closing = ['Black Bob', 'Heritage', 'Scarborough', 'Tomahawk', 'Walnut Grove'];
    const expected = closing.reduce((sum, name) => sum + schoolNamed(name).neighborhood[S.meta.firstPlanYear], 0);
    expect(Math.abs(result.summary.unassignedStudents - expected)).toBeLessThan(expected * 0.03);
  });

  it('every district option and solver plan places every elementary student', () => {
    for (const preset of S.presets.filter(p => p.id.startsWith('dc') || p.id.startsWith('solver'))) {
      const result = engine.run('es', preset, false);
      expect(result.summary.unassignedStudents, preset.id).toBeLessThan(1);
    }
  });

  it("the model agrees with the solver: solver plans keep every school that takes students under the plan's cap", () => {
    const caps: Record<string, number> = { 'solver-receivers': 0.90, 'solver-85': 0.85 };
    const solverEngine = new Engine(loadStatic({ calibrated: false }));   // the plans were solved before calibration
    for (const [id, cap] of Object.entries(caps)) {
      const result = solverEngine.run('es', { ...presetById(id), includePreK: true }, false);
      const mergedSchools = new Set(['Fairview', 'Ridgeview']);   // the district's approved merges, outside the solver's problem
      for (const stat of Object.values(result.schools)) {
        const origins = Object.keys(stat.movedInByOrigin).map(origin => S.schools[Number(origin)].name);
        if (!stat.open || !origins.some(name => !mergedSchools.has(name))) continue;
        expect(stat.peak, `${id}: ${S.schools[stat.i].name}`).toBeLessThan(cap + 0.01);   // 1 point for block-edge differences
      }
    }
  });
});

describe('road distances', () => {
  it('reach every home from every elementary school', () => {
    for (const school of S.schools.filter(s => s.level === 'es')) {
      const feet = engine.roadFeetFrom(school.i);
      let unreachable = 0;
      for (let home = 0; home < S.homes.n; home++) if (!isFinite(feet[S.homes.node[home]])) unreachable++;
      expect(unreachable, school.name).toBe(0);
    }
  });
});
