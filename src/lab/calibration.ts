// Verified district facts layered on the pipeline's files (public/data/calibration.json, written by pipeline/tools/calibrate).
// Facts only: capacities, fall 2026 counts and moved-student counts. The district's forecasts are never fitted, so the model
// stays an independent check on them.
import type { Combos, Homes, MsConcept, School } from './data';

export interface Calibration {
  capacity: Record<string, number>;     // school number -> the district's Nov 2026 functional capacity
  capSource: string;
  prek: Record<string, number>;         // school number -> Early Childhood in the building, from fall 2026 enrollment
  factorScale: Record<string, number>;  // school number -> scale that matches the district's fall 2026 count
  yearScale: Record<string, number[]>;  // school number -> scale for each school year, where one year's projection needs adjusting
  homeWeights: { scale: number; homes: number[] }[];   // elementary home groups (delta-encoded) and their weight scale
  conceptEdits: Record<string, MsConcept['edits']>;    // middle school concept -> detached map-reading pieces, given to the school around them
}

export function applyCalibration(schools: School[], homes: Homes, combos: Combos | null, calibration: Calibration) {
  for (const concept of combos?.ms?.concepts ?? []) concept.edits.push(...(calibration.conceptEdits[concept.id] ?? []));
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
