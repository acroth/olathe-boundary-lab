// One number per school: the district's published figure when one exists, otherwise the model's estimate. The map, scorecard and
// tables all read from here so they can't disagree.
import type { Level, Static } from './data';
import type { LevelResult } from './model/engine';
import { PARENT_SLIDE_TOTALS } from './parentSlides';
import { buildPlan } from './planBuilder';
import { QUESTIONABLE_FIGURES } from './questionableFigures';
import type { Plan } from './store';

export type Source = 'district' | 'model';
export type Agreement = 'close' | 'differs' | 'tooClose';

export const AGREEMENT_LABEL: Record<Agreement, string> = { close: 'Close', differs: 'Differs', tooClose: 'Too close to call' };
export const CLOSE_POINTS = 3;

const ROUNDING_TOLERANCE = 1e-9;
const FIRST_DISTRICT_TABLE_YEAR = 1;   // the district's tables start in 2026-27, index 1 of the app's years

export interface SchoolNumber {
  school: number;
  year: number;
  source: Source;
  value: number;             // the headline utilization
  district: number | null;   // the district's utilization, where it published one
  students: number;          // students behind the headline: the district's count, or the model's
  model: number;
  agreement: Agreement | null;
  parentSlide: { students: number; percent: number; printedPercent?: number; columnsAddUpTo?: number } | null;   // a parent-meeting slide that showed this school fuller
  districtPeak: { utilization: number; students: number; year: number } | null;   // the fullest year in the district's table (2026-27 to 2031-32)
  questionable: string | null;   // why the district's figure here looks like an error
  districtConcepts: string[];    // the published concepts whose figures apply to this school (empty for estimates)
}

interface PublishedTable {
  concept: string;
  table: Record<string, number[]>;
  cap: Record<string, number>;
}

/** Close: within CLOSE_POINTS on the same side of the target. Too close to call: on opposite sides of it, at any gap. */
export function agreementOf(district: number, model: number, target: number): Agreement {
  const districtIsOver = district > target + ROUNDING_TOLERANCE;
  const modelIsOver = model > target + ROUNDING_TOLERANCE;
  if (districtIsOver !== modelIsOver) return 'tooClose';
  const gapInPoints = Math.abs(district - model) * 100;
  return gapInPoints > CLOSE_POINTS + ROUNDING_TOLERANCE ? 'differs' : 'close';
}

function sameIds(first: string[], second: string[]): boolean {
  return first.length === second.length && [...first].sort().join() === [...second].sort().join();
}

function editIds(plan: Plan, level: Level): string[] {
  return plan.edits.filter(edit => edit.level === level).map(edit => edit.id);
}

/** The district option (1-4) this plan is exactly, unedited; null for a custom mix or a hand edit. */
export function publishedOption(staticData: Static, plan: Plan): string | null {
  const combos = staticData.combos;
  if (!combos) return null;

  const planEditIds = editIds(plan, 'es');
  for (const [option, concepts] of Object.entries(combos.options)) {
    const preset = staticData.presets.find(candidate => candidate.id === 'dc' + option);
    if (!preset?.district || JSON.stringify(plan.closures) !== JSON.stringify(preset.closures)) continue;

    const presetEditIds = preset.edits.filter(edit => edit.level === 'es').map(edit => edit.id);
    if (plan.preset === preset.id && sameIds(planEditIds, presetEditIds)) return option;
    if (sameIds(planEditIds, editIds(buildPlan(staticData, concepts, null), 'es'))) return option;
  }
  return null;
}

/** The middle school concept (1-5) this plan is exactly; null otherwise. */
export function publishedConcept(staticData: Static, plan: Plan): number | null {
  const planEditIds = editIds(plan, 'ms');
  if (!planEditIds.length) return null;
  const concept = staticData.combos?.ms?.concepts.find(candidate => {
    const conceptEditIds = candidate.edits.map((_, editIndex) => `b-MS${candidate.id}-${editIndex}`);
    return sameIds(planEditIds, conceptEditIds);
  });
  return concept?.id ?? null;
}

/** Every published concept's table at a level, by concept. */
function conceptTables(staticData: Static, level: Level): Record<string, PublishedTable> {
  const tables: Record<string, PublishedTable> = {};
  if (level === 'es') {
    for (const option of Object.keys(staticData.combos?.options ?? {})) {
      const district = staticData.presets.find(preset => preset.id === 'dc' + option)?.district;
      if (district) tables[option] = { concept: option, table: district.table, cap: district.cap };
    }
  }
  if (level === 'ms' && staticData.combos?.ms) {
    for (const concept of staticData.combos.ms.concepts) tables[String(concept.id)] = { concept: String(concept.id), table: concept.table, cap: staticData.combos.ms.cap };
  }
  return tables;
}

/** The district table that applies to one school when the plan as a whole isn't a published concept: a concept whose homes for
 *  this school match the plan's exactly. Several matches must agree on the school's figures, or none applies. `single` says whether
 *  exactly one concept matched, which is when that concept's notes (meeting slides, questionable figures) also apply. */
