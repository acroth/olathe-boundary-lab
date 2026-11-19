'use client';
// Phones: a map-first layout. One slim row on top (menu, level, year), search at the bottom left, map buttons on the right, and three
// bottom tabs that open drawers. Larger screens keep the top bar, rail and side panel.
import { useState, type MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { Blocks, Info, LocateFixed, PenLine, Search, TableProperties, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Results } from '../../App';
import type { Static } from '../../data';
import { publishedConcept, publishedOption } from '../../numbers';
import { blankPlan } from '../../startingPlans';
import { usePlan, useUI, type MobileDrawer } from '../../store';
import { LegendList, legendTitle } from '../Legend';
import { LevelSwitch, UndoRedo, useShare } from '../TopBar';
import LayersMenu from '../topBar/LayersMenu';
import MoreMenu from '../topBar/MoreMenu';
import SearchBox from '../topBar/SearchBox';
import YearMenu from '../topBar/YearMenu';

interface MobileTopBarProps {
  staticData: Static;
  mapRef: MutableRefObject<MapRef | null>;
  planResults: Results | null;
  padding: () => any;
}

/** One slim row: the ☰ menu (which holds Share), the school level, and the year. */
export function MobileTopBar({ staticData, mapRef, planResults }: MobileTopBarProps) {
  const { share } = useShare(staticData);

  return (
    <div className="mobile-top pointer-events-none absolute z-20">
      <div className="mobile-chip pointer-events-auto">
        <MoreMenu staticData={staticData} mapRef={mapRef} planResults={planResults} onShare={share} asMenu />
      </div>
      <LevelSwitch className="mobile-level" />
      <div className="mobile-chip pointer-events-auto"><YearMenu staticData={staticData} /></div>
    </div>
  );
}

/** Bottom left: undo and redo while drawing, and a search button that opens into a search box to its right (results open upward). */
export function MobileSearch({ staticData, mapRef, padding }: { staticData: Static; mapRef: MutableRefObject<MapRef | null>; padding: () => any }) {
  const [searching, setSearching] = useState(false);
  const drawing = useUI(state => state.mode === 'draw');
  return (
    <div className={cn('mobile-left pointer-events-none absolute z-20', searching && 'open')}>
      {drawing && <div className="map-stack pointer-events-auto"><UndoRedo /></div>}
      <div className="mobile-search pointer-events-auto">
      <Button variant="ghost" size="icon" className="map-button" aria-label={searching ? 'Close search' : 'Search'} aria-expanded={searching} onClick={() => setSearching(open => !open)}>
        {searching ? <X className="size-[18px]" /> : <Search className="size-[18px]" />}
      </Button>
      {searching && <SearchBox staticData={staticData} mapRef={mapRef} padding={padding} opensUp autoFocus onPicked={() => setSearching(false)} />}
      </div>
    </div>
  );
}

/** Layers, map key and back-to-the-closures, stacked on the right edge of the map. */
export function MapButtons({ staticData, visibleSchools, onRecenter }: { staticData: Static; visibleSchools: Set<number>; onRecenter: () => void }) {
  useUI(state => state.colorBy + state.year);   // keep the key's title current
  return (
    <div className="map-buttons pointer-events-auto absolute z-10">
      <LayersMenu staticData={staticData} triggerClassName="map-button" side="left" align="end" />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="map-button" aria-label="Map key"><Info className="size-[18px]" /></Button>
        </PopoverTrigger>
        <PopoverContent side="left" align="end" className="w-60 p-0">
          <p className="px-4 pt-3 pb-2 text-sm font-semibold">{legendTitle(staticData)}</p>
          <LegendList staticData={staticData} visibleSchools={visibleSchools} className="max-h-[50vh] px-4 pb-3.5" />
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon" className="map-button" aria-label="Back to the closure area" onClick={onRecenter}><LocateFixed className="size-[18px]" /></Button>
    </div>
  );
}

/** The Concept tab's label: the district concept on the map at this level, or "Custom" for anything else. */
function conceptLabel(staticData: Static): string {
  const ui = useUI.getState(), plan = usePlan.getState().plan;
  if (ui.level === 'hs') return 'Concepts';
  const concept = ui.level === 'ms' ? publishedConcept(staticData, plan) : publishedOption(staticData, plan);
  return concept ? `Concept ${concept}` : 'Custom';
}

/** Concept, Schools and Draw. Each opens its drawer; tapping the open one closes it. */
export function MobileTabs({ staticData }: { staticData: Static }) {
  const ui = useUI();
  usePlan(state => state.plan);   // the Concept label follows the plan

  const toggle = (drawer: MobileDrawer, extra: Partial<typeof ui> = {}) => {
    const closing = ui.drawer === drawer && Object.keys(extra).length === 0;
    ui.set(closing ? { drawer: null } : { drawer, sheet: drawer === 'draw' ? 'peek' : 'half', ...extra });
  };
  const openConcepts = () => ui.mode === 'build' ? toggle('concepts') : toggle('concepts', { mode: 'build', tool: 'pan' });
  const openDraw = () => {
    if (ui.mode === 'draw') return toggle('draw');
    usePlan.getState().setPlan(blankPlan(staticData, usePlan.getState().plan));
    toggle('draw', { mode: 'draw' });
  };

  const tabs: { id: MobileDrawer; label: string; icon: typeof Blocks; active: boolean; onClick: () => void }[] = [
    { id: 'concepts', label: conceptLabel(staticData), icon: Blocks, active: ui.mode === 'build' && ui.drawer !== 'schools', onClick: openConcepts },
    { id: 'schools', label: 'Schools', icon: TableProperties, active: ui.drawer === 'schools', onClick: () => toggle('schools') },
    { id: 'draw', label: 'Free Draw', icon: PenLine, active: ui.mode === 'draw' && ui.drawer !== 'schools', onClick: openDraw },
  ];

  return (
    <nav className="mobile-tabs pointer-events-auto absolute z-30" aria-label="Lab">
      {tabs.map(tab => (
        <button key={tab.id} className={cn('mobile-tab', tab.active && 'on')} aria-pressed={tab.active} onClick={tab.onClick}>
          <span className="mobile-tab-icon"><tab.icon /></span>
          <span className="mobile-tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export const DRAWER_TITLE: Record<MobileDrawer, string> = { concepts: 'Concepts', schools: 'Schools', draw: 'Free draw' };
