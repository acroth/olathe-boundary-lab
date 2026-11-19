// Runs in a web worker: loads the data once, evaluates plans with the model, and caches results per level so editing one level
// (or toggling a setting) doesn't recompute the others.
import { loadStatic, LEVELS, type Level, type Static } from './data';
import { Engine, type LevelResult, type PlanInput } from './model/engine';
import { buildPlan } from './planBuilder';

const CACHE_SIZE = 60;
let engine: Engine | null = null, staticData: Static | null = null;
let loading: Promise<void> | null = null;
const resultCache = new Map<string, LevelResult>();

/** A plan's result for one level depends only on these: the setting, the closures, and that level's edits. */
function cacheKey(level: Level, plan: PlanInput) {
  const edits = plan.edits.filter(edit => edit.level === level).map(edit => `${edit.id}:${edit.school}:${edit.rev ?? 0}`);
  return `${level}|${plan.includePreK}|${JSON.stringify(plan.closures)}|${edits.join(',')}`;
}

/** Levels whose concepts the district published: elementary (concepts 1-4) and middle school (1-5). */
const CONCEPT_LEVELS = ['es', 'ms'] as const;
type ConceptLevel = typeof CONCEPT_LEVELS[number];
interface Reference { closures: string; assignments: Map<string, Int16Array> }
const references = new Map<ConceptLevel, Reference>();
const closuresKey = (closures: Record<string, number>) => JSON.stringify(Object.entries(closures).sort(([first], [second]) => first.localeCompare(second)));

/** Each district concept's home-by-home assignment at a level, worked out once. */
function referenceFor(level: ConceptLevel): Reference {
  let reference = references.get(level);
  if (reference) return reference;
  const combos = staticData!.combos!, assignments = new Map<string, Int16Array>();
  const concepts = level === 'es'
    ? Object.entries(combos.options).map(([option, picks]) => [option, buildPlan(staticData!, picks, null)] as const)
    : (combos.ms?.concepts ?? []).map(concept => [String(concept.id), buildPlan(staticData!, combos.options['1'], null, concept.id)] as const);
  for (const [concept, plan] of concepts) assignments.set(concept, engine!.run(level, { ...plan, includePreK: true }, false).assign);
  reference = { closures: closuresKey(concepts[0]?.[1].closures ?? {}), assignments };
  references.set(level, reference);
  return reference;
}

/** For each district concept, the schools whose homes differ from that concept in this plan (gained or lost even one).
 *  Every other school has exactly the concept's homes, so the district's figure for it still applies. Null when the closures differ. */
function schoolsDifferingFromConcepts(level: ConceptLevel, plan: PlanInput, assign: Int16Array): Record<string, number[]> | null {
  if (!staticData?.combos) return null;
  const reference = referenceFor(level);
  if (closuresKey(plan.closures) !== reference.closures) return null;
  const differing: Record<string, number[]> = {};
  for (const [concept, conceptAssign] of reference.assignments) differing[concept] = schoolsThatDiffer(assign, conceptAssign);
  return differing;
}

/** Schools that gained or lost any home between two assignments. */
export function schoolsThatDiffer(assign: Int16Array, otherAssign: Int16Array): number[] {
  const schools = new Set<number>();
  for (let home = 0; home < assign.length; home++) {
    if (assign[home] === otherAssign[home]) continue;
    if (assign[home] >= 0) schools.add(assign[home]);
    if (otherAssign[home] >= 0) schools.add(otherAssign[home]);
  }
  return [...schools];
}

function evaluate(plan: PlanInput) {
  const levels: Record<string, LevelResult> = {};
  for (const level of LEVELS) {
    const key = cacheKey(level, plan);
    let result = resultCache.get(key);
    if (!result) {
      result = engine!.run(level, plan);
      resultCache.set(key, result);
      if (resultCache.size > CACHE_SIZE) resultCache.delete(resultCache.keys().next().value!);
    }
    levels[level] = result;
  }
  const differsFrom: Partial<Record<Level, Record<string, number[]> | null>> = {};
  for (const level of CONCEPT_LEVELS) differsFrom[level] = schoolsDifferingFromConcepts(level, plan, levels[level].assign);
  return { levels, feeder: engine!.feeder(levels.es.assign, levels.ms.assign), differsFrom };
}

/** Message handler: { id, plans: {name: plan}, base: data folder URL } -> { id, res: {name: result}, ms } or { id, error }. */
export async function handle(message: any): Promise<any> {
  const { id, plans, base } = message as { id: number; plans: Record<string, PlanInput>; base: string };
  if (!loading) loading = loadStatic(base).then(data => { staticData = data; engine = new Engine(data); });
  await loading;
  try {
    const started = performance.now();
    const results: Record<string, any> = {};
    for (const name in plans) results[name] = evaluate(plans[name]);
    return { id, res: results, ms: performance.now() - started };
  } catch (error: any) {
    return { id, error: String(error?.stack ?? error) };
  }
}
