// Concept Builder: pick a district concept and see what it means for each school.
import type { Combos, ComboConcept, Level, Static } from '../data';
import type { LevelResult } from '../model/engine';
import { headlineSummary, type SchoolNumber } from '../numbers';
import { useUI, type Build, type Plan } from '../store';
import EstimateMark from './EstimateMark';
import Fold from './Fold';
import { SchoolList } from './SchoolNumbers';
import Scorecard from './Scorecard';

type MiddleSchools = NonNullable<Combos['ms']>;

interface BuilderProps {
  staticData: Static;
  plan: Plan;
  level: Level;
  elementaryResult: LevelResult | null;
  middleSchoolResult: LevelResult | null;
  numbers: Map<number, SchoolNumber>;
  visibleSchools: Set<number>;
  build: Build;
  onBuildChange: (build: Build) => void;
  onEditByHand: () => void;
  onSchoolSelect: (school: number) => void;
  part?: BuilderPart;   // phones split the builder: the Concept tab shows the concepts, the Schools tab the school list
}

export type BuilderPart = 'all' | 'concepts' | 'schools';

export default function Builder(props: BuilderProps) {
  const { staticData, level } = props;
  const combos = staticData.combos;
  if (!combos) return <section><p className="list-note">Concept data not loaded.</p></section>;

  if (level === 'hs') {
    return <section className="panel-section"><p className="plain-note">The district's concepts don't change high school boundaries, so these are today's areas.</p></section>;
  }
  if (level === 'ms') {
    if (!combos.ms) return <section><p className="list-note">Middle school concepts not loaded.</p></section>;
    return <MiddleSchoolBuilder {...props} middleSchools={combos.ms} />;
  }
  return <ElementaryBuilder {...props} combos={combos} />;
}

function selectedConcept(concepts: ComboConcept[], conceptId: number): ComboConcept {
  return concepts.find(concept => concept.id === conceptId)!;
}

/** The schools section both builder views share. */
function SchoolsSection({ staticData, numbers, visibleSchools, result, onSchoolSelect }: Pick<BuilderProps, 'staticData' | 'numbers' | 'visibleSchools' | 'onSchoolSelect'> & { result: LevelResult | null }) {
  const summary = headlineSummary(staticData, numbers, visibleSchools);
  const goalPercent = staticData.meta.target * 100;
  return (
    <section className="panel-section">
      <h3 className="panel-heading">Projected Functional Capacity</h3>
      <p className="section-note">{summary.sourceLabel} The district's goal is {goalPercent}% full or less.</p>
      {result && <SchoolList staticData={staticData} numbers={numbers} schools={summary.schools.map(schoolNumber => schoolNumber.school)} result={result} onSchoolSelect={onSchoolSelect} />}
    </section>
  );
}

