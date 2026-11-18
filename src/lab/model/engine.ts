import Flatbush from 'flatbush';
import { boolOp, clean } from './clip';
import type { Edit, Level, Static } from '../data';
import { LEVELS } from '../data';
import { buildGraph, dijkstraAll } from './graph';
import { MPoly, bboxHit, bboxOf, inMPoly, polyAcres, toMPoly } from './geo';

export interface PlanInput { closures: Record<string, number>; edits: Edit[]; includePreK?: boolean }

export interface SchoolStat {
  i: number; open: boolean; capacity: number; fixed: number;
  students: number[];        // neighborhood students by year
  total: number[];           // students + fixed load
  util: number[];            // total / capacity
  peak: number; peakYear: number;
  homes: number; units: number;
  fromClosed: number;        // students (first plan year) arriving from closed schools
  fromOrig: Record<number, number>;  // moved-in students by original school
  fromOrigPrev: Record<number, number>;  // the same, in the year before the first plan year (2026-27), to set beside the district's counts
  tripW: number; tripSum: number; over: number;   // road-trip accumulators for moved-in students
  unassignedOwn: number;     // this school's original students left unassigned
  fromOpen: number;          // students moved in from other open schools
  movedOut: number;          // this school's original students now assigned elsewhere
  grades: Record<string, number>[];   // by year
  classrooms: Record<string, number>[];
  pieces: number; acres: number;
}
export interface LevelResult {
  level: Level;
  assign: Int16Array;               // per home: school index or -1
  zones: GeoJSON.FeatureCollection;  // dissolved final zones (+ an unassigned feature, school -1)
  schools: Record<number, SchoolStat>;
  summary: {
    unassignedStudents: number; displaced: number; avgTripMi: number; over25Share: number; movedFromOpen: number;
    maxUtil: number; maxUtilSchool: number; maxUtilYear: number; fixedNotPlaced: number; overTarget: number[];
  };
}

const MI = 5280;
const q = (mp: MPoly, g = 1e6): MPoly => mp.map(p => p.map(r => r.map(([x, y]) => [Math.round(x * g) / g, Math.round(y * g) / g] as [number, number])));
export const clipStats = { fail: 0, retry: 0 };
type Op = 'union' | 'difference' | 'intersection';
/** polygon boolean op with a retry on snapped coordinates; returns `fallback` if both fail */
function clip(op: Op, a: MPoly, b: MPoly, fallback: MPoly): MPoly {
  try { return boolOp(op, a, b); } catch { clipStats.fail++; return fallback; }
}

export class Engine {
  S: Static; idx: Flatbush; dist = new Map<number, Float32Array>(); baseZones: Record<Level, Map<number, MPoly>>; districtMP: MPoly;
  graphAll: ReturnType<typeof buildGraph>;
  constructor(S: Static) {
    this.S = S;
    const h = S.homes;
    this.idx = new Flatbush(h.n);
    for (let i = 0; i < h.n; i++) this.idx.add(h.lon[i], h.lat[i], h.lon[i], h.lat[i]);
    this.idx.finish();
    this.graphAll = buildGraph(S.streets, false);
    this.baseZones = { es: new Map(), ms: new Map(), hs: new Map() };
    for (const lv of LEVELS) for (const f of S.zones[lv].features) {
      const s = f.properties!.school as number;
      this.baseZones[lv].set(s, [...(this.baseZones[lv].get(s) ?? []), ...toMPoly(f.geometry as any)]);
    }
    this.districtMP = S.district.features.flatMap(f => toMPoly(f.geometry as any));
  }

  private cleanCache = new Map<string, ReturnType<typeof clean>>();
  /** display geometry with hairline slits and slivers removed; cached by a fingerprint of the input */
  cleaned(mp: MPoly) {
    let n = 0, sx = 0, sy = 0;
    for (const p of mp) for (const r of p) for (const [x, y] of r) { n++; sx += x * (n % 7 + 1); sy += y * (n % 5 + 1); }
    const k = `${mp.length}:${n}:${sx.toFixed(6)}:${sy.toFixed(6)}`;
    let c = this.cleanCache.get(k);
    if (!c) {
      try { c = clean(mp); } catch { c = { display: mp, closed: mp }; }
      this.cleanCache.set(k, c); if (this.cleanCache.size > 400) this.cleanCache.delete(this.cleanCache.keys().next().value!);
    }
    return c;
  }

  distTo(school: number): Float32Array {
    let d = this.dist.get(school);
    if (!d) { d = dijkstraAll(this.graphAll, this.S.schools[school].node); this.dist.set(school, d); }
    return d;
  }
  /** road miles from home h to school s */
  miles(h: number, s: number) {
    const d = this.distTo(s)[this.S.homes.node[h]];
    return (d + this.S.homes.offsetFt[h]) / MI;
  }

