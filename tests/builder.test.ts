// The Option Builder (src/lab/planBuilder.ts) rebuilds the district's four options from per-school concepts.
import { expect, it } from 'vitest';
import { Engine } from '../src/lab/model/engine';
import { publishedConcept, publishedOption } from '../src/lab/numbers';
import { buildPlan } from '../src/lab/planBuilder';
import { currentStartingPlan, startingPlans, withStartingPlan } from '../src/lab/startingPlans';
import { loadStatic } from './support/loadStatic';

it("picking a district option's concepts gives the same assignment as that option's preset", () => {
  const S = loadStatic(), engine = new Engine(S), combos = S.combos!;
  for (const [option, concepts] of Object.entries(combos.options)) {
    const built = engine.run('es', { ...buildPlan(S, concepts, null), includePreK: true }, false);
    const preset = S.presets.find(p => p.id === 'dc' + option)!;
    const fromPreset = engine.run('es', { ...preset, includePreK: true }, false);
    let weightAssignedDifferently = 0;
    for (let home = 0; home < built.assign.length; home++) if (built.assign[home] !== fromPreset.assign[home]) weightAssignedDifferently += S.homes.w.es[home];
    expect(weightAssignedDifferently, `option ${option}`).toBeLessThan(1);
  }
});

it('any mix of concepts places every elementary student', () => {
  const S = loadStatic(), engine = new Engine(S);
  for (const concepts of [[1, 1, 1, 3, 2], [2, 2, 3, 3, 3], [3, 2, 1, 3, 3], [4, 2, 1, 3, 2], [1, 1, 3, 2, 1]]) {
    const result = engine.run('es', { ...buildPlan(S, concepts, null), includePreK: true }, false);
    expect(result.summary.unassignedStudents, concepts.join('.')).toBeLessThan(1);
  }
});

it("Free draw's starting plans offer each level's own district concepts and only change that level", () => {
  const S = loadStatic(), engine = new Engine(S);
  expect(startingPlans(S, 'es').map(start => start.id)).toEqual(['blank', 'dc1', 'dc2', 'dc3', 'dc4']);
  expect(startingPlans(S, 'ms').map(start => start.id)).toEqual(['blank', 'ms1', 'ms2', 'ms3', 'ms4', 'ms5']);
  expect(startingPlans(S, 'hs')).toEqual([]);

  const withMiddle = withStartingPlan(S, withStartingPlan(S, buildPlan(S, S.combos!.options['1'], null), 'es', 'blank'), 'ms', 'ms3');
  expect(currentStartingPlan(S, withMiddle, 'es')).toBe('blank');
  expect(currentStartingPlan(S, withMiddle, 'ms')).toBe('ms3');

  const withBoth = withStartingPlan(S, withMiddle, 'es', 'dc2');
  expect(publishedOption(S, withBoth)).toBe('2');
  expect(publishedConcept(S, withBoth)).toBe(3);
  expect(engine.run('ms', { ...withBoth, includePreK: true }, false).summary.unassignedStudents).toBeLessThan(1);

  const blankMiddle = withStartingPlan(S, withBoth, 'ms', 'blank');
  expect(currentStartingPlan(S, blankMiddle, 'ms')).toBe('blank');
  expect(publishedOption(S, blankMiddle)).toBe('2');
  expect(engine.run('ms', { ...blankMiddle, includePreK: true }, false).summary.unassignedStudents).toBeGreaterThan(100);   // Indian Trail's students
});
