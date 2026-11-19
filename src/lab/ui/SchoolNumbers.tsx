// How full each school would be, written for someone seeing these numbers for the first time.
import { useState } from 'react';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { schoolColor } from '../colors';
import type { Static } from '../data';
import type { LevelResult } from '../model/engine';
import { headline, type SchoolNumber } from '../numbers';
import EstimateMark from './EstimateMark';

const COLLAPSED_SCHOOL_COUNT = 5, LONGEST_FULL_LIST = 6;   // a list of six is short enough to show whole
const NEAR_GOAL_POINTS = 5;
const METER_MAX = 1.1;   // the bar's full width stands for 110% full

const percent = (utilization: number) => `${(utilization * 100).toFixed(1)}%`;
const studentCount = (students: number) => Math.round(students).toLocaleString();

function fullnessTone(utilization: number, goal: number): 'over' | 'near' | 'room' {
  if (utilization > goal + 1e-9) return 'over';
  return utilization >= goal - NEAR_GOAL_POINTS / 100 ? 'near' : 'room';
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
  const tone = fullnessTone(value, meta.target);
  const showEstimates = district === null;   // our estimates appear only where no district number stands in for them
  const compareSchool = compareResult?.schools[schoolNumber.school];
  const slide = schoolNumber.parentSlide;
  const printedNote = slide?.printedPercent !== undefined ? ` (The slide itself said ${slide.printedPercent}%.)` : '';
  const columnsNote = slide?.columnsAddUpTo !== undefined
    ? ` The numbers on the slide itself add up to ${slide.columnsAddUpTo.toLocaleString()} students, not ${slide.students.toLocaleString()}, so it may include students moving from other schools that it doesn't list.`
    : '';
  const capacityNote = school.capSource.startsWith('estimated')
    ? `The district hasn't published this building's capacity, so it's estimated: ${Math.round(school.enroll2025).toLocaleString()} students in ${meta.years[0]} ÷ ${school.util[0]}% full (the district's July 2026 forecast) ≈ ${Math.round(school.capacity).toLocaleString()}.`
    : null;
  const meterWidth = `${Math.min(value / METER_MAX, 1) * 100}%`, goalPosition = `${(meta.target / METER_MAX) * 100}%`;

  return (
    <li className={'school-row' + (focused ? ' focused' : '')} data-school={school.name} data-headline={headline(schoolNumber)}
      data-district={district === null ? '' : percent(district)} data-model={percent(model)} data-agreement={agreement ?? ''}>
      <button className="school-row-main" onClick={onToggle} aria-expanded={expanded}>
        <span className="school-row-top">
          <i className="school-dot" style={{ background: schoolColor(school as any) }} />
          <span className="school-name">{school.name}</span>
          {(schoolNumber.questionable || slide) && <TriangleAlert className="school-warning" aria-label="Open for a note about the district's number" />}
          <b className={'school-value ' + tone}>{headline(schoolNumber)}</b>
          {schoolNumber.source === 'model' && <EstimateMark focusable={false} />}
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
            <div><dt>Students ({meta.years[schoolNumber.year]})</dt><dd>{studentCount(schoolNumber.students)}{showEstimates && <EstimateMark />}</dd></div>
            <div><dt>Max Functional Capacity</dt><dd>{studentCount(school.capacity)}</dd></div>
            {schoolNumber.districtPeak
              ? <div><dt>Peak year ({meta.years[schoolNumber.districtPeak.year]})</dt><dd>{percent(schoolNumber.districtPeak.utilization)} ({studentCount(schoolNumber.districtPeak.students)} students)</dd></div>
              : <div><dt>Peak year ({meta.years[schoolResult.peakYear]})</dt><dd>{percent(schoolResult.peak)} ({studentCount(schoolResult.total[schoolResult.peakYear])} students)<EstimateMark /></dd></div>}
            {showEstimates && compareResult && <div><dt>Peak year, compared plan ({meta.years[compareSchool?.peakYear ?? schoolResult.peakYear]})</dt><dd>{compareSchool?.open ? <>{percent(compareSchool.peak)} ({studentCount(compareSchool.total[compareSchool.peakYear])} students)<EstimateMark /></> : 'Closing'}</dd></div>}
          </dl>
          {schoolNumber.questionable && <p className="school-note"><TriangleAlert className="school-warning" aria-hidden />{schoolNumber.questionable}</p>}
          {capacityNote && <p className="school-note">{capacityNote}</p>}
          {slide && <p className="school-note"><TriangleAlert className="school-warning" aria-hidden />At a parent meeting, the district showed {slide.students.toLocaleString()} students here, or {percent(slide.percent)} full.{printedNote} That slide adds the moving students to this school year's (2026&ndash;27) classes.{columnsNote} The number above is the district's projection for {meta.years[schoolNumber.year]}.</p>}
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
    </>
  );
}
