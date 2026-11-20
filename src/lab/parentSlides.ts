// Totals from the district's November 2026 parent-meeting slides, for schools where a slide showed more students than the main
// deck's 2027-28 projection. The main decks stay the official numbers; these slides add the moving students to 2026-27 classes.
import type { Level } from './data';

export interface ParentSlideTotal {
  students: number;
  printedPercent?: number;   // what the slide printed, where that doesn't match its own student count
  // What the slide's own columns add up to (the school's students plus the movers the slides list), where that's more than
  // 5 students off the total. Middle school slides list only Indian Trail's students, not areas moved between open schools.
  columnsAddUpTo?: number;
}

type SlideTotals = Record<string, Record<string, ParentSlideTotal>>;

export const PARENT_SLIDE_TOTALS: Partial<Record<Level, SlideTotals>> = {
  es: {
    1: { Brougham: { students: 461, columnsAddUpTo: 263 + 83 + 39 }, Havencroft: { students: 386, printedPercent: 73.9 } },
    2: {
      'Green Springs': { students: 424, printedPercent: 86.8, columnsAddUpTo: 221 + 132 }, Havencroft: { students: 347 },
      'Madison Place': { students: 539, columnsAddUpTo: 359 + 60 + 107 }, Sunnyside: { students: 522 },
    },
    3: { Briarwood: { students: 414 }, Havencroft: { students: 407 }, Sunnyside: { students: 522 } },
    4: { Countryside: { students: 335 } },
  },
  ms: {
    1: {
      'Frontier Trail': { students: 876, printedPercent: 95, columnsAddUpTo: 721 + 256 },
      'Pioneer Trail': { students: 688, printedPercent: 78, columnsAddUpTo: 646 + 34 },
    },
    2: { 'Frontier Trail': { students: 876, printedPercent: 95, columnsAddUpTo: 721 + 256 } },
  },
};

/** Receiving schools' K-5 students by grade after the move (2026-27 classes plus the incoming students), from the grade tables on
 *  the Nov 2026 parent-meeting slides, by district concept. Only the grade mix is used: some slide totals don't match the main
 *  decks, which stay the hard stop. A slide covers the concepts that use that closing school's version; where two slides disagree,
 *  the one moving more students into the school is kept. */
export const PARENT_SLIDE_GRADES: Record<string, Record<string, number[]>> = {
  1: {
    Brougham: [69, 71, 81, 87, 76, 77],          // Heritage and Black Bob concept 1
    'Madison Place': [77, 90, 80, 82, 83, 87],   // Heritage concept 1
    'Green Springs': [66, 44, 68, 76, 80, 82],   // Black Bob concept 1
    Briarwood: [75, 61, 68, 62, 78, 70],         // Tomahawk concept 1
    Havencroft: [60, 50, 66, 60, 75, 74],        // Tomahawk concept 1
    Sunnyside: [80, 73, 101, 88, 97, 107],       // Scarborough concept 1
    Heatherstone: [74, 72, 64, 64, 71, 74],      // Walnut Grove concept 1
    'Pleasant Ridge': [75, 77, 66, 59, 70, 73],  // Walnut Grove concept 1
  },
  2: {
    Havencroft: [51, 46, 58, 64, 62, 66],        // Heritage concept 2
    Sunnyside: [79, 67, 103, 78, 93, 102],       // Heritage concept 2, Scarborough concept 2
    'Madison Place': [80, 99, 89, 95, 85, 91],   // Heritage concept 2, Scarborough concept 2
    Brougham: [55, 63, 60, 74, 65, 65],          // Black Bob concept 2
    'Green Springs': [57, 68, 75, 71, 81, 72],   // Black Bob concept 2
    Briarwood: [81, 64, 70, 64, 78, 67],         // Tomahawk concept 2
    Heatherstone: [89, 99, 81, 78, 85, 97],      // Walnut Grove concept 2
    'Pleasant Ridge': [70, 61, 59, 55, 67, 60],  // Walnut Grove concept 2
  },
  3: {
    Havencroft: [64, 58, 67, 65, 69, 74],        // Heritage concept 3
    Sunnyside: [79, 67, 103, 78, 93, 102],       // Heritage concept 3, Scarborough concept 2
    Brougham: [49, 56, 55, 67, 57, 57],          // Black Bob concept 3
    'Green Springs': [50, 50, 62, 65, 75, 70],   // Black Bob concept 3
    Briarwood: [75, 61, 68, 62, 78, 70],         // Tomahawk concept 3
    'Indian Creek': [66, 52, 72, 71, 70, 78],    // Tomahawk concept 3
    Heatherstone: [89, 99, 81, 78, 85, 97],      // Walnut Grove concept 2
    'Pleasant Ridge': [70, 61, 59, 55, 67, 60],  // Walnut Grove concept 2
  },
  4: {
    Sunnyside: [80, 73, 101, 88, 97, 107],       // Scarborough concept 1
    'Green Springs': [50, 50, 62, 65, 75, 70],   // Black Bob concept 3
    Briarwood: [81, 64, 70, 64, 78, 67],         // Tomahawk concept 2
    Countryside: [50, 46, 54, 64, 54, 67],       // Walnut Grove concept 3
    Heatherstone: [85, 88, 77, 74, 81, 90],      // Walnut Grove concept 3
    'Pleasant Ridge': [70, 61, 59, 55, 67, 60],  // Walnut Grove concept 3
  },
};
export const SLIDE_GRADE_ORDER = ['K', '1', '2', '3', '4', '5'];
