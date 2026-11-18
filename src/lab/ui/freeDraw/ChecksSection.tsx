// Free draw's checks: split attendance areas, split feeder patterns, and which schools close.
import type { School, Static } from '../../data';
import type { LevelResult } from '../../model/engine';
import type { Results } from '../../App';
import { usePlan, type Plan } from '../../store';

const FIRST_YEAR_CLOSED = 2;
const SECOND_SCHOOL_MIN_SHARE = 0.1;

interface ChecksSectionProps {
  staticData: Static;
  plan: Plan;
  result: LevelResult;
  feeder: Results['feeder'];
  schools: School[];
  visibleSchools: Set<number>;
  onSchoolSelect: (school: number) => void;
}

export default function ChecksSection({ staticData, plan, result, feeder, schools, visibleSchools, onSchoolSelect }: ChecksSectionProps) {
  const { toggleClosure } = usePlan.getState();
  const isClosed = (school: number) => plan.closures[String(school)] !== undefined;

  const splitSchools = schools.filter(school => result.schools[school.i].open && result.schools[school.i].pieces > 1);
  const splitFeeders = feeder.filter(entry => visibleSchools.has(entry.es) && entry.split.length > 1 && entry.split[1].share >= SECOND_SCHOOL_MIN_SHARE);

  const feederLabel = (entry: Results['feeder'][number]) => {
    const shares = entry.split.map(part => `${staticData.schools[part.ms].name} ${Math.round(part.share * 100)}%`).join(', ');
    return `${staticData.schools[entry.es].name}: ${shares}`;
  };
  const closureNote = (school: School) => {
    if (!isClosed(school.i)) return '';
    return ` closes after ${staticData.meta.years[plan.closures[String(school.i)] - 1]}`;
  };
  const receiversNote = (school: School) => {
    const receivers = staticData.receivers[String(school.i)];
    if (!receivers) return '';
    return ` (district listed: ${receivers.map(receiver => staticData.schools[receiver].name).join(', ')})`;
  };

  return (
    <section>
      <h3>Separate pieces</h3>
      <ul className="list">
        {splitSchools.map(school => <li key={school.i} onClick={() => onSchoolSelect(school.i)}>{school.name}: {result.schools[school.i].pieces} pieces</li>)}
        {!splitSchools.length && <li className="muted">Every open school's area is one piece.</li>}
      </ul>
      <h3>Elementary → middle school splits</h3>
      <ul className="list">
        {splitFeeders.map(entry => <li key={entry.es} onClick={() => onSchoolSelect(entry.es)}>{feederLabel(entry)}</li>)}
        {!splitFeeders.length && <li className="muted">No elementary area sends 10% or more of its students to a second middle school.</li>}
      </ul>
      <h3>Closures</h3>
      <ul className="list">
        {schools.map(school => (
          <li key={school.i}>
            <label className="chk">
              <input type="checkbox" checked={isClosed(school.i)} onChange={() => toggleClosure(school.i, FIRST_YEAR_CLOSED)} /> {school.name}{closureNote(school)}{receiversNote(school)}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