function ElementaryBuilder(props: BuilderProps & { combos: Combos }) {
  const { staticData, plan, combos, elementaryResult, numbers, visibleSchools, build, onBuildChange, onEditByHand, onSchoolSelect } = props;
  const { sel: selectedConcepts } = build;

  const matchingOption = Object.entries(combos.options).find(([, concepts]) => concepts.every((conceptId, index) => conceptId === selectedConcepts[index]))?.[0];

  const pickConcept = (schoolIndex: number, conceptId: number) => {
    const nextConcepts = [...selectedConcepts];
    nextConcepts[schoolIndex] = conceptId;
    onBuildChange({ ...build, sel: nextConcepts, moves: null });
  };

  // The district's per-destination counts are the students who move when the change takes effect (2027-28). Later years have no
  // district counts, so each part shows the model's estimate of its students that year, like the school list does.
  const year = useUI(state => state.year), moveYear = staticData.meta.firstPlanYear;
  const useDistrictCounts = year <= moveYear;

  /** Where the chosen concept sends a closing school's students: the concept's own description of each part, with how many move. */
  const destinations = (school: Combos['schools'][number], schoolIndex: number) => {
    const concept = selectedConcept(school.concepts, selectedConcepts[schoolIndex]);
    const clausesOf = (summary: string) => (summary.includes(': ') ? summary.split(': ')[1] : summary).split(/;\s*/).map(clause => clause.replace(/\.$/, ''));
    const note = concept.summary.includes(': ') ? concept.summary.split(': ')[0] : '';
    // "otherwise as concept 2": the rest of the description comes from that concept
    const borrowed = concept.summary.match(/as concept (\d)/)?.[1];
    const borrowedClauses = borrowed ? clausesOf(school.concepts.find(other => String(other.id) === borrowed)?.summary ?? '') : [];
    const clauses = [...clausesOf(concept.summary).filter(clause => !/as concept \d/.test(clause)), ...borrowedClauses];
    const parts = concept.pieces.filter(piece => (piece.district ?? 0) > 0 || piece.model26 > 0).map(piece => {
      const index = clauses.findIndex(candidate => candidate.includes(piece.to));
      const clause = index >= 0 ? clauses[index] : `To ${piece.to}`;
      // a home keeps its original school's rate, so a later year scales the fall 2026 count by that school's rate that year
      const fall2026 = elementaryResult?.schools[piece.school]?.movedInByOriginFall2026[school.i];
      const rates = staticData.schools[school.i].factor;
      const modelStudents = fall2026 === undefined ? undefined : fall2026 * (rates[year] / rates[moveYear - 1]);
      const district = useDistrictCounts ? piece.district : null;
      return { to: piece.to, order: index >= 0 ? index : clauses.length, text: clause.charAt(0).toUpperCase() + clause.slice(1), district, modelStudents };
    });
    return { note, parts: parts.sort((first, second) => first.order - second.order) };
  };

  const { part = 'all' } = props;
  const schoolsSection = <SchoolsSection staticData={staticData} numbers={numbers} visibleSchools={visibleSchools} result={elementaryResult} onSchoolSelect={onSchoolSelect} />;
  if (part === 'schools') return schoolsSection;

  return (
    <>
      <section className="panel-section">
        <h3 className="panel-heading">Choose a concept</h3>
        <div className="concept-picker">
          {Object.entries(combos.options).map(([option, concepts]) => (
            <button key={option} className={matchingOption === option ? 'on' : ''} aria-pressed={matchingOption === option} onClick={() => onBuildChange({ ...build, sel: [...concepts], moves: null })}>{option}</button>
          ))}
        </div>
        {!matchingOption && <p className="section-note picker-note">You're viewing a custom combination of the district's concepts.</p>}
        <Scorecard staticData={staticData} plan={plan} result={elementaryResult} numbers={numbers} visibleSchools={visibleSchools} />
      </section>

      {part === 'all' && schoolsSection}

      <section className="panel-section folds">
        <Fold title="Concepts by closing school">
          <p className="section-note">The board votes on each closing school separately. Pick a concept for each to see the combined result.
            Counts are students in each part in {staticData.meta.years[year]}.</p>
          {combos.schools.map((school, schoolIndex) => (
            <div key={school.name} className="closing-school">
              <div className="closing-school-top">
                <b>{school.name}</b>
                <div className="mini-picker">
                  {school.concepts.map(concept => (
                    <button key={concept.id} className={concept.id === selectedConcepts[schoolIndex] ? 'on' : ''} onClick={() => pickConcept(schoolIndex, concept.id)} title={concept.summary}>{concept.id}</button>
                  ))}
                </div>
              </div>
              {(() => {
                const { note, parts } = destinations(school, schoolIndex);
                return (
                  <>
                    {note && <p className="section-note">{note}.</p>}
                    <ul className="destination-list">
                      {parts.map(part => (
                        <li key={part.to}>
                          <span>{part.text}</span>
                          <b>{part.district !== null
                            ? `${part.district} students`
                            : part.modelStudents === undefined ? '—' : <>{Math.round(part.modelStudents)} students<EstimateMark /></>}</b>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
            </div>
          ))}
        </Fold>
      </section>

      <button className="secondary-action" onClick={onEditByHand}>Edit this plan by hand</button>
    </>
  );
}

/** The concept's summary as a short list of changes. */
function changesIn(summary: string): string[] {
  return summary.split(/;\s*/).map(change => change.replace(/\.$/, '')).map(change => change.charAt(0).toUpperCase() + change.slice(1));
}

/** Middle school concept picker (the district's five concepts, independent of the elementary concepts). */
function MiddleSchoolBuilder(props: BuilderProps & { middleSchools: MiddleSchools }) {
  const { staticData, plan, middleSchools, middleSchoolResult, numbers, visibleSchools, build, onBuildChange, onSchoolSelect } = props;
  const concept = middleSchools.concepts.find(candidate => candidate.id === build.ms);
  const { part = 'all' } = props;
  const schoolsSection = <SchoolsSection staticData={staticData} numbers={numbers} visibleSchools={visibleSchools} result={middleSchoolResult} onSchoolSelect={onSchoolSelect} />;
  if (part === 'schools') return schoolsSection;

  return (
    <>
      <section className="panel-section">
        <h3 className="panel-heading">Choose a concept</h3>
        <div className="concept-picker">
          {middleSchools.concepts.map(candidate => (
            <button key={candidate.id} className={candidate.id === build.ms ? 'on' : ''} aria-pressed={candidate.id === build.ms} onClick={() => onBuildChange({ ...build, ms: candidate.id })}>{candidate.id}</button>
          ))}
        </div>
        <Scorecard staticData={staticData} plan={plan} result={middleSchoolResult} numbers={numbers} visibleSchools={visibleSchools} />
      </section>

      {part === 'all' && schoolsSection}

      <section className="panel-section folds">
        <Fold title="What changes in this concept">
          {concept
            ? <ul className="change-list">{changesIn(concept.summary).map(change => <li key={change}>{change}</li>)}</ul>
            : <p className="section-note">No concept is selected, so Indian Trail's area has no school yet.</p>}
        </Fold>
      </section>
    </>
  );
}
