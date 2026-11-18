// Saving, sharing, exporting and links, plus the small form that names a saved plan.
import { useState, type FormEvent, type MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { Download, FileJson, FileSpreadsheet, Image as ImageIcon, Info, Link2, MessageSquareText, MoreHorizontal, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Results } from '../../App';
import type { Static } from '../../data';
import { usePlan, useSaved, useUI, type Plan } from '../../store';
import { encodePlan } from '../../url';
import { exportCSV, exportGeoJSON, exportPNG } from '../exports';
import IconTip from './IconTip';

const MAX_FEEDBACK_LINK_LENGTH = 2000;

function feedbackHref(): string {
  return location.href.length <= MAX_FEEDBACK_LINK_LENGTH ? '/contact?plan=' + encodeURIComponent(location.href) : '/contact';
}

interface MoreMenuProps {
  staticData: Static;
  mapRef: MutableRefObject<MapRef | null>;
  planResults: Results | null;
  onShare: () => void;
}

export default function MoreMenu({ staticData, mapRef, planResults, onShare }: MoreMenuProps) {
  const ui = useUI();
  const plan = usePlan(state => state.plan);
  const savePlan = useSaved(state => state.save);
  const [planName, setPlanName] = useState<string | null>(null);

  const saveNamedPlan = (event: FormEvent) => {
    event.preventDefault();
    const name = (planName ?? '').trim();
    if (!name) return;
    const namedPlan: Plan = { ...plan, name };
    usePlan.getState().setPlan(namedPlan);
    savePlan({ name, enc: encodePlan(namedPlan, staticData.presets) });
    setPlanName(null);
    ui.set({ toast: `Saved “${name}” in this browser.` });
  };

  return (
    <>
      <DropdownMenu>
        <IconTip label="More"><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More"><MoreHorizontal className="size-[18px]" /></Button></DropdownMenuTrigger></IconTip>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => setTimeout(() => setPlanName(plan.name ?? ''), 50)}><Save />Save plan in this browser</DropdownMenuItem>
          <DropdownMenuItem onSelect={onShare}><Link2 />Copy link to this view</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-1.5"><Download className="size-3.5" />Export</DropdownMenuLabel>
          <DropdownMenuItem disabled={!planResults} onSelect={() => planResults && exportGeoJSON(staticData, planResults, plan)}><FileJson />Boundaries (GeoJSON)</DropdownMenuItem>
          <DropdownMenuItem disabled={!planResults} onSelect={() => planResults && exportCSV(staticData, planResults, plan)}><FileSpreadsheet />Numbers (CSV)</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => mapRef.current && exportPNG(mapRef.current)}><ImageIcon />Map image (PNG)</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><a href="/about"><Info />About &amp; data sources</a></DropdownMenuItem>
          <DropdownMenuItem asChild><a href="/contact" onClick={event => { event.currentTarget.href = feedbackHref(); }}><MessageSquareText />Send feedback</a></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {planName !== null && (
        <div className="pointer-events-auto absolute top-[calc(100%+8px)] right-0 z-40 w-72 rounded-xl border bg-popover p-4 text-popover-foreground shadow-float" onKeyDown={event => event.key === 'Escape' && setPlanName(null)}>
          <form onSubmit={saveNamedPlan} className="space-y-3">
            <Label htmlFor="plan-name">Name this plan</Label>
            <Input id="plan-name" autoFocus value={planName} onChange={event => setPlanName(event.target.value)} placeholder="e.g. Option 2 with Heritage 1" />
            <p className="text-xs text-muted-foreground">Saved only in this browser. Use Share to send it to someone.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPlanName(null)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={!planName.trim()}>Save</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
