import { useMemo, useState, type MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { useStore } from 'zustand';
import { areaGeom, LEVELS, LEVEL_NAME, type Level, type Static } from '../data';
import { planFromPreset, usePlan, useUI, type Plan } from '../store';
import { PALETTE, TIERS, tierColor , schoolColor as colorOf } from '../colors';
import type { Results } from '../App';
import { encodePlan, decodePlan } from '../url';
import { exportCSV, exportGeoJSON, exportPNG } from './exports';
import { AREAS, summarize } from '../visible';
import Builder from './Builder';

const pct = (u: number) => `${(u * 100).toFixed(1)}%`;
const n0 = (x: number) => Math.round(x).toLocaleString();


export default function Sidebar({ S, resA, resB, busy, mapRef, faceGeom, vis }: { S: Static; resA: Results | null; resB: Results | null; busy: boolean; mapRef: MutableRefObject<MapRef | null>; faceGeom: (ids: number[]) => GeoJSON.MultiPolygon; vis: Set<number> }) {
  const plan = usePlan(s => s.plan);
  const { setPlan, toggleClosure, removeEdit } = usePlan.getState();
  const temporal = useStore(usePlan.temporal);
  const ui = useUI();
  const lv = ui.level;
  const Y = S.meta.years, y0 = S.meta.firstPlanYear;
  const res = resA?.levels[lv];
  const resb = resB?.levels[lv];
  const schools = S.schools.filter(s => s.level === lv && vis.has(s.i));
  const isClosed = (i: number) => plan.closures[String(i)] !== undefined;
  const [section, setSection] = useState<'schools' | 'district' | 'grades' | 'checks' | 'plan'>('schools');
  const [cmpLink, setCmpLink] = useState('');
  const [saved, setSaved] = useState<{ name: string; enc: string }[]>(() => { try { return JSON.parse(localStorage.getItem('saved-plans') || '[]'); } catch { return []; } });

  const loadPreset = (id: string) => {
    const p = S.presets.find(x => x.id === id)!;
    const hadDrawing = plan.edits.some(e => e.kind !== 'preset');
    setPlan(planFromPreset(p));
    if (hadDrawing) ui.set({ toast: 'Starting plan loaded. Undo brings back your drawing.' });
  };
  const share = async () => {
    // Short link from the server when it is set up (Supabase); otherwise the full address, which carries the plan itself.
    let url = location.href;
    try {
      const r = await fetch('/api/plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hash: location.hash.slice(1), name: plan.name ?? null, dataVersion: S.meta.dataVersion ?? null }) });
      if (r.ok) { const j = await r.json(); if (j.id) url = `${location.origin}/p/${j.id}`; }
    } catch { /* offline or no API: keep the long link */ }
    try { await navigator.clipboard.writeText(url); ui.set({ toast: 'Link copied. Anyone with it sees this exact plan.' }); }
    catch { ui.set({ toast: 'Copy this link to share: ' + url }); }
  };
  const [naming, setNaming] = useState<string | null>(null);
  const save = (name: string) => {
    name = name.trim(); if (!name) return;
    setNaming(null);
    const p: Plan = { ...plan, name }; setPlan(p);
    const enc = encodePlan(p, S.presets);
    const next = [...saved.filter(s => s.name !== name), { name, enc }];
    setSaved(next); try { localStorage.setItem('saved-plans', JSON.stringify(next)); } catch { /* */ }
    ui.set({ toast: `Saved "${name}" in this browser.` });
  };
  const decode = (enc: string) => decodePlan(enc, S.presets, faceGeom, r => areaGeom(S, r));
  const startCompare = (v: string) => {
    if (!v) { ui.set({ compare: null, diff: false }); return; }
    if (v.startsWith('preset:')) ui.set({ compare: planFromPreset(S.presets.find(p => p.id === v.slice(7))!) });
    else if (v.startsWith('saved:')) { const s = saved.find(x => x.name === v.slice(6)); const p = s && decode(s.enc); if (p) ui.set({ compare: p }); }
  };
  const compareLink = () => {
    const m = cmpLink.match(/plan=([^&]+)/); const p = m ? decode(decodeURIComponent(m[1])) : null;
    if (p) { ui.set({ compare: p }); setCmpLink(''); } else ui.set({ toast: 'That link does not contain a plan.' });
  };
  const focus = (i: number) => {
    const s = S.schools[i]; ui.set({ focusSchool: i });
    mapRef.current?.flyTo({ center: [s.lon, s.lat], zoom: 13.2, duration: 600 });
  };

  const sorted = useMemo(() => [...schools].sort((a, b) => a.name.localeCompare(b.name)), [schools]);
  const sm = res ? summarize(S, res, vis, lv) : null;
  const focusS = ui.focusSchool !== null && S.schools[ui.focusSchool]?.level === lv ? ui.focusSchool : null;

  const sheetNext = { peek: 'half', half: 'full', full: 'peek' } as const;
  return (
    <aside className={'side sheet-' + ui.sheet + (ui.panelOpen ? '' : ' closed')}>
      <button className="grab" aria-label="Resize panel" onClick={() => ui.set({ sheet: sheetNext[ui.sheet] })}><span /></button>
      <div className="side-body">
      <header>
        <div className="row between">
          <h1>Olathe Boundary Lab</h1>
          <div className="row gap">
            <button className="primary small" onClick={share}>Share</button>
            <details className="menu">
              <summary aria-label="More">⋯</summary>
              <div className="menu-body">
                <button onClick={() => setNaming(naming === null ? (plan.name || '') : null)}>Save plan in this browser</button>
                {ui.mode === 'draw' && <div className="row gap"><button onClick={() => temporal.undo()} disabled={!temporal.pastStates.length}>Undo</button><button onClick={() => temporal.redo()} disabled={!temporal.futureStates.length}>Redo</button></div>}
                <label className="lbl">Areas shown</label>
                <div className="chips">
                  {AREAS.map(a => { const on = ui.areas.includes(a); return <button key={a} className={'chip' + (on ? ' on' : '')} aria-pressed={on}
                    onClick={() => { const next = on ? ui.areas.filter(x => x !== a) : [...ui.areas, a]; if (next.length) ui.set({ areas: next }); }}>{a}</button>; })}
                </div>
                <label className="lbl">Map</label>
                <div className="seg small">
                  <button className={ui.colorBy === 'school' ? 'on' : ''} onClick={() => ui.set({ colorBy: 'school' })}>Color by school</button>
                  <button className={ui.colorBy === 'util' ? 'on' : ''} onClick={() => ui.set({ colorBy: 'util' })}>by % full</button>
                </div>
                <label className="chk"><input type="checkbox" checked={ui.showAreas} onChange={e => ui.set({ showAreas: e.target.checked })} /> Planning areas</label>
                <label className="chk"><input type="checkbox" checked={ui.showHomes} onChange={e => ui.set({ showHomes: e.target.checked })} /> Homes</label>
                {ui.mode === 'draw' && <label className="chk"><input type="checkbox" checked={ui.showStreets} onChange={e => ui.set({ showStreets: e.target.checked })} /> Street snapping lines</label>}
                <label className="chk"><input type="checkbox" checked={ui.includePreK} onChange={e => ui.set({ includePreK: e.target.checked })} /> Count Pre-K in model %</label>
                <label className="lbl">Year: {Y[ui.year]}</label>
                <input type="range" min={y0} max={Y.length - 1} value={ui.year} onChange={e => ui.set({ year: Number(e.target.value) })} aria-label="Year" />
              </div>
            </details>
            <button className="small hide-panel" aria-label="Hide panel" onClick={() => ui.set({ panelOpen: false })}>«</button>
          </div>
        </div>
        <div className="seg modes" role="tablist">
          <button role="tab" aria-selected={ui.mode === 'build'} className={ui.mode === 'build' ? 'on' : ''} onClick={() => ui.set({ mode: 'build', level: 'es', tool: 'pan' })}>Option builder</button>
          <button role="tab" aria-selected={ui.mode === 'draw'} className={ui.mode === 'draw' ? 'on' : ''} onClick={() => ui.set({ mode: 'draw', sheet: 'peek' })}>Free draw</button>
        </div>
        {naming !== null && <form className="row gap" onSubmit={e => { e.preventDefault(); save(naming); }}>
          <input id="plan-name" autoFocus placeholder="Name this plan" value={naming} onChange={e => setNaming(e.target.value)} />
          <button className="primary" type="submit" disabled={!naming.trim()}>Save</button>
        </form>}
        {ui.colorBy === 'util' && <div className="legend">{TIERS.map(t => <span key={t.label}><i style={{ background: t.color }} />{t.label}</span>)}</div>}
      </header>

      {ui.mode === 'build' && <Builder S={S} res={resA?.levels.es ?? null} sel={ui.build.sel} moves={ui.build.moves} set={b => ui.set({ build: b })}
        toDraw={() => ui.set({ mode: 'draw', toast: 'This combination is now your free-draw plan. Edit it with the tools on the map.' })} />}

      {ui.mode === 'draw' && <>
      <section>
        <div className="row gap">
          <select value={plan.preset} onChange={e => loadPreset(e.target.value)} aria-label="Starting plan">
            {S.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="seg small">{LEVELS.map(l => <button key={l} className={lv === l ? 'on' : ''} onClick={() => ui.set({ level: l, brush: -2 })} title={LEVEL_NAME[l]}>{{ es: 'Elem', ms: 'Mid', hs: 'High' }[l]}</button>)}</div>
        </div>
        <details className="more"><summary>About this plan</summary><p className="note">{S.presets.find(p => p.id === plan.preset)?.description}</p></details>
        {saved.length > 0 && (
          <select value="" onChange={e => { const s = saved.find(x => x.name === e.target.value); const p = s && decode(s.enc); if (p) setPlan(p); }}>
            <option value="">Open a saved plan…</option>
            {saved.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        )}
      </section>

      <section className="summary">
        {busy && <span className="muted busy-inline">updating…</span>}
        {sm && <div className="stats">
          <Stat v={sm.maxUtilSchool >= 0 ? pct(sm.maxUtil) : '—'} l={sm.maxUtilSchool >= 0 ? `Highest: ${S.schools[sm.maxUtilSchool].name}` : 'Highest'} warn={sm.maxUtil > S.meta.target} />
          <Stat v={String(sm.overTarget.length)} l={`Schools over ${S.meta.target * 100}%`} warn={sm.overTarget.length > 0} />
          <Stat v={n0(sm.unassignedStudents)} l="Students unassigned" warn={sm.unassignedStudents > 0.5} />
          <Stat v={pct(sm.over25Share)} l={`Moved kids ${S.meta.busMiles}+ mi away`} />
        </div>}
        {sm && <details className="more"><summary>More numbers</summary><div className="stats">
          <Stat v={n0(sm.displaced)} l="Students from closing schools placed" />
          <Stat v={sm.avgTripMi ? sm.avgTripMi.toFixed(2) + ' mi' : '—'} l="Average trip, moved students" />
          <Stat v={n0(sm.movedFromOpen)} l="Moved from open schools" />
          {lv === 'es' && <Stat v={n0(sm.fixedNotPlaced)} l="Pre-K at closing schools, not placed" />}
        </div><p className="note">Model numbers, {Y[ui.year]} for the school table; peaks run 2027-28 to 2034-35. Year and Pre-K are in the ⋯ menu.</p></details>}
      </section>

      <section className="row between">
        <label className="lbl">Show</label>
        <select className="show-select" value={section} onChange={e => setSection(e.target.value as any)}>
          <option value="schools">Schools</option>
          {lv === 'es' && <option value="district">District numbers</option>}
          <option value="grades">Grades</option>
          <option value="checks">Checks</option>
          <option value="plan">Compare &amp; export</option>
        </select>
      </section>
      </>}

      {ui.mode === 'draw' && section === 'schools' && res && <section>
        <table className="tbl">
          <thead><tr><th>School</th><th title="Functional capacity">Cap.</th><th>{Y[ui.year]}</th><th>Peak</th><th title="Separate pieces of the attendance area">Pcs</th>{resb && <th>Compare peak</th>}</tr></thead>
          <tbody>
            {sorted.map(s => {
              const r = res.schools[s.i]; const rb = resb?.schools[s.i];
              if (!r.open) return <tr key={s.i} className="closed"><td>{s.name}</td><td colSpan={resb ? 5 : 4}>closing</td></tr>;
              return <tr key={s.i} onClick={() => focus(s.i)} className={focusS === s.i ? 'sel' : ''}>
                <td><i className="sw" style={{ background: colorOf(s as any) }} />{s.name}{s.capSource.startsWith('estimated') && <sup title={s.capSource}>e</sup>}</td>
                <td>{n0(s.capacity)}</td>
                <td><span className="pill" style={{ background: tierColor(r.util[ui.year]) }}>{pct(r.util[ui.year])}</span></td>
                <td title={Y[r.peakYear]} className={r.peak > S.meta.target ? 'bad' : ''}>{pct(r.peak)}</td>
                <td className={r.pieces > 1 ? 'bad' : ''}>{r.pieces}</td>
                {rb && <td>{rb.open ? pct(rb.peak) : 'closing'}</td>}
              </tr>;
            })}
          </tbody>
        </table>
        <p className="note">Tap a row to zoom to the school. Model numbers; the district's are under Show → District numbers.</p>
      </section>}

      {ui.mode === 'draw' && section === 'district' && res && lv === 'es' && <District S={S} res={res} plan={plan} year={ui.year} />}
      {ui.mode === 'draw' && section === 'district' && lv !== 'es' && <section><p className="note">District numbers are loaded for elementary schools only.</p></section>}
      {ui.mode === 'draw' && section === 'grades' && res && <Grades S={S} res={res} focus={focusS} setFocus={focus} schools={sorted} year={ui.year} />}

      {ui.mode === 'draw' && section === 'checks' && res && <section>
        <h3>Separate pieces</h3>
        <ul className="list">{sorted.filter(s => res.schools[s.i].open && res.schools[s.i].pieces > 1).map(s => <li key={s.i} onClick={() => focus(s.i)}>{s.name}: {res.schools[s.i].pieces} pieces</li>)}
          {!sorted.some(s => res.schools[s.i].open && res.schools[s.i].pieces > 1) && <li className="muted">Every open school's area is one piece.</li>}</ul>
        <h3>Elementary → middle school splits</h3>
        <ul className="list">{resA!.feeder.filter(f => vis.has(f.es) && f.split.length > 1 && f.split[1].share >= 0.1).map(f => <li key={f.es} onClick={() => focus(f.es)}>{S.schools[f.es].name}: {f.split.map(x => `${S.schools[x.ms].name} ${Math.round(x.share * 100)}%`).join(', ')}</li>)}
          {!resA!.feeder.some(f => vis.has(f.es) && f.split.length > 1 && f.split[1].share >= 0.1) && <li className="muted">No elementary area sends 10% or more of its students to a second middle school.</li>}</ul>
        <h3>Closures</h3>
        <ul className="list">{sorted.map(s => <li key={s.i}><label className="chk"><input type="checkbox" checked={isClosed(s.i)} onChange={() => toggleClosure(s.i, 2)} /> {s.name}{isClosed(s.i) ? ` closes after ${Y[plan.closures[String(s.i)] - 1]}` : ''}{S.receivers[String(s.i)] ? ` (district listed: ${S.receivers[String(s.i)].map(r => S.schools[r].name).join(', ')})` : ''}</label></li>)}</ul>
      </section>}

      {ui.mode === 'draw' && section === 'plan' && <section>
        <h3>Compare with</h3>
        <select value="" onChange={e => startCompare(e.target.value)}>
          <option value="">{ui.compare ? 'Change or stop comparing…' : 'Pick a plan…'}</option>
          {ui.compare && <option value="">Stop comparing</option>}
          {S.presets.map(p => <option key={p.id} value={'preset:' + p.id}>{p.name}</option>)}
          {saved.map(s => <option key={s.name} value={'saved:' + s.name}>Saved: {s.name}</option>)}
        </select>
        <div className="row gap"><input placeholder="…or paste a plan link" value={cmpLink} onChange={e => setCmpLink(e.target.value)} /><button onClick={compareLink} disabled={!cmpLink}>Compare</button></div>
        {ui.compare && <label className="chk"><input type="checkbox" checked={ui.diff} onChange={e => ui.set({ diff: e.target.checked })} /> Highlight homes assigned differently (red)</label>}
        <h3>Export</h3>
        <div className="row gap wrap">
          <button onClick={() => resA && exportGeoJSON(S, resA, plan)}>Boundaries (GeoJSON)</button>
          <button onClick={() => resA && exportCSV(S, resA, plan)}>Numbers (CSV)</button>
          <button onClick={() => mapRef.current && exportPNG(mapRef.current)}>Map image (PNG)</button>
        </div>
        <h3>Areas in this plan ({plan.edits.filter(e => e.level === lv).length})</h3>
        <ul className="list edits">{plan.edits.map((e, k) => e.level !== lv ? null : (
          <li key={e.id} className={ui.selectedEdit === e.id ? 'sel' : ''} onMouseEnter={() => ui.set({ selectedEdit: e.id })} onMouseLeave={() => ui.set({ selectedEdit: null })}>
            <span>{k + 1}. {e.kind === 'area' ? `${e.label} → ${e.school < 0 ? 'Unassigned' : S.schools[e.school].name}` : e.label ?? `${{ draw: 'Drawn', trace: 'Traced', blocks: 'Painted', area: 'Area', preset: 'Plan' }[e.kind]} → ${e.school < 0 ? 'Unassigned' : S.schools[e.school].name}`}</span>
            <button className="x" onClick={() => removeEdit(e.id)} aria-label="Delete area">×</button>
          </li>))}</ul>
        <h3>Sources</h3>
        <ul className="list src">{Object.entries(S.meta.sources).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}</ul>
        <p className="note">Students per home come from 2020 census ages, scaled so each school's current area matches its projected K–12 grade enrollment (the district's utilization × capacity; Spanish immersion is counted at Arbor Creek, not in neighborhoods). A home keeps its original school's projection wherever you assign it. Homes built after 2020 are estimated from building footprints. Boundaries are shown as of full implementation; Fairview and Ridgeview close in 2028-29 in the district's plan.</p>
      </section>}
      </div>
    </aside>
  );
}

function Stat({ v, l, warn }: { v: string; l: string; warn?: boolean }) {
  return <div className={'stat' + (warn ? ' warn' : '')}><b>{v}</b><span>{l}</span></div>;
}

function Grades({ S, res, focus, setFocus, schools, year }: any) {
  const [yrs, setYrs] = useState<number[]>([year, Math.min(year + 2, S.meta.years.length - 1), S.meta.years.length - 1]);
  const s = focus ?? schools.find((x: any) => res.schools[x.i].open)?.i;
  if (s === undefined) return null;
  const r = res.schools[s]; const ORDER = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']; const grades = Object.keys(S.schools[s].gradeShare).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const es = S.schools[s].level === 'es';
  return <section>
    <select value={s} onChange={e => setFocus(Number(e.target.value))}>{schools.filter((x: any) => res.schools[x.i].open).map((x: any) => <option key={x.i} value={x.i}>{x.name}</option>)}</select>
    <div className="row gap">{yrs.map((y, k) => <select key={k} value={y} onChange={e => setYrs(yrs.map((q, j) => j === k ? Number(e.target.value) : q))}>{S.meta.years.map((n: string, i: number) => i >= S.meta.firstPlanYear && <option key={i} value={i}>{n}</option>)}</select>)}</div>
    <table className="tbl">
      <thead><tr><th>Grade</th>{yrs.map((y, k) => <th key={k}>{S.meta.years[y]}{es && <><br /><span className="muted">students · rooms</span></>}</th>)}</tr></thead>
      <tbody>
        {grades.map((g: string) => <tr key={g}><td>{g === 'K' ? 'K' : 'Grade ' + g}{es && <span className="muted"> (max {S.meta.classSize[g]})</span>}</td>
          {yrs.map((y, k) => <td key={k}>{Math.round(r.grades[y][g] ?? 0)}{es && <> · {r.classrooms[y][g]}</>}</td>)}</tr>)}
        <tr className="tot"><td>Neighborhood total</td>{yrs.map((y, k) => <td key={k}>{Math.round(r.students[y])}{es && <> · {Object.values(r.classrooms[y] as Record<string, number>).reduce((a, b) => a + b, 0)}</>}</td>)}</tr>
        {es && r.fixed > 0 && <tr><td>Pre-K / immersion (fixed)</td>{yrs.map((y, k) => <td key={k}>{Math.round(r.fixed)}</td>)}</tr>}
        <tr className="tot"><td>Utilization</td>{yrs.map((y, k) => <td key={k}>{(r.util[y] * 100).toFixed(1)}%</td>)}</tr>
      </tbody>
    </table>
    {es && <p className="note">Classrooms use Kansas class-size guidelines (K–2: 22, grade 3: 24, grades 4–5: 26) and assume no combined-grade classes. Grade mix follows each home's original school.</p>}
  </section>;
}

/** The district's own figures (Nov 2026 boundary presentations) beside the model's, for the district options. */
function District({ S, res, plan, year }: any) {
  const pre = S.presets.find((p: any) => p.id === plan.preset);
  const D = pre?.district ?? S.presets.find((p: any) => p.district)?.district;
  if (!D) return <section><p className="note">No district numbers loaded.</p></section>;
  const Y = S.meta.years; const byName: Record<string, any> = {};
  for (const s of S.schools) if (s.level === 'es') byName[s.name] = s;
  const ti = year - 1;                                  // district tables run 2026-27 (index 0) to 2031-32 (index 5)
  const yi = ti >= 0 && ti <= 5 ? year : 2; const tj = yi - 1;
  const modified = plan.edits.some((e: any) => e.kind !== 'preset');
  const rows = pre?.district ? Object.keys(D.table) : [];
  return <section>
    {pre?.district ? <>
      <p className="note"><b>{pre.name}</b>: the district's five-year table (Early Childhood counted at receiving schools) beside the model's
        total for the same year (Pre-K counted {''}when the Pre-K box is on). Percentages use each side's own capacity.{modified ? ' Your edits change the model columns only.' : ''}
        {ti < 0 || ti > 5 ? ` The district's tables cover 2026-27 to 2031-32, so ${Y[yi]} is shown.` : ''}</p>
      <table className="tbl">
        <thead><tr><th>School</th><th>District {Y[yi]}</th><th>Model {Y[yi]}</th><th>Gap</th><th title="District 2031-32 % of its functional capacity">District 31-32</th></tr></thead>
        <tbody>{rows.map(n => {
          const s = byName[n]; const r = s ? res.schools[s.i] : null; const d = D.table[n][tj]; const cap = D.cap[n];
          const m = r ? r.total[yi] : NaN;
          return <tr key={n}><td>{n}</td>
            <td>{d} <span className="muted">({pct(d / cap)})</span></td>
            <td>{isNaN(m) ? '—' : n0(m)} <span className="muted">({r ? pct(r.util[yi]) : '—'})</span></td>
            <td className={Math.abs(m - d) > 40 ? 'bad' : ''}>{isNaN(m) ? '—' : (m - d >= 0 ? '+' : '') + n0(m - d)}</td>
            <td>{pct(D.table[n][5] / cap)}</td></tr>;
        })}</tbody>
      </table>
      <h3>Students moving from closing schools</h3>
      <p className="note">District: actual 2026-27 K–5 students by destination (parent-meeting grade tables). Model: the same pieces as drawn in this plan, 2026-27.</p>
      <table className="tbl">
        <thead><tr><th>From</th><th>To</th><th>District</th><th>Model</th><th>Gap</th></tr></thead>
        <tbody>{D.pieces.map((p: any) => {
          const f = byName[p.frm], t = byName[p.to]; const m = f && t ? (res.schools[t.i]?.fromOrigPrev?.[f.i] ?? 0) : NaN;
          return <tr key={p.frm + p.to}><td>{p.frm}</td><td>{p.to}</td><td>{p.n}</td><td>{n0(m)}</td>
            <td className={Math.abs(m - p.n) > 25 ? 'bad' : ''}>{(m - p.n >= 0 ? '+' : '') + n0(m - p.n)}</td></tr>;
        })}</tbody>
      </table>
    </> : <p className="note">Pick a district option (1–4) under Starting plan to see its tables. Below: fall 2026 enrollment and functional capacity from the district.</p>}
    <h3>Fall 2026 enrollment and capacity</h3>
    <table className="tbl">
      <thead><tr><th>School</th><th>District 2026</th><th>Model 26-27</th><th>District cap.</th><th>Model cap.</th></tr></thead>
      <tbody>{Object.keys(D.enroll2026).sort().map(n => { const s = byName[n]; if (!s) return null;
        const own = s.neighborhood[1] + s.prek + (n === 'Black Bob' ? s.immersion : 0);
        return <tr key={n}><td>{n}</td><td>{D.enroll2026[n]}</td><td>{n0(own)}</td><td>{D.cap[n]}</td><td>{n0(s.capacity)}</td></tr>; })}</tbody>
    </table>
    <p className="note">District 2026 counts include Early Childhood. Model 26-27 = own neighborhood students + Pre-K (+ immersion still at Black Bob).</p>
  </section>;
}
