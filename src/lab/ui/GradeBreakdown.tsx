// One school's students by grade for the chosen year, shown in its row's details. The school's total for that year is the hard stop
// (the district's figure while it publishes one, the model's after): less Pre-K and immersion, it's split across grades by the
// grade mix: the district's own post-move grade counts where a parent-meeting slide gives them for this school and concept, the
// model's otherwise. Elementary schools also show the sections each grade needs at the district's staffing guidelines.
// The method is written up on the About page (#grades).
import type { School, Static } from '../data';
import type { LevelResult } from '../model/engine';
import { CircleHelp } from 'lucide-react';
import { SLIDE_GRADE_ORDER } from '../parentSlides';
import { useUI } from '../store';
import EstimateMark from './EstimateMark';

const GRADE_ORDER = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const byGrade = (first: string, second: string) => GRADE_ORDER.indexOf(first) - GRADE_ORDER.indexOf(second);

export default function GradeBreakdown({ staticData, school, schoolResult, year, total, fromDistrict, slideGrades }: {
  staticData: Static; school: School; schoolResult: LevelResult['schools'][number]; year: number;
  total: number;                     // the school's students that year, as shown above the table
  fromDistrict: boolean;             // whether that total is the district's figure
  slideGrades?: number[] | null;     // K-5 counts from a parent-meeting slide (parentSlides.ts), when one covers this school
}) {
  const { classSize } = staticData.meta;
  const isElementary = school.level === 'es';
  const grades = Object.keys(school.gradeShare).sort(byGrade);
  // Pre-K and immersion. The district's totals always include Early Childhood, so its Pre-K comes out even when the
  // "Count Pre-K" setting leaves it out of the model's totals (and of inBuilding).
  const includePreK = useUI(state => state.includePreK);
  const preKLeftOut = fromDistrict && !includePreK ? school.prek : 0;
  const notInClasses = Math.min(total, schoolResult.inBuilding + preKLeftOut);
  const classroomStudents = total - notInClasses;
  const mix: Record<string, number> = slideGrades
    ? Object.fromEntries(SLIDE_GRADE_ORDER.map((grade, index) => [grade, slideGrades[index]]))
    : schoolResult.grades[year];
  const mixTotal = grades.reduce((sum, grade) => sum + (mix[grade] ?? 0), 0);
  const students = (grade: string) => mixTotal ? classroomStudents * (mix[grade] ?? 0) / mixTotal : 0;
  const sections = (grade: string) => classSize[grade] ? Math.ceil(students(grade) / classSize[grade] - 1e-9) : 0;
  const totalSections = grades.reduce((sum, grade) => sum + sections(grade), 0);

  return (
    <div className="grade-breakdown">
      <table className="grades-table">
        <thead>
          <tr><th>
            <a className="grades-help" href="/about#grades" target="_blank" rel="noopener" aria-label="How grades and sections are counted (opens in a new tab)">
              Grade<CircleHelp aria-hidden />
            </a>
          </th><th>Students<EstimateMark /></th>{isElementary && <><th>Sections</th><th>Avg class</th><th>Max</th></>}</tr>
        </thead>
        <tbody>
          {grades.map(grade => (
            <tr key={grade}>
              <td>{grade}</td>
              <td>{Math.round(students(grade))}</td>
              {isElementary && <>
                <td>{sections(grade)}</td>
                <td>{sections(grade) ? (students(grade) / sections(grade)).toFixed(1) : '—'}</td>
                <td className="muted">{classSize[grade]}</td>
              </>}
            </tr>
          ))}
          {isElementary && (
            <tr className="tot"><td>Total</td><td>{Math.round(classroomStudents)}</td><td>{totalSections}</td>
              <td>{totalSections ? (classroomStudents / totalSections).toFixed(1) : '—'}</td><td /></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
