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
    for (const o in t.movedInByOrigin) if (t.movedInByOrigin[o] > 0.5 && on.has(S.schools[Number(o)].area)) vis.add(Number(k));
  }
  for (const s of S.schools) if (closed(s.i) && !on.has(s.area)) vis.delete(s.i);
  return vis;
}

/** The level's summary (see LevelResult.summary), counting only the visible schools. */
export function summarize(S: Static, r: LevelResult, vis: Set<number>, level: Level): LevelResult['summary'] {
  let unassignedStudents = 0, studentsFromClosingSchools = 0, movedStudents = 0, movedStudentMiles = 0, movedBeyondBusMiles = 0;
  let movedFromOpen = 0, inBuildingNotPlaced = 0;
  let maxUtil = 0, maxUtilSchool = -1, maxUtilYear = S.meta.firstPlanYear;
  const overTarget: number[] = [];
  for (const school of S.schools) {
    if (school.level !== level || !vis.has(school.i)) continue;
    const stat = r.schools[school.i];
    unassignedStudents += stat.ownStudentsUnassigned;
    if (!stat.open) { inBuildingNotPlaced += school.prek; continue; }
    studentsFromClosingSchools += stat.fromClosingSchools;
    movedFromOpen += stat.fromOpenSchools;
    movedStudents += stat.movedInStudents;
    movedStudentMiles += stat.movedInStudentMiles;
    movedBeyondBusMiles += stat.movedInBeyondBusMiles;
    if (stat.peak > maxUtil) { maxUtil = stat.peak; maxUtilSchool = school.i; maxUtilYear = stat.peakYear; }
    if (stat.peak > S.meta.target + 1e-9) overTarget.push(school.i);
  }
  return {
    unassignedStudents, studentsFromClosingSchools,
    averageTripMiles: movedStudents ? movedStudentMiles / movedStudents : 0,
    shareBeyondBusMiles: movedStudents ? movedBeyondBusMiles / movedStudents : 0,
    movedFromOpen, maxUtil, maxUtilSchool, maxUtilYear, inBuildingNotPlaced, overTarget,
  };
}
