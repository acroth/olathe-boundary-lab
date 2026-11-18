// Which schools to show: those in the chosen high-school areas, plus the district's listed receivers for closing schools in
// those areas and any school the plan sends their students to (so receivers just across an area line still show).
import type { Level, Static } from './data';
import type { LevelResult } from './model/engine';
import type { Results } from './App';

export const AREAS = ['South', 'East', 'North', 'West', 'Northwest'];

export function visibleSet(S: Static, res: Results | null, areas: string[], closures: Record<string, number>): Set<number> {
  const on = new Set(areas), vis = new Set<number>();
  const closed = (i: number) => closures[String(i)] !== undefined;
  for (const s of S.schools) if (on.has(s.area)) vis.add(s.i);
  for (const s of S.schools) {
    if (!closed(s.i) || !on.has(s.area)) continue;
    for (const r of S.receivers[String(s.i)] ?? []) if (!closed(r)) vis.add(r);
  }
  if (res) for (const lv of ['es', 'ms', 'hs'] as Level[]) for (const k in res.levels[lv].schools) {
    const t = res.levels[lv].schools[k];
    for (const o in t.fromOrig) if (t.fromOrig[o] > 0.5 && on.has(S.schools[Number(o)].area)) vis.add(Number(k));
  }
  for (const s of S.schools) if (closed(s.i) && !on.has(s.area)) vis.delete(s.i);
  return vis;
}

/** level summary restricted to the visible schools */
export function summarize(S: Static, r: LevelResult, vis: Set<number>, level: Level) {
  let unassigned = 0, displaced = 0, tripW = 0, tripSum = 0, over = 0, movedFromOpen = 0, fixedNotPlaced = 0;
  let maxU = 0, maxS = -1, maxY = S.meta.firstPlanYear; const overT: number[] = [];
  for (const s of S.schools) {
    if (s.level !== level || !vis.has(s.i)) continue;
    const t = r.schools[s.i];
    unassigned += t.unassignedOwn;
    if (!t.open) { fixedNotPlaced += s.prek; continue; }
    displaced += t.fromClosed; movedFromOpen += t.fromOpen; tripW += t.tripW; tripSum += t.tripSum; over += t.over;
    if (t.peak > maxU) { maxU = t.peak; maxS = s.i; maxY = t.peakYear; }
    if (t.peak > S.meta.target + 1e-9) overT.push(s.i);
  }
  return { unassignedStudents: unassigned, displaced, avgTripMi: tripW ? tripSum / tripW : 0, over25Share: tripW ? over / tripW : 0,
    movedFromOpen, maxUtil: maxU, maxUtilSchool: maxS, maxUtilYear: maxY, fixedNotPlaced, overTarget: overT };
}
