// How district and model numbers look wherever they appear together.
import { schoolColor } from '../colors';
import type { Static } from '../data';
import type { LevelResult } from '../model/engine';
import { AGREEMENT_LABEL, CLOSE_POINTS, type Agreement, type SchoolNumber, type Source } from '../numbers';

const percent = (utilization: number) => `${(utilization * 100).toFixed(1)}%`;

export function SourceTag({ source }: { source: Source }) {
  const label = source === 'district' ? 'District' : 'Model';
  return <i className={'src-tag ' + source}>{label}</i>;
}

export function AgreementTag({ agreement }: { agreement: Agreement | null }) {
  if (!agreement) return <span className="muted">Model only</span>;
  return <span className={'agree ' + agreement}>{AGREEMENT_LABEL[agreement]}</span>;
}

interface SchoolRowProps {
  staticData: Static;
  schoolIndex: number;
  schoolNumber: SchoolNumber;
  result: LevelResult;
  compareResult?: LevelResult | null;
  focused: boolean;
  onSelect?: (school: number) => void;
}

function SchoolRow({ staticData, schoolIndex, schoolNumber, result, compareResult, focused, onSelect }: SchoolRowProps) {
  const school = staticData.schools[schoolIndex], schoolResult = result.schools[schoolIndex];
  const target = staticData.meta.target;
  const { district, model, agreement } = schoolNumber;

  const capacityNote = school.capSource.startsWith('estimated') ? ' (est.)' : '';
  const capacityLabel = `cap. ${Math.round(school.capacity).toLocaleString()}${capacityNote}`;
  const districtIsOver = district !== null && district > target;
  const peakIsOver = schoolResult.peak > target;
  const compareSchool = compareResult?.schools[schoolIndex];
  const comparePeak = compareSchool?.open ? '~' + percent(compareSchool.peak) : 'closing';

  return (
    <tr onClick={() => onSelect?.(schoolIndex)} className={focused ? 'sel' : ''}>
      <td>
        <i className="sw" style={{ background: schoolColor(school as any) }} />{school.name}
        <span className="cap">{capacityLabel}</span>
      </td>
      <td className={districtIsOver ? 'bad' : ''}>{district !== null ? percent(district) : '—'}</td>
      <td>~{percent(model)}</td>
      <td><AgreementTag agreement={agreement} /></td>
      <td title={staticData.meta.years[schoolResult.peakYear]} className={peakIsOver ? 'bad' : ''}>~{percent(schoolResult.peak)}</td>
      {compareResult && <td>{comparePeak}</td>}
    </tr>
  );
}

interface SchoolNumbersTableProps {
  staticData: Static;
  numbers: Map<number, SchoolNumber>;
  schools: number[];
  result: LevelResult;
  compareResult?: LevelResult | null;
  focusedSchool?: number | null;
  onSchoolSelect?: (school: number) => void;
}

/** District first, then the model, then whether they agree. */
export function SchoolNumbersTable({ staticData, numbers, schools, result, compareResult, focusedSchool, onSchoolSelect }: SchoolNumbersTableProps) {
  const { meta } = staticData;
  const firstNumber = [...numbers.values()][0];
  const year = meta.years[firstNumber?.year ?? meta.firstPlanYear];
  const closingColumns = compareResult ? 5 : 4;

  return (
    <>
      <table className="tbl numbers">
        <thead>
          <tr>
            <th>School</th>
            <th>District {year}</th>
            <th>Model {year}</th>
            <th>Agreement</th>
            <th title="Highest model estimate, 2027-28 to 2034-35">Model peak</th>
            {compareResult && <th>Compare peak</th>}
          </tr>
        </thead>
        <tbody>
          {schools.map(schoolIndex => {
            const schoolNumber = numbers.get(schoolIndex);
            if (!schoolNumber) {
              return <tr key={schoolIndex} className="closed"><td>{staticData.schools[schoolIndex].name}</td><td colSpan={closingColumns}>closing</td></tr>;
            }
            return (
              <SchoolRow key={schoolIndex} staticData={staticData} schoolIndex={schoolIndex} schoolNumber={schoolNumber} result={result}
                compareResult={compareResult} focused={focusedSchool === schoolIndex} onSelect={onSchoolSelect} />
            );
          })}
        </tbody>
      </table>
      <p className="note">
        — means the district published no figure for this plan, school and year. Close: within {CLOSE_POINTS} points.
        {' '}Too close to call: on opposite sides of {meta.target * 100}%.
      </p>
    </>
  );
}
