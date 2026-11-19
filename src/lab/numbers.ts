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

/** Headline numbers for a level's open schools. */
export function schoolNumbers(staticData: Static, plan: Plan, result: LevelResult | null, level: Level, year: number): Map<number, SchoolNumber> {
  const numbers = new Map<number, SchoolNumber>();
  if (!result) return numbers;

  const published = publishedTable(staticData, plan, level);
  for (const school of staticData.schools) {
    const schoolResult = result.schools[school.i];
    if (school.level !== level || !schoolResult?.open) continue;

    const students = districtStudents(published, school.name, year);
    const district = students === null ? null : students / published!.cap[school.name];
    const model = schoolResult.util[year];
    const slide = district !== null && published ? PARENT_SLIDE_TOTALS[level]?.[published.concept]?.[school.name] : undefined;
    numbers.set(school.i, {
      school: school.i, year, model, district, students: students ?? schoolResult.total[year],
      source: district === null ? 'model' : 'district',
      value: district ?? model,
      agreement: district === null ? null : agreementOf(district, model, staticData.meta.target),
      parentSlide: slide ? { ...slide, percent: slide.students / school.capacity } : null,
      districtPeak: district === null ? null : districtPeak(published, school.name),
      questionable: district !== null && published ? QUESTIONABLE_FIGURES[level]?.[Number(published.concept)]?.[school.name] ?? null : null,
    });
  }
  return numbers;
}

const percent = (utilization: number) => `${(utilization * 100).toFixed(1)}%`;

/** 84.0% for a district figure, ~81.0% for a model estimate: the same text on the map, scorecard and tables. */
export function headline(schoolNumber: SchoolNumber): string {
  const estimateMark = schoolNumber.source === 'model' ? '~' : '';
  return estimateMark + percent(schoolNumber.value);
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