  isClosed(plan: PlanInput, s: number) { return plan.closures[String(s)] !== undefined; }

  /** Spanish immersion: Black Bob's own value while it is open (immersion beyond the in-area students who would stay);
   *  when Black Bob closes, the host's value (the share expected to follow the program) goes to the host (Arbor Creek). */
  immersionAt(plan: PlanInput, s: number) {
    const sc = this.S.schools[s];
    const bb = this.S.schools.find(x => x.level === 'es' && x.name === 'Black Bob');
    const host = this.S.schools.find(x => x.level === 'es' && x.immersion > 0 && x.name !== 'Black Bob');
    if (!bb || !host) return sc.immersion;
    const amount = host.immersion;
    if (s === bb.i) return this.isClosed(plan, bb.i) ? 0 : bb.immersion;
    if (s === host.i) return this.isClosed(plan, bb.i) ? amount : 0;
    return 0;
  }

  assign(level: Level, plan: PlanInput): Int16Array {
    const h = this.S.homes, a = new Int16Array(h.n), orig = h.orig[level];
    for (let i = 0; i < h.n; i++) a[i] = this.isClosed(plan, orig[i]) ? -1 : orig[i];
    for (const e of plan.edits) {
      if (e.level !== level) continue;
      const mp = toMPoly(e.geom), bb = bboxOf(mp);
      const target = e.school >= 0 && this.isClosed(plan, e.school) ? -1 : e.school;
      for (const i of this.idx.search(bb[0], bb[1], bb[2], bb[3])) if (inMPoly(h.lon[i], h.lat[i], mp)) a[i] = target;
    }
    return a;
  }

  /** final zones per school; key -1 holds the unassigned area (closed schools' areas and areas drawn as unassigned) */
  /** schools whose area was changed by an edit in the last zones() call (only those need cleaning) */
  touched = new Set<number>();
  zones(level: Level, plan: PlanInput): Map<number, MPoly> {
    const z = new Map<number, MPoly>(); const touched = this.touched = new Set<number>([-1]);
    // closed schools' areas stay separate (key -100 - school) so the lines between them can be used to split
    for (const [s, mp] of this.baseZones[level]) z.set(this.isClosed(plan, s) ? -100 - s : s, mp);
    z.set(-1, []);
    for (const e of plan.edits) {
      if (e.level !== level) continue;
      const mp = toMPoly(e.geom); if (!mp.length) continue;
      const bb = bboxOf(mp);
      for (const [s, cur] of z) {
        if (!cur.length || !bboxHit(bboxOf(cur), bb)) continue;
        z.set(s, clip('difference', cur, mp, cur)); touched.add(s);
      }
      const target = e.school >= 0 && !this.isClosed(plan, e.school) ? e.school : -1;
      const cur = z.get(target) ?? [];
      z.set(target, cur.length ? clip('union', cur, mp, [...cur, ...mp]) : mp); touched.add(target);
    }
    for (const [s, mp] of z) if (mp.length && touched.has(s)) z.set(s, clip('intersection', mp, this.districtMP, mp));
    return z;
  }

