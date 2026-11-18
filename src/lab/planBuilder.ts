// Turns Option Builder choices (one district concept per closing school, moves between open schools, a middle school concept)
// into a plan the model can evaluate.
import type { Combos, Edit, Static } from './data';
import type { Plan } from './store';

type MoveChoices = Record<string, boolean>;

const CONCEPT_CODES: Record<string, string> = { Heritage: 'HT', Scarborough: 'SC', 'Black Bob': 'BB', Tomahawk: 'TH', 'Walnut Grove': 'WG' };

/** Evaluates a move's rule ("BB2|BB3", "(HT1|HT4)&BB3", "BB3&!TH2", "GSN-RP", "always") against the concepts and moves already on. */
function ruleIsMet(rule: string, activeTokens: Set<string>): boolean {
  if (rule === 'always') return true;
  const ruleTokens = rule.match(/[()&|!]|[A-Za-z0-9-]+/g) ?? [];
  let position = 0;

  const readTerm = (): boolean => {
    const token = ruleTokens[position++];
    if (token === '!') return !readTerm();
    if (token === '(') {
      const value = readAnyOf();
      position++;   // the closing parenthesis
      return value;
    }
    return activeTokens.has(token!);
  };
  const readAllOf = (): boolean => {
    let value = readTerm();
    while (ruleTokens[position] === '&') {
      position++;
      const next = readTerm();
      value = value && next;
    }
    return value;
  };
  const readAnyOf = (): boolean => {
    let value = readAllOf();
    while (ruleTokens[position] === '|') {
      position++;
      const next = readAllOf();
      value = value || next;
    }
    return value;
  };
  return readAnyOf();
}

const conceptToken = (schoolName: string, conceptId: number) => CONCEPT_CODES[schoolName] + conceptId;

/** Moves that come with the chosen concepts (the user can override each one). */
export function defaultMoves(combos: Combos, selectedConcepts: number[]): MoveChoices {
  const activeTokens = new Set(combos.schools.map((school, index) => conceptToken(school.name, selectedConcepts[index])));
  const choices: MoveChoices = {};
  for (const move of combos.moves) {
    choices[move.id] = ruleIsMet(move.rule, activeTokens);
    if (choices[move.id]) activeTokens.add(move.id);
  }
  return choices;
}

export function activeMoves(combos: Combos, selectedConcepts: number[], moveOverrides: MoveChoices | null): MoveChoices {
  return moveOverrides ?? defaultMoves(combos, selectedConcepts);
}

function elementaryConceptEdits(combos: Combos, selectedConcepts: number[]): Edit[] {
  return combos.schools.flatMap((school, index) => {
    const concept = school.concepts.find(candidate => candidate.id === selectedConcepts[index]) ?? school.concepts[0];
    return concept.pieces.map((piece, pieceIndex): Edit => ({
      id: `b-${conceptToken(school.name, concept.id)}-${pieceIndex}`, level: 'es', school: piece.school, geom: piece.geom, kind: 'preset',
      label: `${school.name} ${concept.id} → ${piece.to}`,
    }));
  });
}

function openSchoolMoveEdits(combos: Combos, moves: MoveChoices): Edit[] {
  return combos.moves.filter(move => moves[move.id]).map((move): Edit => ({
    id: `b-${move.id}`, level: 'es', school: move.school, geom: move.geom, kind: 'preset', label: move.label,
  }));
}

function middleSchoolConceptEdits(combos: Combos, conceptId: number): Edit[] {
  const concept = combos.ms?.concepts.find(candidate => candidate.id === conceptId);
  if (!concept) return [];
  return concept.edits.map((edit, editIndex): Edit => ({
    id: `b-MS${concept.id}-${editIndex}`, level: 'ms', school: edit.school, geom: edit.geom, kind: 'preset',
    label: `Middle school concept ${concept.id} → ${edit.to}`,
  }));
}

function planName(combos: Combos, selectedConcepts: number[], middleSchoolConcept: number): string {
  const elementaryName = combos.schools.map((school, index) => conceptToken(school.name, selectedConcepts[index])).join(' · ');
  const hasMiddleSchoolConcept = combos.ms?.concepts.some(concept => concept.id === middleSchoolConcept);
  return hasMiddleSchoolConcept ? `${elementaryName} · MS${middleSchoolConcept}` : elementaryName;
}

export function buildPlan(staticData: Static, selectedConcepts: number[], moveOverrides: MoveChoices | null, middleSchoolConcept = 0): Plan {
  const combos = staticData.combos!;
  const basePreset = staticData.presets.find(preset => preset.id === combos.basePreset)!;
  const moves = activeMoves(combos, selectedConcepts, moveOverrides);
  const edits: Edit[] = [
    ...basePreset.edits.map(edit => ({ ...edit })),
    ...elementaryConceptEdits(combos, selectedConcepts),
    ...openSchoolMoveEdits(combos, moves),
    ...middleSchoolConceptEdits(combos, middleSchoolConcept),
  ];
  return { preset: combos.basePreset, closures: { ...basePreset.closures }, edits, name: planName(combos, selectedConcepts, middleSchoolConcept) };
}
