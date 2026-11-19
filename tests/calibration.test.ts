// The district's facts the model is anchored to, and the rules for which number the app leads with.
import { readFileSync } from 'fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/lab/model/engine';
import { boolOp } from '../src/lab/model/clip';
import { inMPoly, polyAcres, toMPoly } from '../src/lab/model/geo';
import type { Static } from '../src/lab/data';
import { agreementOf, headline, publishedConcept, publishedOption, schoolNumbers } from '../src/lab/numbers';
import { buildPlan } from '../src/lab/planBuilder';
import { planFromPreset } from '../src/lab/store';
import { INDIAN_CREEK } from '../pipeline/tools/calibrate/indianCreek';
import { PARENT_SLIDE_TOTALS } from '../src/lab/parentSlides';
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

describe('middle school concepts', () => {
  it('leave every school with one connected area', () => {
    for (const concept of S.combos!.ms!.concepts) {
      const plan = buildPlan(S, [1, 1, 1, 1, 1], null, concept.id);
      const result = engine.run('ms', { ...plan, includePreK: true });
      for (const feature of result.zones.features.filter(zone => zone.properties!.school >= 0)) {
        const name = S.schools[feature.properties!.school].name;
        expect(toMPoly(feature.geometry as any).length, `concept ${concept.id}: ${name}`).toBe(1);
      }
    }
  });
});

describe('reviewed middle school boundaries', () => {
  const BLACK_BOB = -94.76107, STREET_119TH = 38.91285, STREET_127TH = 38.89822, ROAD_MARGIN = 0.0008;

  function assignment(conceptId: number) {
    const plan = buildPlan(S, [1, 1, 1, 1, 1], null, conceptId);
    const assigned = engine.run('ms', { ...plan, includePreK: true }, false).assign;
    return (home: number) => S.schools[assigned[home]]?.name;
  }
  function homesInPlanningArea(area: string) {
    const feature = S.planning.features.find(candidate => String(candidate.properties!.pa) === area && candidate.geometry.type !== 'Point')!;
    const shape = toMPoly(feature.geometry as any), homes: number[] = [];
    for (let home = 0; home < S.homes.n; home++) if (inMPoly(S.homes.lon[home], S.homes.lat[home], shape)) homes.push(home);
    return homes;
  }
  const schoolsIn = (area: string, schoolOf: (home: number) => string) => [...new Set(homesInPlanningArea(area).map(schoolOf))];

  it('concept 1: Pioneer Trail takes all of 610 and 620 and stays west of Black Bob south of 119th', () => {
    const schoolOf = assignment(1);
    expect(schoolsIn('600', schoolOf)).toEqual(['Santa Fe Trail']);
    for (const area of ['610', '620']) expect(schoolsIn(area, schoolOf), area).toEqual(['Pioneer Trail']);
    for (const area of ['660', '680']) expect(schoolsIn(area, schoolOf), area).toEqual(['Frontier Trail']);
    for (let home = 0; home < S.homes.n; home++) {
      const eastOfBlackBob = S.homes.lon[home] > BLACK_BOB + ROAD_MARGIN, southOf119th = S.homes.lat[home] < STREET_119TH - ROAD_MARGIN;
      if (eastOfBlackBob && southOf119th) expect(schoolOf(home), `home ${home}`).not.toBe('Pioneer Trail');
    }
  });

  it('concept 2: Pioneer Trail is north of 127th, California Trail south of it, and California takes 610-630', () => {
    const schoolOf = assignment(2);
    for (const area of ['610', '620', '630']) expect(schoolsIn(area, schoolOf), area).toEqual(['California Trail']);
    for (const area of ['650', '660', '680']) expect(schoolsIn(area, schoolOf), area).toEqual(['Frontier Trail']);

    const area625 = S.planning.features.find(feature => String(feature.properties!.pa) === '625' && feature.geometry.type !== 'Point')!.properties!;   // 625 has no homes
    const plan = buildPlan(S, [1, 1, 1, 1, 1], null, 2), california = schoolNamed('ms', 'California Trail').i;
    const californiaZone = engine.run('ms', { ...plan, includePreK: true }).zones.features.find(feature => feature.properties!.school === california)!;
    expect(inMPoly(area625.lon, area625.lat, toMPoly(californiaZone.geometry as any))).toBe(true);

    for (let home = 0; home < S.homes.n; home++) {
      const school = schoolOf(home), latitude = S.homes.lat[home];
      if (school === 'Pioneer Trail') expect(latitude, `home ${home}`).toBeGreaterThan(STREET_127TH - ROAD_MARGIN);
      if (school === 'California Trail') expect(latitude, `home ${home}`).toBeLessThan(STREET_127TH + ROAD_MARGIN);
    }
  });
});

