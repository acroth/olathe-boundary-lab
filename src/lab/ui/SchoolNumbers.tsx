// How full each school would be, written for someone seeing these numbers for the first time.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { schoolColor } from '../colors';
import type { Static } from '../data';
import type { LevelResult } from '../model/engine';
import { CLOSE_POINTS, headline, type SchoolNumber } from '../numbers';

const COLLAPSED_SCHOOL_COUNT = 5, LONGEST_FULL_LIST = 6;   // a list of six is short enough to show whole
const NEAR_GOAL_POINTS = 5;
const METER_MAX = 1.1;   // the bar's full width stands for 110% full

const percent = (utilization: number) => `${(utilization * 100).toFixed(1)}%`;

function fullnessTone(utilization: number, goal: number): 'over' | 'near' | 'room' {
  if (utilization > goal + 1e-9) return 'over';
  return utilization >= goal - NEAR_GOAL_POINTS / 100 ? 'near' : 'room';
}

function agreementNote(schoolNumber: SchoolNumber, goalPercent: number): string | null {
  if (schoolNumber.agreement === 'tooClose') return `One number is over ${goalPercent}% and the other isn't, so this school is too close to call.`;
  if (schoolNumber.agreement === 'differs') return `Our estimate is more than ${CLOSE_POINTS} points away from the district's number.`;
  return null;
}

interface SchoolRowProps {
  staticData: Static;
  schoolNumber: SchoolNumber;
  result: LevelResult;
  compareResult?: LevelResult | null;
  expanded: boolean;
  focused: boolean;
  onToggle: () => void;
}

function SchoolRow({ staticData, schoolNumber, result, compareResult, expanded, focused, onToggle }: SchoolRowProps) {
  const { meta } = staticData;
  const school = staticData.schools[schoolNumber.school], schoolResult = result.schools[schoolNumber.school];
  const { district, model, agreement, value } = schoolNumber;
  const goalPercent = meta.target * 100;
  const tone = fullnessTone(value, meta.target);
  const note = agreementNote(schoolNumber, goalPercent);
  const compareSchool = compareResult?.schools[schoolNumber.school];
  const meterWidth = `${Math.min(value / METER_MAX, 1) * 100}%`, goalPosition = `${(meta.target / METER_MAX) * 100}%`;

  return (
    <li className={'school-row' + (focused ? ' focused' : '')} data-school={school.name} data-headline={headline(schoolNumber)}
      data-district={district === null ? '' : percent(district)} data-model={'~' + percent(model)} data-agreement={agreement ?? ''}>
      <button className="school-row-main" onClick={onToggle} aria-expanded={expanded}>
        <span className="school-row-top">
          <i className="school-dot" style={{ background: schoolColor(school as any) }} />
          <span className="school-name">{school.name}</span>
          {agreement === 'tooClose' && <span className="school-flag">Too close to call</span>}
          <b className={'school-value ' + tone}>{headline(schoolNumber)}</b>
          <ChevronDown className={'school-chevron' + (expanded ? ' open' : '')} aria-hidden />
        </span>
        <span className="meter" aria-hidden>
          <span className={'meter-fill ' + tone} style={{ width: meterWidth }} />
          <span className="meter-goal" style={{ left: goalPosition }} />
        </span>
      </button>
      {expanded && (
        <div className="school-details">
          <dl>
            {district !== null && <div><dt>District's number</dt><dd>{percent(district)}</dd></div>}
            <div><dt>Our estimate</dt><dd>~{percent(model)}</dd></div>
            <div><dt>Students the building is sized for</dt><dd>{Math.round(school.capacity).toLocaleString()}</dd></div>
            <div><dt>Fullest it gets ({meta.years[schoolResult.peakYear]})</dt><dd>~{percent(schoolResult.peak)}</dd></div>
            {compareResult && <div><dt>Fullest in the compared plan</dt><dd>{compareSchool?.open ? '~' + percent(compareSchool.peak) : 'Closing'}</dd></div>}
          </dl>
          {note && <p className="school-note">{note}</p>}
        </div>
      )}
    </li>
  );
}

interface SchoolListProps {
  staticData: Static;
  numbers: Map<number, SchoolNumber>;
  schools: number[];
  result: LevelResult;
  compareResult?: LevelResult | null;
  focusedSchool?: number | null;
  onSchoolSelect?: (school: number) => void;
}

/** Every school, fullest first, with the detail one tap away. */
export function SchoolList({ staticData, numbers, schools, result, compareResult, focusedSchool, onSchoolSelect }: SchoolListProps) {
  const [expandedSchool, setExpandedSchool] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const openSchools = schools.flatMap(school => numbers.get(school) ?? []).sort((first, second) => second.value - first.value);
  const closingSchools = schools.filter(school => !numbers.has(school));
  const canCollapse = openSchools.length > LONGEST_FULL_LIST;
  const shownSchools = showAll || !canCollapse ? openSchools : openSchools.slice(0, COLLAPSED_SCHOOL_COUNT);
  const hasEstimates = openSchools.some(schoolNumber => schoolNumber.source === 'model');

  const toggleSchool = (school: number) => {
    setExpandedSchool(current => current === school ? null : school);
    onSchoolSelect?.(school);
  };

  return (
    <>
      <ul className="school-list">
        {shownSchools.map(schoolNumber => (
          <SchoolRow key={schoolNumber.school} staticData={staticData} schoolNumber={schoolNumber} result={result} compareResult={compareResult}
            expanded={expandedSchool === schoolNumber.school} focused={focusedSchool === schoolNumber.school} onToggle={() => toggleSchool(schoolNumber.school)} />
        ))}
      </ul>
      {canCollapse && (
        <button className="show-all" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer schools' : `Show all ${openSchools.length} schools`}</button>
      )}
      {closingSchools.length > 0 && <p className="list-note">Closing: {closingSchools.map(school => staticData.schools[school].name).join(', ')}</p>}
      {hasEstimates && <p className="list-note">~ means our own estimate, because the district hasn't published a number.</p>}
    </>
  );
}