  run(level: Level, plan: PlanInput, withZones = true): LevelResult {
    const S = this.S, h = S.homes, Y = S.meta.years.length, y0 = S.meta.firstPlanYear;
    const a = this.assign(level, plan);
    const lvSchools = S.schools.filter(s => s.level === level);
    const w = h.w[level], orig = h.orig[level];
    // M[s][o]: weight at school s that originally belonged to o
    const M = new Map<number, Map<number, number>>();
    const st: Record<number, SchoolStat> = {};
    for (const s of lvSchools) {
      st[s.i] = { i: s.i, open: !this.isClosed(plan, s.i), capacity: s.capacity, fixed: 0, students: [], total: [], util: [], peak: 0, peakYear: y0,
        homes: 0, units: 0, fromClosed: 0, fromOrig: {}, fromOrigPrev: {}, tripW: 0, tripSum: 0, over: 0, unassignedOwn: 0, fromOpen: 0, movedOut: 0, grades: [], classrooms: [], pieces: 0, acres: 0 };
      M.set(s.i, new Map());
    }
    const unM = new Map<number, number>();
    let tripW = 0, tripSum = 0, over = 0, movedFromOpen = 0;
    const f0 = (o: number) => S.schools[o].factor[y0];
    for (let i = 0; i < h.n; i++) {
      const s = a[i], o = orig[i], wi = w[i];
      if (s < 0) { unM.set(o, (unM.get(o) ?? 0) + wi); continue; }
      const m = M.get(s)!; m.set(o, (m.get(o) ?? 0) + wi);
      const t = st[s]; t.homes++; t.units += h.units[i];
      if (s !== o) {
        const stu = wi * f0(o);
        if (this.isClosed(plan, o)) t.fromClosed += stu; else { t.fromOpen += stu; movedFromOpen += stu; st[o].movedOut += stu; }
        t.fromOrig[o] = (t.fromOrig[o] ?? 0) + stu;
        t.fromOrigPrev[o] = (t.fromOrigPrev[o] ?? 0) + wi * S.schools[o].factor[Math.max(0, y0 - 1)];
        if (stu > 0) { const mi = this.miles(i, s); tripW += stu; tripSum += stu * mi; t.tripW += stu; t.tripSum += stu * mi; if (mi > S.meta.busMiles) { over += stu; t.over += stu; } }
      }
    }
    for (const s of lvSchools) {
      const t = st[s.i], m = M.get(s.i)!;
      t.fixed = t.open ? this.immersionAt(plan, s.i) + (plan.includePreK === false ? 0 : s.prek) : 0;
      for (let y = 0; y < Y; y++) {
        let n = 0; const g: Record<string, number> = {};
        for (const [o, wt] of m) {
          const so = S.schools[o], v = wt * so.factor[y]; n += v;
          for (const k in so.gradeShare) g[k] = (g[k] ?? 0) + v * so.gradeShare[k];
        }
        t.students.push(n); t.total.push(n + t.fixed); t.util.push(t.open ? (n + t.fixed) / s.capacity : 0);
        t.grades.push(g);
        const c: Record<string, number> = {};
        for (const k in g) c[k] = S.meta.classSize[k] ? Math.ceil(g[k] / S.meta.classSize[k] - 1e-9) : 0;
        t.classrooms.push(c);
      }
      for (let y = y0; y < Y; y++) if (t.util[y] > t.peak) { t.peak = t.util[y]; t.peakYear = y; }
    }
    let unassigned = 0; for (const [o, wt] of unM) { unassigned += wt * f0(o); if (st[o]) st[o].unassignedOwn += wt * f0(o); }
    let displaced = 0; for (const s of lvSchools) displaced += st[s.i].fromClosed;
    let maxU = 0, maxS = -1, maxY = y0; const overT: number[] = [];
    for (const s of lvSchools) { const t = st[s.i]; if (t.open && t.peak > maxU) { maxU = t.peak; maxS = s.i; maxY = t.peakYear; } if (t.open && t.peak > S.meta.target + 1e-9) overT.push(s.i); }
    const fixedNotPlaced = lvSchools.filter(s => this.isClosed(plan, s.i)).reduce((q, s) => q + this.immersionAt(plan, s.i) + (plan.includePreK === false ? 0 : s.prek), 0);

    const features: GeoJSON.Feature[] = [];
    if (withZones) {
      const z = this.zones(level, plan);
      for (const [s, raw] of z) {
        const c = this.touched.has(s) ? this.cleaned(raw) : { display: raw, closed: raw };
        if (!c.display.length) continue;
        if (s >= 0) { st[s].pieces = c.closed.filter(p => polyAcres(p) > 2).length; st[s].acres = raw.reduce((q, p) => q + polyAcres(p), 0); }
        features.push({ type: 'Feature', properties: { school: s < 0 ? -1 : s, orig: s <= -100 ? -100 - s : s }, geometry: { type: 'MultiPolygon', coordinates: c.display } });
      }
    }
    return {
      level, assign: a, zones: { type: 'FeatureCollection', features }, schools: st,
      summary: { unassignedStudents: unassigned, displaced, avgTripMi: tripW ? tripSum / tripW : 0, over25Share: tripW ? over / tripW : 0,
        movedFromOpen, maxUtil: maxU, maxUtilSchool: maxS, maxUtilYear: maxY, fixedNotPlaced, overTarget: overT },
    };
  }

  /** ES zone -> share of its middle-school students going to each MS */
  feeder(aES: Int16Array, aMS: Int16Array) {
    const h = this.S.homes, out = new Map<number, Map<number, number>>();
    for (let i = 0; i < h.n; i++) {
      const e = aES[i], m = aMS[i]; if (e < 0 || m < 0) continue;
      const mm = out.get(e) ?? new Map(); mm.set(m, (mm.get(m) ?? 0) + h.w.ms[i]); out.set(e, mm);
    }
    const res: { es: number; split: { ms: number; share: number }[] }[] = [];
    for (const [e, mm] of out) {
      const tot = [...mm.values()].reduce((a, b) => a + b, 0) || 1;
      const split = [...mm].map(([ms, v]) => ({ ms, share: v / tot })).filter(x => x.share >= 0.02).sort((a, b) => b.share - a.share);
      res.push({ es: e, split });
    }
    return res;
  }
}
