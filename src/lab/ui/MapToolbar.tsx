import { useStore } from 'zustand';
import type { Static } from '../data';
import { usePlan, useUI, type Tool } from '../store';
import { UNASSIGNED, schoolColor as colorOf } from '../colors';

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'pan', label: 'Move map', hint: 'Drag to move the map; pinch or +/− to zoom.' },
  { id: 'areas', label: 'Pick areas', hint: '' },
  { id: 'trace', label: 'Trace', hint: 'Tap along streets to draw a line from one boundary to another; it follows the roads between taps. Tap Done, then tap the side that should go to the school.' },
  { id: 'erase', label: 'Remove', hint: 'Tap an area you changed to undo just that change.' },
];

/** Floating controls on the map so drawing doesn't need the side panel. */
export default function MapToolbar({ S, vis }: { S: Static; vis: Set<number> }) {
  const ui = useUI();
  const plan = usePlan(s => s.plan);
  const temporal = useStore(usePlan.temporal);
  const schools = S.schools.filter(s => s.level === ui.level && vis.has(s.i) && plan.closures[String(s.i)] === undefined).sort((a, b) => a.name.localeCompare(b.name));
  const color = ui.brush >= 0 ? colorOf(S.schools[ui.brush] as any) : ui.brush === -1 ? UNASSIGNED : 'transparent';
  const needsDone = ui.tool === 'trace';
  const tool = TOOLS.some(t => t.id === ui.tool) ? ui.tool : 'pan';
  const hint = tool === 'areas' ? (ui.pickBy === 'planning' ? 'Tap a numbered planning area to give all of it to the school.' : 'Tap a school\'s area to give all of it to the school.') : TOOLS.find(t => t.id === tool)?.hint;
  return (
    <div className="mapbar" role="toolbar" aria-label="Drawing tools">
      <div className="mapbar-row">
        <label className="school-pick">
          <i style={{ background: color }} />
          <select id="map-brush" value={ui.brush} onChange={e => { const b = Number(e.target.value); ui.set({ brush: b, tool: tool === 'pan' || tool === 'erase' ? 'areas' : tool }); }} aria-label="School to draw">
            <option value={-2} disabled>Give areas to…</option>
            {schools.map(s => <option key={s.i} value={s.i}>{s.name}</option>)}
            <option value={-1}>Unassigned</option>
          </select>
        </label>
        <button onClick={() => temporal.undo()} disabled={!temporal.pastStates.length} aria-label="Undo">↶</button>
        <button onClick={() => temporal.redo()} disabled={!temporal.futureStates.length} aria-label="Redo">↷</button>
        {needsDone && <button className="primary" onClick={() => ui.set({ doneTick: ui.doneTick + 1 })}>Done</button>}
      </div>
      <div className="mapbar-row tools">
        {TOOLS.map(t => <button key={t.id} className={tool === t.id ? 'on' : ''} onClick={() => ui.set({ tool: t.id, ...(t.id === 'areas' && ui.pickBy === 'planning' ? { showAreas: true } : {}) })}>{t.label}</button>)}
      </div>
      {tool === 'areas' && <div className="mapbar-row seg small pickby">
        <button className={ui.pickBy === 'planning' ? 'on' : ''} onClick={() => ui.set({ pickBy: 'planning', showAreas: true })}>Planning areas</button>
        <button className={ui.pickBy === 'zones' ? 'on' : ''} onClick={() => ui.set({ pickBy: 'zones' })}>Whole school areas</button>
      </div>}
      <div className="mapbar-hint">{hint}</div>
    </div>
  );
}
