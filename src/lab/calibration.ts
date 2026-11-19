// Verified district facts layered on the pipeline's files (public/data/calibration.json, written by pipeline/tools/calibrate).
// Capacities, fall 2026 counts, moved-student counts, and each school's yearly trend tuned to the district's five-year tables, so
// the model's estimates extend the district's numbers.
import type { Combos, Homes, MsConcept, Preset, School } from './data';

export interface Calibration {
  capacity: Record<string, number>;     // school number -> the district's Nov 2026 functional capacity
  capSource: string;
  prek: Record<string, number>;         // school number -> Early Childhood in the building, from fall 2026 enrollment
  factorScale: Record<string, number>;  // school number -> scale that matches the district's fall 2026 count
  yearScale: Record<string, number[]>;  // school number -> scale for each school year, where one year's projection needs adjusting
  homeWeights: { scale: number; homes: number[] }[];   // elementary home groups (delta-encoded) and their weight scale
  conceptEdits: Record<string, MsConcept['edits']>;    // middle school concept -> detached map-reading pieces, given to the school around them
  moveGeometries?: Record<string, GeoJSON.MultiPolygon>;   // open-school move -> corrected outline (also replaces the same shape in presets)
}

export function applyCalibration(schools: School[], homes: Homes, combos: Combos | null, calibration: Calibration, presets: Preset[] = []) {
  for (const concept of combos?.ms?.concepts ?? []) concept.edits.push(...(calibration.conceptEdits[concept.id] ?? []));
  for (const [moveId, geom] of Object.entries(calibration.moveGeometries ?? {})) {
    const move = combos?.moves.find(candidate => candidate.id === moveId);
    if (!move) continue;
    const oldShape = JSON.stringify(move.geom);
    for (const preset of presets) for (const presetEdit of preset.edits) if (JSON.stringify(presetEdit.geom) === oldShape) presetEdit.geom = geom;
    move.geom = geom;
  }
  for (const [school, capacity] of Object.entries(calibration.capacity)) {
    schools[Number(school)].capacity = capacity;
    schools[Number(school)].capSource = calibration.capSource;
  }
  for (const [school, prek] of Object.entries(calibration.prek)) schools[Number(school)].prek = prek;
  for (const [school, scale] of Object.entries(calibration.factorScale)) {
    const target = schools[Number(school)];
    target.factor = target.factor.map(value => value * scale);
    target.neighborhood = target.neighborhood.map(value => value * scale);
  }
  for (const [school, scales] of Object.entries(calibration.yearScale)) {
    const target = schools[Number(school)];
    target.factor = target.factor.map((value, year) => value * scales[year]);
    target.neighborhood = target.neighborhood.map((value, year) => value * scales[year]);
  }
  for (const group of calibration.homeWeights) {
    let home = 0;
    for (const step of group.homes) { home += step; homes.w.es[home] *= group.scale; }
  }
}
