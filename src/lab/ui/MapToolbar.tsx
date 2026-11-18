'use client';
import { Check, Eraser, Hand, MousePointerClick, Spline } from 'lucide-react';
import type { Static } from '../data';
import { usePlan, useUI, type Tool } from '../store';
import { UNASSIGNED, schoolColor as colorOf } from '../colors';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const TOOLS: { id: Tool; label: string; icon: typeof Hand; hint: string }[] = [
  { id: 'pan', label: 'Move', icon: Hand, hint: 'Drag to move the map; pinch or scroll to zoom.' },
  { id: 'areas', label: 'Pick areas', icon: MousePointerClick, hint: '' },
  { id: 'trace', label: 'Trace', icon: Spline, hint: 'Tap along streets to draw a line from one boundary to another; it follows the roads between taps. Tap Done, then tap the side that should go to the school.' },
  { id: 'erase', label: 'Remove', icon: Eraser, hint: 'Tap an area you changed to undo just that change.' },
];

/** Floating drawing controls (free draw). */
export default function MapToolbar({ S, vis }: { S: Static; vis: Set<number> }) {
  const ui = useUI();
  const plan = usePlan(s => s.plan);
  const schools = S.schools.filter(s => s.level === ui.level && vis.has(s.i) && plan.closures[String(s.i)] === undefined).sort((a, b) => a.name.localeCompare(b.name));
  const color = ui.brush >= 0 ? colorOf(S.schools[ui.brush] as any) : ui.brush === -1 ? UNASSIGNED : 'transparent';
  const tool = TOOLS.some(t => t.id === ui.tool) ? ui.tool : 'pan';
  const hint = tool === 'areas' ? (ui.pickBy === 'planning' ? 'Tap a numbered planning area to give all of it to the school.' : 'Tap a school’s area to give all of it to the school.') : TOOLS.find(t => t.id === tool)?.hint;
  return (
    <div className="drawbar absolute z-10 flex flex-col gap-2 rounded-2xl border bg-card p-2 shadow-float" role="toolbar" aria-label="Drawing tools">
      <div className="flex items-center gap-2">
        <label className="relative flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card pl-3 pr-2 text-sm">
          <span className="size-3.5 shrink-0 rounded-full border border-black/20" style={{ background: color }} />
          <select id="map-brush" value={ui.brush} aria-label="School to draw"
            onChange={e => { const b = Number(e.target.value); ui.set({ brush: b, tool: tool === 'pan' || tool === 'erase' ? 'areas' : tool }); }}
            className="h-full min-w-0 flex-1 cursor-pointer bg-transparent outline-none">
            <option value={-2} disabled>Give areas to…</option>
            {schools.map(s => <option key={s.i} value={s.i}>{s.name}</option>)}
            <option value={-1}>Unassigned</option>
          </select>
        </label>
        {tool === 'trace' && <Button size="sm" className="h-9" onClick={() => ui.set({ doneTick: ui.doneTick + 1 })}><Check />Done</Button>}
      </div>
      <ToggleGroup type="single" value={tool} className="w-full" aria-label="Tool"
        onValueChange={v => v && ui.set({ tool: v as Tool, ...(v === 'areas' && ui.pickBy === 'planning' ? { showAreas: true } : {}) })}>
        {TOOLS.map(t => <ToggleGroupItem key={t.id} value={t.id} className="h-8"><t.icon />{t.label}</ToggleGroupItem>)}
      </ToggleGroup>
      {tool === 'areas' && (
        <ToggleGroup type="single" value={ui.pickBy} className="w-full" aria-label="Pick by"
          onValueChange={v => v && ui.set({ pickBy: v as any, ...(v === 'planning' ? { showAreas: true } : {}) })}>
          <ToggleGroupItem value="planning">Planning areas</ToggleGroupItem>
          <ToggleGroupItem value="zones">Whole school areas</ToggleGroupItem>
        </ToggleGroup>
      )}
      {hint && <p className="drawbar-hint px-1 text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}
