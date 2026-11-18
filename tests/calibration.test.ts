// The district's facts the model is anchored to, and the rules for which number the app leads with.
import { beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/lab/model/engine';
import type { Static } from '../src/lab/data';
import { agreementOf, headline, mapLabel, publishedConcept, publishedOption, schoolNumbers } from '../src/lab/numbers';
import { buildPlan } from '../src/lab/planBuilder';
import { planFromPreset } from '../src/lab/store';
import { loadStatic } from './support/loadStatic';

let S: Static, engine: Engine;
const schoolNamed = (level: string, name: string) => S.schools.find(school => school.level === level && school.name === name)!;
const today = { closures: {}, edits: [], includePreK: true };

beforeAll(() => { S = loadStatic(); engine = new Engine(S); });

describe('facts', () => {
  it('capacities match the November 2026 decks', () => {
    const district = S.presets.find(p => p.id === 'dc1')!.district!;
    for (const [name, capacity] of Object.entries(district.cap)) expect(schoolNamed('es', name).capacity, name).toBe(capacity);
    for (const [name, capacity] of Object.entries(S.combos!.ms!.cap)) expect(schoolNamed('ms', name).capacity, name).toBe(capacity);
  });

  it('fall 2026 counts match the district at every published school', () => {
    const elementary = engine.run('es', today, false), middle = engine.run('ms', today, false);
    for (const [name, count] of Object.entries(S.presets.find(p => p.id === 'dc1')!.district!.enroll2026)) expect(Math.abs(elementary.schools[schoolNamed('es', name).i].total[1] - count), name).toBeLessThan(1);
    for (const [name, counts] of Object.entries(S.combos!.ms!.concepts[0].table)) expect(Math.abs(middle.schools[schoolNamed('ms', name).i].total[1] - counts[0]), name).toBeLessThan(1);
  });

  it('students moved from schools whose counts reconcile match the district within 3%', () => {
    for (const option of ['1', '2', '3', '4']) {
      const preset = S.presets.find(p => p.id === 'dc' + option)!;
      const result = engine.run('es', { ...preset, includePreK: true }, false);
      for (const piece of preset.district!.pieces.filter(p => ['Heritage', 'Scarborough', 'Walnut Grove'].includes(p.frm))) {
        const moved = result.schools[schoolNamed('es', piece.to).i].movedInByOriginFall2026[schoolNamed('es', piece.frm).i] ?? 0;
        expect(Math.abs(moved - piece.n), `option ${option}: ${piece.frm} to ${piece.to}`).toBeLessThan(Math.max(3, piece.n * 0.03));
      }
    }
  });
});

describe('agreement labels', () => {
  it('close means within 3 points on the same side of the target', () => {
    expect(agreementOf(0.80, 0.77, 0.85)).toBe('close');
    expect(agreementOf(0.80, 0.769, 0.85)).toBe('differs');
  });
  it('opposite sides of the target are too close to call, at any gap', () => {
    expect(agreementOf(0.851, 0.85, 0.85)).toBe('tooClose');
    expect(agreementOf(0.85, 0.80, 0.85)).toBe('differs');   // exactly 85% is not over 85%
    expect(agreementOf(0.90, 0.70, 0.85)).toBe('tooClose');
  });
});

describe('the headline number', () => {
  it('is the exact district figure for a published option', () => {
    for (const [option, concepts] of Object.entries(S.combos!.options)) {
      const plan = buildPlan(S, concepts, null, 1), table = S.presets.find(p => p.id === 'dc' + option)!.district!;
      expect(publishedOption(S, plan)).toBe(option);
      const numbers = schoolNumbers(S, plan, engine.run('es', { ...plan, includePreK: true }, false), 'es', 2);
      for (const [name, counts] of Object.entries(table.table)) {
        const number = numbers.get(schoolNamed('es', name).i)!;
        expect(number.source, name).toBe('district');
        expect(number.value, name).toBeCloseTo(counts[1] / table.cap[name], 9);
      }
    }
  });

  it('is the exact district figure for a published middle school concept', () => {
    for (const concept of S.combos!.ms!.concepts) {
      const plan = buildPlan(S, [1, 1, 1, 1, 1], null, concept.id);
      expect(publishedConcept(S, plan)).toBe(concept.id);
      const numbers = schoolNumbers(S, plan, engine.run('ms', { ...plan, includePreK: true }, false), 'ms', 2);
      for (const [name, counts] of Object.entries(concept.table)) expect(numbers.get(schoolNamed('ms', name).i)!.value, name).toBeCloseTo(counts[1] / S.combos!.ms!.cap[name], 9);
    }
  });

  it('recognizes an unedited district option picked as a starting plan', () => {
    expect(publishedOption(S, planFromPreset(S.presets.find(p => p.id === 'dc2')!))).toBe('2');
  });

  it('falls back to the model for custom mixes, hand edits, later years and unpublished schools', () => {
    const modelOnly = (plan: any, year: number) => [...schoolNumbers(S, plan, engine.run('es', { ...plan, includePreK: true }, false), 'es', year).values()].every(n => n.source === 'model' && n.value === n.model);
    const published = buildPlan(S, S.combos!.options['1'], null, 1);
    expect(modelOnly(buildPlan(S, [1, 2, 1, 1, 1], null, 1), 2)).toBe(true);
    expect(modelOnly({ ...published, edits: [...published.edits, { ...published.edits[0], id: 'hand-edit', kind: 'draw' }] }, 2)).toBe(true);
    expect(modelOnly(published, 7)).toBe(true);
    const numbers = schoolNumbers(S, published, engine.run('es', { ...published, includePreK: true }, false), 'es', 2);
    expect(numbers.get(schoolNamed('es', 'Central').i)!.source).toBe('model');
  });

  it('marks the source on every label', () => {
    const base = { school: 0, year: 2, model: 0.81 };
    expect(headline({ ...base, source: 'model', value: 0.81, district: null, agreement: null })).toBe('~81.0%');
    expect(mapLabel({ ...base, source: 'district', value: 0.84, district: 0.84, agreement: 'close' })).toBe('84.0%');
    expect(mapLabel({ ...base, source: 'district', value: 0.87, district: 0.87, agreement: 'tooClose' })).toBe('87.0% · model ~81.0%');
  });
});
