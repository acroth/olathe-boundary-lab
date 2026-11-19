// Free draw's top of panel: where the plan starts from and its headline facts.
import type { Level, Static } from '../../data';
import type { LevelResult } from '../../model/engine';
import { headlineSummary, type SchoolNumber } from '../../numbers';
import { currentStartingPlan, startingPlans, withStartingPlan } from '../../startingPlans';
import { usePlan, useSaved, useUI, type Plan } from '../../store';
import { summarize } from '../../visible';
import { GlanceItem } from '../Scorecard';

const wholeNumber = (value: number) => Math.round(value).toLocaleString();

interface PlanSummaryProps {
  staticData: Static;
  plan: Plan;
  level: Level;
  result: LevelResult | undefined;
  numbers: Map<number, SchoolNumber>;
  visibleSchools: Set<number>;
  decodeSavedPlan: (encoded: string) => Plan | null;
}

export default function PlanSummary({ staticData, plan, level, result, numbers, visibleSchools, decodeSavedPlan }: PlanSummaryProps) {
  const { meta } = staticData;
  const ui = useUI();
  const savedPlans = useSaved(state => state.saved);
  const { setPlan } = usePlan.getState();

  const summary = result ? summarize(staticData, result, visibleSchools, level) : null;
  const { overTarget } = headlineSummary(staticData, numbers, visibleSchools);
  const goalPercent = meta.target * 100;

  const starts = startingPlans(staticData, level), currentStart = currentStartingPlan(staticData, plan, level);
  const loadStartingPlan = (startId: string) => {
    const hadDrawing = plan.edits.some(edit => edit.level === level && edit.kind !== 'preset');
    setPlan(withStartingPlan(staticData, plan, level, startId));
    if (hadDrawing) ui.set({ toast: 'Starting plan loaded. Undo brings back your drawing.' });
  };
  const openSavedPlan = (name: string) => {
    const saved = savedPlans.find(candidate => candidate.name === name);
    const decoded = saved && decodeSavedPlan(saved.enc);
    if (decoded) setPlan(decoded);
  };

  return (
    <section className="panel-section">
      {starts.length > 0 ? (
        <>
          <label className="field-label" htmlFor="starting-plan">Start from</label>
          <select id="starting-plan" className="plan-select" value={currentStart} onChange={event => loadStartingPlan(event.target.value)} aria-label="Starting plan">
            {currentStart === '' && <option value="" disabled>Your edited plan</option>}
            {starts.map(start => <option key={start.id} value={start.id}>{start.name}</option>)}
          </select>
        </>
      ) : (
        <p className="section-note">No high schools close, so high school lines start from today's boundaries.</p>
      )}
      {savedPlans.length > 0 && (
        <select className="plan-select" value="" onChange={event => openSavedPlan(event.target.value)}>
          <option value="">Open a saved plan…</option>
          {savedPlans.map(saved => <option key={saved.name} value={saved.name}>{saved.name}</option>)}
        </select>
      )}
      {summary && (
        <ul className="glance">
          <GlanceItem value={overTarget.length} label={overTarget.length === 1 ? `school over ${goalPercent}% full` : `schools over ${goalPercent}% full`} warn={overTarget.length > 0} />
          <GlanceItem value={wholeNumber(summary.unassignedStudents)} label="students without a school yet" warn={summary.unassignedStudents > 0.5} />
          <GlanceItem value={'~' + wholeNumber(summary.movedFromOpen)} label="students move from schools staying open" />
        </ul>
      )}
    </section>
  );
}
