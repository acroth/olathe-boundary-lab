// How full each school would be, written for someone seeing these numbers for the first time.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { schoolColor } from '../colors';
import type { Static } from '../data';
import type { LevelResult } from '../model/engine';
import { headline, type SchoolNumber } from '../numbers';

const COLLAPSED_SCHOOL_COUNT = 5, LONGEST_FULL_LIST = 6;   // a list of six is short enough to show whole
const NEAR_GOAL_POINTS = 5;
const METER_MAX = 1.1;   // the bar's full width stands for 110% full

const percent = (utilization: number) => `${(utilization * 100).toFixed(1)}%`;

function fullnessTone(utilization: number, goal: number): 'over' | 'near' | 'room' {
  if (utilization > goal + 1e-9) return 'over';
  return utilization >= goal - NEAR_GOAL_POINTS / 100 ? 'near' : 'room';
}

/** How our estimate compares with the district's, in words. */
function comparisonNote({ district, model, agreement }: SchoolNumber, goalPercent: number): string | null {
  if (district === null) return null;
  if (agreement === 'tooClose') {
    return model > district
      ? `The district has this school at or under ${goalPercent}% full, but our estimate puts it over.`
      : `The district has this school over ${goalPercent}% full, but our estimate puts it at or under.`;
  }
  const points = Math.round(Math.abs(model - district) * 100);
  if (agreement === 'close') return points === 0 ? "Our estimate matches the district's." : "Our estimate is about the same as the district's.";
  return `Our estimate is ${points} percentage points ${model > district ? 'higher' : 'lower'} than the district's.`;
}

/** The short tag on a row where the two numbers land on opposite sides of the goal. */
function disagreementFlag({ district, model, agreement }: SchoolNumber, goalPercent: number): string | null {
  if (agreement !== 'tooClose' || district === null) return null;
  return model > district ? `We estimate over ${goalPercent}%` : `We estimate under ${goalPercent}%`;
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
  const note = comparisonNote(schoolNumber, goalPercent), flag = disagreementFlag(schoolNumber, goalPercent);
  const compareSchool = compareResult?.schools[schoolNumber.school];
  const slide = schoolNumber.parentSlide;
  const printedNote = slide?.printedPercent !== undefined ? ` (The slide itself said ${slide.printedPercent}%.)` : '';
  const columnsNote = slide?.columnsAddUpTo !== undefined
    ? ` The numbers on the slide itself add up to ${slide.columnsAddUpTo.toLocaleString()} students, not ${slide.students.toLocaleString()}, so it may include students moving from other schools that it doesn't list.`
    : '';
  const meterWidth = `${Math.min(value / METER_MAX, 1) * 100}%`, goalPosition = `${(meta.target / METER_MAX) * 100}%`;

  return (
    <li className={'school-row' + (focused ? ' focused' : '')} data-school={school.name} data-headline={headline(schoolNumber)}
      data-district={district === null ? '' : percent(district)} data-model={'~' + percent(model)} data-agreement={agreement ?? ''}>
      <button className="school-row-main" onClick={onToggle} aria-expanded={expanded}>
        <span className="school-row-top">
          <i className="school-dot" style={{ background: schoolColor(school as any) }} />
          <span className="school-name">{school.name}</span>
          {flag && <span className="school-flag">{flag}</span>}
          {!flag && slide && <span className="school-flag">Meeting slide: {percent(slide.percent)}</span>}
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
          {slide && <p className="school-note">At a parent meeting, the district showed {slide.students.toLocaleString()} students here, or {percent(slide.percent)} full.{printedNote} That slide adds the moving students to this school year's (2026&ndash;27) classes.{columnsNote} The number above is the district's projection for {meta.years[schoolNumber.year]}.</p>}
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
