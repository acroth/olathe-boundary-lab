import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
      <PopoverContent align="end" className="w-64">
        <p className="text-sm font-semibold">Projection year</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="outline" size="icon" aria-label="Earlier year" disabled={ui.year <= firstPlanYear} onClick={() => ui.set({ year: ui.year - 1 })}><ChevronLeft /></Button>
          <span className="text-lg font-semibold tabular-nums" aria-live="polite">{selectedYear}</span>
          <Button variant="outline" size="icon" aria-label="Later year" disabled={ui.year >= lastYear} onClick={() => ui.set({ year: ui.year + 1 })}><ChevronRight /></Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{years[firstPlanYear]} to {years[lastYear]}. Sets the year for the school list and the % full colors.</p>
      </PopoverContent>
    </Popover>
  );
}
