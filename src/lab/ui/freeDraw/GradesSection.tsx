// Free draw's grade-by-grade table for one school: students, classrooms and utilization across three chosen years.
import { useState } from 'react';
import type { School, Static } from '../../data';
import type { LevelResult } from '../../model/engine';

const GRADE_ORDER = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

interface GradesSectionProps {
  staticData: Static;
  result: LevelResult;
  focusedSchool: number | null;
  onSchoolSelect: (school: number) => void;
  schools: School[];
  year: number;
}

export default function GradesSection({ staticData, result, focusedSchool, onSchoolSelect, schools, year }: GradesSectionProps) {
  const { meta } = staticData;
  const lastYear = meta.years.length - 1;
  const [shownYears, setShownYears] = useState<number[]>([year, Math.min(year + 2, lastYear), lastYear]);

  const openSchools = schools.filter(school => result.schools[school.i].open);
  const schoolIndex = focusedSchool ?? openSchools[0]?.i;
  if (schoolIndex === undefined) return null;

  const school = staticData.schools[schoolIndex], schoolResult = result.schools[schoolIndex];
  const isElementary = school.level === 'es';
  const grades = Object.keys(school.gradeShare).sort((first, second) => GRADE_ORDER.indexOf(first) - GRADE_ORDER.indexOf(second));
  const planYears = meta.years.map((name, index) => ({ name, index })).filter(({ index }) => index >= meta.firstPlanYear);

  const changeShownYear = (column: number, newYear: number) => setShownYears(shownYears.map((shown, index) => index === column ? newYear : shown));
  const totalClassrooms = (shownYear: number) => Object.values(schoolResult.classrooms[shownYear]).reduce((total, rooms) => total + rooms, 0);

  return (
    <section>
      <select value={schoolIndex} onChange={event => onSchoolSelect(Number(event.target.value))}>
        {openSchools.map(option => <option key={option.i} value={option.i}>{option.name}</option>)}
      </select>
      <div className="row gap">
        {shownYears.map((shownYear, column) => (
          <select key={column} value={shownYear} onChange={event => changeShownYear(column, Number(event.target.value))}>
            {planYears.map(({ name, index }) => <option key={index} value={index}>{name}</option>)}
          </select>
        ))}
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Grade</th>
            {shownYears.map((shownYear, column) => <th key={column}>{meta.years[shownYear]}{isElementary && <><br /><span className="muted">students · rooms</span></>}</th>)}
          </tr>
        </thead>
        <tbody>
          {grades.map(grade => (
            <tr key={grade}>
              <td>{grade === 'K' ? 'K' : 'Grade ' + grade}{isElementary && <span className="muted"> (max {meta.classSize[grade]})</span>}</td>
              {shownYears.map((shownYear, column) => <td key={column}>{Math.round(schoolResult.grades[shownYear][grade] ?? 0)}{isElementary && <> · {schoolResult.classrooms[shownYear][grade]}</>}</td>)}
            </tr>
          ))}
          <tr className="tot">
            <td>Neighborhood total</td>
            {shownYears.map((shownYear, column) => <td key={column}>{Math.round(schoolResult.students[shownYear])}{isElementary && <> · {totalClassrooms(shownYear)}</>}</td>)}
          </tr>
          {isElementary && schoolResult.inBuilding > 0 && (
            <tr>
              <td>Pre-K / immersion (fixed)</td>
              {shownYears.map((_, column) => <td key={column}>{Math.round(schoolResult.inBuilding)}</td>)}
            </tr>
          )}
          <tr className="tot">
            <td>Utilization</td>
            {shownYears.map((shownYear, column) => <td key={column}>{(schoolResult.util[shownYear] * 100).toFixed(1)}%</td>)}
          </tr>
        </tbody>
      </table>
      {isElementary && <p className="note">Classrooms use Kansas class-size guidelines (K–2: 22, grade 3: 24, grades 4–5: 26) and assume no combined-grade classes. Grade mix follows each home's original school.</p>}
    </section>
  );
}
