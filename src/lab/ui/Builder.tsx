// Concept Builder: pick a district concept and see what it means for each school.
import type { Combos, ComboConcept, Level, Static } from '../data';
import type { LevelResult } from '../model/engine';
import { headlineSummary, type SchoolNumber } from '../numbers';
import type { Build, Plan } from '../store';
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
      <h3 className="panel-heading">How full each school would be</h3>
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

  const movingPieces = combos.schools.flatMap((school, schoolIndex) => {
    const concept = selectedConcept(school.concepts, selectedConcepts[schoolIndex]);
    const pieces = concept.pieces.filter(piece => (piece.district ?? 0) > 0 || piece.model26 > 0);
    return pieces.map(piece => ({ school, piece, modelStudents: elementaryResult?.schools[piece.school]?.movedInByOriginFall2026[school.i] }));
  });

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
        {!matchingOption && <p className="section-note picker-note">You're viewing a custom mix of the district's concepts.</p>}
        <Scorecard staticData={staticData} plan={plan} result={elementaryResult} numbers={numbers} visibleSchools={visibleSchools} />
      </section>

      {part === 'all' && schoolsSection}

      <section className="panel-section folds">
        <Fold title="Mix and match closing schools">
          <p className="section-note">Choose where each closing school's students would go.</p>
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
              <p className="section-note">{selectedConcept(school.concepts, selectedConcepts[schoolIndex]).summary}</p>
            </div>
          ))}
        </Fold>
        <Fold title="Where students would go">
          <table className="simple-table">
            <thead><tr><th>From → to</th><th>District</th><th>Estimate</th></tr></thead>
            <tbody>
              {movingPieces.map(({ school, piece, modelStudents }) => (
                <tr key={school.name + piece.to}>
                  <td>{school.name} → {piece.to}</td>
                  <td>{piece.district ?? '—'}</td>
                  <td>{modelStudents === undefined ? '—' : <>{Math.round(modelStudents)}<EstimateMark /></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
