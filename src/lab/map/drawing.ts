// Drawing controller bound to one maplibre map: polygon (snaps to street intersections), freehand,
// street tracing, block (street-face) painting, erasing and reshaping edits.
import type { Map as MLMap, MapMouseEvent, GeoJSONSource } from 'maplibre-gl';
import Flatbush from 'flatbush';
import { boolOp, lineStrip } from '../model/clip';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawFreehandMode, TerraDrawSelectMode, TerraDrawRenderMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Edit, Level, Static } from '../data';
import { buildGraph, shortestPath, pathCoords } from '../model/graph';
import { inMPoly, polyAcres, toMPoly, type MPoly } from '../model/geo';
import type { Tool } from '../store';

export interface DrawCallbacks {
  getBrush: () => number; getLevel: () => Level; getEdits: () => Edit[];
  addEdit: (e: Omit<Edit, 'id'>) => void; extendBlocks: (faces: number[], remove: boolean) => void;
  removeEdit: (id: string) => void; updateGeom: (id: string, g: GeoJSON.Polygon | GeoJSON.MultiPolygon) => void;
  toast: (s: string) => void; selectEdit: (id: string | null) => void; getSnap: () => boolean; getZones: () => GeoJSON.FeatureCollection;
  getPickBy: () => 'planning' | 'zones'; getFollowStreets: () => boolean;
}

const SNAP_PX = 16;
interface TracePt { lon: number; lat: number; node: number | null; edge: boolean }

export class DrawController {
  map: MLMap; S: Static; cb: DrawCallbacks; tool: Tool = 'pan';
  draw: TerraDraw; nodeIdx: Flatbush; pubNodes: Uint32Array; graph: ReturnType<typeof buildGraph>;
  faceIdx: Flatbush; faces: { id: number; mp: ReturnType<typeof toMPoly> }[];
  trace: TracePt[] = []; traceCoords: [number, number][][] = []; splitPieces: MPoly | null = null;
  painting = false; paintRemove = false; painted = new Set<number>();
  editing: string | null = null; editingPart = 0;
  /** whole areas the 'areas' tool can hand over: district planning areas and each school's current boundary */
  pickable: { planning: { label: string; ref: string; mp: MPoly; geom: any; bb: number[] }[]; zones: Record<string, { label: string; ref: string; school: number; mp: MPoly; geom: any; bb: number[] }[]> };

