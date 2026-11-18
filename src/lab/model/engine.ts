// The lab's model: given a plan, which school each home goes to, how many students each school gets by year, how far the
// moved students travel, and the resulting attendance-area shapes.
//
// The numbers come from the pipeline (pipeline/boundary_lab/steps/students.py): every home carries a weight, and each
// school has a factor per year that turns its homes' weights into its projected students. A home keeps its ORIGINAL school's
// factor wherever a plan sends it, so moving an area moves its projected students with it.
import Flatbush from 'flatbush';
import { boolOp, clean } from './clip';
import type { Edit, Level, Static } from '../data';
import { LEVELS } from '../data';
import { buildGraph, shortestDistances } from './graph';
import { MPoly, bboxHit, bboxOf, inMPoly, polyAcres, toMPoly } from './geo';

export interface PlanInput { closures: Record<string, number>; edits: Edit[]; includePreK?: boolean }

export interface SchoolStat {
  i: number;                     // school number (index in schools.json)
  open: boolean;
  capacity: number;
  inBuilding: number;            // Pre-K and Spanish immersion counted in the building (not tied to homes)
  students: number[];            // neighborhood students by year
  total: number[];               // students + inBuilding
  util: number[];                // total / capacity
  peak: number; peakYear: number;  // highest utilization from the first plan year on, and the year it happens
  homes: number; units: number;
  fromClosingSchools: number;    // students (first plan year) arriving from closing schools
  fromOpenSchools: number;       // students (first plan year) arriving from other open schools
  movedOut: number;              // this school's own students now assigned elsewhere
  movedInByOrigin: Record<number, number>;          // students arriving, by original school (first plan year)
  movedInByOriginFall2026: Record<number, number>;  // the same in 2026-27, to set beside the district's counts
  movedInStudents: number;       // students arriving (first plan year) ...
  movedInStudentMiles: number;   // ... times their road miles to this school
  movedInBeyondBusMiles: number; // ... of whom live farther than the bus distance
  ownStudentsUnassigned: number; // this school's original students the plan leaves unassigned
  grades: Record<string, number>[];      // students by grade, by year
  classrooms: Record<string, number>[];  // classrooms needed by grade, by year
  pieces: number;                // separate parts of the attendance area larger than 2 acres
  acres: number;
}
export interface LevelResult {
  level: Level;
  assign: Int16Array;                // per home: school number, or -1 if unassigned
  zones: GeoJSON.FeatureCollection;  // final attendance areas, plus an unassigned feature (school -1)
  schools: Record<number, SchoolStat>;
  summary: {
    unassignedStudents: number;
    studentsFromClosingSchools: number;
    averageTripMiles: number;        // moved students' average road trip
    shareBeyondBusMiles: number;     // share of moved students living past the bus distance
    movedFromOpen: number;
    maxUtil: number; maxUtilSchool: number; maxUtilYear: number;
    inBuildingNotPlaced: number;     // Pre-K / immersion at closing schools that the plan doesn't place anywhere
    overTarget: number[];            // open schools whose peak is above the district's target utilization
  };
}

const FEET_PER_MILE = 5280;
const MIN_PIECE_ACRES = 2;   // smaller separate parts of an area are slivers, not real pieces
const UNASSIGNED = -1;
const closedAreaKey = (school: number) => -100 - school;   // closed schools' areas stay separate while zones are built
export const clipStats = { fail: 0, retry: 0 };

type BooleanOp = 'union' | 'difference' | 'intersection';
/** A polygon boolean op that falls back to `fallback` instead of throwing (rare robustness failures). */
function clip(op: BooleanOp, a: MPoly, b: MPoly, fallback: MPoly): MPoly {
  try { return boolOp(op, a, b); } catch { clipStats.fail++; return fallback; }
}

/** Empty per-school tally, filled in by Engine.run */
function emptyStat(school: number, open: boolean, capacity: number, peakYear: number): SchoolStat {
  return {
    i: school, open, capacity, inBuilding: 0, students: [], total: [], util: [], peak: 0, peakYear, homes: 0, units: 0,
    fromClosingSchools: 0, fromOpenSchools: 0, movedOut: 0, movedInByOrigin: {}, movedInByOriginFall2026: {},
    movedInStudents: 0, movedInStudentMiles: 0, movedInBeyondBusMiles: 0, ownStudentsUnassigned: 0,
    grades: [], classrooms: [], pieces: 0, acres: 0,
  };
}

export class Engine {
  S: Static;
  private homeIndex: Flatbush;                               // spatial index of home points
  private roadGraph: ReturnType<typeof buildGraph>;
  private feetFromSchool = new Map<number, Float32Array>();  // school -> road feet to every street node (cached)
  private todaysAreas: Record<Level, Map<number, MPoly>>;
  private districtShape: MPoly;
  /** schools whose area an edit changed in the last zones() call (only those need display cleanup) */
  changedAreas = new Set<number>();

