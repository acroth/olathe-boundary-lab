// Runs in a web worker: loads the data once, evaluates plans with the model, and caches results per level so editing one level
// (or toggling a setting) doesn't recompute the others.
import { loadStatic, LEVELS, type Level } from './data';
import { Engine, type LevelResult, type PlanInput } from './model/engine';

const CACHE_SIZE = 60;
let engine: Engine | null = null;
let loading: Promise<void> | null = null;
const resultCache = new Map<string, LevelResult>();

/** A plan's result for one level depends only on these: the setting, the closures, and that level's edits. */
function cacheKey(level: Level, plan: PlanInput) {
  const edits = plan.edits.filter(edit => edit.level === level).map(edit => `${edit.id}:${edit.school}:${edit.rev ?? 0}`);
  return `${level}|${plan.includePreK}|${JSON.stringify(plan.closures)}|${edits.join(',')}`;
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
  return { levels, feeder: engine!.feeder(levels.es.assign, levels.ms.assign) };
}

/** Message handler: { id, plans: {name: plan}, base: data folder URL } -> { id, res: {name: result}, ms } or { id, error }. */
export async function handle(message: any): Promise<any> {
  const { id, plans, base } = message as { id: number; plans: Record<string, PlanInput>; base: string };
  if (!loading) loading = loadStatic(base).then(data => { engine = new Engine(data); });
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