  constructor(map: MLMap, S: Static, cb: DrawCallbacks) {
    this.map = map; this.S = S; this.cb = cb;
    const st = S.streets;
    this.graph = buildGraph(st, true);
    const pub: number[] = [];
    for (let i = 0; i < st.nNodes; i++) if (this.graph.firstEntry[i + 1] > this.graph.firstEntry[i]) pub.push(i);
    this.pubNodes = Uint32Array.from(pub);
    this.nodeIdx = new Flatbush(pub.length);
    for (const i of pub) this.nodeIdx.add(st.nodeLon[i], st.nodeLat[i], st.nodeLon[i], st.nodeLat[i]);
    this.nodeIdx.finish();
    this.faces = S.faces.features.map(f => ({ id: f.properties!.id as number, mp: toMPoly(f.geometry as any) }));
    this.faceIdx = new Flatbush(this.faces.length);
    for (const f of this.faces) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of f.mp) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      this.faceIdx.add(x0, y0, x1, y1);
    }
    this.faceIdx.finish();
    const bb = (mp: MPoly) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of mp) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
    this.pickable = { planning: [], zones: {} };
    for (const f of S.planning.features) {
      if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue;
      const mp = toMPoly(f.geometry as any); this.pickable.planning.push({ label: `Area ${f.properties!.pa}`, ref: `p${f.properties!.pa}`, mp, geom: f.geometry, bb: bb(mp) });
    }
    for (const lv of ['es', 'ms', 'hs'] as Level[]) this.pickable.zones[lv] = S.zones[lv].features.map(f => {
      const mp = toMPoly(f.geometry as any); const sc = f.properties!.school as number;
      return { label: `All of ${S.schools[sc]?.name ?? 'area'}`, ref: `z${lv}:${sc}`, school: sc, mp, geom: f.geometry, bb: bb(mp) };
    });

    const snap = (ev: any) => { if (!this.cb.getSnap()) return undefined; const n = this.snapNode(ev.lng, ev.lat); return n === null ? undefined : [st.nodeLon[n], st.nodeLat[n]]; };
    this.draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map, renderBelowLayerId: 'school-points' } as any),
      modes: [
        new TerraDrawPolygonMode({ snapping: { toCustom: snap } as any, styles: { fillColor: '#222222', fillOpacity: 0.15, outlineColor: '#111111', outlineWidth: 2 } } as any),
        new TerraDrawFreehandMode({ drawInteraction: 'click-move-or-drag', minDistance: 20, styles: { fillColor: '#222222', fillOpacity: 0.15, outlineColor: '#111111', outlineWidth: 2 } } as any),
        new TerraDrawSelectMode({ pointerDistance: 30, flags: { polygon: { feature: { draggable: false, coordinates: { midpoints: true, draggable: true, deletable: true } } } } } as any),
        new TerraDrawRenderMode({ modeName: 'static', styles: {} } as any),
      ],
    });
    this.draw.start();
    this.draw.setMode('static');
    this.draw.on('finish', (id: any, ctx: any) => {
      const f = this.draw.getSnapshotFeature(id);
      if (!f) return;
      if (this.tool === 'edit') {
        if (this.editing && ctx?.action !== 'draw') this.saveEditing();
        return;
      }
      this.draw.removeFeatures([id]);
      if (f.geometry.type !== 'Polygon') return;
      this.commitPolygon(f.geometry as GeoJSON.Polygon, this.tool === 'freehand' ? 'draw' : 'draw');
    });

    map.on('click', this.onClick);
    map.on('dblclick', this.onDbl);
    map.on('mousedown', this.onDown);
    map.on('mousemove', this.onMove);
    map.on('mouseout', this.onLeave);
    map.on('mouseup', this.onUp);
    map.on('touchstart', this.onDown as any);
    map.on('touchmove', this.onMove as any);
    map.on('touchend', this.onUp);
    window.addEventListener('keydown', this.onKey);
    this.ensureLayers();
  }

  destroy() {
    this.map.off('click', this.onClick); this.map.off('dblclick', this.onDbl);
    this.map.off('mousedown', this.onDown); this.map.off('mousemove', this.onMove); this.map.off('mouseout', this.onLeave); this.map.off('mouseup', this.onUp);
    this.map.off('touchstart', this.onDown as any); this.map.off('touchmove', this.onMove as any); this.map.off('touchend', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    try { this.draw.stop(); } catch { /* */ }
  }

  ensureLayers() {
    const m = this.map;
    if (!m.getSource('trace')) {
      m.addSource('trace', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addSource('split', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'split-fill', type: 'fill', source: 'split', paint: { 'fill-color': ['case', ['==', ['get', 'k'], 0], '#ff9800', '#2196f3'], 'fill-opacity': 0.35 } });
      m.addLayer({ id: 'split-line', type: 'line', source: 'split', paint: { 'line-color': '#111', 'line-width': 2, 'line-dasharray': [2, 1] } });
      m.addLayer({ id: 'trace-line', type: 'line', source: 'trace', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#111', 'line-width': 4, 'line-opacity': 0.85 } });
      m.addLayer({ id: 'trace-pts', type: 'circle', source: 'trace', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 6, 'circle-color': ['case', ['==', ['get', 'edge'], 1], '#ff1744', '#fff'], 'circle-stroke-color': '#111', 'circle-stroke-width': 2 } });
      // where the next tap will land when it snaps: a red ring on a boundary line, a blue one on a street intersection
      m.addSource('trace-target', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'trace-target', type: 'circle', source: 'trace-target', paint: { 'circle-radius': 9, 'circle-color': 'rgba(255,255,255,0.35)',
        'circle-stroke-color': ['case', ['==', ['get', 'edge'], 1], '#ff1744', '#1565c0'], 'circle-stroke-width': 3 } });
    }
  }

  setTool(t: Tool) {
    if (this.tool === t) return;
    this.cancelTrace();
    if (this.tool === 'edit') this.stopEditing();
    this.tool = t;
    const m = this.map;
    const drawingTool = t === 'blocks' || t === 'trace' || t === 'erase' || t === 'areas';
    (m.getSource('face-hover') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
    if (t === 'blocks') m.dragPan.disable(); else m.dragPan.enable();
    m.doubleClickZoom[drawingTool || t === 'polygon' ? 'disable' : 'enable']();
    m.getCanvas().style.cursor = drawingTool ? 'crosshair' : '';
    if (t === 'polygon') this.draw.setMode('polygon');
    else if (t === 'freehand') this.draw.setMode('freehand');
    else if (t === 'edit') this.draw.setMode('select');
    else this.draw.setMode('static');
  }

  snapNode(lon: number, lat: number): number | null {
    const p = this.map.project([lon, lat]);
    const c = this.map.unproject([p.x + SNAP_PX, p.y]);
    const r = Math.abs(c.lng - lon);
    const hits = this.nodeIdx.neighbors(lon, lat, 1, r * 1.3);
    return hits.length ? this.pubNodes[hits[0]] : null;
  }

  needBrush(): boolean {
    if (this.cb.getBrush() === -2) { this.cb.toast('Pick a school first (step 1), or "Unassigned".'); return false; }
    return true;
  }

  commitPolygon(g: GeoJSON.Polygon, kind: Edit['kind']) {
    if (!this.needBrush()) return;
    let geom: GeoJSON.Polygon | GeoJSON.MultiPolygon = g;
    try { const u = boolOp('union', [g.coordinates as any], []); if (u.length) geom = { type: 'MultiPolygon', coordinates: u as any }; } catch { /* keep */ }
    this.cb.addEdit({ level: this.cb.getLevel(), school: this.cb.getBrush(), geom, kind });
  }

  // ---------- trace / split
  // Points snap to a street intersection (segments then follow streets), to an existing boundary line, or stay where tapped
  // (straight segment). Closing the loop makes an area; an open line from one boundary line to another splits the area it
  // crosses, and the next tap picks which side goes to the school.
  renderTrace(hover?: [number, number][]) {
    const lines = this.traceCoords.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }));
    if (hover && hover.length > 1) lines.push({ type: 'Feature', properties: { hover: 1 }, geometry: { type: 'LineString', coordinates: hover } });
    const pts = this.trace.map((t, k) => ({ type: 'Feature', properties: { first: k === 0 ? 1 : 0, edge: t.edge ? 1 : 0 }, geometry: { type: 'Point', coordinates: [t.lon, t.lat] } }));
    (this.map.getSource('trace') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [...lines, ...pts] as any });
  }
  cancelTrace() { this.trace = []; this.traceCoords = []; this.renderTrace(); this.showTarget(null); this.clearSplit(); }
  /** The line runs from one boundary line to another: stop stretching a preview after it (tapping again extends it). */
  traceConnected(): boolean {
    return this.trace.length >= 2 && this.trace[0].edge && this.trace[this.trace.length - 1].edge;
  }
  showTarget(point: TracePt | null) {
    const snapped = point && (point.edge || point.node !== null);
    (this.map.getSource('trace-target') as GeoJSONSource)?.setData(snapped
      ? { type: 'Feature', properties: { edge: point!.edge ? 1 : 0 }, geometry: { type: 'Point', coordinates: [point!.lon, point!.lat] } } as any
      : { type: 'FeatureCollection', features: [] });
  }
  route(a: number, b: number) {
    const p = shortestPath(this.graph, a, b, this.S.streets);
    return p ? pathCoords(this.S.streets, p) : null;
  }
  segment(a: TracePt, b: TracePt): [number, number][] {
    if (a.node !== null && b.node !== null) { const c = this.route(a.node, b.node); if (c) return c; }
    return [[a.lon, a.lat], [b.lon, b.lat]];
  }
  pxDist(a: [number, number], b: [number, number]) {
    const p = this.map.project(a as any), q = this.map.project(b as any); return Math.hypot(p.x - q.x, p.y - q.y);
  }
  /** nearest point on any zone boundary line of the current level */
  nearestBoundary(lon: number, lat: number): [number, number] | null {
    const k = Math.cos(lat * Math.PI / 180);
    let best: [number, number] | null = null, bd = Infinity;
    for (const f of this.cb.getZones().features) for (const poly of toMPoly(f.geometry as any)) for (const r of poly) {
      for (let i = 1; i < r.length; i++) {
        const ax = r[i - 1][0] * k, ay = r[i - 1][1], bx = r[i][0] * k, by = r[i][1], px = lon * k, py = lat;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx, qy = ay + t * dy, d = (qx - px) ** 2 + (qy - py) ** 2;
        if (d < bd) { bd = d; best = [qx / k, qy]; }
      }
    }
    return best;
  }
  /** Where a tap lands: on a nearby boundary line, on a street intersection when following streets, or exactly where tapped. */
  pickPoint(lon: number, lat: number): TracePt {
    const n = this.cb.getFollowStreets() ? this.snapNode(lon, lat) : null;
    const dn = n === null ? Infinity : this.pxDist([lon, lat], [this.S.streets.nodeLon[n], this.S.streets.nodeLat[n]]);
    const b = this.nearestBoundary(lon, lat);
    const db = b ? this.pxDist([lon, lat], b) : Infinity;
    if (db < 18 && db + 4 < dn) return { lon: b![0], lat: b![1], node: null, edge: true };
    if (n !== null) return { lon: this.S.streets.nodeLon[n], lat: this.S.streets.nodeLat[n], node: n, edge: db < 18 };
    return { lon, lat, node: null, edge: false };
  }
  addTracePoint(t: TracePt) {
    if (this.trace.length >= 2 && this.pxDist([t.lon, t.lat], [this.trace[0].lon, this.trace[0].lat]) < 14) return this.finishLoop();
    if (this.trace.length) this.traceCoords.push(this.segment(this.trace[this.trace.length - 1], t));
    this.trace.push(t); this.renderTrace(); this.showTarget(null);
    if (this.trace.length === 1) this.cb.toast(t.edge ? 'Started on a boundary line. Keep tapping, and end on a boundary line (red dot).' : 'Keep tapping. End on a boundary line (red dot) and tap Done, or tap the first point to close a loop.');
    else if (this.traceConnected()) this.cb.toast('Line connected. Tap Done, or keep tapping to extend it.');
  }
  finishLoop() {
    if (this.trace.length < 2) { this.cb.toast('Tap at least two more points before closing the loop.'); return; }
    const back = this.segment(this.trace[this.trace.length - 1], this.trace[0]);
    const ring = [...this.traceCoords, back].flatMap((c, k) => (k === 0 ? c : c.slice(1)));
    ring.push(ring[0]);
    this.cancelTrace();
    this.commitPolygon({ type: 'Polygon', coordinates: [ring] }, 'trace');
  }
  finishTrace() {
    if (this.trace.length < 2) { this.cb.toast('Tap at least two points.'); return; }
    const first = this.trace[0], last = this.trace[this.trace.length - 1];
    const closesNear = this.pxDist([first.lon, first.lat], [last.lon, last.lat]) < 14;
    if (closesNear) return this.finishLoop();
    this.split();
  }

  /** cut the area under the line into pieces and wait for a tap on the side to assign */
  split() {
    let line = this.traceCoords.flatMap((c, k) => (k === 0 ? c : c.slice(1))) as [number, number][];
    // carry both ends onto the nearest boundary line (if close) and a few metres past it, so the cut goes all the way through
    const extend = (end: [number, number], prev: [number, number]) => {
      const out: [number, number][] = [];
      const b = this.nearestBoundary(end[0], end[1]);
      let tip = end;
      if (b && this.pxDist(end, b) < 30) { if (this.pxDist(end, b) > 0.5) out.push(b); tip = b; }
      const dx = tip[0] - prev[0], dy = tip[1] - prev[1], L = Math.hypot(dx, dy) || 1;
      out.push([tip[0] + dx / L * 4e-5, tip[1] + dy / L * 4e-5]);
      return out;
    };
    const head = extend(line[0], line[1]).reverse(), tail = extend(line[line.length - 1], line[line.length - 2]);
    line = [...head, ...line, ...tail];
    // every area the line cuts all the way through, each split into pieces
    const lineBox = line.reduce((box, [x, y]) => [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    const strip = lineStrip(line, 3e-6);
    let pieces: MPoly = [];
    for (const f of this.cb.getZones().features) for (const poly of toMPoly(f.geometry as any)) {
      const box = poly[0].reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
      if (box[0] > lineBox[2] || box[2] < lineBox[0] || box[1] > lineBox[3] || box[3] < lineBox[1]) continue;
      let cut: MPoly = [];
      try { cut = boolOp('difference', [poly], strip).filter(p => polyAcres(p) > 0.05); } catch { /* */ }
      if (cut.length >= 2) pieces = pieces.concat(cut);
    }
    if (!pieces.length) { this.cb.toast('The line has to run from one boundary line to another (both ends on a red dot). Add points or end closer to a line.'); return; }
    this.splitPieces = pieces;
    this.renderSplit();
    this.trace = []; this.traceCoords = []; this.renderTrace(); this.showTarget(null);
    this.cb.toast('Tap each piece to give to the selected school, then tap Done.');
  }
  clearSplit() {
    this.splitPieces = null;
    this.renderSplit();
  }
  renderSplit() {
    const pieces = this.splitPieces ?? [];
    (this.map.getSource('split') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: pieces.map((p, k) => ({ type: 'Feature', properties: { k: k % 2 }, geometry: { type: 'Polygon', coordinates: p } })) as any });
  }

  // ---------- blocks
  faceAt(lon: number, lat: number): number | null {
    for (const k of this.faceIdx.search(lon, lat, lon, lat)) if (inMPoly(lon, lat, this.faces[k].mp)) return this.faces[k].id;
    return null;
  }
  paintFace(f: number) {
    if (this.painted.has(f)) return;
    this.painted.add(f);
    (this.map.getSource('paint') as GeoJSONSource)?.setData({ type: 'FeatureCollection',
      features: [...this.painted].map(id => this.S.faces.features[id]) });
  }

  // ---------- erase / edit
  editAt(lon: number, lat: number): Edit | null {
    const lv = this.cb.getLevel(); const ed = this.cb.getEdits();
    for (let k = ed.length - 1; k >= 0; k--) if (ed[k].level === lv && inMPoly(lon, lat, toMPoly(ed[k].geom))) return ed[k];
    return null;
  }
  /** reshape one part of an area: the part under the tap (areas made of several blocks have several parts) */
  startEditing(e: Edit, lon: number, lat: number) {
    this.stopEditing();
    const polys = toMPoly(e.geom);
    let k = polys.findIndex(p => inMPoly(lon, lat, [p]));
    if (k < 0) k = 0;
    this.editing = e.id; this.editingPart = k;
    const id = this.draw.getFeatureId();
    // terra-draw validates precision and self-intersection: round to ~1 cm and keep only the outer ring
    let ring = polys[k][0].map(([x, y]) => [Math.round(x * 1e7) / 1e7, Math.round(y * 1e7) / 1e7]);
    ring = ring.filter((c, i) => i === 0 || c[0] !== ring[i - 1][0] || c[1] !== ring[i - 1][1]);
    if (ring.length > 80) { const step = Math.ceil(ring.length / 80); ring = ring.filter((_, i) => i % step === 0 || i === ring.length - 1); }
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
    const res = this.draw.addFeatures([{ id, type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { mode: 'polygon' } } as any]);
    if (!res[0]?.valid) { console.warn('reshape rejected', res[0]?.reason); this.editing = null; this.cb.toast('This area can\'t be reshaped (its outline crosses itself). Erase it and draw it again.'); return; }
    this.draw.selectFeature(id);
    this.cb.selectEdit(e.id);
    this.cb.toast('Drag the white corner dots to reshape. Drag a small midpoint dot to add a corner. Tap Done when finished.');
  }
  saveEditing() {
    if (!this.editing) return;
    const snap = this.draw.getSnapshot().find(f => f.geometry.type === 'Polygon');
    const e = this.cb.getEdits().find(x => x.id === this.editing);
    if (!snap || !e) return;
    const polys = toMPoly(e.geom).slice();
    polys[this.editingPart] = (snap.geometry as GeoJSON.Polygon).coordinates as any;
    this.cb.updateGeom(this.editing, { type: 'MultiPolygon', coordinates: polys as any });
  }
  stopEditing() {
    if (!this.editing) return;
    this.saveEditing();
    this.draw.clear(); this.editing = null; this.cb.selectEdit(null);
  }

  /** the planning area or current school boundary under a point */
  areaAt(lng: number, lat: number) {
    const list = this.cb.getPickBy() === 'zones' ? this.pickable.zones[this.cb.getLevel()] : this.pickable.planning;
    let best: (typeof list)[number] | null = null, bestA = Infinity;
    for (const a of list) {
      if (lng < a.bb[0] || lng > a.bb[2] || lat < a.bb[1] || lat > a.bb[3] || !inMPoly(lng, lat, a.mp)) continue;
      const ar = (a.bb[2] - a.bb[0]) * (a.bb[3] - a.bb[1]); if (ar < bestA) { best = a; bestA = ar; }
    }
    return best;
  }

  /** the toolbar's Done button */
  done() {
    if (this.tool === 'trace' && this.splitPieces) this.clearSplit();
    else if (this.tool === 'trace' && this.trace.length) this.finishTrace();
    else if (this.tool === 'edit' && this.editing) { this.stopEditing(); this.cb.toast('Saved.'); }
  }

  onClick = (ev: MapMouseEvent) => {
    const { lng, lat } = ev.lngLat;
    if (this.tool === 'trace') {
      if (!this.needBrush()) return;
      if (this.splitPieces) {
        const k = this.splitPieces.findIndex(p => inMPoly(lng, lat, [p]));
        if (k < 0) { this.cb.toast('Tap inside a highlighted piece, or tap Done when finished.'); return; }
        const piece = this.splitPieces[k];
        this.splitPieces = this.splitPieces.filter((_, index) => index !== k);
        this.renderSplit();
        this.cb.addEdit({ level: this.cb.getLevel(), school: this.cb.getBrush(), geom: { type: 'MultiPolygon', coordinates: [piece] as any }, kind: 'trace' });
        if (this.splitPieces.length < 2) this.clearSplit();
        return;
      }
      this.addTracePoint(this.pickPoint(lng, lat));
    } else if (this.tool === 'areas') {
      if (!this.needBrush()) return;
      const a = this.areaAt(lng, lat);
      if (!a) { this.cb.toast(this.cb.getPickBy() === 'zones' ? 'Tap inside a school\'s area.' : 'Tap inside a numbered planning area.'); return; }
      if ('school' in a && (a as any).school === this.cb.getBrush()) { this.cb.toast(`${a.label.replace('All of ', '')} already has this area.`); return; }
      this.cb.addEdit({ level: this.cb.getLevel(), school: this.cb.getBrush(), geom: a.geom, kind: 'area', label: a.label, ref: a.ref });
      (this.map.getSource('face-hover') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [] });
    } else if (this.tool === 'erase') {
      const e = this.editAt(lng, lat);
      if (!e) { this.cb.toast('Nothing drawn here. Erase removes areas you or a starting plan drew.'); return; }
      this.cb.removeEdit(e.id);
    } else if (this.tool === 'edit') {
      if (this.editing) return;
      const e = this.editAt(lng, lat);
      if (e) this.startEditing(e, lng, lat); else this.cb.toast('Tap an area you or a starting plan drew. Areas from the district map itself cannot be reshaped; draw over them instead.');
    }
  };
  onDbl = (ev: MapMouseEvent) => {
    if (this.tool === 'trace') { ev.preventDefault(); if (this.trace.length >= 2 && !this.splitPieces) this.finishTrace(); }
  };
  onDown = (ev: MapMouseEvent) => {
    if (this.tool !== 'blocks') return;
    if (!this.needBrush()) return;
    const f = this.faceAt(ev.lngLat.lng, ev.lngLat.lat); if (f === null) return;
    this.painting = true; this.paintRemove = !!(ev.originalEvent as any).altKey; this.painted.clear(); this.paintFace(f);
  };
  onMove = (ev: MapMouseEvent) => {
    const { lng, lat } = ev.lngLat;
    if (this.tool === 'areas') {
      const a = this.areaAt(lng, lat);
      (this.map.getSource('face-hover') as GeoJSONSource)?.setData(a ? { type: 'Feature', properties: {}, geometry: a.geom } as any : { type: 'FeatureCollection', features: [] });
    } else if (this.tool === 'blocks') {
      const f = this.faceAt(lng, lat);
      (this.map.getSource('face-hover') as GeoJSONSource)?.setData(f === null ? { type: 'FeatureCollection', features: [] } : this.S.faces.features[f] as any);
      if (this.painting && f !== null) this.paintFace(f);
    } else if (this.tool === 'trace' && !this.splitPieces) {
      if (this.moveFrame) return;   // the boundary search is heavier than a mouse move; once per frame is plenty
      this.moveFrame = requestAnimationFrame(() => {
        this.moveFrame = 0;
        const point = this.pickPoint(lng, lat);
        this.showTarget(point);
        if (!this.trace.length) return;
        if (this.traceConnected()) this.renderTrace();
        else this.renderTrace(this.segment(this.trace[this.trace.length - 1], point));
      });
    }
  };
  moveFrame = 0;
  /** The pointer left the map (toward the toolbar, say): drop the preview so the line doesn't stretch after it. */
  onLeave = () => {
    if (this.tool !== 'trace') return;
    if (this.moveFrame) { cancelAnimationFrame(this.moveFrame); this.moveFrame = 0; }
    this.showTarget(null);
    this.renderTrace();
  };
  onUp = () => {
    if (!this.painting) return;
    this.painting = false;
    const ids = [...this.painted]; this.painted.clear();
    (this.map.getSource('paint') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [] });
    if (ids.length) this.cb.extendBlocks(ids, this.paintRemove);
  };
  onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (this.tool === 'trace') {
      if (e.key === 'Escape') this.cancelTrace();
      if (e.key === 'Enter') this.finishTrace();
      if (e.key === 'Backspace' && this.trace.length) { this.trace.pop(); this.traceCoords.pop(); this.renderTrace(); }
      if (e.key === 'Escape') this.clearSplit();
    }
    if (this.tool === 'edit' && (e.key === 'Escape' || e.key === 'Enter')) this.stopEditing();
  };
}
