import { loadStatic, LEVELS, type Level } from './data';
import { Engine, type LevelResult, type PlanInput } from './model/engine';

let engine: Engine | null = null;
let ready: Promise<void> | null = null;
const cache = new Map<string, LevelResult>();

function keyFor(level: Level, plan: PlanInput) {
  const e = plan.edits.filter(x => x.level === level).map(x => x.id + ':' + x.school + ':' + (x.rev ?? 0));
  return level + '|' + plan.includePreK + '|' + JSON.stringify(plan.closures) + '|' + e.join(',');
}
function runPlan(plan: PlanInput) {
  const out: Record<string, LevelResult> = {};
  for (const lv of LEVELS) {
    const k = keyFor(lv, plan);
    let r = cache.get(k);
    if (!r) { r = engine!.run(lv, plan); cache.set(k, r); if (cache.size > 60) cache.delete(cache.keys().next().value!); }
    out[lv] = r;
  }
  const feeder = engine!.feeder(out.es.assign, out.ms.assign);
  return { levels: out, feeder };
}

export async function handle(data: any): Promise<any> {
  const { id, plans, base } = data as { id: number; plans: Record<string, PlanInput>; base: string };
  if (!ready) ready = loadStatic(base).then(S => { engine = new Engine(S); });
  await ready;
  try {
    const t0 = performance.now();
    const res: Record<string, any> = {};
    for (const k in plans) res[k] = runPlan(plans[k]);
    return { id, res, ms: performance.now() - t0 };
  } catch (err: any) {
    return { id, error: String(err?.stack ?? err) };
  }
}
