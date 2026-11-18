'use client';
import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { useStore } from 'zustand';
import {
  CalendarDays, Check, Download, FileJson, FileSpreadsheet, Image as ImageIcon, Info, Layers, Link2, MapPin, MessageSquareText,
  MoreHorizontal, Redo2, Save, School, Search, Share2, Undo2, Waypoints, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { LEVEL_NAME, type Level, type Static } from '../data';
import { OVERLAY } from '../map/MapPanel';
import { usePlan, useSaved, useUI, type Plan } from '../store';
import { encodePlan } from '../url';
import { AREAS } from '../visible';
import { exportCSV, exportGeoJSON, exportPNG } from './exports';
import type { Results } from '../App';

type Hit = { kind: 'school' | 'area' | 'street'; key: string; title: string; sub: string; go: () => void };

function bboxOf(coords: number[][]): [[number, number], [number, number]] {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const [x, y] of coords) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [[x0, y0], [x1, y1]];
}
const ringCoords = (g: any): number[][] => g.type === 'Polygon' ? g.coordinates[0] : g.coordinates.flatMap((p: any) => p[0]);

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side="bottom">{label}</TooltipContent></Tooltip>;
}

/** Floating search across schools, planning areas and streets. */
function SearchBox({ S, mapRef, pad }: { S: Static; mapRef: MutableRefObject<MapRef | null>; pad: () => any }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [k, setK] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const ui = useUI();
  const plan = usePlan(s => s.plan);

  // street name -> edges, built once
  const streetIndex = useMemo(() => {
    const m = new Map<number, number[]>(); const st = S.streets;
    for (let e = 0; e < st.nEdges; e++) { if (st.cls[e] >= 8) continue; const n = st.name[e]; if (!n) continue; (m.get(n) ?? m.set(n, []).get(n)!).push(e); }
    return m;
  }, [S]);

  const hits = useMemo<Hit[]>(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const map = () => mapRef.current;
    const out: Hit[] = [];
    for (const s of S.schools) {
      if (!s.name.toLowerCase().includes(t)) continue;
      const closing = plan.closures[String(s.i)] !== undefined;
      out.push({ kind: 'school', key: 's' + s.i, title: s.name, sub: `${LEVEL_NAME[s.level]}${closing ? ' · closing' : ''} · ${s.address}`,
        go: () => { if (s.level === ui.level) ui.set({ focusSchool: s.i }); map()?.flyTo({ center: [s.lon, s.lat], zoom: 14, duration: 700, padding: pad() }); } });
    }
    for (const f of S.planning.features) {
      if (f.geometry.type === 'Point') continue; const pa = String(f.properties!.pa);
      if (!pa.startsWith(t.replace(/^(pa|area)\s*/, ''))) continue;
      out.push({ kind: 'area', key: 'p' + pa, title: `Planning area ${pa}`, sub: `In ${f.properties!.school}'s current area`,
        go: () => { ui.set({ showAreas: true }); map()?.fitBounds(bboxOf(ringCoords(f.geometry)), { padding: pad(), duration: 700, maxZoom: 15 }); } });
    }
    const names = S.meta.streetNames; let ns = 0;
    for (let n = 0; n < names.length && ns < 6; n++) {
      if (!names[n].toLowerCase().includes(t) || !streetIndex.has(n)) continue; ns++;
      out.push({ kind: 'street', key: 'r' + n, title: names[n], sub: 'Street',
        go: () => {
          const st = S.streets, c: number[][] = [];
          for (const e of streetIndex.get(n)!) for (let j = st.coordOff[e]; j < st.coordOff[e + 1]; j++) c.push([st.coordLon[j], st.coordLat[j]]);
          map()?.fitBounds(bboxOf(c), { padding: pad(), duration: 700, maxZoom: 16 });
        } });
    }
    const rank = { school: 0, area: 1, street: 2 };
    return out.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.title.toLowerCase().startsWith(t) ? 0 : 1) - (b.title.toLowerCase().startsWith(t) ? 0 : 1)).slice(0, 9);
  }, [q, S, streetIndex, plan.closures, ui.level]);

  const pick = (h: Hit) => { h.go(); setOpen(false); input.current?.blur(); };
  const Icon = { school: School, area: MapPin, street: Waypoints };
  return (
    <div className="relative min-w-0 flex-1 md:w-[380px] md:flex-none">
      <div className="flex h-12 items-center gap-2.5 rounded-2xl border bg-card px-4 shadow-float">
        <Search className="size-[18px] shrink-0 text-muted-foreground" />
        <input ref={input} value={q} placeholder="Search schools, areas, streets" aria-label="Search" role="combobox" aria-expanded={open && hits.length > 0} aria-controls="search-results"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          onChange={e => { setQ(e.target.value); setK(0); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setK(x => Math.min(x + 1, hits.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setK(x => Math.max(x - 1, 0)); }
            else if (e.key === 'Enter' && hits[k]) pick(hits[k]);
            else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
          }} />
        {q && <button className="text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Clear search" onClick={() => { setQ(''); input.current?.focus(); }}><X className="size-4" /></button>}
      </div>
      {open && q.trim().length >= 2 && (
        <div id="search-results" role="listbox" className="absolute inset-x-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border bg-popover p-1.5 shadow-float">
          {hits.length === 0 && <p className="px-3 py-2.5 text-sm text-muted-foreground">No schools, planning areas or streets match “{q.trim()}”.</p>}
          {hits.map((h, i) => { const I = Icon[h.kind]; return (
            <button key={h.key} role="option" aria-selected={i === k} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setK(i)} onClick={() => pick(h)}
              className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left', i === k && 'bg-accent')}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><I className="size-4" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{h.title}</span><span className="block truncate text-xs text-muted-foreground">{h.sub}</span></span>
            </button>); })}
        </div>
      )}
    </div>
  );
}

