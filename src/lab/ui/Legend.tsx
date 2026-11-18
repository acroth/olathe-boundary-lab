'use client';
import { useState, type MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEVEL_NAME, type Static } from '../data';
import { TIERS, schoolColor } from '../colors';
import { shownOverlay, usePlan, useUI } from '../store';
import { headlineSummary, type SchoolNumber } from '../numbers';
import LineSwatch from './LineSwatch';

const OVERLAY_NAME = { es: 'Elementary school', ms: 'Middle school', hs: 'High school' };

function LegendItem({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  const swatchClass = ring ? 'border-2 border-foreground bg-card' : 'border border-black/15';
  return (
    <li className="flex items-center gap-2.5 text-[13px] leading-5">
      <span className={cn('size-3.5 shrink-0 rounded-full', swatchClass)} style={ring ? undefined : { background: color }} />
      <span className="truncate">{label}</span>
    </li>
  );
}

interface LegendProps {
  staticData: Static;
  visibleSchools: Set<number>;
  mapRef: MutableRefObject<MapRef | null>;
  numbers: Map<number, SchoolNumber>;
}

/** Bottom-right legend card and zoom buttons. */
export default function Legend({ staticData, visibleSchools, mapRef, numbers }: LegendProps) {
  const ui = useUI();
  const plan = usePlan(state => state.plan);
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);

  const isClosing = (school: number) => plan.closures[String(school)] !== undefined;
  const schools = staticData.schools
    .filter(school => school.level === ui.level && visibleSchools.has(school.i))
    .sort((first, second) => first.name.localeCompare(second.name));
  const openSchools = schools.filter(school => !isClosing(school.i));
  const closingSchools = schools.filter(school => isClosing(school.i));
  const overlay = shownOverlay(ui.level, ui.overlay);

  const title = ui.colorBy === 'util' ? `% full, ${staticData.meta.years[ui.year]}` : `${LEVEL_NAME[ui.level]} schools`;
  const { sourceLabel } = headlineSummary(staticData, numbers, visibleSchools);

  return (
    <div className="legend-dock pointer-events-none absolute z-10 flex items-end gap-3">
      <div className="pointer-events-auto w-[220px] overflow-hidden rounded-2xl border bg-card shadow-float">
        <button className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold" onClick={() => setOpen(isOpen => !isOpen)} aria-expanded={open}>
          {title}<ChevronDown className={cn('size-4 text-muted-foreground transition-transform', !open && '-rotate-90')} />
        </button>
        {open && <p className="px-4 pb-2 text-xs leading-snug text-muted-foreground">{sourceLabel}. A ~ marks a model estimate.</p>}
        {open && (
          <ul className="max-h-[min(340px,45vh)] space-y-1.5 overflow-y-auto px-4 pb-3.5">
            {ui.colorBy === 'util'
              ? TIERS.map(tier => <LegendItem key={tier.label} color={tier.color} label={tier.label} />)
              : (
                <>
                  {openSchools.map(school => <LegendItem key={school.i} color={schoolColor(school as any)} label={school.name} />)}
                  {closingSchools.length > 0 && <li className="pt-1.5 text-xs font-medium text-muted-foreground">Closing</li>}
                  {closingSchools.map(school => <LegendItem key={school.i} color="" ring label={school.name} />)}
                </>
              )}
            {overlay && <li className="pt-1.5 text-xs font-medium text-muted-foreground">Feeder overlay</li>}
            {overlay && <li className="flex items-center gap-2.5 text-[13px] leading-5"><LineSwatch />{OVERLAY_NAME[overlay]}</li>}
          </ul>
        )}
      </div>
      <div className="pointer-events-auto hidden flex-col overflow-hidden rounded-xl border bg-card shadow-float md:flex">
        <button className="flex size-10 cursor-pointer items-center justify-center hover:bg-accent" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus className="size-[18px]" /></button>
        <span className="h-px bg-border" />
        <button className="flex size-10 cursor-pointer items-center justify-center hover:bg-accent" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus className="size-[18px]" /></button>
      </div>
    </div>
  );
}
