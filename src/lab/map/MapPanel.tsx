import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Source, ScaleControl, type MapRef, type ViewState } from 'react-map-gl/maplibre';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Level, Static } from '../data';
import type { LevelResult } from '../model/engine';
import { PALETTE, TIERS, UNASSIGNED, schoolColor } from '../colors';
import type { SchoolNumber } from '../numbers';
import { baseStyle, registerPmtiles } from './style';
import { DrawController, type DrawCallbacks } from './drawing';
import { homeFeatures, overlayFeatures, planningFeatures, schoolFeatures, streetFeatures } from './mapFeatures';
import type { Tool } from '../store';

registerPmtiles();

/** Feeder overlay styles: middle school dashed navy, high school solid brown. */
export const OVERLAY = { ms: { color: '#1e3a8a', w: 2.2, dash: [3, 1.5] as number[] | null, name: 'Middle school' }, hs: { color: '#7c2d12', w: 3, dash: null as number[] | null, name: 'High school' } };

const EMPTY_FEATURES: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const STREET_DRAWING_TOOLS = ['trace', 'polygon', 'freehand', 'edit'];
const HOMES_RETRY_MS = 300;
const HOME_UNASSIGNED = -1, HOME_HIDDEN = -2;

interface MapPanelProps {
  staticData: Static;
  visibleSchools: Set<number>;
  showAreas?: boolean;
  result: Record<Level, LevelResult> | null;
  numbers: Map<number, SchoolNumber>;
  level: Level;
  year: number;
  colorBy: 'school' | 'util';
  closures: Record<string, number>;
  showHomes: boolean;
  showStreets: boolean;
  tool: Tool;
  interactive: boolean;
  view: Partial<ViewState>;
  onView: (view: ViewState) => void;
  drawCallbacks?: DrawCallbacks;
  diffHomes?: Uint8Array | null;
  selectedGeometry?: GeoJSON.Geometry | null;
  title?: string;
  overlays?: Level[];
  doneTick?: number;
  children?: React.ReactNode;
  onMapRef?: (map: MapRef | null) => void;
}

function addHatchPattern(map: any) {
  if (map.hasImage('hatch')) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'rgba(255,255,255,0.55)';
  context.fillRect(0, 0, 16, 16);
  context.strokeStyle = 'rgba(198,40,40,0.75)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-4, 20); context.lineTo(20, -4);
  context.moveTo(-4, 4); context.lineTo(4, -4);
  context.moveTo(12, 20); context.lineTo(20, 12);
  context.stroke();
  map.addImage('hatch', context.getImageData(0, 0, 16, 16) as any);
}