export default function TopBar({ S, mapRef, resA, pad }: { S: Static; mapRef: MutableRefObject<MapRef | null>; resA: Results | null; pad: () => any }) {
  const ui = useUI();
  const plan = usePlan(s => s.plan);
  const temporal = useStore(usePlan.temporal);
  const save = useSaved(s => s.save);
  const [naming, setNaming] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const Y = S.meta.years, y0 = S.meta.firstPlanYear;

  const share = async () => {
    // Short link from the server when Supabase is set up; otherwise the full address, which carries the plan itself.
    let url = location.href;
    try {
      const r = await fetch('/api/plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hash: location.hash.slice(1), name: plan.name ?? null, dataVersion: S.meta.dataVersion ?? null }) });
      if (r.ok) { const j = await r.json(); if (j.id) url = `${location.origin}/p/${j.id}`; }
    } catch { /* offline or no API: keep the long link */ }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); ui.set({ toast: 'Link copied. Anyone with it sees this exact plan.' }); }
    catch { ui.set({ toast: 'Copy this link to share: ' + url }); }
  };
  const doSave = () => {
    const name = (naming ?? '').trim(); if (!name) return;
    const p: Plan = { ...plan, name }; usePlan.getState().setPlan(p);
    save({ name, enc: encodePlan(p, S.presets) }); setNaming(null);
    ui.set({ toast: `Saved “${name}” in this browser.` });
  };
  const feedbackHref = () => (location.href.length <= 2000 ? '/contact?plan=' + encodeURIComponent(location.href) : '/contact');

  return (
    <div className="topbar pointer-events-none absolute z-20 flex items-start gap-2 md:gap-3">
      <div className="pointer-events-auto contents"><SearchBox S={S} mapRef={mapRef} pad={pad} /></div>
      <div className="pointer-events-auto relative flex h-12 shrink-0 items-center gap-0.5 rounded-2xl border bg-card px-1.5 shadow-float">
        <Popover>
          <Tip label="Layers and map"><PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label="Layers and map"><Layers className="size-[18px]" /></Button></PopoverTrigger></Tip>
          <PopoverContent align="start" className="w-80 p-0">
            <div className="space-y-3 p-4">
              <p className="text-sm font-semibold">Areas shown</p>
              <div className="flex flex-wrap gap-1.5">
                {AREAS.map(a => { const onA = ui.areas.includes(a); return (
                  <button key={a} aria-pressed={onA} onClick={() => { const next = onA ? ui.areas.filter(x => x !== a) : [...ui.areas, a]; if (next.length) ui.set({ areas: next }); }}
                    className={cn('inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors', onA ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>
                    {onA && <Check className="size-3.5" />}{a}</button>); })}
              </div>
              <p className="text-xs text-muted-foreground">High school areas. Schools receiving students from a closing school always show.</p>
            </div>
            <Separator />
            <div className="space-y-3 p-4">
              <p className="text-sm font-semibold">Color areas by</p>
              <ToggleGroup type="single" value={ui.colorBy} onValueChange={v => v && ui.set({ colorBy: v as any })} className="w-full">
                <ToggleGroupItem value="school">School</ToggleGroupItem><ToggleGroupItem value="util">% full</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <Separator />
            <div className="space-y-3.5 p-4">
              <p className="text-sm font-semibold">Overlay feeder boundaries</p>
              {(['ms', 'hs'] as const).filter(l => l !== ui.level).map(l => (
                <Row key={l} id={'sw-ov-' + l} label={l === 'ms' ? 'Middle school' : 'High school'} swatch={l}
                  checked={ui.overlays.includes(l)} on={v => ui.set({ overlays: v ? [...ui.overlays, l] : ui.overlays.filter(x => x !== l) })} />
              ))}
              {ui.level === 'es' && ui.overlays.includes('ms') && <p className="text-xs text-muted-foreground">{ui.mode === 'build' ? <>Shows the middle school concept picked in the Option Builder{ui.build.ms ? ` (concept ${ui.build.ms})` : ''}.</> : <>Shows this plan&rsquo;s middle school lines. The starting plans leave Indian Trail&rsquo;s area unassigned; build from the Option Builder to include a middle school concept.</>}</p>}
            </div>
            <Separator />
            <div className="space-y-3.5 p-4">
              <Row id="sw-areas" label="Planning areas" checked={ui.showAreas} on={v => ui.set({ showAreas: v })} />
              <Row id="sw-homes" label="Homes" checked={ui.showHomes} on={v => ui.set({ showHomes: v })} />
              {ui.mode === 'draw' && <Row id="sw-streets" label="Street snapping lines" checked={ui.showStreets} on={v => ui.set({ showStreets: v })} />}
              <Row id="sw-prek" label="Count Pre-K in model %" checked={ui.includePreK} on={v => ui.set({ includePreK: v })} />
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <Tip label="Projection year"><PopoverTrigger asChild>
            <Button variant="ghost" className="h-9 gap-1.5 px-2.5" aria-label={'Projection year ' + Y[ui.year]}><CalendarDays className="size-[18px]" /><span className="hidden text-[13px] tabular-nums sm:inline">{Y[ui.year]}</span></Button>
          </PopoverTrigger></Tip>
          <PopoverContent align="start" className="w-72">
            <div className="flex items-baseline justify-between"><p className="text-sm font-semibold">Projection year</p><span className="text-sm tabular-nums text-primary font-semibold">{Y[ui.year]}</span></div>
            <Slider className="mt-4" min={y0} max={Y.length - 1} step={1} value={[ui.year]} onValueChange={([v]) => ui.set({ year: v })} aria-label="Projection year" />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{Y[y0]}</span><span>{Y[Y.length - 1]}</span></div>
            <p className="mt-3 text-xs text-muted-foreground">Sets the year for the school table and % full colors. Peaks always cover every year.</p>
          </PopoverContent>
        </Popover>
        {ui.mode === 'draw' && <>
          <Separator orientation="vertical" className="mx-1 !h-6" />
          <Tip label="Undo"><Button variant="ghost" size="icon" onClick={() => temporal.undo()} disabled={!temporal.pastStates.length} aria-label="Undo"><Undo2 className="size-[18px]" /></Button></Tip>
          <Tip label="Redo"><Button variant="ghost" size="icon" onClick={() => temporal.redo()} disabled={!temporal.futureStates.length} aria-label="Redo"><Redo2 className="size-[18px]" /></Button></Tip>
        </>}
        <Separator orientation="vertical" className="mx-1 !h-6" />
        <DropdownMenu>
            <Tip label="More"><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More"><MoreHorizontal className="size-[18px]" /></Button></DropdownMenuTrigger></Tip>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={() => setTimeout(() => setNaming(plan.name ?? ''), 50)}><Save />Save plan in this browser</DropdownMenuItem>
              <DropdownMenuItem onSelect={share}><Link2 />Copy link to this view</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5"><Download className="size-3.5" />Export</DropdownMenuLabel>
              <DropdownMenuItem disabled={!resA} onSelect={() => resA && exportGeoJSON(S, resA, plan)}><FileJson />Boundaries (GeoJSON)</DropdownMenuItem>
              <DropdownMenuItem disabled={!resA} onSelect={() => resA && exportCSV(S, resA, plan)}><FileSpreadsheet />Numbers (CSV)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => mapRef.current && exportPNG(mapRef.current)}><ImageIcon />Map image (PNG)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><a href="/about"><Info />About &amp; data sources</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href="/contact" onClick={e => { e.currentTarget.href = feedbackHref(); }}><MessageSquareText />Send feedback</a></DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
        {naming !== null && (
          <div className="pointer-events-auto absolute top-[calc(100%+8px)] right-0 z-40 w-72 rounded-xl border bg-popover p-4 text-popover-foreground shadow-float" onKeyDown={e => e.key === 'Escape' && setNaming(null)}>
            <form onSubmit={e => { e.preventDefault(); doSave(); }} className="space-y-3">
              <Label htmlFor="plan-name">Name this plan</Label>
              <Input id="plan-name" autoFocus value={naming} onChange={e => setNaming(e.target.value)} placeholder="e.g. Option 2 with Heritage 1" />
              <p className="text-xs text-muted-foreground">Saved only in this browser. Use Share to send it to someone.</p>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setNaming(null)}>Cancel</Button><Button type="submit" size="sm" disabled={!naming.trim()}>Save</Button></div>
            </form>
          </div>
        )}
      </div>
      <Button onClick={share} className="pointer-events-auto hidden h-12 rounded-2xl px-5 shadow-float sm:inline-flex" aria-label="Share this view">
        {copied ? <Check className="size-[18px]" /> : <Share2 className="size-[18px]" />}{copied ? 'Copied' : 'Share'}
      </Button>
    </div>
  );
}

function Row({ id, label, checked, on, swatch }: { id: string; label: string; checked: boolean; on: (v: boolean) => void; swatch?: 'ms' | 'hs' }) {
  return <div className="flex items-center justify-between gap-3">
    <Label htmlFor={id} className="font-normal">{swatch && <LineSwatch lv={swatch} />}{label}</Label><Switch id={id} checked={checked} onCheckedChange={on} />
  </div>;
}
export function LineSwatch({ lv }: { lv: 'ms' | 'hs' }) {
  const c = OVERLAY[lv];
  return <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden className="shrink-0"><line x1="1" y1="5" x2="21" y2="5" stroke={c.color} strokeWidth={lv === 'hs' ? 3 : 2.2} strokeDasharray={c.dash ? '5 2.5' : undefined} strokeLinecap="round" /></svg>;
}