describe('whole planning areas in the reviewed concepts', () => {
  const RULES: Record<number, Record<string, string>> = {
    1: { 590: 'Oregon Trail', 600: 'Santa Fe Trail', 730: 'Frontier Trail' },
    2: { 600: 'Oregon Trail', 730: 'Frontier Trail', 750: 'Frontier Trail', 770: 'Frontier Trail' },
    3: { 460: 'California Trail' },
    4: { 590: 'Oregon Trail', 600: 'Santa Fe Trail', 730: 'Frontier Trail' },
    5: { 600: 'Santa Fe Trail', 750: 'Frontier Trail', 770: 'Frontier Trail' },
  };
  it('send every home in each named area to its school', () => {
    for (const [concept, areas] of Object.entries(RULES)) {
      const plan = buildPlan(S, [1, 1, 1, 1, 1], null, Number(concept));
      const assigned = engine.run('ms', { ...plan, includePreK: true }, false).assign;
      for (const [area, school] of Object.entries(areas)) {
        const feature = S.planning.features.find(candidate => String(candidate.properties!.pa) === area && candidate.geometry.type !== 'Point')!;
        const shape = toMPoly(feature.geometry as any), schools = new Set<string>();
        for (let home = 0; home < S.homes.n; home++) if (inMPoly(S.homes.lon[home], S.homes.lat[home], shape)) schools.add(S.schools[assigned[home]].name);
        expect([...schools], `concept ${concept}: ${area}`).toEqual([school]);
      }
    }
  });
});

describe('reviewed lines follow the planning areas', () => {
  const INTENTIONALLY_SPLIT: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: ['400'] };
  const EAST_SIDE = ['200', '210', '230', '240', '370', '380', '390', '400', '410', '420', '430', '440', '450', '460', '470', '610', '620', '625', '630', '635', '640', '645'];
  it('keeps each east-side planning area in one school, apart from deliberate splits', () => {
    for (const [concept, splits] of Object.entries(INTENTIONALLY_SPLIT)) {
      const plan = buildPlan(S, [1, 1, 1, 1, 1], null, Number(concept));
      const zones = engine.run('ms', { ...plan, includePreK: true }).zones.features.filter(zone => zone.properties!.school >= 0);
      for (const area of EAST_SIDE.filter(name => !splits.includes(name))) {
        const feature = S.planning.features.find(candidate => String(candidate.properties!.pa) === area && candidate.geometry.type !== 'Point')!;
        const shape = toMPoly(feature.geometry as any);
        const acresBySchool = zones.map(zone => boolOp('intersection', shape, toMPoly(zone.geometry as any)).reduce((total, polygon) => total + polyAcres(polygon), 0));
        const strayAcres = acresBySchool.reduce((total, acres) => total + acres, 0) - Math.max(...acresBySchool);
        expect(strayAcres, `concept ${concept}: ${area}`).toBeLessThan(0.5);   // neighboring planning areas overlap by slivers
      }
    }
  });
});

