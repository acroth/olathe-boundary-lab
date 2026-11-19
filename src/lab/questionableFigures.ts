// District figures that look like errors. The lab still shows them, since district numbers come first, but says so, and the model's
// trend isn't tuned to them (pipeline/tools/calibrate/districtTrend.ts).
import type { Level } from './data';

/** Level -> concept -> school name -> why its district figure looks wrong. */
export const QUESTIONABLE_FIGURES: Partial<Record<Level, Record<number, Record<string, string>>>> = {
  ms: {
    // 933 in 2027-28 is about 721 current students plus ~200 from Indian Trail, as if 620, 630 and 650 never left. Without those
    // ~170 students, concept 4's total lines up with the other concepts.
    4: {
      'Frontier Trail':
        'This number looks too high. In this concept Frontier Trail gives areas 620, 630 and 650 to California Trail, but the ' +
        "district's number looks as if those students never left. This concept's total is also about 160 students more than the " +
        'others, so they may be counted at both schools.',
    },
  },
};
