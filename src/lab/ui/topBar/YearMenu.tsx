import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import type { Static } from '../../data';
import { useUI } from '../../store';
import IconTip from './IconTip';

/** Chooses the projection year shown across the lab. */
export default function YearMenu({ staticData, showYear = false }: { staticData: Static; showYear?: boolean }) {
  const ui = useUI();
  const { years, firstPlanYear } = staticData.meta;
  const selectedYear = years[ui.year], lastYear = years.length - 1;

  return (
    <Popover>
      <IconTip label="Projection year">
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-9 gap-1.5 px-2.5" aria-label={'Projection year ' + selectedYear}>
            <CalendarDays className="size-[18px]" /><span className={(showYear ? 'inline' : 'hidden lg:inline') + ' text-[13px] tabular-nums'}>{selectedYear}</span>
          </Button>
        </PopoverTrigger>
      </IconTip>
      <PopoverContent align="start" className="w-72">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">Projection year</p>
          <span className="text-sm tabular-nums text-primary font-semibold">{selectedYear}</span>
        </div>
        <Slider className="mt-4" min={firstPlanYear} max={lastYear} step={1} value={[ui.year]} onValueChange={([year]) => ui.set({ year })} aria-label="Projection year" />
        <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{years[firstPlanYear]}</span><span>{years[lastYear]}</span></div>
        <p className="mt-3 text-xs text-muted-foreground">Sets the year for the school table and % full colors. Peaks always cover every year.</p>
      </PopoverContent>
    </Popover>
  );
}
