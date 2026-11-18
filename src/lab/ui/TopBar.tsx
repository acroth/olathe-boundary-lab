'use client';
// The floating bar above the map: school level, search, map settings, undo and sharing.
import { useState, type MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { useStore } from 'zustand';
import { Check, Redo2, Share2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Results } from '../App';
import { LEVELS, LEVEL_NAME, type Level, type Static } from '../data';
import { usePlan, useUI } from '../store';
import IconTip from './topBar/IconTip';
import LayersMenu from './topBar/LayersMenu';
import MoreMenu from './topBar/MoreMenu';
import SearchBox from './topBar/SearchBox';
import YearMenu from './topBar/YearMenu';

const COPIED_MESSAGE_MS = 2000;

/** School level for the whole lab; the map, panel and tools all follow it. */
function LevelSwitch() {
  const ui = useUI();
  return (
    <div className="pointer-events-auto order-last flex h-12 w-full items-center rounded-2xl border bg-card px-1.5 shadow-float md:order-first md:w-auto md:shrink-0">
      <ToggleGroup type="single" value={ui.level} className="w-full" aria-label="School level" onValueChange={level => level && ui.set({ level: level as Level, brush: -2 })}>
        {LEVELS.map(level => <ToggleGroupItem key={level} value={level} className="h-9 flex-auto px-3">{LEVEL_NAME[level]}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  );
}

/** A short link from the server when Supabase is set up; otherwise the full address, which carries the plan itself. */
async function shareableLink(staticData: Static, planName: string | undefined): Promise<string> {
  try {
    const response = await fetch('/api/plans', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hash: location.hash.slice(1), name: planName ?? null, dataVersion: staticData.meta.dataVersion ?? null }),
    });
    if (response.ok) {
      const { id } = await response.json();
      if (id) return `${location.origin}/p/${id}`;
    }
  } catch { /* offline or no API: keep the long link */ }
  return location.href;
}

interface TopBarProps {
  staticData: Static;
  mapRef: MutableRefObject<MapRef | null>;
  planResults: Results | null;
  padding: () => any;
}

export default function TopBar({ staticData, mapRef, planResults, padding }: TopBarProps) {
  const ui = useUI();
  const plan = usePlan(state => state.plan);
  const history = useStore(usePlan.temporal);
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const link = await shareableLink(staticData, plan.name);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MESSAGE_MS);
      ui.set({ toast: 'Link copied. Anyone with it sees this exact plan.' });
    } catch {
      ui.set({ toast: 'Copy this link to share: ' + link });
    }
  };

  return (
    <div className="topbar pointer-events-none absolute z-20 flex flex-wrap items-start gap-2 md:flex-nowrap md:gap-3">
      <LevelSwitch />
      <div className="pointer-events-auto contents"><SearchBox staticData={staticData} mapRef={mapRef} padding={padding} /></div>
      <div className="pointer-events-auto relative flex h-12 shrink-0 items-center gap-0.5 rounded-2xl border bg-card px-1.5 shadow-float">
        <LayersMenu />
        <YearMenu staticData={staticData} />
        {ui.mode === 'draw' && (
          <>
            <Separator orientation="vertical" className="mx-1 !h-6" />
            <IconTip label="Undo"><Button variant="ghost" size="icon" onClick={() => history.undo()} disabled={!history.pastStates.length} aria-label="Undo"><Undo2 className="size-[18px]" /></Button></IconTip>
            <IconTip label="Redo"><Button variant="ghost" size="icon" onClick={() => history.redo()} disabled={!history.futureStates.length} aria-label="Redo"><Redo2 className="size-[18px]" /></Button></IconTip>
          </>
        )}
        <Separator orientation="vertical" className="mx-1 !h-6" />
        <MoreMenu staticData={staticData} mapRef={mapRef} planResults={planResults} onShare={share} />
      </div>
      <Button onClick={share} className="pointer-events-auto hidden h-12 shrink-0 rounded-2xl px-5 shadow-float sm:inline-flex md:hidden lg:inline-flex" aria-label="Share this view">
        {copied ? <Check className="size-[18px]" /> : <Share2 className="size-[18px]" />}{copied ? 'Copied' : 'Share'}
      </Button>
    </div>
  );
}
