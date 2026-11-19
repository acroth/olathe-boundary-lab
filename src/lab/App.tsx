import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef, ViewState } from 'react-map-gl/maplibre';
import { Loader2 } from 'lucide-react';
import Rail from '@/components/Rail';
import { facesGeometry, LEVELS, loadStatic, type Level, type Static } from './data';
import { useDrawCallbacks } from './hooks/useDrawCallbacks';
import { useModelResults, type Results } from './hooks/useModelResults';
import { applyLinkedState, writeLinkedState } from './linkedState';
import MapPanel from './map/MapPanel';
import { schoolNumbers, type SchoolNumber } from './numbers';
import { buildPlan } from './planBuilder';
import { shownOverlay, usePlan, useUI } from './store';
import Legend from './ui/Legend';
import MapToolbar from './ui/MapToolbar';
import Sidebar from './ui/Sidebar';
import TopBar from './ui/TopBar';
import { visibleSet } from './visible';

export type { Results };

const INITIAL_VIEW = { longitude: -94.80, latitude: 38.895, zoom: 11.2 };
const LINK_UPDATE_DELAY_MS = 300;
const TOAST_MS = 3500;
const NEXT_SHEET_SIZE = { peek: 'half', half: 'full', full: 'peek' } as const;
const BUILDER_SUBTITLE: Record<Level, string> = {
  es: 'Pick a district concept for each closing school',
  ms: 'Pick a middle school concept',
  hs: 'No district concept changes high schools',
};

/** The bounding box of every attendance area in the chosen high school areas; null when there are none. */
function boundsOfAreas(staticData: Static, areas: string[]): [[number, number], [number, number]] | null {
  let west = 180, south = 90, east = -180, north = -90;
  for (const level of LEVELS) {
    for (const feature of staticData.zones[level].features) {
      if (!areas.includes(staticData.schools[feature.properties!.school].area)) continue;
      const geometry = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      for (const polygon of polygons) {
        for (const [longitude, latitude] of polygon[0]) {
          west = Math.min(west, longitude); south = Math.min(south, latitude);
          east = Math.max(east, longitude); north = Math.max(north, latitude);
        }
      }
    }
  }
  return east > west ? [[west, south], [east, north]] : null;
}

/** Map padding that keeps fitted areas clear of the floating panel, top bar and legend. */
export function mapPadding() {
  const { sheet, panelOpen } = useUI.getState();
  if (window.innerWidth >= 768) return { top: 90, left: panelOpen ? 420 : 40, right: 260, bottom: 40 };
  const sheetHeight = { peek: 190, half: window.innerHeight * 0.5, full: window.innerHeight * 0.5 }[sheet];
  return { top: 132, left: 16, right: 16, bottom: sheetHeight + 16 };
}

