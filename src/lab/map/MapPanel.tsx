import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Source, ScaleControl, type MapRef, type ViewState } from 'react-map-gl/maplibre';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Level, Static } from '../data';
import type { LevelResult } from '../model/engine';
import { PALETTE, TIERS, UNASSIGNED , schoolColor as colorOf } from '../colors';
import { mapLabel, type SchoolNumber } from '../numbers';
import { baseStyle, registerPmtiles } from './style';
import { DrawController, type DrawCallbacks } from './drawing';
import type { Tool } from '../store';

registerPmtiles();

/** Feeder overlay styles: middle school dashed navy, high school solid brown. */
export const OVERLAY = { ms: { color: '#1e3a8a', w: 2.2, dash: [3, 1.5] as number[] | null, name: 'Middle school' }, hs: { color: '#7c2d12', w: 3, dash: null as number[] | null, name: 'High school' } };

interface Props {
  S: Static; vis: Set<number>; showAreas?: boolean; result: Record<Level, LevelResult> | null; numbers: Map<number, SchoolNumber>; level: Level; year: number; colorBy: 'school' | 'util';
  closures: Record<string, number>; showHomes: boolean; showStreets: boolean; tool: Tool; interactive: boolean;
  view: Partial<ViewState>; onView: (v: ViewState) => void; drawCb?: DrawCallbacks; diffHomes?: Uint8Array | null;
  selectedGeom?: GeoJSON.Geometry | null; title?: string; overlays?: Level[]; doneTick?: number; children?: React.ReactNode; onMapRef?: (m: MapRef | null) => void;
}

function addHatch(m: any) {
  if (m.hasImage('hatch')) return;
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 0, 16, 16); g.strokeStyle = 'rgba(198,40,40,0.75)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-4, 20); g.lineTo(20, -4); g.moveTo(-4, 4); g.lineTo(4, -4); g.moveTo(12, 20); g.lineTo(20, 12); g.stroke();
  m.addImage('hatch', g.getImageData(0, 0, 16, 16) as any);
}

