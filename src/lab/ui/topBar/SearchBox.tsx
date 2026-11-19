// Floating search across schools and planning areas.
import { useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { MapPin, School, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEVEL_NAME, type Level, type Static } from '../../data';
import { usePlan, useUI, type Plan } from '../../store';

type HitKind = 'school' | 'area';
interface SearchHit { kind: HitKind; key: string; title: string; sub: string; go: () => void }
type LngLatBounds = [[number, number], [number, number]];

const MIN_QUERY_LENGTH = 2, MAX_HITS = 9;
const KIND_RANK: Record<HitKind, number> = { school: 0, area: 1 };
const KIND_ICON = { school: School, area: MapPin };

function boundsOf(coordinates: number[][]): LngLatBounds {
  let west = 180, south = 90, east = -180, north = -90;
  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude); south = Math.min(south, latitude);
    east = Math.max(east, longitude); north = Math.max(north, latitude);
  }
  return [[west, south], [east, north]];
}

function outerRingCoordinates(geometry: any): number[][] {
  return geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates.flatMap((polygon: any) => polygon[0]);
}

interface HitContext {
  staticData: Static;
  plan: Plan;
  level: Level;
  query: string;
  map: () => MapRef | null;
  padding: () => any;
  focusSchool: (school: number) => void;
  showPlanningAreas: () => void;
}

function schoolHits({ staticData, plan, level, query, map, padding, focusSchool }: HitContext): SearchHit[] {
  return staticData.schools.filter(school => school.name.toLowerCase().includes(query)).map(school => {
    const closingNote = plan.closures[String(school.i)] !== undefined ? ' · closing' : '';
    return {
      kind: 'school', key: 's' + school.i, title: school.name, sub: `${LEVEL_NAME[school.level]}${closingNote} · ${school.address}`,
      go: () => {
        if (school.level === level) focusSchool(school.i);
        map()?.flyTo({ center: [school.lon, school.lat], zoom: 14, duration: 700, padding: padding() });
      },
    };
  });
}

function planningAreaHits({ staticData, query, map, padding, showPlanningAreas }: HitContext): SearchHit[] {
  const areaNumber = query.replace(/^(pa|area)\s*/, '');
  const areas = staticData.planning.features.filter(feature => feature.geometry.type !== 'Point' && String(feature.properties!.pa).startsWith(areaNumber));
  return areas.map(feature => {
    const area = String(feature.properties!.pa);
    return {
      kind: 'area', key: 'p' + area, title: `Planning area ${area}`, sub: `In ${feature.properties!.school}'s current area`,
      go: () => {
        showPlanningAreas();
        map()?.fitBounds(boundsOf(outerRingCoordinates(feature.geometry)), { padding: padding(), duration: 700, maxZoom: 15 });
      },
    };
  });
}

/** Schools first, then areas; within each, titles that start with the query come first. */
function rankHits(hits: SearchHit[], query: string): SearchHit[] {
  const startsWithQuery = (hit: SearchHit) => hit.title.toLowerCase().startsWith(query) ? 0 : 1;
  return hits.sort((first, second) => KIND_RANK[first.kind] - KIND_RANK[second.kind] || startsWithQuery(first) - startsWithQuery(second)).slice(0, MAX_HITS);
}

interface SearchBoxProps {
  staticData: Static;
  mapRef: MutableRefObject<MapRef | null>;
  padding: () => any;
}

export default function SearchBox({ staticData, mapRef, padding }: SearchBoxProps) {
  const [queryText, setQueryText] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const ui = useUI();
  const plan = usePlan(state => state.plan);

  const hits = useMemo<SearchHit[]>(() => {
    const query = queryText.trim().toLowerCase();
    if (query.length < MIN_QUERY_LENGTH) return [];
    const context: HitContext = {
      staticData, plan, level: ui.level, query, map: () => mapRef.current, padding,
      focusSchool: school => ui.set({ focusSchool: school }),
      showPlanningAreas: () => ui.set({ showAreas: true }),
    };
    return rankHits([...schoolHits(context), ...planningAreaHits(context)], query);
  }, [queryText, staticData, plan.closures, ui.level]);

  const pickHit = (hit: SearchHit) => {
    hit.go();
    setOpen(false);
    input.current?.blur();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(index + 1, hits.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && hits[activeIndex]) {
      pickHit(hits[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
    }
  };
  const clearQuery = () => {
    setQueryText('');
    input.current?.focus();
  };

  const trimmedQuery = queryText.trim();
  const showResults = open && trimmedQuery.length >= MIN_QUERY_LENGTH;

  return (
    <div className="relative min-w-0 flex-1 md:max-w-[380px]">
      <div className="flex h-12 items-center gap-2.5 rounded-2xl border bg-card px-4 shadow-float">
        <Search className="size-[18px] shrink-0 text-muted-foreground" />
        <input ref={input} value={queryText} placeholder="Search schools or planning areas" aria-label="Search" role="combobox" aria-expanded={open && hits.length > 0} aria-controls="search-results"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          onChange={event => { setQueryText(event.target.value); setActiveIndex(0); setOpen(true); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={handleKeyDown} />
        {queryText && <button className="text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Clear search" onClick={clearQuery}><X className="size-4" /></button>}
      </div>
      {showResults && (
        <div id="search-results" role="listbox" className="absolute inset-x-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border bg-popover p-1.5 shadow-float">
          {hits.length === 0 && <p className="px-3 py-2.5 text-sm text-muted-foreground">No schools or planning areas match “{trimmedQuery}”.</p>}
          {hits.map((hit, index) => {
            const Icon = KIND_ICON[hit.kind];
            return (
              <button key={hit.key} role="option" aria-selected={index === activeIndex} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => pickHit(hit)}
                className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left', index === activeIndex && 'bg-accent')}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{hit.title}</span><span className="block truncate text-xs text-muted-foreground">{hit.sub}</span></span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
