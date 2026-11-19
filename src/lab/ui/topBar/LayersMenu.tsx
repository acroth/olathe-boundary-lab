// What the map shows: areas, colors, feeder overlays and other layers.
import { Check, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { Level, Static } from '../../data';
import { currentStartingPlan, withStartingPlan } from '../../startingPlans';
import { OVERLAY_OPTIONS, shownOverlay, usePlan, useUI } from '../../store';
import { AREAS } from '../../visible';
import LineSwatch from '../LineSwatch';
import IconTip from './IconTip';

const OVERLAY_NAME: Record<Level, string> = { es: 'Elementary school', ms: 'Middle school', hs: 'High school' };

function SettingRow({ id, label, checked, onChange, swatch }: { id: string; label: string; checked: boolean; onChange: (on: boolean) => void; swatch?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="font-normal">{swatch && <LineSwatch />}{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Which middle school concept's lines the overlay shows. In Free draw it sets the plan's middle school lines. */
function MiddleSchoolConceptPicker({ staticData }: { staticData: Static }) {
  const ui = useUI();
  const plan = usePlan(state => state.plan);
  const concepts = staticData.combos?.ms?.concepts ?? [];
  const drawing = ui.mode === 'draw';
  const current = drawing ? currentStartingPlan(staticData, plan, 'ms').replace(/^ms/, '') : String(ui.build.ms);
  const choose = (conceptId: string) => {
    if (!conceptId) return;
    if (drawing) usePlan.getState().setPlan(withStartingPlan(staticData, plan, 'ms', 'ms' + conceptId));
    else ui.set({ build: { ...ui.build, ms: Number(conceptId) } });
  };
  return (
    <div className="space-y-2 pl-6">
      <p className="text-xs text-muted-foreground">Middle school concept</p>
      <ToggleGroup type="single" value={current} onValueChange={choose} className="w-full" aria-label="Middle school concept">
        {concepts.map(concept => <ToggleGroupItem key={concept.id} value={String(concept.id)}>{concept.id}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  );
}

export default function LayersMenu({ staticData, triggerClassName, side = 'bottom', align = 'start' }: {
  staticData: Static; triggerClassName?: string; side?: 'bottom' | 'left'; align?: 'start' | 'end';
}) {
  const ui = useUI();

  const toggleArea = (area: string) => {
    const nextAreas = ui.areas.includes(area) ? ui.areas.filter(shown => shown !== area) : [...ui.areas, area];
    if (nextAreas.length) ui.set({ areas: nextAreas });
  };
  const overlay = shownOverlay(ui.level, ui.overlay);
  const setOverlay = (level: Level, on: boolean) => ui.set({ overlay: on ? level : null });


  return (
    <Popover>
      <IconTip label="Layers and map"><PopoverTrigger asChild><Button variant="ghost" size="icon" className={triggerClassName} aria-label="Layers and map"><Layers className="size-[18px]" /></Button></PopoverTrigger></IconTip>
      <PopoverContent side={side} align={align} className="max-h-[70vh] w-80 overflow-y-auto p-0">
        <div className="space-y-3 p-4">
          <p className="text-sm font-semibold">Areas shown</p>
          <div className="flex flex-wrap gap-1.5">
            {AREAS.map(area => {
              const shown = ui.areas.includes(area);
              return (
                <button key={area} aria-pressed={shown} onClick={() => toggleArea(area)}
                  className={cn('inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors', shown ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>
                  {shown && <Check className="size-3.5" />}{area}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">High school areas. Schools receiving students from a closing school always show.</p>
        </div>
        <Separator />
        <div className="space-y-3 p-4">
          <p className="text-sm font-semibold">Color areas by</p>
          <ToggleGroup type="single" value={ui.colorBy} onValueChange={value => value && ui.set({ colorBy: value as typeof ui.colorBy })} className="w-full">
            <ToggleGroupItem value="school">School</ToggleGroupItem><ToggleGroupItem value="util">% full</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Separator />
        <div className="space-y-3.5 p-4">
          <p className="text-sm font-semibold">Overlay feeder boundaries</p>
          {OVERLAY_OPTIONS[ui.level].map(level => (
            <div key={level} className="space-y-3">
              <SettingRow id={'sw-ov-' + level} label={OVERLAY_NAME[level]} swatch checked={overlay === level} onChange={on => setOverlay(level, on)} />
              {level === 'ms' && overlay === 'ms' && <MiddleSchoolConceptPicker staticData={staticData} />}
            </div>
          ))}
        </div>
        <Separator />
        <div className="space-y-3.5 p-4">
          <SettingRow id="sw-areas" label="Planning areas" checked={ui.showAreas} onChange={on => ui.set({ showAreas: on })} />
          <SettingRow id="sw-homes" label="Homes" checked={ui.showHomes} onChange={on => ui.set({ showHomes: on })} />
          {ui.mode === 'draw' && <SettingRow id="sw-streets" label="Street snapping lines" checked={ui.showStreets} onChange={on => ui.set({ showStreets: on })} />}
          <SettingRow id="sw-prek" label="Count Pre-K in model %" checked={ui.includePreK} onChange={on => ui.set({ includePreK: on })} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
