// The Option Builder (src/lab/ui/Builder.tsx) rebuilds the district's four options from per-school concepts.
import { expect, it } from 'vitest';
import { Engine } from '../src/lab/model/engine';
import { buildPlan } from '../src/lab/ui/Builder';
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