  constructor(S: Static) {
    this.S = S;
    const homes = S.homes;
    this.homeIndex = new Flatbush(homes.n);
    for (let home = 0; home < homes.n; home++) this.homeIndex.add(homes.lon[home], homes.lat[home], homes.lon[home], homes.lat[home]);
    this.homeIndex.finish();
    this.roadGraph = buildGraph(S.streets, false);
    this.todaysAreas = { es: new Map(), ms: new Map(), hs: new Map() };
    for (const level of LEVELS) for (const feature of S.zones[level].features) {
      const school = feature.properties!.school as number;
      this.todaysAreas[level].set(school, [...(this.todaysAreas[level].get(school) ?? []), ...toMPoly(feature.geometry as any)]);
    }
    this.districtShape = S.district.features.flatMap(feature => toMPoly(feature.geometry as any));
  }

  // ----- shapes for display -----------------------------------------------------------------------------------------------
  private cleanupCache = new Map<string, ReturnType<typeof clean>>();
  /** Display version of an area with hairline slits and slivers removed; cached by a fingerprint of the shape. */
  cleaned(shape: MPoly) {
    let count = 0, sumX = 0, sumY = 0;
    for (const polygon of shape) for (const ring of polygon) for (const [x, y] of ring) { count++; sumX += x * (count % 7 + 1); sumY += y * (count % 5 + 1); }
    const key = `${shape.length}:${count}:${sumX.toFixed(6)}:${sumY.toFixed(6)}`;
    let result = this.cleanupCache.get(key);
    if (!result) {
      try { result = clean(shape); } catch { result = { display: shape, closed: shape }; }
      this.cleanupCache.set(key, result);
      if (this.cleanupCache.size > 400) this.cleanupCache.delete(this.cleanupCache.keys().next().value!);
    }
    return result;
  }

  // ----- trips ------------------------------------------------------------------------------------------------------------
  /** Road feet from a school to every street node (computed once per school). */
  roadFeetFrom(school: number): Float32Array {
    let feet = this.feetFromSchool.get(school);
    if (!feet) { feet = shortestDistances(this.roadGraph, this.S.schools[school].node); this.feetFromSchool.set(school, feet); }
    return feet;
  }
  /** Road miles from a home to a school (to the home's nearest street node, plus the straight line from there). */
  tripMiles(home: number, school: number) {
    return (this.roadFeetFrom(school)[this.S.homes.node[home]] + this.S.homes.offsetFt[home]) / FEET_PER_MILE;
  }

  // ----- closures ---------------------------------------------------------------------------------------------------------
  isClosed(plan: PlanInput, school: number) { return plan.closures[String(school)] !== undefined; }

  /** Spanish immersion counted in a building: Black Bob's own figure while it's open; once Black Bob closes, the share
   *  expected to follow the program goes to its new host (Arbor Creek). */
  immersionInBuilding(plan: PlanInput, school: number) {
    const schools = this.S.schools;
    const blackBob = schools.find(x => x.level === 'es' && x.name === 'Black Bob');
    const host = schools.find(x => x.level === 'es' && x.immersion > 0 && x.name !== 'Black Bob');
    if (!blackBob || !host) return schools[school].immersion;
    const blackBobClosed = this.isClosed(plan, blackBob.i);
    if (school === blackBob.i) return blackBobClosed ? 0 : blackBob.immersion;
    if (school === host.i) return blackBobClosed ? host.immersion : 0;
    return 0;
  }

  private inBuilding(plan: PlanInput, school: number) {
    const prek = plan.includePreK === false ? 0 : this.S.schools[school].prek;
    return this.immersionInBuilding(plan, school) + prek;
  }

  // ----- the plan applied to homes and shapes -----------------------------------------------------------------------------
  /** Each home's school under the plan: its original school (unassigned if that school closes), then each edit in order. */
  assign(level: Level, plan: PlanInput): Int16Array {
    const homes = this.S.homes, school = new Int16Array(homes.n), original = homes.orig[level];
    for (let home = 0; home < homes.n; home++) school[home] = this.isClosed(plan, original[home]) ? UNASSIGNED : original[home];
    for (const edit of plan.edits) {
      if (edit.level !== level) continue;
      const shape = toMPoly(edit.geom), [x0, y0, x1, y1] = bboxOf(shape);
      const target = edit.school >= 0 && this.isClosed(plan, edit.school) ? UNASSIGNED : edit.school;
      for (const home of this.homeIndex.search(x0, y0, x1, y1)) if (inMPoly(homes.lon[home], homes.lat[home], shape)) school[home] = target;
    }
    return school;
  }

