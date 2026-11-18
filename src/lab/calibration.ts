// Verified district facts layered on the pipeline's files (public/data/calibration.json, written by pipeline/tools/calibrate).
// Facts only: capacities, fall 2026 counts and moved-student counts. The district's forecasts are never fitted, so the model
// stays an independent check on them.
import type { Homes, School } from './data';

export interface Calibration {
  capacity: Record<string, number>;     // school number -> the district's Nov 2026 functional capacity
  capSource: string;
  prek: Record<string, number>;         // school number -> Early Childhood in the building, from fall 2026 enrollment
  factorScale: Record<string, number>;  // school number -> scale that matches the district's fall 2026 count
  homeWeights: { scale: number; homes: number[] }[];   // elementary home groups (delta-encoded) and their weight scale
}

export function applyCalibration(schools: School[], homes: Homes, calibration: Calibration) {
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
  for (const group of calibration.homeWeights) {
    let home = 0;
    for (const step of group.homes) { home += step; homes.w.es[home] *= group.scale; }
  }
}
