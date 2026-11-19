// The plan's headline facts, in plain words, using the same numbers as the map.
import type { Static } from '../data';
import type { LevelResult } from '../model/engine';
import { headlineSummary, publishedOption, type SchoolNumber } from '../numbers';
import type { Plan } from '../store';

/** Students the model moves out of closing schools, counted in fall 2026 so they compare with the district's counts. */
function modelStudentsFromClosingSchools(plan: Plan, result: LevelResult | null): number {
  if (!result) return 0;
  let students = 0;
  for (const schoolResult of Object.values(result.schools)) {
    for (const [origin, moved] of Object.entries(schoolResult.movedInByOriginFall2026)) {
      if (plan.closures[origin] !== undefined) students += moved;
    }
  }
  return students;
}

interface ScorecardInput {
  staticData: Static;
  plan: Plan;
  result: LevelResult | null;
  numbers: Map<number, SchoolNumber>;
  visibleSchools: Set<number>;
  showStudentMoves?: boolean;
}

export function calculateScorecard({ staticData, plan, result, numbers, visibleSchools }: ScorecardInput) {
  const { overTarget } = headlineSummary(staticData, numbers, visibleSchools);
  const option = publishedOption(staticData, plan);
  const districtPieces = option ? staticData.presets.find(preset => preset.id === 'dc' + option)!.district!.pieces : null;
  const studentsMoved = districtPieces
    ? districtPieces.reduce((total, piece) => total + piece.n, 0)
    : modelStudentsFromClosingSchools(plan, result);
  const movedFromOpenSchools = result?.summary.movedFromOpen ?? null;

  return {
    overTargetCount: overTarget.length,
    overTargetNames: overTarget.map(schoolNumber => staticData.schools[schoolNumber.school].name).join(', '),
    studentsMovedLabel: (districtPieces ? '' : '~') + Math.round(studentsMoved).toLocaleString(),
    movedFromOpenLabel: movedFromOpenSchools === null ? '—' : `~${Math.round(movedFromOpenSchools).toLocaleString()}`,
  };
}

export function GlanceItem({ value, label, detail, warn }: { value: string | number; label: string; detail?: string; warn?: boolean }) {
  return (
    <li className={'glance-item' + (warn ? ' warn' : '')}>
      <b>{value}</b>
      <span>{label}{detail && <small>{detail}</small>}</span>
    </li>
  );
}

export default function Scorecard(input: ScorecardInput) {
  const { showStudentMoves = true } = input;
  const scorecard = calculateScorecard(input);
  const goalPercent = input.staticData.meta.target * 100;
  const overLabel = scorecard.overTargetCount === 1 ? `school over ${goalPercent}% full` : `schools over ${goalPercent}% full`;

  return (
    <ul className="glance">
      <GlanceItem value={scorecard.overTargetCount} label={overLabel} detail={scorecard.overTargetNames} warn={scorecard.overTargetCount > 0} />
      {showStudentMoves && <GlanceItem value={scorecard.studentsMovedLabel} label="students leave closing schools" />}
      {showStudentMoves && <GlanceItem value={scorecard.movedFromOpenLabel} label="students move from schools staying open" />}
    </ul>
  );
}
