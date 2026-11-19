// Concept Builder: pick one district concept per closing school and see the combination.
import type { Combos, ComboConcept, Level, Static } from '../data';
import type { LevelResult } from '../model/engine';
import { headlineSummary, type SchoolNumber } from '../numbers';
import { activeMoves, defaultMoves } from '../planBuilder';
import type { Build, Plan } from '../store';
import { SchoolNumbersTable } from './SchoolNumbers';
import Scorecard from './Scorecard';

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
  middleSchoolLinesOn: boolean;
  onMiddleSchoolLinesChange: (on: boolean) => void;
  onSchoolSelect: (school: number) => void;
}

export default function Builder(props: BuilderProps) {
  const { staticData, level } = props;
  const combos = staticData.combos;
  if (!combos) return <section><p className="note">Concept data not loaded.</p></section>;

  if (level === 'hs') {
    return <section className="builder"><p className="note">None of the district’s concepts change high school boundaries, so these are the current areas.</p></section>;
  }
  if (level === 'ms') {
    if (!combos.ms) return <section><p className="note">Middle school concepts not loaded.</p></section>;
    return <MiddleSchoolBuilder {...props} middleSchools={combos.ms} />;
  }
  return <ElementaryBuilder {...props} combos={combos} />;
}

function selectedConcept(concepts: ComboConcept[], conceptId: number): ComboConcept {
  return concepts.find(concept => concept.id === conceptId)!;
}

