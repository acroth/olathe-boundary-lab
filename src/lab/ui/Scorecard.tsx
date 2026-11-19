// The Concept Builder's four headline figures, using the same numbers as the map.
import type { ReactNode } from 'react';
import type { Static } from '../data';
import type { LevelResult } from '../model/engine';
import { headline, headlineSummary, publishedOption, type SchoolNumber, type Source } from '../numbers';
import type { Plan } from '../store';
import { SourceTag } from './SchoolNumbers';

const WARNING_UTILIZATION = 0.85, SEVERE_UTILIZATION = 0.9;

function utilizationTone(utilization: number): string {
  if (utilization > SEVERE_UTILIZATION) return 'bad';
  return utilization > WARNING_UTILIZATION ? 'warn' : '';
}

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
}

export function calculateScorecard({ staticData, plan, result, numbers, visibleSchools }: ScorecardInput) {
  const summary = headlineSummary(staticData, numbers, visibleSchools);
  const { fullest, overTarget, districtCount } = summary;

  const option = publishedOption(staticData, plan);
  const districtPieces = option ? staticData.presets.find(preset => preset.id === 'dc' + option)!.district!.pieces : null;
  const studentsMoved = districtPieces
    ? districtPieces.reduce((total, piece) => total + piece.n, 0)
    : modelStudentsFromClosingSchools(plan, result);

  const anyOverTargetIsModel = overTarget.some(schoolNumber => schoolNumber.source === 'model');
  const overTargetSource: Source = districtCount && !anyOverTargetIsModel ? 'district' : 'model';
  const overTargetNames = overTarget.map(schoolNumber => staticData.schools[schoolNumber.school].name).join(', ');
  const movedFromOpenSchools = result?.summary.movedFromOpen ?? null;

  return {
    sourceLabel: summary.sourceLabel,
    fullest,
    fullestName: fullest ? staticData.schools[fullest.school].name : '—',
    overTargetCount: overTarget.length,
    overTargetLabel: overTarget.length ? `Over 85%: ${overTargetNames}` : 'Schools over 85%',
    overTargetSource,
    studentsMovedLabel: (districtPieces ? '' : '~') + Math.round(studentsMoved).toLocaleString(),
    studentsMovedSource: (districtPieces ? 'district' : 'model') as Source,
    movedFromOpenSchools,
  };
}

function ScoreTile({ tone = '', value, label, source }: { tone?: string; value: ReactNode; label: ReactNode; source?: Source }) {
  return (
    <div className={'stat ' + tone}>
      <b>{value}</b>
      <span>{label}</span>
      {source && <SourceTag source={source} />}
    </div>
  );
}

export default function Scorecard(input: ScorecardInput) {
  const scorecard = calculateScorecard(input);
  const { fullest, movedFromOpenSchools } = scorecard;

  const movedFromOpenValue = movedFromOpenSchools === null ? '—' : `~${Math.round(movedFromOpenSchools).toLocaleString()}`;

  return (
    <>
      <p className="note source-line">{scorecard.sourceLabel}</p>
      <div className="stats score">
        <ScoreTile tone={utilizationTone(fullest?.value ?? 0)} value={fullest ? headline(fullest) : '—'} label={`Fullest: ${scorecard.fullestName}`} source={fullest?.source} />
        <ScoreTile tone={scorecard.overTargetCount ? 'warn' : ''} value={scorecard.overTargetCount} label={scorecard.overTargetLabel} source={scorecard.overTargetSource} />
        <ScoreTile value={scorecard.studentsMovedLabel} label="Students moved from closing schools" source={scorecard.studentsMovedSource} />
        <ScoreTile value={movedFromOpenValue} label="Students moved from non-closing schools" source="model" />
      </div>
    </>
  );
}