export default function MapPanel(props: MapPanelProps) {
  const { staticData, level, numbers, visibleSchools } = props;
  const mapRef = useRef<MapRef>(null);
  const drawController = useRef<DrawController | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [homesRetry, setHomesRetry] = useState(0);
  const style = useMemo(() => baseStyle(), []);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const restoreHatch = (event: any) => { if (event.id === 'hatch') addHatchPattern(map); };
    map.on('styleimagemissing', restoreHatch);
    return () => { map.off('styleimagemissing', restoreHatch); };
  }, [mapRef.current]);

  const schoolColorExpression = useMemo(() => {
    const expression: any[] = ['match', ['get', 'school']];
    for (const school of staticData.schools) expression.push(school.i, schoolColor(school as any));
    expression.push(UNASSIGNED);
    return expression;
  }, [staticData]);
  const utilizationColorExpression = useMemo(() => {
    const expression: any[] = ['match', ['get', 'school']];
    for (const schoolNumber of numbers.values()) {
      const tier = TIERS.find(candidate => schoolNumber.value < candidate.max + 1e-9)!;
      expression.push(schoolNumber.school, tier.color);
    }
    expression.push(UNASSIGNED);
    return expression.length > 3 ? expression : UNASSIGNED;
  }, [numbers]);

  const visibleFilter: any = useMemo(() => ['in', ['get', 'orig'], ['literal', [...visibleSchools, -1]]], [visibleSchools]);
  const zones = props.result?.[level]?.zones ?? EMPTY_FEATURES;
  const streetsNeeded = props.showStreets && props.interactive && STREET_DRAWING_TOOLS.includes(props.tool);

  const overlayGeoJson = useMemo(() => overlayFeatures(staticData, props.result, level, props.overlays), [props.result, level, props.overlays, staticData]);
  const schoolsGeoJson = useMemo(() => schoolFeatures(staticData, level, visibleSchools, numbers, props.closures), [staticData, level, numbers, props.closures, visibleSchools]);
  const planningGeoJson = useMemo(() => planningFeatures(staticData, visibleSchools, level, props.year), [staticData, visibleSchools, level, props.year]);
  const homesGeoJson = useMemo(() => props.showHomes ? homeFeatures(staticData) : EMPTY_FEATURES, [staticData, props.showHomes]);
  const streetsGeoJson = useMemo(() => streetsNeeded ? streetFeatures(staticData) : EMPTY_FEATURES, [staticData, streetsNeeded]);

  // push home assignments as feature-state
  useEffect(() => {
    const map = mapRef.current?.getMap(), levelResult = props.result?.[level];
    if (!map || !loaded || !levelResult || !props.showHomes) return;

    const homesSource = map.getSource('homes') as any;
    if (!homesSource || !homesSource._data?.features?.length) {
      const retry = setTimeout(() => setHomesRetry(count => count + 1), HOMES_RETRY_MS);
      return () => clearTimeout(retry);
    }
    const homeColorIndex = (school: number) => {
      if (school < 0) return HOME_UNASSIGNED;
      return visibleSchools.has(school) ? (staticData.schools[school] as any).color : HOME_HIDDEN;
    };
    const assignment = levelResult.assign;
    for (let home = 0; home < assignment.length; home++) {
      map.setFeatureState({ source: 'homes', id: home }, { c: homeColorIndex(assignment[home]), d: props.diffHomes ? props.diffHomes[home] : 0 });
    }
  }, [props.result, level, loaded, props.showHomes, props.diffHomes, staticData, homesRetry, visibleSchools]);

  // drawing controller on the interactive map
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !loaded || !props.interactive || !props.drawCallbacks) return;
    drawController.current = new DrawController(map, staticData, props.drawCallbacks);
    return () => {
      drawController.current?.destroy();
      drawController.current = null;
    };
  }, [loaded, props.interactive]);
  useEffect(() => { drawController.current?.setTool(props.tool); }, [props.tool, loaded]);
  useEffect(() => { if (props.doneTick) drawController.current?.done(); }, [props.doneTick]);
  useEffect(() => { props.onMapRef?.(mapRef.current); }, [loaded]);
  useEffect(() => { if (drawController.current && props.drawCallbacks) drawController.current.cb = props.drawCallbacks; }, [props.drawCallbacks]);

  const homeColorExpression: any = ['match', ['coalesce', ['feature-state', 'c'], -1]];
  PALETTE.forEach((color, index) => homeColorExpression.push(index, color));
  homeColorExpression.push('#666');

  const zoneFillColor = props.colorBy === 'util' ? utilizationColorExpression : schoolColorExpression;
  const zoneFillOpacity = props.colorBy === 'util' ? 0.42 : 0.68;
  const planningVisibility = props.showAreas ? 'visible' : 'none';
  const streetVisibility = streetsNeeded ? 'visible' : 'none';
  const homesVisibility = props.showHomes ? 'visible' : 'none';
  const selectedGeoJson = props.selectedGeometry ? { type: 'Feature', properties: {}, geometry: props.selectedGeometry } : EMPTY_FEATURES;

  return (
    <div className="map-wrap">
      {props.title && <div className="map-title">{props.title}</div>}
      {props.children}
      <Map ref={mapRef} {...(props.view as any)} onMove={event => props.onView(event.viewState)} mapStyle={style}
        style={{ position: 'absolute', inset: 0 }} onLoad={event => { addHatchPattern(event.target); setLoaded(true); }} canvasContextAttributes={{ preserveDrawingBuffer: true } as any}
        attributionControl={{ compact: true }} maxZoom={18} minZoom={9}>
        <ScaleControl position="bottom-left" unit="imperial" />
        <Source id="zones" type="geojson" data={zones as any}>
          <Layer id="zone-fill" type="fill" filter={['all', ['!=', ['get', 'school'], -1], visibleFilter]} paint={{ 'fill-color': zoneFillColor as any, 'fill-opacity': zoneFillOpacity }} />
          <Layer id="zone-unassigned" type="line" filter={['all', ['==', ['get', 'school'], -1], visibleFilter]} paint={{ 'line-color': '#c62828', 'line-width': 2, 'line-dasharray': [2, 2] }} />
          <Layer id="zone-hidden" type="line" filter={['!', visibleFilter]} paint={{ 'line-color': '#78909c', 'line-width': 0.8, 'line-opacity': 0.5 }} />
          <Layer id="zone-line" type="line" filter={['all', ['!=', ['get', 'school'], -1], visibleFilter]} paint={{ 'line-color': '#263238', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 2.5], 'line-opacity': 0.8 }} />
        </Source>
        <Source id="planning" type="geojson" data={planningGeoJson as any}>
          <Layer id="planning-line" type="line" filter={['!=', ['geometry-type'], 'Point']} layout={{ visibility: planningVisibility }}
            paint={{ 'line-color': '#4a148c', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 1.6], 'line-dasharray': [3, 2], 'line-opacity': 0.75 }} />
          <Layer id="planning-label" type="symbol" minzoom={props.tool === 'areas' ? 10.5 : 12} filter={['==', ['geometry-type'], 'Point']} layout={{ visibility: planningVisibility,
            'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 13], 'text-allow-overlap': false }}
            paint={{ 'text-color': '#4a148c', 'text-halo-color': '#fff', 'text-halo-width': 1.6 }} />
        </Source>
        <Source id="district" type="geojson" data={staticData.district as any}>
          <Layer id="district-line" type="line" paint={{ 'line-color': '#111', 'line-width': 2.5, 'line-opacity': 0.6 }} />
        </Source>
        {(['ms', 'hs'] as const).map(overlayLevel => {
          const overlay = OVERLAY[overlayLevel];
          return (
            <Source key={overlayLevel} id={'overlay-' + overlayLevel} type="geojson" data={overlayGeoJson[overlayLevel] as any}>
              <Layer id={'overlay-' + overlayLevel + '-casing'} type="line" paint={{ 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, overlay.w + 2, 15, overlay.w + 4], 'line-opacity': 0.85 }} />
              <Layer id={'overlay-' + overlayLevel + '-line'} type="line" paint={{ 'line-color': overlay.color, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, overlay.w, 15, overlay.w + 1.5], ...(overlay.dash ? { 'line-dasharray': overlay.dash } : {}) } as any} />
              <Layer id={'overlay-' + overlayLevel + '-label'} type="symbol" layout={{ 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 14, 14],
                'text-transform': 'uppercase', 'text-letter-spacing': 0.06, 'symbol-placement': 'point', 'text-allow-overlap': false, 'text-padding': 8 } as any}
                paint={{ 'text-color': overlay.color, 'text-halo-color': '#ffffff', 'text-halo-width': 2 }} />
            </Source>
          );
        })}
        <Source id="streets" type="geojson" data={streetsGeoJson as any}>
          <Layer id="street-overlay" type="line" minzoom={13} layout={{ visibility: streetVisibility }}
            paint={{ 'line-color': '#0d47a1', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 17, 2], 'line-opacity': 0.45 }} />
        </Source>
        <Source id="faces" type="geojson" data={staticData.faces as any}>
          <Layer id="face-lines" type="line" minzoom={12} layout={{ visibility: props.tool === 'blocks' && props.interactive ? 'visible' : 'none' }} paint={{ 'line-color': '#37474f', 'line-width': 0.8, 'line-opacity': 0.6 }} />
        </Source>
        <Source id="face-hover" type="geojson" data={EMPTY_FEATURES}>
          <Layer id="face-hover-fill" type="fill" paint={{ 'fill-color': '#000', 'fill-opacity': 0.15 }} />
          <Layer id="face-hover-line" type="line" paint={{ 'line-color': '#111', 'line-width': 2.5 }} />
        </Source>
        <Source id="paint" type="geojson" data={EMPTY_FEATURES}>
          <Layer id="paint-fill" type="fill" paint={{ 'fill-color': '#111', 'fill-opacity': 0.3 }} />
        </Source>
        <Source id="selected" type="geojson" data={selectedGeoJson as any}>
          <Layer id="selected-line" type="line" paint={{ 'line-color': '#ff1744', 'line-width': 3 }} />
        </Source>
        <Source id="homes" type="geojson" data={homesGeoJson as any}>
          <Layer id="homes" type="circle" minzoom={12} layout={{ visibility: homesVisibility }}
            paint={{ 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 16, ['case', ['>', ['get', 'u'], 3], 6, 3]],
              'circle-opacity': ['case', ['==', ['feature-state', 'c'], -2], 0, 1], 'circle-stroke-opacity': ['case', ['==', ['feature-state', 'c'], -2], 0, 1],
              'circle-color': ['case', ['==', ['feature-state', 'd'], 1], '#ff1744', homeColorExpression] as any,
              'circle-stroke-color': '#222', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 0, 16, 0.6] }} />
        </Source>
        <Source id="schools" type="geojson" data={schoolsGeoJson as any}>
          <Layer id="school-points" type="circle" paint={{ 'circle-radius': 6, 'circle-color': ['case', ['==', ['get', 'closed'], 1], '#fff', '#111'], 'circle-stroke-color': '#111', 'circle-stroke-width': 2 }} />
          <Layer id="school-labels" type="symbol" layout={{ 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-allow-overlap': false }}
            paint={{ 'text-color': ['case', ['==', ['get', 'closed'], 1], '#b71c1c', '#111'], 'text-halo-color': '#fff', 'text-halo-width': 1.6 }} />
        </Source>
      </Map>
    </div>
  );
}
export type { GeoJSONSource };