function matchingTable(tables: Record<string, PublishedTable>, differsFrom: Record<string, number[]>, school: { i: number; name: string }) {
  const matches = Object.values(tables).filter(table => table.table[school.name] && !differsFrom[table.concept]?.includes(school.i));
  if (!matches.length) return null;
  const figures = JSON.stringify(matches[0].table[school.name]) + matches[0].cap[school.name];
  if (matches.some(table => JSON.stringify(table.table[school.name]) + table.cap[school.name] !== figures)) return null;
  return { table: matches[0], single: matches.length === 1, concepts: matches.map(table => table.concept) };
}

function publishedTable(staticData: Static, plan: Plan, level: Level): PublishedTable | null {
  if (level === 'es') {
    const option = publishedOption(staticData, plan);
    return option ? { concept: option, ...staticData.presets.find(preset => preset.id === 'dc' + option)!.district! } : null;
  }
  if (level === 'ms') {
    const conceptId = publishedConcept(staticData, plan), middleSchools = staticData.combos?.ms;
    if (!conceptId || !middleSchools) return null;
    return { concept: String(conceptId), table: middleSchools.concepts.find(concept => concept.id === conceptId)!.table, cap: middleSchools.cap };
  }
  return null;
}

function districtPeak(published: PublishedTable | null, schoolName: string): SchoolNumber['districtPeak'] {
  const students = published?.table[schoolName], capacity = published?.cap[schoolName];
  if (!students || !capacity) return null;
  const fullest = students.indexOf(Math.max(...students));
  return { utilization: students[fullest] / capacity, students: students[fullest], year: fullest + FIRST_DISTRICT_TABLE_YEAR };
}

function districtStudents(published: PublishedTable | null, schoolName: string, year: number): number | null {
  const students = published?.table[schoolName]?.[year - FIRST_DISTRICT_TABLE_YEAR];
  return students !== undefined && published?.cap[schoolName] ? students : null;
}

/** Headline numbers for a level's open schools. A school keeps the district's figure while its homes are exactly those of a published
 *  concept (`differsFrom`, from compute.ts), even when other schools in the plan were changed. */
export function schoolNumbers(staticData: Static, plan: Plan, result: LevelResult | null, level: Level, year: number,
  differsFrom?: Record<string, number[]> | null): Map<number, SchoolNumber> {
  const numbers = new Map<number, SchoolNumber>();
  if (!result) return numbers;

  const wholePlan = publishedTable(staticData, plan, level);
  const tables = !wholePlan && differsFrom ? conceptTables(staticData, level) : null;
  for (const school of staticData.schools) {
    const schoolResult = result.schools[school.i];
    if (school.level !== level || !schoolResult?.open) continue;

    const match = wholePlan ? { table: wholePlan, single: true, concepts: [wholePlan.concept] } : tables ? matchingTable(tables, differsFrom!, school) : null;
    const published = match?.table ?? null, notesApply = !!match?.single;
    const students = districtStudents(published, school.name, year);
    const district = students === null ? null : students / published!.cap[school.name];
    const model = schoolResult.util[year];
    const slide = district !== null && published && notesApply ? PARENT_SLIDE_TOTALS[level]?.[published.concept]?.[school.name] : undefined;
    numbers.set(school.i, {
      school: school.i, year, model, district, students: students ?? schoolResult.total[year],
      source: district === null ? 'model' : 'district',
      value: district ?? model,
      agreement: district === null ? null : agreementOf(district, model, staticData.meta.target),
      parentSlide: slide ? { ...slide, percent: slide.students / school.capacity } : null,
      districtPeak: district === null ? null : districtPeak(published, school.name),
      questionable: district !== null && published && notesApply ? QUESTIONABLE_FIGURES[level]?.[Number(published.concept)]?.[school.name] ?? null : null,
      districtConcepts: district !== null && match ? match.concepts : [],
    });
  }
  return numbers;
}

const percent = (utilization: number) => `${(utilization * 100).toFixed(1)}%`;

/** The headline percent, the same text on the map, scorecard and tables. Estimates get the ƒ mark beside it, not in the text. */
export function headline(schoolNumber: SchoolNumber): string {
  return percent(schoolNumber.value);
}

function describeSources(districtCount: number, modelCount: number, year: string): string {
  if (!districtCount) return `Our estimates for ${year}.`;
  if (!modelCount) return `District numbers for ${year}.`;
  return `District numbers for ${year}, with our estimates where it has none.`;
}

/** The visible schools' headline numbers, fullest first, with what the scorecard and legend say about them. */
export function headlineSummary(staticData: Static, numbers: Map<number, SchoolNumber>, visibleSchools: Set<number>) {
  const schools = [...numbers.values()]
    .filter(schoolNumber => visibleSchools.has(schoolNumber.school))
    .sort((first, second) => second.value - first.value);
  const districtCount = schools.filter(schoolNumber => schoolNumber.source === 'district').length;
  const modelCount = schools.length - districtCount;
  const year = staticData.meta.years[schools[0]?.year ?? staticData.meta.firstPlanYear];
  return {
    schools, districtCount,
    fullest: schools[0] ?? null,
    overTarget: schools.filter(schoolNumber => schoolNumber.value > staticData.meta.target + ROUNDING_TOLERANCE),
    sourceLabel: describeSources(districtCount, modelCount, year),
  };
}
