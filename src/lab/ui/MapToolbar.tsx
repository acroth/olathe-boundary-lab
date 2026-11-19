'use client';
import { Check, Eraser, Hand, MousePointerClick, Spline } from 'lucide-react';
import type { Static } from '../data';
import { usePlan, useUI, type PickBy, type Tool } from '../store';
import { UNASSIGNED, schoolColor } from '../colors';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const BRUSH_NONE = -2, BRUSH_UNASSIGNED = -1;

const TOOLS: { id: Tool; label: string; icon: typeof Hand; hint: string }[] = [
  { id: 'pan', label: 'Move', icon: Hand, hint: 'Drag to move the map; pinch or scroll to zoom.' },
  { id: 'areas', label: 'Pick areas', icon: MousePointerClick, hint: '' },
  { id: 'trace', label: 'Trace', icon: Spline, hint: 'Tap along streets to draw a line from one boundary to another; it follows the roads between taps. Tap Done, then tap the side that should go to the school.' },
  { id: 'erase', label: 'Remove', icon: Eraser, hint: 'Tap an area you changed to undo just that change.' },
];
const PICK_AREAS_HINT: Record<PickBy, string> = {
  planning: 'Tap a numbered planning area to give all of it to the school.',
  zones: 'Tap a school’s area to give all of it to the school.',
};

/** Floating drawing controls (free draw). */
export default function MapToolbar({ staticData, visibleSchools }: { staticData: Static; visibleSchools: Set<number> }) {
  const ui = useUI();
  const plan = usePlan(state => state.plan);

  const openSchools = staticData.schools
    .filter(school => school.level === ui.level && visibleSchools.has(school.i) && plan.closures[String(school.i)] === undefined)
    .sort((first, second) => first.name.localeCompare(second.name));
  const tool = TOOLS.some(candidate => candidate.id === ui.tool) ? ui.tool : 'pan';
  const hint = tool === 'areas' ? PICK_AREAS_HINT[ui.pickBy] : TOOLS.find(candidate => candidate.id === tool)?.hint;

  let brushColor = 'transparent';
  if (ui.brush >= 0) brushColor = schoolColor(staticData.schools[ui.brush] as any);
  else if (ui.brush === BRUSH_UNASSIGNED) brushColor = UNASSIGNED;

  const chooseBrush = (brush: number) => {
    const toolKeepsPainting = tool !== 'pan' && tool !== 'erase';
    ui.set({ brush, tool: toolKeepsPainting ? tool : 'areas' });
  };
  const chooseTool = (nextTool: Tool) => {
    const needsPlanningAreas = nextTool === 'areas' && ui.pickBy === 'planning';
    ui.set({ tool: nextTool, ...(needsPlanningAreas ? { showAreas: true } : {}) });
  };
  const choosePickBy = (pickBy: PickBy) => {
    ui.set({ pickBy, ...(pickBy === 'planning' ? { showAreas: true } : {}) });
  };

  return (
    <div className="drawbar absolute z-10 flex flex-col gap-2 rounded-2xl border bg-card p-2 shadow-float" role="toolbar" aria-label="Drawing tools">
      <div className="flex items-center gap-2">
        <label className="relative flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card pl-3 pr-2 text-sm">
          <span className="size-3.5 shrink-0 rounded-full border border-black/20" style={{ background: brushColor }} />
          <select id="map-brush" value={ui.brush} aria-label="School to draw" onChange={event => chooseBrush(Number(event.target.value))}
            className="h-full min-w-0 flex-1 cursor-pointer bg-transparent outline-none">
            <option value={BRUSH_NONE} disabled>Select a school</option>
            {openSchools.map(school => <option key={school.i} value={school.i}>{school.name}</option>)}
            <option value={BRUSH_UNASSIGNED}>Unassigned</option>
          </select>
        </label>
        {tool === 'trace' && <Button size="sm" className="h-9" onClick={() => ui.set({ doneTick: ui.doneTick + 1 })}><Check />Done</Button>}
      </div>
      <ToggleGroup type="single" value={tool} className="w-full" aria-label="Tool" onValueChange={value => value && chooseTool(value as Tool)}>
        {TOOLS.map(candidate => <ToggleGroupItem key={candidate.id} value={candidate.id} className="h-8"><candidate.icon />{candidate.label}</ToggleGroupItem>)}
      </ToggleGroup>
      {tool === 'areas' && (
        <ToggleGroup type="single" value={ui.pickBy} className="w-full" aria-label="Pick by" onValueChange={value => value && choosePickBy(value as PickBy)}>
          <ToggleGroupItem value="planning">Planning areas</ToggleGroupItem>
          <ToggleGroupItem value="zones">Whole school areas</ToggleGroupItem>
        </ToggleGroup>
      )}
      {hint && <p className="drawbar-hint px-1 text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}
