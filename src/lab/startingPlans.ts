// The plans Free draw can start from or compare with, one school level at a time: today's lines with the closing schools left
// blank, or one of the district's concepts for that level. Choosing one only replaces that level's areas.
import type { Level, Static } from './data';
import { publishedConcept, publishedOption } from './numbers';
import { buildPlan } from './planBuilder';
import type { Plan } from './store';

export const BLANK_START = 'blank';
const ELEMENTARY_PREFIX = 'dc', MIDDLE_PREFIX = 'ms';

export interface StartingPlan { id: string; name: string }

/** The choices for a level. High schools don't change, so they have none. */
export function startingPlans(staticData: Static, level: Level): StartingPlan[] {
  const blank = { id: BLANK_START, name: 'Current boundaries' };   // closing schools' areas are left for you to assign
  if (level === 'es') {
    return [blank, ...Object.keys(staticData.combos!.options).map(option => ({ id: ELEMENTARY_PREFIX + option, name: `District concept ${option}` }))];
  }
  if (level === 'ms') {
    return [blank, ...(staticData.combos?.ms?.concepts ?? []).map(concept => ({ id: MIDDLE_PREFIX + concept.id, name: `District concept ${concept.id}` }))];
  }
  return [];
}

/** The plan with one level's areas replaced by a starting plan's; the other levels keep their areas. */
export function withStartingPlan(staticData: Static, plan: Plan, level: Level, startId: string): Plan {
  const combos = staticData.combos!;
  const blankPreset = staticData.presets.find(preset => preset.id === combos.basePreset)!;
  const otherLevelEdits = plan.edits.filter(edit => edit.level !== level).map(edit => ({ ...edit }));

  if (level === 'es') {
    const preset = startId === BLANK_START ? blankPreset : staticData.presets.find(candidate => candidate.id === startId)!;
    const elementaryEdits = preset.edits.filter(edit => edit.level === 'es').map(edit => ({ ...edit }));
    return { preset: preset.id, closures: { ...preset.closures }, edits: [...elementaryEdits, ...otherLevelEdits] };
  }

  const conceptId = startId === BLANK_START ? 0 : Number(startId.slice(MIDDLE_PREFIX.length));
  const middleSchoolEdits = buildPlan(staticData, combos.options['1'], null, conceptId).edits.filter(edit => edit.level === 'ms');
  return { ...plan, closures: { ...blankPreset.closures }, edits: [...otherLevelEdits, ...middleSchoolEdits] };
}

/** Which starting plan this level matches exactly, or '' once it has been edited. */
export function currentStartingPlan(staticData: Static, plan: Plan, level: Level): string {
  const levelEditIds = plan.edits.filter(edit => edit.level === level).map(edit => edit.id).sort().join();
  if (level === 'es') {
    const option = publishedOption(staticData, plan);
    if (option) return ELEMENTARY_PREFIX + option;
    const blankPreset = staticData.presets.find(preset => preset.id === staticData.combos!.basePreset)!;
    const blankIds = blankPreset.edits.filter(edit => edit.level === 'es').map(edit => edit.id).sort().join();
    return levelEditIds === blankIds ? BLANK_START : '';
  }
  if (level === 'ms') {
    const conceptId = publishedConcept(staticData, plan);
    if (conceptId) return MIDDLE_PREFIX + conceptId;
    return levelEditIds === '' ? BLANK_START : '';
  }
  return '';
}

/** Free draw's default: today's lines at every level, with the closing schools' areas left for you to assign. */
export function blankPlan(staticData: Static, plan: Plan): Plan {
  return withStartingPlan(staticData, withStartingPlan(staticData, plan, 'es', BLANK_START), 'ms', BLANK_START);
}
