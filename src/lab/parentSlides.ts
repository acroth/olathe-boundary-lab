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
