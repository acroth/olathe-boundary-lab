// The plan's headline facts, in plain words, using the same numbers as the map.
import type { Static } from '../data';
import type { LevelResult } from '../model/engine';
import { headlineSummary, type SchoolNumber } from '../numbers';
import type { Plan } from '../store';
import EstimateMark from './EstimateMark';

interface ScorecardInput {
  staticData: Static;
  plan: Plan;
  result: LevelResult | null;
  numbers: Map<number, SchoolNumber>;
  visibleSchools: Set<number>;
}

export function calculateScorecard({ staticData, result, numbers, visibleSchools }: ScorecardInput) {
  const { overTarget } = headlineSummary(staticData, numbers, visibleSchools);
  const movedFromOpenSchools = result?.summary.movedFromOpen ?? null;

  return {
    overTargetCount: overTarget.length,
    overTargetNames: overTarget.map(schoolNumber => staticData.schools[schoolNumber.school].name).join(', '),
    movedFromOpenLabel: movedFromOpenSchools === null ? '—' : Math.round(movedFromOpenSchools).toLocaleString(),
  };
}

export function GlanceItem({ value, label, detail, warn, estimate }: { value: string | number; label: string; detail?: string; warn?: boolean; estimate?: boolean }) {
  return (
    <li className={'glance-item' + (warn ? ' warn' : '')}>
      <b>{value}{estimate && <EstimateMark />}</b>
      <span>{label}{detail && <small>{detail}</small>}</span>
    </li>
  );
}

export default function Scorecard(input: ScorecardInput) {
  const scorecard = calculateScorecard(input);
  const goalPercent = input.staticData.meta.target * 100;
  const overLabel = scorecard.overTargetCount === 1 ? `school over ${goalPercent}% full` : `schools over ${goalPercent}% full`;

  return (
    <ul className="glance">
      <GlanceItem value={scorecard.overTargetCount} label={overLabel} detail={scorecard.overTargetNames} warn={scorecard.overTargetCount > 0} />
      <GlanceItem value={scorecard.movedFromOpenLabel} label="students move from schools staying open" estimate />
    </ul>
  );
}