  /** Final attendance areas: today's areas with each edit cut out of whatever it overlaps and added to its school.
   *  Key -1 holds the unassigned area; closed schools' leftover areas are kept under closedAreaKey(school). */
  zones(level: Level, plan: PlanInput): Map<number, MPoly> {
    const areas = new Map<number, MPoly>();
    const changed = this.changedAreas = new Set<number>([UNASSIGNED]);
    for (const [school, shape] of this.todaysAreas[level]) areas.set(this.isClosed(plan, school) ? closedAreaKey(school) : school, shape);
    areas.set(UNASSIGNED, []);
    for (const edit of plan.edits) {
      if (edit.level !== level) continue;
      const editShape = toMPoly(edit.geom);
      if (!editShape.length) continue;
      const editBox = bboxOf(editShape);
      for (const [key, shape] of areas) {
        if (!shape.length || !bboxHit(bboxOf(shape), editBox)) continue;
        areas.set(key, clip('difference', shape, editShape, shape));
        changed.add(key);
      }
      const target = edit.school >= 0 && !this.isClosed(plan, edit.school) ? edit.school : UNASSIGNED;
      const current = areas.get(target) ?? [];
      areas.set(target, current.length ? clip('union', current, editShape, [...current, ...editShape]) : editShape);
      changed.add(target);
    }
    for (const [key, shape] of areas) if (shape.length && changed.has(key)) areas.set(key, clip('intersection', shape, this.districtShape, shape));
    return areas;
  }

  // ----- evaluating a plan ------------------------------------------------------------------------------------------------
  run(level: Level, plan: PlanInput, withZones = true): LevelResult {
    const S = this.S, homes = S.homes, yearCount = S.meta.years.length, firstPlanYear = S.meta.firstPlanYear;
    const assigned = this.assign(level, plan);
    const levelSchools = S.schools.filter(school => school.level === level);
    const weight = homes.w[level], original = homes.orig[level];
    const studentsInFirstPlanYear = (home: number) => weight[home] * S.schools[original[home]].factor[firstPlanYear];

    const stats: Record<number, SchoolStat> = {};
    const weightByOrigin = new Map<number, Map<number, number>>();   // school -> original school -> summed home weight
    for (const school of levelSchools) {
      stats[school.i] = emptyStat(school.i, !this.isClosed(plan, school.i), school.capacity, firstPlanYear);
      weightByOrigin.set(school.i, new Map());
    }

    // 1. Walk every home: add its weight to its school, and tally moves and trips
    const unassignedWeightByOrigin = new Map<number, number>();
    let movedStudents = 0, movedStudentMiles = 0, movedBeyondBusMiles = 0, movedFromOpen = 0;
    for (let home = 0; home < homes.n; home++) {
      const school = assigned[home], origin = original[home];
      if (school < 0) { unassignedWeightByOrigin.set(origin, (unassignedWeightByOrigin.get(origin) ?? 0) + weight[home]); continue; }
      const byOrigin = weightByOrigin.get(school)!;
      byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + weight[home]);
      const stat = stats[school];
      stat.homes++; stat.units += homes.units[home];
      if (school === origin) continue;

      const students = studentsInFirstPlanYear(home);
      if (this.isClosed(plan, origin)) stat.fromClosingSchools += students;
      else { stat.fromOpenSchools += students; movedFromOpen += students; stats[origin].movedOut += students; }
      stat.movedInByOrigin[origin] = (stat.movedInByOrigin[origin] ?? 0) + students;
      stat.movedInByOriginFall2026[origin] = (stat.movedInByOriginFall2026[origin] ?? 0) + weight[home] * S.schools[origin].factor[Math.max(0, firstPlanYear - 1)];
      if (students > 0) {
        const miles = this.tripMiles(home, school);
        movedStudents += students; movedStudentMiles += students * miles;
        stat.movedInStudents += students; stat.movedInStudentMiles += students * miles;
        if (miles > S.meta.busMiles) { movedBeyondBusMiles += students; stat.movedInBeyondBusMiles += students; }
      }
    }

