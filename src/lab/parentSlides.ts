// Totals from the district's November 2026 parent-meeting slides, for schools where a slide showed more students than the main
// deck's 2027-28 projection. The main decks stay the official numbers; these slides count 2026-27 students as if they moved now.
import type { Level } from './data';

export interface ParentSlideTotal {
  students: number;
  printedPercent?: number;   // what the slide printed, where that doesn't match its own student count
}

type SlideTotals = Record<string, Record<string, ParentSlideTotal>>;

export const PARENT_SLIDE_TOTALS: Partial<Record<Level, SlideTotals>> = {
  es: {
    1: { Brougham: { students: 461 }, Havencroft: { students: 386, printedPercent: 73.9 } },
    2: {
      'Green Springs': { students: 424, printedPercent: 86.8 }, Havencroft: { students: 347 },
      'Madison Place': { students: 539 }, Sunnyside: { students: 522 },
    },
    3: { Briarwood: { students: 414 }, Havencroft: { students: 407 }, Sunnyside: { students: 522 } },
    4: { Countryside: { students: 335 } },
  },
  ms: {
    1: { 'Frontier Trail': { students: 876, printedPercent: 95 }, 'Pioneer Trail': { students: 688, printedPercent: 78 } },
    2: { 'Frontier Trail': { students: 876, printedPercent: 95 } },
  },
};
