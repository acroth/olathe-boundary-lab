// Free draw's top of panel: the starting plan, the headline figures, and which detail section to show.
import type { Level, Static } from '../../data';
import type { LevelResult } from '../../model/engine';
import { headline, headlineSummary, type SchoolNumber } from '../../numbers';
import { planFromPreset, usePlan, useSaved, useUI, type Plan } from '../../store';
import { summarize } from '../../visible';

export type FreeDrawSection = 'schools' | 'district' | 'grades' | 'checks' | 'plan';

const percent = (utilization: number) => `${(utilization * 100).toFixed(1)}%`;
const wholeNumber = (value: number) => Math.round(value).toLocaleString();

function StatTile({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return <div className={'stat' + (warn ? ' warn' : '')}><b>{value}</b><span>{label}</span></div>;
}

interface PlanSummaryProps {
  staticData: Static;
  plan: Plan;
  level: Level;
  result: LevelResult | undefined;
  numbers: Map<number, SchoolNumber>;
  visibleSchools: Set<number>;
  section: FreeDrawSection;
  onSectionChange: (section: FreeDrawSection) => void;
  decodeSavedPlan: (encoded: string) => Plan | null;
}

export default function PlanSummary({ staticData, plan, level, result, numbers, visibleSchools, section, onSectionChange, decodeSavedPlan }: PlanSummaryProps) {
  const { meta, presets, schools } = staticData;
  const ui = useUI();
  const savedPlans = useSaved(state => state.saved);
  const { setPlan } = usePlan.getState();

  const summary = result ? summarize(staticData, result, visibleSchools, level) : null;
  const { fullest, overTarget, sourceLabel } = headlineSummary(staticData, numbers, visibleSchools);
  const fullestLabel = fullest ? `Highest: ${schools[fullest.school].name}` : 'Highest';

  const loadStartingPlan = (presetId: string) => {
    const preset = presets.find(candidate => candidate.id === presetId)!;
    const hadDrawing = plan.edits.some(edit => edit.kind !== 'preset');
    setPlan(planFromPreset(preset));
    if (hadDrawing) ui.set({ toast: 'Starting plan loaded. Undo brings back your drawing.' });
  };
  const openSavedPlan = (name: string) => {
    const saved = savedPlans.find(candidate => candidate.name === name);
    const decoded = saved && decodeSavedPlan(saved.enc);
    if (decoded) setPlan(decoded);
  };

  return (
    <>
      <section>
        <div className="row gap">
          <select value={plan.preset} onChange={event => loadStartingPlan(event.target.value)} aria-label="Starting plan">
            {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
        </div>
        <details className="more"><summary>About this plan</summary><p className="note">{presets.find(preset => preset.id === plan.preset)?.description}</p></details>
        {savedPlans.length > 0 && (
          <select value="" onChange={event => openSavedPlan(event.target.value)}>
            <option value="">Open a saved plan…</option>
            {savedPlans.map(saved => <option key={saved.name} value={saved.name}>{saved.name}</option>)}
          </select>
        )}
      </section>

      <section className="summary">
        <p className="note source-line">{sourceLabel}</p>
        {summary && (
          <div className="stats">
            <StatTile value={fullest ? headline(fullest) : '—'} label={fullestLabel} warn={(fullest?.value ?? 0) > meta.target} />
            <StatTile value={String(overTarget.length)} label={`Schools over ${meta.target * 100}%`} warn={overTarget.length > 0} />
            <StatTile value={wholeNumber(summary.unassignedStudents)} label="Students unassigned" warn={summary.unassignedStudents > 0.5} />
            <StatTile value={'~' + wholeNumber(summary.movedFromOpen)} label="Students moved from non-closing schools (model)" />
          </div>
        )}
        {summary && (
          <details className="more">
            <summary>More numbers</summary>
            <div className="stats">
              <StatTile value={wholeNumber(summary.studentsFromClosingSchools)} label="Students from closing schools placed" />
              <StatTile value={summary.averageTripMiles ? summary.averageTripMiles.toFixed(2) + ' mi' : '—'} label="Average trip, moved students" />
              <StatTile value={'~' + percent(summary.shareBeyondBusMiles)} label={`Moved kids ${meta.busMiles}+ mi away`} />
              {level === 'es' && <StatTile value={wholeNumber(summary.inBuildingNotPlaced)} label="Pre-K at closing schools, not placed" />}
            </div>
            <p className="note">These are model estimates. Model peaks run 2027-28 to 2034-35. Year and Pre-K are in the top bar.</p>
          </details>
        )}
      </section>

      <section className="row between">
        <label className="lbl">Show</label>
        <select className="show-select" value={section} onChange={event => onSectionChange(event.target.value as FreeDrawSection)}>
          <option value="schools">Schools</option>
          {level === 'es' && <option value="district">District numbers</option>}
          <option value="grades">Grades</option>
          <option value="checks">Checks</option>
          <option value="plan">Compare &amp; export</option>
        </select>
      </section>
    </>
  );
}