export default function MapPanel(p: Props) {
  const ref = useRef<MapRef>(null);
  const ctl = useRef<DrawController | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const style = useMemo(() => baseStyle(), []);
  useEffect(() => {
    const m = ref.current?.getMap(); if (!m) return;
    const h = (e: any) => { if (e.id === 'hatch') addHatch(m); };
    m.on('styleimagemissing', h); return () => { m.off('styleimagemissing', h); };
  }, [ref.current]);
  const S = p.S;

  // color expression for school index
  const schoolColor = useMemo(() => {
    const m: any[] = ['match', ['get', 'school']];
    for (const s of S.schools) m.push(s.i, colorOf(s as any));
    m.push(UNASSIGNED); return m;
  }, [S]);
  const utilColor = useMemo(() => {
    const m: any[] = ['match', ['get', 'school']];
    for (const schoolNumber of p.numbers.values()) {
      const tier = TIERS.find(candidate => schoolNumber.value < candidate.max + 1e-9)!;
      m.push(schoolNumber.school, tier.color);
    }
    m.push(UNASSIGNED);
    return m.length > 3 ? m : UNASSIGNED;
  }, [p.numbers]);

  const visExpr: any = useMemo(() => ['in', ['get', 'orig'], ['literal', [...p.vis, -1]]], [p.vis]);
  const zones = p.result?.[p.level]?.zones ?? { type: 'FeatureCollection', features: [] };

  // feeder overlays: other levels' boundaries in this plan, outlined and labeled
  const overlayGeo = useMemo(() => {
    const out: Record<string, GeoJSON.FeatureCollection> = {};
    for (const lv of ['ms', 'hs'] as Level[]) {
      const z = p.result?.[lv]?.zones;
      out[lv] = { type: 'FeatureCollection', features: !z || lv === p.level || !p.overlays?.includes(lv) ? [] : z.features.map(f => {
        const k = f.properties!.school as number;
        return { ...f, properties: { school: k, label: k >= 0 ? S.schools[k].name : 'Not yet assigned' } };
      }) };
    }
    return out;
  }, [p.result, p.level, p.overlays, S]);

  const schoolsGeo = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: S.schools.filter(s => s.level === p.level && p.vis.has(s.i)).map(s => {
      const schoolNumber = p.numbers.get(s.i);
      const closed = p.closures[String(s.i)] !== undefined;
      const u = schoolNumber && !closed ? mapLabel(schoolNumber) : '';
      return { type: 'Feature', properties: { school: s.i, name: s.name, label: closed ? `${s.name}\n(closing)` : `${s.name}\n${u}`, closed: closed ? 1 : 0 },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] } };
    }),
  }), [S, p.level, p.numbers, p.closures, p.vis]);

  const EMPTY: GeoJSON.FeatureCollection = useMemo(() => ({ type: 'FeatureCollection', features: [] }), []);
  const needStreets = p.showStreets && p.interactive && ['trace', 'polygon', 'freehand', 'edit'].includes(p.tool);
  // district planning areas: dashed lines plus "number / students living there" for the level and year shown
  const planning = useMemo<GeoJSON.FeatureCollection>(() => {
    const visNames = new Set(S.schools.filter(s => p.vis.has(s.i) && s.level === 'es').map(s => s.name));
    const unit = p.level === 'es' ? 'K–5' : p.level === 'ms' ? '6–8' : '9–12';
    const feats = S.planning.features.filter(f => visNames.has(f.properties!.school));
    return { type: 'FeatureCollection', features: [
      ...feats.map(f => ({ ...f, properties: { pa: f.properties!.pa } })),
      ...feats.map(f => { const q = f.properties!; const n = Math.round(q[p.level][p.year]);
        return { type: 'Feature', properties: { label: `${q.pa}\n${n} ${unit}` }, geometry: { type: 'Point', coordinates: [q.lon, q.lat] } } as GeoJSON.Feature; }),
    ] };
  }, [S, p.vis, p.level, p.year]);

  const homesGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!p.showHomes) return EMPTY;
    const h = S.homes, f: GeoJSON.Feature[] = new Array(h.n);
    for (let i = 0; i < h.n; i++) f[i] = { type: 'Feature', id: i, properties: { u: h.units[i] }, geometry: { type: 'Point', coordinates: [h.lon[i], h.lat[i]] } };
    return { type: 'FeatureCollection', features: f };
  }, [S, p.showHomes]);

  const streetsGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!needStreets) return EMPTY;
    const st = S.streets, f: GeoJSON.Feature[] = [];
    for (let e = 0; e < st.nEdges; e++) {
      if (st.cls[e] >= 8) continue;
      const c: number[][] = [];
      for (let k = st.coordOff[e]; k < st.coordOff[e + 1]; k++) c.push([st.coordLon[k], st.coordLat[k]]);
      f.push({ type: 'Feature', properties: { c: st.cls[e] }, geometry: { type: 'LineString', coordinates: c } });
    }
    return { type: 'FeatureCollection', features: f };
  }, [S, needStreets]);

  // push home assignments as feature-state
  useEffect(() => {
    const m = ref.current?.getMap(); const res = p.result?.[p.level];
    if (!m || !loaded || !res || !p.showHomes) return;
    const a = res.assign;
    if (!m.getSource('homes') || !(m.getSource('homes') as any)._data?.features?.length) { const t = setTimeout(() => setTick(x => x + 1), 300); return () => clearTimeout(t); }
    const colorOf = (s: number) => (s < 0 ? -1 : !p.vis.has(s) ? -2 : (S.schools[s] as any).color);
    for (let i = 0; i < a.length; i++) m.setFeatureState({ source: 'homes', id: i }, { c: colorOf(a[i]), d: p.diffHomes ? p.diffHomes[i] : 0 });
  }, [p.result, p.level, loaded, p.showHomes, p.diffHomes, S, tick, p.vis]);

  // drawing controller on the interactive map
  useEffect(() => {
    const m = ref.current?.getMap();
    if (!m || !loaded || !p.interactive || !p.drawCb) return;
    ctl.current = new DrawController(m, S, p.drawCb);
    return () => { ctl.current?.destroy(); ctl.current = null; };
  }, [loaded, p.interactive]);
  useEffect(() => { ctl.current?.setTool(p.tool); }, [p.tool, loaded]);
  useEffect(() => { if (p.doneTick) ctl.current?.done(); }, [p.doneTick]);
  useEffect(() => { p.onMapRef?.(ref.current); }, [loaded]);
  useEffect(() => { if (ctl.current && p.drawCb) ctl.current.cb = p.drawCb; }, [p.drawCb]);

  const homeColor: any = ['match', ['coalesce', ['feature-state', 'c'], -1]];
  PALETTE.forEach((c, k) => homeColor.push(k, c)); homeColor.push('#666');

  return (
    <div className="map-wrap">
      {p.title && <div className="map-title">{p.title}</div>}
      {p.children}
      <Map ref={ref} {...(p.view as any)} onMove={e => p.onView(e.viewState)} mapStyle={style}
        style={{ position: 'absolute', inset: 0 }} onLoad={(e) => { addHatch(e.target); setLoaded(true); }} canvasContextAttributes={{ preserveDrawingBuffer: true } as any}
        attributionControl={{ compact: true }} maxZoom={18} minZoom={9}>
        <ScaleControl position="bottom-left" unit="imperial" />
        <Source id="zones" type="geojson" data={zones as any}>
          <Layer id="zone-fill" type="fill" filter={['all', ['!=', ['get', 'school'], -1], visExpr]} paint={{ 'fill-color': (p.colorBy === 'util' ? utilColor : schoolColor) as any, 'fill-opacity': p.colorBy === 'util' ? 0.42 : 0.68 }} />
          <Layer id="zone-unassigned" type="line" filter={['all', ['==', ['get', 'school'], -1], visExpr]} paint={{ 'line-color': '#c62828', 'line-width': 2, 'line-dasharray': [2, 2] }} />
          <Layer id="zone-hidden" type="line" filter={['!', visExpr]} paint={{ 'line-color': '#78909c', 'line-width': 0.8, 'line-opacity': 0.5 }} />
          <Layer id="zone-line" type="line" filter={['all', ['!=', ['get', 'school'], -1], visExpr]} paint={{ 'line-color': '#263238', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 2.5], 'line-opacity': 0.8 }} />
        </Source>
        <Source id="planning" type="geojson" data={planning as any}>
          <Layer id="planning-line" type="line" filter={['!=', ['geometry-type'], 'Point']} layout={{ visibility: p.showAreas ? 'visible' : 'none' }}
            paint={{ 'line-color': '#4a148c', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 1.6], 'line-dasharray': [3, 2], 'line-opacity': 0.75 }} />
          <Layer id="planning-label" type="symbol" minzoom={p.tool === 'areas' ? 10.5 : 12} filter={['==', ['geometry-type'], 'Point']} layout={{ visibility: p.showAreas ? 'visible' : 'none',
            'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 13], 'text-allow-overlap': false }}
            paint={{ 'text-color': '#4a148c', 'text-halo-color': '#fff', 'text-halo-width': 1.6 }} />
        </Source>
        <Source id="district" type="geojson" data={S.district as any}>
          <Layer id="district-line" type="line" paint={{ 'line-color': '#111', 'line-width': 2.5, 'line-opacity': 0.6 }} />
        </Source>
        {(['ms', 'hs'] as const).map(lv => { const c = OVERLAY[lv]; return (
          <Source key={lv} id={'overlay-' + lv} type="geojson" data={overlayGeo[lv] as any}>
            <Layer id={'overlay-' + lv + '-casing'} type="line" paint={{ 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, c.w + 2, 15, c.w + 4], 'line-opacity': 0.85 }} />
            <Layer id={'overlay-' + lv + '-line'} type="line" paint={{ 'line-color': c.color, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, c.w, 15, c.w + 1.5], ...(c.dash ? { 'line-dasharray': c.dash } : {}) } as any} />
            <Layer id={'overlay-' + lv + '-label'} type="symbol" layout={{ 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 14, 14],
              'text-transform': 'uppercase', 'text-letter-spacing': 0.06, 'symbol-placement': 'point', 'text-allow-overlap': false, 'text-padding': 8 } as any}
              paint={{ 'text-color': c.color, 'text-halo-color': '#ffffff', 'text-halo-width': 2 }} />
          </Source>); })}
        <Source id="streets" type="geojson" data={streetsGeo as any}>
          <Layer id="street-overlay" type="line" minzoom={13} layout={{ visibility: p.showStreets && ['trace', 'polygon', 'freehand', 'edit'].includes(p.tool) && p.interactive ? 'visible' : 'none' }}
            paint={{ 'line-color': '#0d47a1', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 17, 2], 'line-opacity': 0.45 }} />
        </Source>
        <Source id="faces" type="geojson" data={S.faces as any}>
          <Layer id="face-lines" type="line" minzoom={12} layout={{ visibility: p.tool === 'blocks' && p.interactive ? 'visible' : 'none' }} paint={{ 'line-color': '#37474f', 'line-width': 0.8, 'line-opacity': 0.6 }} />
        </Source>
        <Source id="face-hover" type="geojson" data={{ type: 'FeatureCollection', features: [] }}>
          <Layer id="face-hover-fill" type="fill" paint={{ 'fill-color': '#000', 'fill-opacity': 0.15 }} />
          <Layer id="face-hover-line" type="line" paint={{ 'line-color': '#111', 'line-width': 2.5 }} />
        </Source>
        <Source id="paint" type="geojson" data={{ type: 'FeatureCollection', features: [] }}>
          <Layer id="paint-fill" type="fill" paint={{ 'fill-color': '#111', 'fill-opacity': 0.3 }} />
        </Source>
        <Source id="selected" type="geojson" data={(p.selectedGeom ? { type: 'Feature', properties: {}, geometry: p.selectedGeom } : { type: 'FeatureCollection', features: [] }) as any}>
          <Layer id="selected-line" type="line" paint={{ 'line-color': '#ff1744', 'line-width': 3 }} />
        </Source>
        <Source id="homes" type="geojson" data={homesGeo as any}>
          <Layer id="homes" type="circle" minzoom={12} layout={{ visibility: p.showHomes ? 'visible' : 'none' }}
            paint={{ 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 16, ['case', ['>', ['get', 'u'], 3], 6, 3]],
              'circle-opacity': ['case', ['==', ['feature-state', 'c'], -2], 0, 1], 'circle-stroke-opacity': ['case', ['==', ['feature-state', 'c'], -2], 0, 1],
              'circle-color': ['case', ['==', ['feature-state', 'd'], 1], '#ff1744', homeColor] as any,
              'circle-stroke-color': '#222', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 0, 16, 0.6] }} />
        </Source>
        <Source id="schools" type="geojson" data={schoolsGeo as any}>
          <Layer id="school-points" type="circle" paint={{ 'circle-radius': 6, 'circle-color': ['case', ['==', ['get', 'closed'], 1], '#fff', '#111'], 'circle-stroke-color': '#111', 'circle-stroke-width': 2 }} />
          <Layer id="school-labels" type="symbol" layout={{ 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-allow-overlap': false }}
            paint={{ 'text-color': ['case', ['==', ['get', 'closed'], 1], '#b71c1c', '#111'], 'text-halo-color': '#fff', 'text-halo-width': 1.6 }} />
        </Source>
      </Map>
    </div>
  );
}
export type { GeoJSONSource };