export default function App() {
  const [staticData, setStaticData] = useState<Static | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [view, setView] = useState<Partial<ViewState>>(INITIAL_VIEW);
  const mapRef = useRef<MapRef | null>(null);
  const plan = usePlan(state => state.plan);
  const ui = useUI();

  useEffect(() => {
    loadStatic().then(data => {
      setStaticData(data);
      applyLinkedState(data);
    }).catch(error => setLoadError(String(error)));
  }, []);

  // concept builder: the plan follows the chosen concepts
  useEffect(() => {
    if (!staticData || ui.mode !== 'build' || !staticData.combos) return;
    usePlan.getState().setPlan(buildPlan(staticData, ui.build.sel, ui.build.moves, ui.build.ms));
  }, [staticData, ui.mode, ui.build]);

  const { planResults, compareResults, isUpdating } = useModelResults(staticData, plan, ui.compare, ui.includePreK);
  const latestResults = useRef<Results | null>(null);
  latestResults.current = planResults;

  // keep the plan in the URL
  useEffect(() => {
    if (!staticData) return;
    const update = setTimeout(() => writeLinkedState(staticData, plan, ui.level, ui.compare), LINK_UPDATE_DELAY_MS);
    return () => clearTimeout(update);
  }, [plan, ui.compare, staticData, ui.mode, ui.build, ui.level]);

  useEffect(() => {
    if (!ui.toast) return;
    const hide = setTimeout(() => useUI.getState().set({ toast: null }), TOAST_MS);
    return () => clearTimeout(hide);
  }, [ui.toast]);

  // undo / redo keys
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      const history = usePlan.temporal.getState();
      if (event.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const faceGeometry = useCallback((faceIds: number[]) => facesGeometry(staticData!, faceIds), [staticData]);
  const drawCallbacks = useDrawCallbacks(faceGeometry, latestResults);

  const diffHomes = useMemo(() => {
    if (!ui.diff || !planResults || !compareResults) return null;
    const planAssignment = planResults.levels[ui.level].assign, compareAssignment = compareResults.levels[ui.level].assign;
    const differs = new Uint8Array(planAssignment.length);
    for (let home = 0; home < planAssignment.length; home++) differs[home] = planAssignment[home] !== compareAssignment[home] ? 1 : 0;
    return differs;
  }, [ui.diff, planResults, compareResults, ui.level]);

  const visibleSchools = useMemo(() => {
    return staticData ? visibleSet(staticData, planResults, ui.areas, plan.closures) : new Set<number>();
  }, [staticData, planResults, ui.areas, plan.closures]);
  const planNumbers = useMemo(() => {
    if (!staticData) return new Map<number, SchoolNumber>();
    return schoolNumbers(staticData, plan, planResults?.levels[ui.level] ?? null, ui.level, ui.year);
  }, [staticData, plan, planResults, ui.level, ui.year]);
  const compareNumbers = useMemo(() => {
    if (!staticData || !ui.compare) return new Map<number, SchoolNumber>();
    return schoolNumbers(staticData, ui.compare, compareResults?.levels[ui.level] ?? null, ui.level, ui.year);
  }, [staticData, ui.compare, compareResults, ui.level, ui.year]);

  // say so when an edit or a year change leaves the district's published figures
  const previousFigures = useRef<{ level: Level; hasDistrictFigures: boolean } | null>(null);
  useEffect(() => {
    if (!planNumbers.size) return;
    const hasDistrictFigures = [...planNumbers.values()].some(schoolNumber => schoolNumber.source === 'district');
    const previous = previousFigures.current;
    previousFigures.current = { level: ui.level, hasDistrictFigures };
    const leftDistrictFigures = previous?.hasDistrictFigures && previous.level === ui.level && !hasDistrictFigures;
    if (leftDistrictFigures) useUI.getState().set({ toast: 'The district published no figures for this plan and year, so these are model estimates (~).' });
  }, [planNumbers, ui.level]);

  // zoom to the areas shown
  const shownAreasKey = ui.areas.slice().sort().join(',');
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!staticData || !map) return;
    const bounds = boundsOfAreas(staticData, ui.areas);
    if (bounds) map.fitBounds(bounds, { padding: mapPadding(), duration: 500 });
  }, [shownAreasKey, staticData, mapReady]);

  if (loadError) return <div className="loading">Could not load data: {loadError}</div>;
  if (!staticData) return <div className="loading">Loading district data…</div>;

  const inBuilder = ui.mode === 'build';
  const panelTitle = inBuilder ? 'Concept builder' : 'Free draw';
  const panelSubtitle = inBuilder ? BUILDER_SUBTITLE[ui.level] : 'Start from a plan, then redraw on the map';
  const labClassName = `lab sheet-${ui.sheet} ${ui.panelOpen ? 'panel-open' : 'panel-closed'} mode-${ui.mode}`;
  const selectedGeometry = plan.edits.find(edit => edit.id === ui.selectedEdit)?.geom ?? null;
  const comparePlanName = ui.compare?.name || staticData.presets.find(preset => preset.id === ui.compare?.preset)?.name || 'other plan';

  const sharedMapProps = {
    staticData, visibleSchools, diffHomes, view,
    showAreas: ui.showAreas, level: ui.level, year: ui.year, colorBy: ui.colorBy, overlay: shownOverlay(ui.level, ui.overlay),
    showHomes: ui.showHomes || ui.diff, showStreets: ui.showStreets,
    onView: (nextView: ViewState) => setView(nextView),
  };
  const switchTool = (mode: 'build' | 'draw') => {
    ui.set(mode === 'build' ? { mode: 'build', tool: 'pan', panelOpen: true } : { mode: 'draw', panelOpen: true, sheet: 'peek' });
  };
  const handleMapRef = (map: MapRef | null) => {
    mapRef.current = map;
    (window as any).__lab = { map: map?.getMap(), S: staticData };
    if (map) setMapReady(true);
  };

  return (
    <div className={labClassName}>
      <Rail active={ui.mode} onMode={switchTool} panelOpen={ui.panelOpen} onTogglePanel={() => ui.set({ panelOpen: !ui.panelOpen })} />
      <main className="lab-main">
        <div className={'maps' + (ui.compare ? ' split' : '')}>
          <MapPanel {...sharedMapProps} result={planResults?.levels ?? null} numbers={planNumbers} closures={plan.closures} tool={inBuilder ? 'pan' : ui.tool} interactive drawCallbacks={drawCallbacks}
            selectedGeometry={selectedGeometry} doneTick={ui.doneTick} title={ui.compare ? (plan.name || 'This plan') : undefined} onMapRef={handleMapRef} />
          {ui.compare && (
            <MapPanel {...sharedMapProps} result={compareResults?.levels ?? null} numbers={compareNumbers} closures={ui.compare.closures} tool="pan" interactive={false} title={'Compare: ' + comparePlanName} />
          )}
        </div>
        <TopBar staticData={staticData} mapRef={mapRef} planResults={planResults} padding={mapPadding} />
        <aside className="panel" aria-label={panelTitle}>
          <button className="grab" aria-label="Resize panel" onClick={() => ui.set({ sheet: NEXT_SHEET_SIZE[ui.sheet] })}><span /></button>
          <header className="panel-head">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight">{panelTitle}</h2>
              <p className="truncate text-xs text-muted-foreground">{panelSubtitle}</p>
            </div>
            {isUpdating && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Updating</span>}
          </header>
          <div className="panel-body lg">
            <Sidebar staticData={staticData} planResults={planResults} compareResults={compareResults} mapRef={mapRef} faceGeometry={faceGeometry} visibleSchools={visibleSchools} numbers={planNumbers} />
          </div>
        </aside>
        {!inBuilder && <MapToolbar staticData={staticData} visibleSchools={visibleSchools} />}
        <Legend staticData={staticData} visibleSchools={visibleSchools} mapRef={mapRef} numbers={planNumbers} />
        {ui.toast && <div className="toast" role="status">{ui.toast}</div>}
      </main>
    </div>
  );
}