function ElementaryBuilder(props: BuilderProps & { combos: Combos }) {
  const { staticData, plan, combos, elementaryResult, numbers, visibleSchools, build, onBuildChange, onEditByHand, onSchoolSelect } = props;
  const { sel: selectedConcepts, moves: moveOverrides } = build;
  const moves = activeMoves(combos, selectedConcepts, moveOverrides);
  const automaticMoves = defaultMoves(combos, selectedConcepts);
  const summary = headlineSummary(staticData, numbers, visibleSchools);

  const matchingOption = Object.entries(combos.options).find(([, concepts]) => concepts.every((conceptId, index) => conceptId === selectedConcepts[index]))?.[0];
  const movesOnCount = combos.moves.filter(move => moves[move.id]).length;

  const pickConcept = (schoolIndex: number, conceptId: number) => {
    const nextConcepts = [...selectedConcepts];
    nextConcepts[schoolIndex] = conceptId;
    onBuildChange({ ...build, sel: nextConcepts, moves: null });
  };
  const toggleMove = (moveId: string) => {
    const nextMoves = { ...moves, [moveId]: !moves[moveId] };
    if (nextMoves[moveId]) {
      const conflicting = combos.exclusive.filter(group => group.includes(moveId)).flat().filter(id => id !== moveId);
      for (const id of conflicting) nextMoves[id] = false;
    }
    onBuildChange({ ...build, moves: nextMoves });
  };

  const movingPieces = combos.schools.flatMap((school, schoolIndex) => {
    const concept = selectedConcept(school.concepts, selectedConcepts[schoolIndex]);
    const pieces = concept.pieces.filter(piece => (piece.district ?? 0) > 0 || piece.model26 > 0);
    return pieces.map(piece => ({ school, piece, modelStudents: elementaryResult?.schools[piece.school]?.movedInByOriginFall2026[school.i] }));
  });

  return (
    <>
      <section className="builder">
        <div className="row between">
          <span className="lbl">District concepts</span>
          {!matchingOption && <span className="tag">Custom mix</span>}
        </div>
        <div className="seg opts">
          {Object.entries(combos.options).map(([option, concepts]) => (
            <button key={option} className={matchingOption === option ? 'on' : ''} onClick={() => onBuildChange({ ...build, sel: [...concepts], moves: null })}>{option}</button>
          ))}
        </div>
        <Scorecard staticData={staticData} plan={plan} result={elementaryResult} numbers={numbers} visibleSchools={visibleSchools} />
      </section>

      <section className="builder">
        {combos.schools.map((school, schoolIndex) => (
          <div key={school.name} className="bschool">
            <div className="row between">
              <b>{school.name}</b>
              <div className="seg small">
                {school.concepts.map(concept => (
                  <button key={concept.id} className={concept.id === selectedConcepts[schoolIndex] ? 'on' : ''} onClick={() => pickConcept(schoolIndex, concept.id)} title={concept.summary}>{concept.id}</button>
                ))}
              </div>
            </div>
            <p className="note">{selectedConcept(school.concepts, selectedConcepts[schoolIndex]).summary}</p>
          </div>
        ))}
      </section>

      {combos.ms && <MiddleSchoolLinesPicker concepts={combos.ms.concepts} {...props} />}

      <section className="builder">
        <details className="more" open>
          <summary>School numbers</summary>
          {elementaryResult && <SchoolNumbersTable staticData={staticData} numbers={numbers} schools={summary.schools.map(schoolNumber => schoolNumber.school)} result={elementaryResult} onSchoolSelect={onSchoolSelect} />}
        </details>
        <details className="more">
          <summary>Students moving, by piece</summary>
          <table className="tbl">
            <thead><tr><th>From → to</th><th>District</th><th>Model</th></tr></thead>
            <tbody>
              {movingPieces.map(({ school, piece, modelStudents }) => (
                <tr key={school.name + piece.to}>
                  <td>{school.name} → {piece.to}</td>
                  <td>{piece.district ?? '—'}</td>
                  <td>{modelStudents === undefined ? '—' : '~' + Math.round(modelStudents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">2026-27 K–5 students. District counts come from the parent-meeting decks.</p>
        </details>
        <details className="more">
          <summary>Moves between open schools ({movesOnCount} on)</summary>
          <p className="note">
            Set automatically by the concepts you pick. Tap to override.
            {moveOverrides && <> <button className="link" onClick={() => onBuildChange({ ...build, moves: null })}>Reset</button></>}
          </p>
          <ul className="moves">
            {combos.moves.map(move => {
              const changedNote = automaticMoves[move.id] !== moves[move.id] ? ' · changed' : '';
              return (
                <li key={move.id}>
                  <label className="chk">
                    <input type="checkbox" checked={!!moves[move.id]} onChange={() => toggleMove(move.id)} />
                    <span>{move.label} <span className="muted">· ~{move.model26}{changedNote}</span></span>
                  </label>
                </li>
              );
            })}
          </ul>
        </details>
        <button className="link-btn" onClick={onEditByHand}>Edit this combination by hand →</button>
      </section>
    </>
  );
}

type MiddleSchools = NonNullable<Combos['ms']>;

/** Elementary view: which middle school concept's lines to overlay on the map. */
function MiddleSchoolLinesPicker({ concepts, build, onBuildChange, middleSchoolLinesOn, onMiddleSchoolLinesChange }: BuilderProps & { concepts: MiddleSchools['concepts'] }) {
  const showConcept = (conceptId: number) => {
    onBuildChange({ ...build, ms: conceptId });
    onMiddleSchoolLinesChange(true);
  };
  return (
    <section className="builder">
      <div className="row between">
        <b>Middle school lines</b>
        <div className="seg small">
          <button className={middleSchoolLinesOn ? '' : 'on'} onClick={() => onMiddleSchoolLinesChange(false)} title="Hide middle school lines">Off</button>
          {concepts.map(concept => (
            <button key={concept.id} className={middleSchoolLinesOn && concept.id === build.ms ? 'on' : ''} onClick={() => showConcept(concept.id)} title={`Show concept ${concept.id} lines`}>{concept.id}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Middle school concept picker (the district's five concepts, independent of the elementary concepts). */
function MiddleSchoolBuilder({ staticData, middleSchools, middleSchoolResult, numbers, visibleSchools, build, onBuildChange, onSchoolSelect }: BuilderProps & { middleSchools: MiddleSchools }) {
  const concept = middleSchools.concepts.find(candidate => candidate.id === build.ms);
  const summary = headlineSummary(staticData, numbers, visibleSchools);
  const conceptSummary = concept ? concept.summary : 'No middle school concept: Indian Trail’s area is left unassigned.';

  return (
    <section className="builder">
      <div className="bschool">
        <div className="row between">
          <b>Middle schools</b>
          <div className="seg small">
            {middleSchools.concepts.map(candidate => (
              <button key={candidate.id} className={candidate.id === build.ms ? 'on' : ''} onClick={() => onBuildChange({ ...build, ms: candidate.id })} title={candidate.summary}>{candidate.id}</button>
            ))}
            <button className={build.ms === 0 ? 'on' : ''} onClick={() => onBuildChange({ ...build, ms: 0 })} title="Leave Indian Trail's area unassigned">–</button>
          </div>
        </div>
        <p className="note">{conceptSummary} The district shows these separately from the elementary concepts, so any pairing works.</p>
      </div>
      <details className="more" open>
        <summary>Middle school numbers</summary>
        <p className="note source-line">{summary.sourceLabel}</p>
        {middleSchoolResult && <SchoolNumbersTable staticData={staticData} numbers={numbers} schools={summary.schools.map(schoolNumber => schoolNumber.school)} result={middleSchoolResult} onSchoolSelect={onSchoolSelect} />}
        <p className="note">District: five-year estimates from the middle school deck, over functional capacity. Lines are read from the deck’s concept maps onto street blocks.</p>
      </details>
    </section>
  );
}
