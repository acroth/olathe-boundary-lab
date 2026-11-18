import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef, ViewState } from 'react-map-gl/maplibre';
import { areaGeom, dataBase, loadStatic, type Edit, type Level, type Static } from './data';
import type { LevelResult } from './model/engine';
import { newId, planFromPreset, usePlan, useUI, type Plan } from './store';
import { decodePlan, encodePlan } from './url';
import MapPanel from './map/MapPanel';
import Sidebar from './ui/Sidebar';
import MapToolbar from './ui/MapToolbar';
import { visibleSet } from './visible';
import { buildPlan } from './ui/Builder';
import type { DrawCallbacks } from './map/drawing';

export interface Results { levels: Record<Level, LevelResult>; feeder: { es: number; split: { ms: number; share: number }[] }[] }

const INITIAL_VIEW = { longitude: -94.80, latitude: 38.895, zoom: 11.2 };

export default function App() {
  const [S, setS] = useState<Static | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [resA, setResA] = useState<Results | null>(null);
  const resRef = useRef<Results | null>(null); resRef.current = resA;
  const [resB, setResB] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [fallback, setFallback] = useState(0);
  const [view, setView] = useState<Partial<ViewState>>(INITIAL_VIEW);
  const mapRef = useRef<MapRef | null>(null);
  const plan = usePlan(s => s.plan);
  const ui = useUI();
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);

  const faceGeom = useCallback((ids: number[]): GeoJSON.MultiPolygon => {
    const coords: any[] = [];
    for (const id of ids) { const g: any = S!.faces.features[id]?.geometry; if (!g) continue; if (g.type === 'Polygon') coords.push(g.coordinates); else coords.push(...g.coordinates); }
    return { type: 'MultiPolygon', coordinates: coords };
  }, [S]);

  useEffect(() => {
    loadStatic().then(st => {
      setS(st);
      const hash = new URLSearchParams(location.hash.slice(1));
      const enc = hash.get('plan');
      const fg = (ids: number[]) => { const coords: any[] = []; for (const id of ids) { const g: any = st.faces.features[id]?.geometry; if (g) coords.push(...(g.type === 'Polygon' ? [g.coordinates] : g.coordinates)); } return { type: 'MultiPolygon', coordinates: coords } as GeoJSON.MultiPolygon; };
      const p = enc ? decodePlan(enc, st.presets, fg, r => areaGeom(st, r)) : null;
      const bq = hash.get('build');
      if (bq && st.combos) {   // build=1.1.1.1.1 or build=1.1.1.1.1~630,PR-BE (explicit moves)
        const [a, m] = bq.split('~'); const sel = a.split('.').map(Number);
        const moves = m !== undefined ? Object.fromEntries(st.combos.moves.map(x => [x.id, m.split(',').includes(x.id)])) : null;
        if (sel.length === st.combos.schools.length && sel.every(x => x > 0)) useUI.getState().set({ mode: 'build', level: 'es', tool: 'pan', build: { sel, moves } });
      }
      usePlan.getState().setPlan(p ?? planFromPreset(st.presets.find(x => x.id === 'district')!));
      usePlan.temporal.getState().clear();
      const cmp = hash.get('compare');
      if (cmp) { const b = decodePlan(cmp, st.presets, fg, r => areaGeom(st, r)); if (b) useUI.getState().set({ compare: b }); }
    }).catch(e => setErr(String(e)));
    // Background thread when the host allows it; otherwise the same code runs on the page.
    const inline = () => {
      const et = new EventTarget() as any;
      et.postMessage = (d: any) => import('./compute').then(m => m.handle(d)).then(r => et.dispatchEvent(new MessageEvent('message', { data: r })));
      et.terminate = () => {};
      return et as Worker;
    };
    try {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.addEventListener('error', () => { if (worker.current === w) { worker.current = inline(); reqId.current++; setFallback(f => f + 1); } });
      worker.current = w;
    } catch { worker.current = inline(); }
    return () => worker.current?.terminate();
  }, []);

  // option builder: the plan follows the chosen concepts
  useEffect(() => {
    if (!S || ui.mode !== 'build' || !S.combos) return;
    usePlan.getState().setPlan(buildPlan(S, ui.build.sel, ui.build.moves));
  }, [S, ui.mode, ui.build]);

  // recompute when the plan (or compare plan) changes
  useEffect(() => {
    if (!S || !worker.current) return;
    const id = ++reqId.current;
    const strip = (p: Plan) => ({ closures: p.closures, edits: p.edits, includePreK: ui.includePreK });
    const plans: Record<string, any> = { A: strip(plan) };
    if (ui.compare) plans.B = strip(ui.compare);
    setBusy(true);
    const t = setTimeout(() => worker.current!.postMessage({ id, plans, base: dataBase() }), 30);
    const onMsg = (ev: MessageEvent) => {
      if (ev.data.id !== reqId.current) return;
      setBusy(false);
      if (ev.data.error) { console.error(ev.data.error); useUI.getState().set({ toast: 'Calculation error: ' + ev.data.error.split('\n')[0] }); return; }
      setResA(ev.data.res.A); setResB(ev.data.res.B ?? null);
    };
    worker.current.addEventListener('message', onMsg);
    return () => { clearTimeout(t); worker.current?.removeEventListener('message', onMsg); };
  }, [S, plan, ui.compare, ui.includePreK, fallback]);

  // keep the plan in the URL
  useEffect(() => {
    if (!S) return;
    const t = setTimeout(() => {
      const h = new URLSearchParams();
      if (useUI.getState().mode === 'build') {
        const b = useUI.getState().build;
        h.set('build', b.sel.join('.') + (b.moves ? '~' + Object.keys(b.moves).filter(k => b.moves![k]).join(',') : ''));
      } else h.set('plan', encodePlan(plan, S.presets));
      if (ui.compare) h.set('compare', encodePlan(ui.compare, S.presets));
      try { history.replaceState(null, '', '#' + h.toString()); } catch { /* sandboxed */ }
    }, 300);
    return () => clearTimeout(t);
  }, [plan, ui.compare, S, ui.mode, ui.build]);

  useEffect(() => { if (!ui.toast) return; const t = setTimeout(() => useUI.getState().set({ toast: null }), 3500); return () => clearTimeout(t); }, [ui.toast]);

  // undo / redo keys
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? usePlan.temporal.getState().redo() : usePlan.temporal.getState().undo(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);

  const drawCb: DrawCallbacks = useMemo(() => ({
    getBrush: () => useUI.getState().brush,
    getLevel: () => useUI.getState().level,
    getEdits: () => usePlan.getState().plan.edits,
    addEdit: (e) => usePlan.getState().addEdit({ ...e, id: newId() } as Edit),
    extendBlocks: (faces) => {
      const { brush, level } = useUI.getState();
      const st = usePlan.getState(); const last = st.plan.edits[st.plan.edits.length - 1];
      if (last && last.kind === 'blocks' && last.school === brush && last.level === level) {
        const all = [...new Set([...(last.faces ?? []), ...faces])];
        st.updateEdit(last.id, { faces: all, geom: faceGeom(all) });
      } else st.addEdit({ id: newId(), level, school: brush, kind: 'blocks', faces, geom: faceGeom(faces) });
    },
    removeEdit: (id) => usePlan.getState().removeEdit(id),
    updateGeom: (id, g) => usePlan.getState().updateEdit(id, { geom: g, faces: undefined }),
    toast: (s) => useUI.getState().set({ toast: s }),
    selectEdit: (id) => useUI.getState().set({ selectedEdit: id }),
    getSnap: () => useUI.getState().snap,
    getZones: () => resRef.current?.levels[useUI.getState().level]?.zones ?? { type: 'FeatureCollection', features: [] },
    getPickBy: () => useUI.getState().pickBy,
  }), [faceGeom]);

  const diffHomes = useMemo(() => {
    if (!ui.diff || !resA || !resB) return null;
    const a = resA.levels[ui.level].assign, b = resB.levels[ui.level].assign, d = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) d[i] = a[i] !== b[i] ? 1 : 0;
    return d;
  }, [ui.diff, resA, resB, ui.level]);

  const vis = useMemo(() => (S ? visibleSet(S, resA, ui.areas, plan.closures) : new Set<number>()), [S, resA, ui.areas, plan.closures]);
  // zoom to the areas shown
  const areaKey = ui.areas.slice().sort().join(',');
  useEffect(() => {
    const m = mapRef.current?.getMap(); if (!S || !m) return;
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const lv of ['es', 'ms', 'hs'] as Level[]) for (const f of S.zones[lv].features) {
      if (!ui.areas.includes(S.schools[f.properties!.school].area)) continue;
      const g: any = f.geometry; for (const p of (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (!(x1 > x0)) return;
    const phone = window.innerWidth <= 820;
    const sheetPx = phone ? { peek: 190, half: window.innerHeight * 0.5, full: window.innerHeight * 0.5 }[useUI.getState().sheet] : 0;
    m.fitBounds([[x0, y0], [x1, y1]], { padding: phone ? { top: 20, left: 16, right: 16, bottom: sheetPx + 16 } : { top: 30, left: useUI.getState().panelOpen ? 400 : 40, right: 40, bottom: 120 }, duration: 500 });
  }, [areaKey, S, mapReady]);

  if (err) return <div className="loading">Could not load data: {err}</div>;
  if (!S) return <div className="loading">Loading district data…</div>;
  const selected = plan.edits.find(e => e.id === ui.selectedEdit)?.geom ?? null;
  const common = { S, vis, showAreas: ui.showAreas, level: ui.level, year: ui.year, colorBy: ui.colorBy, showHomes: ui.showHomes || ui.diff, showStreets: ui.showStreets, view, onView: (v: ViewState) => setView(v), diffHomes };

  return (
    <div className={'app sheet-' + ui.sheet + (ui.panelOpen ? '' : ' panel-closed')}>
      {!ui.panelOpen && <button className="show-panel" onClick={() => ui.set({ panelOpen: true })}>☰ Options</button>}
      <Sidebar S={S} resA={resA} resB={resB} busy={busy} mapRef={mapRef} faceGeom={faceGeom} vis={vis} />
      <div className={'maps' + (ui.compare ? ' split' : '')}>
        <MapPanel {...common} result={resA?.levels ?? null} closures={plan.closures} tool={ui.mode === 'build' ? 'pan' : ui.tool} interactive drawCb={drawCb}
          selectedGeom={selected} doneTick={ui.doneTick} title={ui.compare ? (plan.name || 'This plan') : undefined} onMapRef={m => { mapRef.current = m; (window as any).__lab = { map: m?.getMap(), S }; if (m) setMapReady(true); }}>
          {ui.mode === 'draw' && <MapToolbar S={S} vis={vis} />}
        </MapPanel>
        {ui.compare && <MapPanel {...common} result={resB?.levels ?? null} closures={ui.compare.closures} tool="pan" interactive={false}
          title={'Compare: ' + (ui.compare.name || S.presets.find(p => p.id === ui.compare!.preset)?.name || 'other plan')} />}
        {busy && <div className="busy">Updating…</div>}
        {ui.toast && <div className="toast" role="status">{ui.toast}</div>}
      </div>
    </div>
  );
}
