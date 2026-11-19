// The district's own figures (Nov 2026 boundary presentations) beside the model's, for the district concepts.
import type { DistrictNumbers, School, Static } from '../../data';
import type { LevelResult } from '../../model/engine';
import { publishedOption } from '../../numbers';
import type { Plan } from '../../store';

const DEFAULT_TABLE_YEAR = 2;                 // 2027-28, shown when the chosen year is outside the district's tables
const LAST_TABLE_COLUMN = 5;                  // the tables run 2026-27 (column 0) to 2031-32 (column 5)
const NOTABLE_ENROLLMENT_GAP = 40, NOTABLE_PIECE_GAP = 25;

const percent = (utilization: number) => `${(utilization * 100).toFixed(1)}%`;
const wholeNumber = (value: number) => Math.round(value).toLocaleString();
const signedNumber = (value: number) => (value >= 0 ? '+' : '') + wholeNumber(value);

type SchoolsByName = Record<string, School>;

function OptionTables({ staticData, presetName, district, result, schoolsByName, tableYear, notes }: {
  staticData: Static; presetName: string; district: DistrictNumbers; result: LevelResult; schoolsByName: SchoolsByName; tableYear: number; notes: string;
}) {
  const yearName = staticData.meta.years[tableYear], tableColumn = tableYear - 1;

  return (
    <>
      <p className="note"><b>{presetName}</b>: the district's five-year table (Early Childhood counted at receiving schools) beside the model's total for the same year (Pre-K counted when the Pre-K box is on). Percentages use each side's own capacity.{notes}</p>
      <table className="tbl">
        <thead><tr><th>School</th><th>District {yearName}</th><th>Model {yearName}</th><th>Gap</th><th title="District 2031-32 % of its functional capacity">District 31-32</th></tr></thead>
        <tbody>
          {Object.keys(district.table).map(name => {
            const school = schoolsByName[name], schoolResult = school ? result.schools[school.i] : null;
            const districtStudents = district.table[name][tableColumn], capacity = district.cap[name];
            const modelStudents = schoolResult ? schoolResult.total[tableYear] : NaN;
            const gap = modelStudents - districtStudents;
            return (
              <tr key={name}>
                <td>{name}</td>
                <td>{districtStudents} <span className="muted">({percent(districtStudents / capacity)})</span></td>
                <td>{isNaN(modelStudents) ? '—' : wholeNumber(modelStudents)} <span className="muted">({schoolResult ? percent(schoolResult.util[tableYear]) : '—'})</span></td>
                <td className={Math.abs(gap) > NOTABLE_ENROLLMENT_GAP ? 'bad' : ''}>{isNaN(modelStudents) ? '—' : signedNumber(gap)}</td>
                <td>{percent(district.table[name][LAST_TABLE_COLUMN] / capacity)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>Students moving from closing schools</h3>
      <p className="note">District: actual 2026-27 K–5 students by destination (parent-meeting grade tables). Model: the same pieces as drawn in this plan, 2026-27.</p>
      <table className="tbl">
        <thead><tr><th>From</th><th>To</th><th>District</th><th>Model</th><th>Gap</th></tr></thead>
        <tbody>
          {district.pieces.map(piece => {
            const origin = schoolsByName[piece.frm], receiver = schoolsByName[piece.to];
            const modelStudents = origin && receiver ? (result.schools[receiver.i]?.movedInByOriginFall2026?.[origin.i] ?? 0) : NaN;
            const gap = modelStudents - piece.n;
            return (
              <tr key={piece.frm + piece.to}>
                <td>{piece.frm}</td><td>{piece.to}</td><td>{piece.n}</td><td>{wholeNumber(modelStudents)}</td>
                <td className={Math.abs(gap) > NOTABLE_PIECE_GAP ? 'bad' : ''}>{signedNumber(gap)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export default function DistrictSection({ staticData, result, plan, year }: { staticData: Static; result: LevelResult; plan: Plan; year: number }) {
  const option = publishedOption(staticData, plan);
  const preset = option ? staticData.presets.find(candidate => candidate.id === 'dc' + option) : undefined;
  const district = preset?.district ?? staticData.presets.find(candidate => candidate.district)?.district;
  if (!district) return <section><p className="note">No district numbers loaded.</p></section>;

  const schoolsByName: SchoolsByName = {};
  for (const school of staticData.schools) if (school.level === 'es') schoolsByName[school.name] = school;

  const tableColumn = year - 1;
  const yearIsInTables = tableColumn >= 0 && tableColumn <= LAST_TABLE_COLUMN;
  const tableYear = yearIsInTables ? year : DEFAULT_TABLE_YEAR;
  const editNote = plan.edits.some(edit => edit.kind !== 'preset') ? ' Your edits change the model columns only.' : '';
  const yearNote = yearIsInTables ? '' : ` The district's tables cover 2026-27 to 2031-32, so ${staticData.meta.years[tableYear]} is shown.`;

  return (
    <section>
      {preset?.district
        ? <OptionTables staticData={staticData} presetName={preset.name} district={district} result={result} schoolsByName={schoolsByName} tableYear={tableYear} notes={editNote + yearNote} />
        : <p className="note">Start from a district concept (1–4) to see its tables. Below: fall 2026 enrollment and functional capacity from the district.</p>}
      <h3>Fall 2026 enrollment and capacity</h3>
      <table className="tbl">
        <thead><tr><th>School</th><th>District 2026</th><th>Model 26-27</th><th>District cap.</th><th>Model cap.</th></tr></thead>
        <tbody>
          {Object.keys(district.enroll2026).sort().map(name => {
            const school = schoolsByName[name];
            if (!school) return null;
            const immersionInBuilding = name === 'Black Bob' ? school.immersion : 0;
            const modelEnrollment = school.neighborhood[1] + school.prek + immersionInBuilding;
            return (
              <tr key={name}>
                <td>{name}</td><td>{district.enroll2026[name]}</td><td>{wholeNumber(modelEnrollment)}</td><td>{district.cap[name]}</td><td>{wholeNumber(school.capacity)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note">District 2026 counts include Early Childhood. Model 26-27 = own neighborhood students + Pre-K (+ immersion still at Black Bob).</p>
    </section>
  );
}
