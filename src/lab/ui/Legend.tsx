'use client';
import { useState, type MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEVEL_NAME, type Static } from '../data';
import { TIERS, schoolColor } from '../colors';
import { usePlan, useUI } from '../store';

/** Bottom-right legend card and zoom buttons. */
export default function Legend({ S, vis, mapRef }: { S: Static; vis: Set<number>; mapRef: MutableRefObject<MapRef | null> }) {
  const ui = useUI();
  const plan = usePlan(s => s.plan);
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const closed = (i: number) => plan.closures[String(i)] !== undefined;
  const schools = S.schools.filter(s => s.level === ui.level && vis.has(s.i)).sort((a, b) => a.name.localeCompare(b.name));
  const openS = schools.filter(s => !closed(s.i)), closing = schools.filter(s => closed(s.i));
  const title = ui.colorBy === 'util' ? `% full, ${S.meta.years[ui.year]}` : `${LEVEL_NAME[ui.level]} schools`;
  const Item = ({ c, label, ring }: { c: string; label: string; ring?: boolean }) => (
    <li className="flex items-center gap-2.5 text-[13px] leading-5">
      <span className={cn('size-3.5 shrink-0 rounded-full', ring ? 'border-2 border-foreground bg-card' : 'border border-black/15')} style={ring ? undefined : { background: c }} />
      <span className="truncate">{label}</span>
    </li>
  );
  return (
    <div className="legend-dock pointer-events-none absolute z-10 flex items-end gap-3">
      <div className="pointer-events-auto w-[220px] overflow-hidden rounded-2xl border bg-card shadow-float">
        <button className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {title}<ChevronDown className={cn('size-4 text-muted-foreground transition-transform', !open && '-rotate-90')} />
        </button>
        {open && <ul className="max-h-[min(340px,45vh)] space-y-1.5 overflow-y-auto px-4 pb-3.5">
          {ui.colorBy === 'util'
            ? TIERS.map(t => <Item key={t.label} c={t.color} label={t.label} />)
            : <>
              {openS.map(s => <Item key={s.i} c={schoolColor(s as any)} label={s.name} />)}
              {closing.length > 0 && <li className="pt-1.5 text-xs font-medium text-muted-foreground">Closing</li>}
              {closing.map(s => <Item key={s.i} c="" ring label={s.name} />)}
            </>}
        </ul>}
      </div>
      <div className="pointer-events-auto hidden flex-col overflow-hidden rounded-xl border bg-card shadow-float md:flex">
        <button className="flex size-10 cursor-pointer items-center justify-center hover:bg-accent" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus className="size-[18px]" /></button>
        <span className="h-px bg-border" />
        <button className="flex size-10 cursor-pointer items-center justify-center hover:bg-accent" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus className="size-[18px]" /></button>
      </div>
    </div>
  );
}
