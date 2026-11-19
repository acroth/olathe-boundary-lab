// Elementary concept 1 moves the southeast part of Pleasant Ridge to Bentwood. On the district's concept 1 map that line runs north
// from 127th, then follows the Indian Creek trail northeast through planning area 400, and goes up to 119th just east of where
// the creek loops back (the original map reading ran well east of the creek).
import { INDIAN_CREEK } from './indianCreek';

const STREET_127TH = 38.8975, STREET_119TH = 38.91285, EAST_OF_QUIVIRA = -94.70;   // 119th: between planning areas 410 and 210
const NORTH_FROM_127TH: [number, number][] = [[-94.73333, STREET_127TH], [-94.73290, 38.89962], [-94.73275, 38.90051], [-94.73300, 38.90327]];
const CREEK_FROM_LAT = 38.9036, CREEK_LOOP_TOP: [number, number] = [-94.72582, 38.91132];

/** The area handed to Bentwood: everything east of the line above, between 127th and 119th. */
export function bentwoodSideOfCreek(): [number, number][] {
  const creekStart = INDIAN_CREEK.findIndex(([, lat]) => lat >= CREEK_FROM_LAT);
  const creekEnd = INDIAN_CREEK.findIndex(([lon, lat]) => lon === CREEK_LOOP_TOP[0] && lat === CREEK_LOOP_TOP[1]);
  const line = [...NORTH_FROM_127TH, ...INDIAN_CREEK.slice(creekStart, creekEnd + 1), [CREEK_LOOP_TOP[0], STREET_119TH] as [number, number]];
  return [...line, [EAST_OF_QUIVIRA, STREET_119TH], [EAST_OF_QUIVIRA, STREET_127TH], line[0]];
}