describe('hand-drawn concept 2 boundary', () => {
  it('puts every home around 850 at the school drawn for it', () => {
    const drawn = JSON.parse(readFileSync(new URL('../pipeline/data/map_readings/middle_school_concept2_850_drawn.geojson', import.meta.url), 'utf8'));
    const plan = buildPlan(S, [1, 1, 1, 1, 1], null, 2);
    const assigned = engine.run('ms', { ...plan, includePreK: true }, false).assign;
    let checked = 0;
    for (const feature of drawn.features) {
      const shape = toMPoly(feature.geometry);
      for (let home = 0; home < S.homes.n; home++) {
        if (!inMPoly(S.homes.lon[home], S.homes.lat[home], shape)) continue;
        checked++;
        expect(S.schools[assigned[home]].name, `home ${home}`).toBe(feature.properties.school);
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('hand-drawn concept 5 boundary', () => {
  it('puts every home in the drawn changes at the school drawn for it', () => {
    const drawn = JSON.parse(readFileSync(new URL('../pipeline/data/map_readings/middle_school_concept5_drawn.geojson', import.meta.url), 'utf8'));
    const plan = buildPlan(S, [1, 1, 1, 1, 1], null, 5);
    const assigned = engine.run('ms', { ...plan, includePreK: true }, false).assign;
    let checked = 0;
    for (const feature of drawn.features) {
      const shape = toMPoly(feature.geometry);
      for (let home = 0; home < S.homes.n; home++) {
        if (!inMPoly(S.homes.lon[home], S.homes.lat[home], shape)) continue;
        checked++;
        expect(S.schools[assigned[home]].name, `home ${home}`).toBe(feature.properties.school);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('reviewed concept 3 boundaries', () => {
  it('sends 380 and 610 to Pioneer Trail and 390 and 620 to California Trail', () => {
    const plan = buildPlan(S, [1, 1, 1, 1, 1], null, 3);
    const assigned = engine.run('ms', { ...plan, includePreK: true }, false).assign;
    const expected: Record<string, string> = { 380: 'Pioneer Trail', 610: 'Pioneer Trail', 390: 'California Trail', 620: 'California Trail', 630: 'California Trail', 650: 'Frontier Trail', 660: 'Frontier Trail', 680: 'Frontier Trail', 685: 'Frontier Trail', 850: 'Frontier Trail' };
    const homesIn = (area: string) => {
      const feature = S.planning.features.find(candidate => String(candidate.properties!.pa) === area && candidate.geometry.type !== 'Point')!;
      const shape = toMPoly(feature.geometry as any), homes: number[] = [];
      for (let home = 0; home < S.homes.n; home++) if (inMPoly(S.homes.lon[home], S.homes.lat[home], shape)) homes.push(home);
      return homes;
    };
    for (const [area, school] of Object.entries(expected)) {
      expect([...new Set(homesIn(area).map(home => S.schools[assigned[home]].name))], area).toEqual([school]);
    }

    const LINDENWOOD = -94.7884;   // 750 splits here: Chisholm Trail to the east, Frontier Trail to the west
    for (const home of homesIn('750')) {
      expect(S.schools[assigned[home]].name, `home ${home}`).toBe(S.homes.lon[home] > LINDENWOOD ? 'Chisholm Trail' : 'Frontier Trail');
    }
  });
});

describe('reviewed concept 4 boundaries', () => {
  it('sends 610-650 to California Trail, 850 to Frontier Trail, and divides 400 along Indian Creek', () => {
    const plan = buildPlan(S, [1, 1, 1, 1, 1], null, 4);
    const assigned = engine.run('ms', { ...plan, includePreK: true }, false).assign;
    const homesIn = (area: string) => {
      const feature = S.planning.features.find(candidate => String(candidate.properties!.pa) === area && candidate.geometry.type !== 'Point')!;
      const shape = toMPoly(feature.geometry as any), homes: number[] = [];
      for (let home = 0; home < S.homes.n; home++) if (inMPoly(S.homes.lon[home], S.homes.lat[home], shape)) homes.push(home);
      return homes;
    };
    const expected: Record<string, string> = { 610: 'California Trail', 620: 'California Trail', 630: 'California Trail', 650: 'California Trail', 850: 'Frontier Trail' };
    for (const [area, school] of Object.entries(expected)) {
      expect([...new Set(homesIn(area).map(home => S.schools[assigned[home]].name))], area).toEqual([school]);
    }

    const creekShape = [[[...INDIAN_CREEK, [INDIAN_CREEK[INDIAN_CREEK.length - 1][0], 38.7], [INDIAN_CREEK[0][0], 38.7], INDIAN_CREEK[0]]]] as any;
    for (const home of homesIn('400')) {
      const southOfCreek = inMPoly(S.homes.lon[home], S.homes.lat[home], creekShape);
      expect(S.schools[assigned[home]].name, `home ${home}`).toBe(southOfCreek ? 'California Trail' : 'Pioneer Trail');
    }
  });
});

describe('first-year model counts', () => {
  it('starts Indian Trail from its fall 2026 count', () => {
    const today = engine.run('ms', { closures: {}, edits: [], includePreK: true }, false);
    expect(Math.abs(today.schools[schoolNamed('ms', 'Indian Trail').i].total[1] - 570)).toBeLessThan(1);
  });
  it('spreads Frontier Trail\'s decline evenly through 2031-32', () => {
    const students = schoolNamed('ms', 'Frontier Trail').neighborhood.slice(1, 7);
    const steps = students.slice(1).map((value, year) => value - students[year]);
    for (const step of steps) expect(Math.abs(step - steps[0])).toBeLessThan(1);
    expect(students[0]).toBeCloseTo(721, 0);
  });
  it('starts closing schools from the students the district places', () => {
    const counts: Record<string, number> = { Heritage: 233, Scarborough: 237, 'Walnut Grove': 367, Tomahawk: 322, 'Black Bob': 229 };
    for (const [name, students] of Object.entries(counts)) expect(Math.abs(schoolNamed('es', name).neighborhood[2] - students), name).toBeLessThan(1);
  });
});

describe('parent-meeting slides', () => {
  it('only note schools a slide showed fuller than the main deck', () => {
    for (const [level, concepts] of Object.entries(PARENT_SLIDE_TOTALS)) for (const [concept, schools] of Object.entries(concepts!)) {
      const published = level === 'es' ? S.presets.find(p => p.id === 'dc' + concept)!.district! : { table: S.combos!.ms!.concepts.find(c => c.id === Number(concept))!.table, cap: S.combos!.ms!.cap };
      for (const [name, slide] of Object.entries(schools)) expect(slide.students / published.cap[name], `${level} ${concept} ${name}`).toBeGreaterThan(published.table[name][1] / published.cap[name]);
    }
  });
  it('appear on the published concept only', () => {
    const published = buildPlan(S, S.combos!.options['1'], null, 1), custom = buildPlan(S, [1, 2, 1, 1, 1], null, 1);
    const slideFor = (plan: any) => schoolNumbers(S, plan, engine.run('es', { ...plan, includePreK: true }, false), 'es', 2).get(schoolNamed('es', 'Brougham').i)!.parentSlide;
    expect(slideFor(published)?.students).toBe(461);
    expect(slideFor(custom)).toBeNull();
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
    const base = { school: 0, year: 2, model: 0.81, parentSlide: null };
    expect(headline({ ...base, source: 'model', value: 0.81, district: null, agreement: null })).toBe('~81.0%');
    expect(headline({ ...base, source: 'district', value: 0.84, district: 0.84, agreement: 'close' })).toBe('84.0%');
  });
});
