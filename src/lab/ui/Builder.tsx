// Option Builder: pick one district concept per closing school and see the combination.
import type { Combos, Edit, Static } from '../data';
import type { Plan } from '../store';
import type { LevelResult } from '../model/engine';

export const SHORT: Record<string, string> = { Heritage: 'HT', Scarborough: 'SC', 'Black Bob': 'BB', Tomahawk: 'TH', 'Walnut Grove': 'WG' };
const pct = (u: number) => `${(u * 100).toFixed(1)}%`;

/** Evaluate a move's rule ("BB2|BB3", "(HT1|HT4)&BB3", "BB3&!TH2", "GSN-RP", "always") against the chosen concepts and earlier moves. */
function evalRule(rule: string, on: Set<string>): boolean {
  if (rule === 'always') return true;
  const t = rule.match(/[()&|!]|[A-Za-z0-9-]+/g) ?? []; let i = 0;
  const atom = (): boolean => {
    const x = t[i++];
    if (x === '!') return !atom();
    if (x === '(') { const v = or(); i++; return v; }
    return on.has(x!);
  };
  const and = (): boolean => { let v = atom(); while (t[i] === '&') { i++; const w = atom(); v = v && w; } return v; };
  const or = (): boolean => { let v = and(); while (t[i] === '|') { i++; const w = and(); v = v || w; } return v; };
  return or();
}

export function tokens(C: Combos, sel: number[]): Set<string> {
  return new Set(C.schools.map((s, k) => SHORT[s.name] + sel[k]));
}
/** Moves that come with the chosen concepts (the user can override each one). */
export function defaultMoves(C: Combos, sel: number[]): Record<string, boolean> {
  const on = tokens(C, sel); const out: Record<string, boolean> = {};
  for (const m of C.moves) { out[m.id] = evalRule(m.rule, on); if (out[m.id]) on.add(m.id); }
  return out;
}
export function activeMoves(C: Combos, sel: number[], moves: Record<string, boolean> | null) {
  return moves ?? defaultMoves(C, sel);
}

export function buildPlan(S: Static, sel: number[], moves: Record<string, boolean> | null): Plan {
  const C = S.combos!; const base = S.presets.find(p => p.id === C.basePreset)!;
  const mv = activeMoves(C, sel, moves);
  const edits: Edit[] = base.edits.map(e => ({ ...e }));
  C.schools.forEach((s, k) => {
    const c = s.concepts.find(x => x.id === sel[k]) ?? s.concepts[0];
    c.pieces.forEach((p, j) => edits.push({ id: `b-${SHORT[s.name]}${c.id}-${j}`, level: 'es', school: p.school, geom: p.geom, kind: 'preset', label: `${s.name} ${c.id} → ${p.to}` }));
  });
  for (const m of C.moves) if (mv[m.id]) edits.push({ id: `b-${m.id}`, level: 'es', school: m.school, geom: m.geom, kind: 'preset', label: m.label });
  return { preset: C.basePreset, closures: { ...base.closures }, edits, name: comboName(C, sel) };
}
export const comboName = (C: Combos, sel: number[]) => C.schools.map((s, k) => SHORT[s.name] + sel[k]).join(' · ');

/** District-number check: each receiver's fall 2026 enrollment + the district's counts for the pieces it takes + moves (model counts). */
export function districtCheck(C: Combos, sel: number[], mv: Record<string, boolean>) {
  const tot: Record<string, number> = {}; const touched = new Set<string>();
  const add = (n: string, v: number) => { tot[n] = (tot[n] ?? C.district.enroll2026[n] ?? 0) + v; touched.add(n); };
  C.schools.forEach((s, k) => { const c = s.concepts.find(x => x.id === sel[k])!; for (const p of c.pieces) if ((p.district ?? p.model26) > 0) add(p.to, p.district ?? p.model26); });
  for (const m of C.moves) if (mv[m.id]) { add(m.to, m.model26); add(m.frm, -m.model26); }
  return [...touched].map(n => ({ name: n, n: tot[n], cap: C.district.cap[n], u: tot[n] / C.district.cap[n] })).sort((a, b) => b.u - a.u);
}