    // 2. Each school's students, grades and classrooms by year
    for (const school of levelSchools) {
      const stat = stats[school.i];
      stat.inBuilding = stat.open ? this.inBuilding(plan, school.i) : 0;
      for (let year = 0; year < yearCount; year++) {
        let students = 0;
        const grades: Record<string, number> = {};
        for (const [origin, summedWeight] of weightByOrigin.get(school.i)!) {
          const originSchool = S.schools[origin], fromOrigin = summedWeight * originSchool.factor[year];
          students += fromOrigin;
          for (const grade in originSchool.gradeShare) grades[grade] = (grades[grade] ?? 0) + fromOrigin * originSchool.gradeShare[grade];
        }
        stat.students.push(students);
        stat.total.push(students + stat.inBuilding);
        stat.util.push(stat.open ? (students + stat.inBuilding) / school.capacity : 0);
        stat.grades.push(grades);
        const classrooms: Record<string, number> = {};
        for (const grade in grades) {
          const classSize = S.meta.classSize[grade];
          classrooms[grade] = classSize ? Math.ceil(grades[grade] / classSize - 1e-9) : 0;
        }
        stat.classrooms.push(classrooms);
      }
      for (let year = firstPlanYear; year < yearCount; year++) if (stat.util[year] > stat.peak) { stat.peak = stat.util[year]; stat.peakYear = year; }
    }

    // 3. District-wide summary
    let unassignedStudents = 0;
    for (const [origin, summedWeight] of unassignedWeightByOrigin) {
      const students = summedWeight * S.schools[origin].factor[firstPlanYear];
      unassignedStudents += students;
      if (stats[origin]) stats[origin].ownStudentsUnassigned += students;
    }
    let maxUtil = 0, maxUtilSchool = -1, maxUtilYear = firstPlanYear;
    const overTarget: number[] = [];
    for (const school of levelSchools) {
      const stat = stats[school.i];
      if (!stat.open) continue;
      if (stat.peak > maxUtil) { maxUtil = stat.peak; maxUtilSchool = school.i; maxUtilYear = stat.peakYear; }
      if (stat.peak > S.meta.target + 1e-9) overTarget.push(school.i);
    }
    const inBuildingNotPlaced = levelSchools.filter(school => this.isClosed(plan, school.i)).reduce((sum, school) => sum + this.inBuilding(plan, school.i), 0);

    return {
      level, assign: assigned, schools: stats,
      zones: { type: 'FeatureCollection', features: withZones ? this.zoneFeatures(level, plan, stats) : [] },
      summary: {
        unassignedStudents,
        studentsFromClosingSchools: levelSchools.reduce((sum, school) => sum + stats[school.i].fromClosingSchools, 0),
        averageTripMiles: movedStudents ? movedStudentMiles / movedStudents : 0,
        shareBeyondBusMiles: movedStudents ? movedBeyondBusMiles / movedStudents : 0,
        movedFromOpen, maxUtil, maxUtilSchool, maxUtilYear, inBuildingNotPlaced, overTarget,
      },
    };
  }

  /** Areas as map features (cleaned for display), recording each school's number of pieces and acres. */
  private zoneFeatures(level: Level, plan: PlanInput, stats: Record<number, SchoolStat>): GeoJSON.Feature[] {
    const features: GeoJSON.Feature[] = [];
    for (const [key, rawShape] of this.zones(level, plan)) {
      const shape = this.changedAreas.has(key) ? this.cleaned(rawShape) : { display: rawShape, closed: rawShape };
      if (!shape.display.length) continue;
      if (key >= 0) {
        stats[key].pieces = shape.closed.filter(polygon => polyAcres(polygon) > MIN_PIECE_ACRES).length;
        stats[key].acres = rawShape.reduce((sum, polygon) => sum + polyAcres(polygon), 0);
      }
      features.push({ type: 'Feature', properties: { school: key < 0 ? UNASSIGNED : key, orig: key <= -100 ? -100 - key : key },
                      geometry: { type: 'MultiPolygon', coordinates: shape.display } });
    }
    return features;
  }

  /** For each elementary area: the share of its middle-school students going to each middle school (2% and up). */
  feeder(elementaryOf: Int16Array, middleOf: Int16Array) {
    const homes = this.S.homes, weightByPair = new Map<number, Map<number, number>>();
    for (let home = 0; home < homes.n; home++) {
      const elementary = elementaryOf[home], middle = middleOf[home];
      if (elementary < 0 || middle < 0) continue;
      const byMiddle = weightByPair.get(elementary) ?? new Map();
      byMiddle.set(middle, (byMiddle.get(middle) ?? 0) + homes.w.ms[home]);
      weightByPair.set(elementary, byMiddle);
    }
    const result: { es: number; split: { ms: number; share: number }[] }[] = [];
    for (const [elementary, byMiddle] of weightByPair) {
      const total = [...byMiddle.values()].reduce((sum, value) => sum + value, 0) || 1;
      const split = [...byMiddle].map(([ms, value]) => ({ ms, share: value / total })).filter(x => x.share >= 0.02).sort((a, b) => b.share - a.share);
      result.push({ es: elementary, split });
    }
    return result;
  }
}