export default function Builder({ S, res, sel, moves, set, toDraw }: { S: Static; res: LevelResult | null; sel: number[]; moves: Record<string, boolean> | null; set: (b: { sel: number[]; moves: Record<string, boolean> | null }) => void; toDraw: () => void }) {
  const C = S.combos;
  if (!C) return <section><p className="note">Option data not loaded.</p></section>;
  const mv = activeMoves(C, sel, moves); const auto = defaultMoves(C, sel);
  const check = districtCheck(C, sel, mv);
  const byName: Record<string, number> = {}; for (const s of S.schools) if (s.level === 'es') byName[s.name] = s.i;
  const option = Object.entries(C.options).find(([, v]) => v.every((x, k) => x === sel[k]))?.[0];
  const pick = (k: number, id: number) => { const s = [...sel]; s[k] = id; set({ sel: s, moves: null }); };
  const toggle = (id: string) => {
    const next = { ...mv, [id]: !mv[id] };
    if (next[id]) for (const g of C.exclusive) if (g.includes(id)) for (const o of g) if (o !== id) next[o] = false;
    set({ sel, moves: next });
  };
  // scorecard on the district's numbers
  const top = check[0]; const over = check.filter(r => r.u > 0.85);
  const placed = C.schools.reduce((t, s, k) => t + s.concepts.find(x => x.id === sel[k])!.pieces.reduce((u, p) => u + (p.district ?? p.model26), 0), 0);
  const openMoved = C.moves.reduce((t, m) => t + (mv[m.id] ? m.model26 : 0), 0);
  const sm = res?.summary;
  const tone = (u: number) => u > 0.9 ? 'bad' : u > 0.85 ? 'warn' : '';
  return <>
    <section className="builder">
      <div className="row between"><span className="lbl">District options</span>{!option && <span className="tag">Custom mix</span>}</div>
      <div className="seg opts">
        {Object.entries(C.options).map(([k, v]) => <button key={k} className={option === k ? 'on' : ''} onClick={() => set({ sel: [...v], moves: null })}>{k}</button>)}
      </div>
      <div className="stats score">
        <div className={'stat ' + tone(top?.u ?? 0)}><b>{top ? pct(top.u) : '—'}</b><span>Fullest: {top?.name ?? '—'}</span></div>
        <div className={'stat ' + (over.length ? 'warn' : '')}><b>{over.length}</b><span>{over.length ? 'Over 85%: ' + over.map(r => r.name).join(', ') : 'Schools over 85%'}</span></div>
        <div className="stat"><b>{Math.round(placed + openMoved).toLocaleString()}</b><span>Students moved{openMoved ? ` (${Math.round(openMoved)} at open schools)` : ''}</span></div>
        <div className="stat"><b>{sm ? pct(sm.over25Share) : '—'}</b><span>Moved kids 2.5+ mi away (model)</span></div>
      </div>
    </section>
    <section className="builder">
      {C.schools.map((s, k) => {
        const c = s.concepts.find(x => x.id === sel[k])!;
        return <div key={s.name} className="bschool">
          <div className="row between"><b>{s.name}</b>
            <div className="seg small">{s.concepts.map(x => <button key={x.id} className={x.id === sel[k] ? 'on' : ''} onClick={() => pick(k, x.id)} title={x.summary}>{x.id}</button>)}</div></div>
          <p className="note">{c.summary}</p>
        </div>;
      })}
    </section>
    <section className="builder">
      <details className="more"><summary>Fullest schools</summary>
        <table className="tbl">
          <thead><tr><th>School</th><th>District</th><th className="muted">Model</th></tr></thead>
          <tbody>{check.map(r => { const m = res?.schools[byName[r.name]];
            return <tr key={r.name}><td>{r.name}</td><td className={tone(r.u)}>{pct(r.u)} <span className="muted">· {Math.round(r.n)}</span></td>
              <td className="muted">{m && m.open ? pct(m.peak) : '—'}</td></tr>; })}</tbody>
        </table>
        <p className="note">District: fall 2026 enrollment plus the district's counts for each piece, over the district's capacity. Model: the lab's projection, peak year.</p>
      </details>
      <details className="more"><summary>Students moving, by piece</summary>
        <table className="tbl">
          <thead><tr><th>From → to</th><th>District</th><th className="muted">Model</th></tr></thead>
          <tbody>{C.schools.flatMap((s, k) => s.concepts.find(x => x.id === sel[k])!.pieces.filter(p => (p.district ?? 0) > 0 || p.model26 > 0)
            .map(p => <tr key={s.name + p.to}><td>{s.name} → {p.to}</td><td>{p.district ?? '—'}</td><td className="muted">{p.model26}</td></tr>))}</tbody>
        </table>
        <p className="note">2026-27 K–5 students. District counts come from the parent-meeting decks.</p>
      </details>
      <details className="more"><summary>Moves between open schools ({C.moves.filter(m => mv[m.id]).length} on)</summary>
        <p className="note">Set automatically by the concepts you pick. Tap to override.{moves && <> <button className="link" onClick={() => set({ sel, moves: null })}>Reset</button></>}</p>
        <ul className="moves">{C.moves.map(m => <li key={m.id}><label className="chk"><input type="checkbox" checked={!!mv[m.id]} onChange={() => toggle(m.id)} />
          <span>{m.label} <span className="muted">· {m.model26}{auto[m.id] !== mv[m.id] ? ' · changed' : ''}</span></span></label></li>)}</ul>
      </details>
      <button className="link-btn" onClick={toDraw}>Edit this combination by hand →</button>
    </section>
  </>;
}
